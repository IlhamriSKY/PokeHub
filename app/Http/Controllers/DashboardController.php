<?php

namespace App\Http\Controllers;

use App\Models\CardAsset;
use App\Rules\Turnstile as TurnstileRule;
use App\Services\GithubCardService;
use App\Services\RegenQuota;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class DashboardController extends Controller
{
    /** A decade on GitHub earns the 1st Edition stamp. */
    private const FIRST_EDITION_YEARS = 10;

    public function index()
    {
        $user = Auth::user();

        // A card from another handle (old editor rows) is treated as missing so it regenerates.
        $card = $user->card;
        if (! is_array($card) || strcasecmp((string) ($card['profile']['login'] ?? ''), (string) $user->github_login) !== 0) {
            $card = null;
        }

        return Inertia::render('dashboard', [
            'profile' => [
                'slug' => $user->slug,
                'is_public' => $user->is_public,
                'card' => $card,
                'github_login' => $user->github_login,
                'public_url' => $user->slug ? url('/'.$user->slug) : null,
            ],
            // Top-level, not nested in `profile`: the countdown reloads just this key when it
            // reaches zero, and a partial reload can only ask for a root prop.
            'quota' => (new RegenQuota($user))->toArray(),
        ]);
    }

    public function updateVisibility(Request $request)
    {
        $data = $request->validate(['is_public' => ['required', 'boolean']]);

        $user = Auth::user();
        $user->is_public = $data['is_public'];
        $user->save();

        return back();
    }

    public function regenerate(Request $request, GithubCardService $svc)
    {
        // Same headroom Api\GithubController gives itself, and for the same reason: the AI call
        // alone is allowed 120s by config, which is longer than PHP's default max_execution_time -
        // so without this the worker was killed mid-call and the regenerate reported "the AI never
        // answered" on a model that was about to reply.
        @set_time_limit((int) config('pokehub.ai.timeout', 60) + 60);

        // The re-rolled card (see rollAxes in card-gallery.tsx). Rolled client-side because the
        // legality rules - which frame belongs to which generation, what a Trainer template drops -
        // live in the lab's own tiles and nowhere else; duplicating them here would be a second
        // copy to drift. What the server owes is the trust boundary: every slug has to name a real,
        // ENABLED asset, so a hand-made POST cannot pin the card to something that renders nothing.
        // One query, grouped, rather than a lookup per axis.
        $slugs = CardAsset::where('enabled', true)->get(['category', 'slug'])->groupBy('category')->map->pluck('slug');
        $in = fn (string $category, string ...$extra) => Rule::in($slugs->get($category, collect())->merge($extra));

        // The rule is implicit (see App\Rules\Turnstile), so it runs on a missing token too and
        // rejects it itself; it no-ops when Turnstile is off. No `nullable` here - that would put
        // the skip back.
        $data = $request->validate([
            'cf-turnstile-response' => [new TurnstileRule],
            'axes' => ['nullable', 'array'],
            'axes.generation' => ['nullable', $in('generation')],
            'axes.variant' => ['nullable', $in('variant', 'none')],
            // 'auto' like its siblings: rollAxes leaves element at the DEFAULT_AXES sentinel
            // whenever the roll lands on a template with no type section (1-gen Trainer), and
            // rejecting it 422'd the auto-generate that a brand-new account depends on.
            'axes.element' => ['nullable', $in('element', 'auto')],
            'axes.dualType' => ['nullable', $in('element', 'auto')],
            'axes.subtype' => ['nullable', $in('subtype', 'auto')],
            'axes.frame' => ['nullable', $in('frame', 'none')],
            'axes.glare' => ['nullable', $in('glare', 'auto')],
            'axes.rarityMark' => ['nullable', $in('rarity', 'auto', 'none')],
            'axes.tag' => ['nullable', $in('tag', 'none')],
            'axes.badge' => ['nullable', $in('badge', 'none')],
            'axes.icon' => ['nullable', $in('icon', 'none')],
            'axes.effect' => ['nullable', $in('effect', 'none')],
            // Not an asset row: ATTRIBUTE_FRAMES is a CSS style list in cardModel.ts.
            'axes.attributeFrame' => ['nullable', Rule::in(['none', 'grey', 'shining', 'black', 'mega'])],
            // Free text (a pre-evolution name), so length is the only real bound.
            'axes.evolvesFrom' => ['nullable', 'string', 'max:40'],
            // firstEdition is deliberately absent: it is a print-run fact the server derives from
            // account age below, not something a client gets to claim.
        ]);

        $user = Auth::user();
        $login = $user->github_login;

        if (! $login) {
            return back()->withErrors(['card' => 'Sign in with GitHub to generate your card.']);
        }

        /*
         * The daily quota, spent HERE rather than by the middleware: a press that never reaches the
         * AI - a captcha typo, an axis slug that no longer exists - should not cost a generation.
         * The burst limiter still bounds how fast those can be thrown. Admins are not blocked, but
         * they are still counted, so the panel shows their real usage against the same cap.
         */
        $quota = new RegenQuota($user);
        if ($quota->exceeded()) {
            $resets = now()->addSeconds($quota->resetsIn())->diffForHumans();

            return back()->withErrors([
                'card' => "Daily limit reached - {$quota->limit()} card generations per day. Resets {$resets}.",
            ]);
        }
        $quota->hit();

        [$gh, $err] = $svc->ghGet('https://api.github.com/users/'.rawurlencode($login));
        if ($err !== null || ! is_array($gh)) {
            return back()->withErrors(['card' => 'GitHub is unreachable or rate-limited. Try again in a minute.']);
        }

        [$repos] = $svc->ghGet('https://api.github.com/users/'.rawurlencode($login).'/repos?per_page=100&sort=pushed');
        $profile = $svc->buildProfile($gh, is_array($repos) ? $repos : []);

        $loreFailed = false;
        $ai = config('pokehub.ai');
        if (! empty($ai['enabled']) && ! empty($ai['key'])) {
            $profile['readme'] = $svc->fetchReadme($login);
            $profile['orgs'] = $svc->fetchOrgs($login);
            // A timed-out AI returns null; keep the existing lore rather than wiping it - but say
            // so below. Keeping it QUIETLY is how a broken endpoint went unnoticed: every press
            // flashed "regenerated" in green while the card never changed a word.
            $lore = $svc->aiGenerate($profile);
            $loreFailed = $lore === null;
            $profile['ai'] = $lore ?? ($user->card['profile']['ai'] ?? null);
            unset($profile['readme'], $profile['orgs']);
        }
        $profile['rarity'] = $svc->rarityFor($login, $profile);

        $user->card = [
            'profile' => $profile,
            'rarity' => $profile['rarity'],
            // Axes are the client's vocabulary; an empty blob means "defaults". The server seeds
            // one: the 1st Edition stamp marks a first print run, so it goes to the accounts that
            // were here first, and only the profile knows how old an account is. resolveOverrides
            // still drops it on any frame but Base Set.
            //
            // Stored axes are on the LEFT, so `+` keeps them: whatever the card lab saved wins,
            // and the derived value only fills the gap. Seeding on the left would quietly undo an
            // admin's choice on the next regenerate.
            //
            // The freshly rolled axes are the exception, and sit LEFT of the stored ones on purpose:
            // "Regenerate" has to hand back a visibly different card, which it cannot do if last
            // run's frame and type always win. An empty roll (options not loaded yet, or a client
            // that sends nothing) leaves the saved card exactly as it was.
            'axes' => (array) ($data['axes'] ?? [])
                + (array) ($user->card['axes'] ?? [])
                + ['firstEdition' => (int) ($profile['age_years'] ?? 0) >= self::FIRST_EDITION_YEARS],
        ];
        $user->save();

        activity('card')
            ->causedBy($user)
            ->performedOn($user)
            ->withProperties(['slug' => $user->slug, 'login' => $login])
            ->log('Regenerated card');

        // The stats and the type did refresh either way, so this is a warning, not a failure -
        // it just reuses the error box rather than growing a third flash channel for one line.
        return $loreFailed
            ? back()->withErrors(['card' => 'Card refreshed, but the AI never answered - the previous flavour text was kept.'])
            : back()->with('success', 'Your card was regenerated.');
    }
}
