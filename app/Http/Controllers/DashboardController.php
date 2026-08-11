<?php

namespace App\Http\Controllers;

use App\Models\CardAsset;
use App\Rules\Turnstile as TurnstileRule;
use App\Services\AvatarCache;
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
            // Top-level rather than nested in `profile`, because the countdown reloads this key on
            // its own and a partial reload can only ask for a root prop.
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

    public function regenerate(Request $request, GithubCardService $svc, AvatarCache $avatars)
    {
        // The AI call alone is allowed 120s by config, which is longer than PHP's default
        // max_execution_time. Without this the worker is killed before the model replies.
        @set_time_limit((int) config('pokehub.ai.timeout', 60) + 60);

        // Axes are re-rolled client-side (rollAxes in card-gallery.tsx), because the legality
        // rules live in the lab's tiles and a second copy here would drift. What the server owes
        // is the trust boundary: every slug must name a real, enabled asset, so a hand-made POST
        // cannot pin the card to something that renders nothing.
        $slugs = CardAsset::where('enabled', true)->get(['category', 'slug'])->groupBy('category')->map->pluck('slug');
        $in = fn (string $category, string ...$extra) => Rule::in($slugs->get($category, collect())->merge($extra));

        // The Turnstile rule is implicit, so it rejects a missing token itself and no-ops when
        // Turnstile is off. Adding `nullable` here would put the skip back.
        $data = $request->validate([
            'cf-turnstile-response' => [new TurnstileRule],
            'axes' => ['nullable', 'array'],
            'axes.generation' => ['nullable', $in('generation')],
            'axes.variant' => ['nullable', $in('variant', 'none')],
            // 'auto' is allowed like its siblings: rollAxes leaves element at the DEFAULT_AXES
            // sentinel whenever the roll lands on a template with no type section.
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
            // Free text (a pre-evolution name), so length is the only bound.
            'axes.evolvesFrom' => ['nullable', 'string', 'max:40'],
            // firstEdition is absent on purpose: the server derives it from account age below,
            // rather than letting a client claim it.
        ]);

        $user = Auth::user();
        $login = $user->github_login;

        if (! $login) {
            return back()->withErrors(['card' => 'Sign in with GitHub to generate your card.']);
        }

        /*
         * The daily quota is spent here rather than by middleware, so a press that never reaches
         * the AI (a captcha typo, a stale axis slug) does not cost a generation. The burst limiter
         * still bounds how fast those can be thrown.
         */
        $quota = new RegenQuota($user);
        if ($quota->exceeded()) {
            $resets = now()->addSeconds($quota->resetsIn())->diffForHumans();

            return back()->withErrors([
                'card' => "Daily limit reached: {$quota->limit()} card generations per day. Resets {$resets}.",
            ]);
        }
        // Spends the free welcome generation if this identity still has one, otherwise the daily
        // pot. Either way it is spent before the AI call, so every press that reaches the model
        // is counted.
        $quota->spend();

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
            // A timed-out AI returns null. Keep the existing lore rather than wiping it, but say
            // so below: keeping it quietly makes a broken endpoint look like a successful press.
            $lore = $svc->aiGenerate($profile);
            $loreFailed = $lore === null;
            $profile['ai'] = $lore ?? ($user->card['profile']['ai'] ?? null);
            unset($profile['readme'], $profile['orgs']);
        }
        $profile['rarity'] = $svc->rarityFor($login, $profile);

        $user->card = [
            'profile' => $profile,
            'rarity' => $profile['rarity'],
            // Axes are the client's vocabulary, and an empty blob means defaults. The server seeds
            // only firstEdition, since the 1st Edition stamp marks a first print run and only the
            // profile knows how old an account is. resolveOverrides drops it on any frame but
            // Base Set.
            //
            // Union order matters, and `+` keeps the leftmost: a fresh roll beats the stored axes
            // so Regenerate hands back a visibly different card, and both beat the derived seed.
            // An empty roll leaves the saved card exactly as it was.
            'axes' => (array) ($data['axes'] ?? [])
                + (array) ($user->card['axes'] ?? [])
                + ['firstEdition' => (int) ($profile['age_years'] ?? 0) >= self::FIRST_EDITION_YEARS],
        ];
        $user->save();

        // The one moment we KNOW the picture may have changed. GitHub's avatar url is the same
        // string before and after a new upload (`?v=4` is not a version), so nothing else can tell
        // AvatarCache to look again inside its weekly TTL.
        $avatars->forget($login);

        activity('card')
            ->causedBy($user)
            ->performedOn($user)
            ->withProperties(['slug' => $user->slug, 'login' => $login])
            ->log('Regenerated card');

        // The stats and the type refreshed either way, so this is a warning rather than a failure.
        // It reuses the error box instead of adding a third flash channel for one line.
        return $loreFailed
            ? back()->withErrors(['card' => 'Card refreshed, but the AI never answered, so the previous flavour text was kept.'])
            : back()->with('success', 'Your card was regenerated.');
    }
}
