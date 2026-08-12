<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use App\Support\Seo;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

/**
 * The home page and its showcase.
 *
 * Showcase cards come from already-cached profile rows and are never fetched at render time: a
 * cold fetch is a GitHub call plus an AI call, which the home page should not make a visitor wait
 * for. A login with no cached row is skipped rather than rendered empty.
 */
class LandingController extends Controller
{
    public const CACHE_KEY = 'landing.showcase';

    /** Separate from CACHE_KEY on purpose - see trainers(). */
    public const TRAINERS_KEY = 'landing.trainers';

    public function index()
    {
        return Inertia::render('landing', $this->props([
            'seo' => Seo::make([
                'title' => config('app.name').' - any GitHub profile as a Pokemon card',
                'description' => 'Look up any GitHub username and get a Pokemon-style trading card built from their public profile. '
                    .'Followers become HP, stars become attack damage, the top language picks the element. No account needed.',
                'imageAlt' => 'PokeHub - a GitHub profile rendered as a Pokemon-style trading card',
                'canonical' => url('/'),
                'jsonLd' => [
                    '@context' => 'https://schema.org',
                    '@type' => 'WebSite',
                    'name' => config('app.name'),
                    'url' => url('/'),
                    'description' => Seo::make()['description'],
                ],
            ]),
        ]));
    }

    /**
     * The landing page's props, shared with the login route.
     *
     * /login renders this same page with a sign-in panel over it, so it needs the same showcase
     * behind the panel. Sharing the cached query means opening the panel costs nothing extra.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public function props(array $extra = []): array
    {
        $showcase = Cache::remember(self::CACHE_KEY, now()->addHour(), function () {
            $cards = ShowcaseCard::where('is_active', true)->orderBy('sort_order')->get();

            $rows = Profile::whereIn('login', $cards->pluck('login'))
                ->get()
                ->keyBy(fn (Profile $p) => strtolower($p->login));

            return $cards
                ->map(function (ShowcaseCard $card) use ($rows) {
                    // Null when the profile row is a stub, so the card is dropped below.
                    $payload = $card->cardPayload($rows->get(strtolower($card->login)));

                    return $payload ? [
                        'login' => strtolower($card->login),
                        'name' => $card->name,
                        'why' => $card->why,
                    ] + $payload : null;
                })
                ->filter()
                ->values()
                ->all();
        });

        return ['showcase' => $showcase, 'trainers' => $this->trainers()] + $extra;
    }

    /**
     * Faces for the hero's link to the gallery.
     *
     * Real generated cards rather than the four editorial showcase entries. The whole argument that
     * link makes is "other people are already in here", and four hand-picked celebrities are the
     * one set of faces that cannot make it - they are the same four fanned out beside the link.
     *
     * Every row in `profiles` IS a generated card, so the pool is that table minus the handles
     * whose owner has hidden themselves. `is_public` is the same flag the gallery and the public
     * page already answer to, and it is checked here rather than trusted from anywhere else,
     * because this is the one prop on the busiest page that puts a face on a stranger's account.
     *
     * The POOL is cached, not the pick: shuffling per request keeps the faces changing on every
     * visit while still costing one query an hour. Its own cache key, so an admin editing the
     * showcase does not have to invalidate a list that has nothing to do with it.
     *
     * @return list<array{login: string, avatar: string}>
     */
    private function trainers(int $take = 4): array
    {
        $pool = Cache::remember(self::TRAINERS_KEY, now()->addHour(), function () {
            $hidden = User::where('is_public', false)
                ->whereNotNull('github_login')
                ->pluck('github_login')
                ->map(fn ($l) => mb_strtolower((string) $l))
                ->all();

            return Profile::all()
                ->map(function (Profile $p) {
                    // split(), not github_json: a legacy payload-only row is still a generated card.
                    [$github] = $p->split();

                    return is_array($github) && ! empty($github['login']) && ! empty($github['avatar'])
                        ? ['login' => mb_strtolower((string) $github['login']), 'avatar' => (string) $github['avatar']]
                        : null;
                })
                ->filter()
                ->reject(fn (array $t) => in_array($t['login'], $hidden, true))
                ->values()
                ->all();
        });

        shuffle($pool);

        return array_slice($pool, 0, $take);
    }
}
