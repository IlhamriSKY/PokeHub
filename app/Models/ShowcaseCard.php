<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A curated landing-page card. The GitHub data still comes from the cached `profiles` row; only
 * the editorial fields and the frame/effect axes live here, so the admin card lab can restyle a
 * showcase card exactly like a user's.
 */
class ShowcaseCard extends Model
{
    protected $guarded = [];

    protected $casts = [
        'axes' => 'array',
        'is_active' => 'boolean',
    ];

    /**
     * The `{profile, rarity, axes}` blob both the landing page and the public card page render.
     * Shared so those two cannot drift into showing the same card differently.
     *
     * Returns null for a stub profile row - better to skip a card than render an empty one.
     */
    public function cardPayload(?Profile $profile): ?array
    {
        $github = $profile?->github_json;
        if (! is_array($github) || empty($github['login'])) {
            return null;
        }

        return [
            'profile' => $github + ['ai' => $profile->card_json['ai'] ?? null],
            'rarity' => $this->rarity ?: config('pokehub.default_rarity', 'common'),
            'axes' => (object) ($this->axes ?? []),
        ];
    }
}
