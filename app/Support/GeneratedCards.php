<?php

namespace App\Support;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use App\Services\GithubCardService;
use Illuminate\Support\Collection;

/**
 * The cards nobody owns: generated from the home page by a visitor who never signed in.
 *
 * They live in `profiles`, which until now only two things read - the public `/{slug}` page and
 * the landing showcase. Every listing in the app queried `users` instead, so the cards the site
 * actually produces most of were invisible: absent from the gallery search, absent from the admin
 * card list, and unreachable by the card lab. This is the one place that knows how to find them,
 * shared so the gallery and the admin panel cannot answer the question differently.
 *
 * Rows claimed by an account, or standing in for a homepage showcase card, are left out: both are
 * already listed by their own table, and showing them twice would offer two handles for one card.
 */
class GeneratedCards
{
    /**
     * Normalised rows, newest first, optionally filtered by name/login and rarity.
     *
     * Filtered in PHP rather than in SQL, because the display name lives inside `github_json` and
     * a JSON path is unindexed anyway. The row count is the number of handles anyone has ever
     * generated, bounded by the Turnstile plus per-IP daily quota on generating one - so this
     * reads a small table whole. If that table ever grows past a few thousand, this is the method
     * to push down into the database, and the only one.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public static function all(string $search = '', string $rarity = ''): Collection
    {
        $claimed = User::whereNotNull('github_login')->pluck('github_login')->map(fn ($l) => strtolower((string) $l));
        $onShow = ShowcaseCard::pluck('login')->map(fn ($l) => strtolower((string) $l));
        $needle = mb_strtolower($search);
        // Hoisted out of the map: app() hands back a NEW service per call for an unbound concrete
        // class, so building it per row gave every rarityFor() its own uncached preset lookup.
        $svc = app(GithubCardService::class);

        return Profile::query()
            ->orderByDesc('fetched_at')
            ->get()
            ->reject(fn (Profile $p) => $claimed->contains(strtolower($p->login)) || $onShow->contains(strtolower($p->login)))
            ->map(function (Profile $p) use ($svc) {
                [$github, $card] = $p->split();
                if (! is_array($github) || empty($github['login'])) {
                    return null;
                }

                $name = ($github['name'] ?? '') !== '' ? $github['name'] : $github['login'];
                // Once per row, not twice: the listing and the nested card payload want the same
                // answer, and scoring it is a preset lookup rather than a field read.
                $rarity = $card['rarity'] ?? $svc->rarityFor($github['login'], $github);

                return [
                    'key' => 'profile:'.strtolower($p->login),
                    'name' => $name,
                    'slug' => strtolower($github['login']),
                    'github_login' => $github['login'],
                    'avatar' => $github['avatar'] ?? null,
                    'rarity' => $rarity,
                    'followers' => isset($github['followers']) ? (int) $github['followers'] : null,
                    'stars' => isset($github['stars']) ? (int) $github['stars'] : null,
                    'fetched_at' => (int) $p->fetched_at,
                    'card' => [
                        'profile' => $github + ['ai' => $card['ai'] ?? null],
                        'rarity' => $rarity,
                        'axes' => (object) ($card['axes'] ?? []),
                    ],
                ];
            })
            ->filter()
            // The display name is not a column, so the name half of the search is applied here.
            ->filter(fn (array $r) => $needle === ''
                || str_contains(mb_strtolower($r['name']), $needle)
                || str_contains(mb_strtolower($r['github_login']), $needle))
            ->filter(fn (array $r) => $rarity === '' || $r['rarity'] === $rarity)
            ->values();
    }
}
