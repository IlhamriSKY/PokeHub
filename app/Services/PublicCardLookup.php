<?php

namespace App\Services;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;

/**
 * Resolve a public slug to a renderable card.
 *
 * Two things answer to a slug: a claimed account's own card, and a landing-page showcase card
 * (those are public too, which is what the "@torvalds" links point at). Both the HTML page and the
 * README SVG need the same answer, so the lookup lives here rather than in either controller.
 */
class PublicCardLookup
{
    /** `['owner' => [...], 'card' => ['profile'=>, 'rarity'=>, 'axes'=>]]`, or null for a 404. */
    public function find(string $slug): ?array
    {
        $user = User::query()
            ->select(['name', 'slug', 'avatar', 'card'])
            ->where('slug', $slug)
            ->where('is_public', true)
            ->first();

        if ($user && is_array($user->card) && ! empty($user->card)) {
            return [
                'owner' => ['name' => $user->name, 'slug' => $user->slug, 'avatar' => $user->avatar],
                'card' => $user->card,
            ];
        }

        $showcase = ShowcaseCard::where('login', $slug)->where('is_active', true)->first();
        $card = $showcase?->cardPayload(Profile::find(strtolower($slug)));

        return $card ? [
            'owner' => [
                'name' => $showcase->name,
                'slug' => strtolower($showcase->login),
                'avatar' => $card['profile']['avatar'] ?? null,
            ],
            'card' => $card,
        ] : null;
    }
}
