<?php

namespace App\Services;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;

/**
 * Resolve a public slug to a renderable card.
 *
 * Three things answer to a slug, in this order: a claimed account's own card, a landing-page
 * showcase card, and the cached `profiles` row left behind when someone generated that handle from
 * the home page. Both the HTML page and the README image need the same answer, so the lookup lives
 * here rather than in either controller.
 */
class PublicCardLookup
{
    /**
     * `['owner' => [...], 'card' => ['profile'=>, 'rarity'=>, 'axes'=>], 'claimed' => bool]`,
     * or null for a 404.
     */
    public function find(string $slug): ?array
    {
        /*
         * The privacy gate sits ahead of every branch, not inside the first one: the dashboard
         * toggle promises the card is gone from the site, so a hidden row must not fall through to
         * the showcase or the profile cache below.
         *
         * Matched on github_login as well as slug, because an admin can edit a slug and the handle
         * is what a searcher types.
         */
        $hidden = User::query()
            ->where('is_public', false)
            ->where(fn ($q) => $q->where('slug', $slug)->orWhere('github_login', $slug))
            ->exists();

        if ($hidden) {
            return null;
        }

        $user = User::query()
            ->select(['name', 'slug', 'avatar', 'card'])
            ->where('slug', $slug)
            ->where('is_public', true)
            ->first();

        if ($user && is_array($user->card) && ! empty($user->card)) {
            return [
                'owner' => ['name' => $user->name, 'slug' => $user->slug, 'avatar' => $user->avatar],
                'card' => $user->card,
                'claimed' => true,
            ];
        }

        $showcase = ShowcaseCard::where('login', $slug)->where('is_active', true)->first();
        $card = $showcase?->cardPayload(Profile::find(strtolower($slug)));

        if ($card) {
            return [
                'owner' => [
                    'name' => $showcase->name,
                    'slug' => strtolower($showcase->login),
                    'avatar' => $card['profile']['avatar'] ?? null,
                ],
                'card' => $card,
                'claimed' => false,
            ];
        }

        return $this->fromProfile($slug);
    }

    /**
     * A card someone generated from the home page: cached GitHub data with no owner behind it.
     *
     * Axes are left empty so the client falls back to DEFAULT_AXES, a Base Set frame with the
     * element derived from the top language. Restyling is a claimed-card feature.
     *
     * @return array<string, mixed>|null
     */
    private function fromProfile(string $slug): ?array
    {
        $row = Profile::find(strtolower($slug));
        [$github, $card] = $row?->split() ?? [null, null];

        if (! is_array($github) || empty($github['login'])) {
            return null;
        }

        return [
            'owner' => [
                'name' => ($github['name'] ?? '') !== '' ? $github['name'] : $github['login'],
                'slug' => strtolower($github['login']),
                'avatar' => $github['avatar'] ?? null,
            ],
            'card' => [
                'profile' => $github + ['ai' => $card['ai'] ?? null],
                // Derived rather than stored, so a card cannot report one rarity before it is
                // claimed and another after.
                'rarity' => app(GithubCardService::class)->rarityFor($github['login'], $github),
                'axes' => (object) [],
            ],
            'claimed' => false,
        ];
    }
}
