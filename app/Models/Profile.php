<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Cached GitHub profile + generative card data. login is the natural key.
 */
class Profile extends Model
{
    protected $table = 'profiles';

    protected $primaryKey = 'login';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'github_json' => 'array',
        'card_json' => 'array',
        'payload' => 'array',
        'fetched_at' => 'integer',
    ];

    /**
     * This row as `[rawGithubData, generativeCardData]`, either of which may be null.
     *
     * Rows written before `github_json` and `card_json` were split still hold everything in
     * `payload` with the lore mixed in. Every reader goes through here, because one that only
     * understands the current shape reports a cache miss and regenerates a stored card.
     *
     * @return array{0: ?array<string, mixed>, 1: ?array<string, mixed>}
     */
    public function split(): array
    {
        $github = is_array($this->github_json) ? $this->github_json : null;
        $card = is_array($this->card_json) ? $this->card_json : null;

        if (! is_array($github) && is_array($this->payload) && ! empty($this->payload['login'])) {
            $legacy = $this->payload;
            $card = ['ai' => $legacy['ai'] ?? null];
            unset($legacy['ai'], $legacy['rarity'], $legacy['card']);
            $github = $legacy;
        }

        return [$github, $card];
    }
}
