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
     * Shared, so the two cannot show the same card differently.
     *
     * Null when the profile row is a stub, so the caller can skip the card rather than render it
     * empty.
     */
    public function cardPayload(?Profile $profile): ?array
    {
        // split(), not github_json: a legacy row keeps everything in `payload` and reading the
        // column straight makes the card look like a stub, so the showcase silently drops it.
        [$github, $card] = $profile?->split() ?? [null, null];
        if (! is_array($github) || empty($github['login'])) {
            return null;
        }

        return [
            'profile' => $github + ['ai' => $card['ai'] ?? null],
            'rarity' => $this->rarity ?: config('pokehub.default_rarity', 'common'),
            'axes' => (object) ($this->axes ?? []),
        ];
    }
}
