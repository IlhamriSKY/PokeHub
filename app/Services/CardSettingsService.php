<?php

namespace App\Services;

use App\Http\Controllers\LandingController;
use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * The card lab, server side.
 *
 * Two kinds of card can be restyled, a user's own and a landing-page showcase card, and they live
 * in different tables. The panel addresses both through one "type:id" handle.
 */
class CardSettingsService
{
    /** Everything an admin may restyle, as a flat picker list. */
    public function targets(): array
    {
        $showcase = ShowcaseCard::orderBy('sort_order')
            ->get()
            ->map(fn (ShowcaseCard $s) => [
                'key' => "showcase:{$s->id}",
                'label' => $s->name,
                'sub' => "@{$s->login}",
                'group' => 'Homepage',
            ]);

        $users = User::query()
            ->select(['id', 'name', 'github_login'])
            ->whereNotNull('card')
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => [
                'key' => "user:{$u->id}",
                'label' => $u->name,
                'sub' => $u->github_login ? "@{$u->github_login}" : '',
                'group' => 'Users',
            ]);

        // Cards someone generated from the home page without signing in. They live in `profiles`
        // and belong to nobody, so nothing else in the panel could reach them - the lab could
        // restyle a claimed card and a homepage card but not the ones the site actually produces
        // most of. Showcase logins are excluded: those are the same profile row seen through a
        // ShowcaseCard, and listing both would offer two handles for one card.
        $claimed = User::whereNotNull('github_login')->pluck('github_login')->map('strtolower');
        $onShow = ShowcaseCard::pluck('login')->map('strtolower');

        $generated = Profile::query()
            ->orderBy('login')
            ->get()
            ->reject(fn (Profile $p) => $claimed->contains(strtolower($p->login)) || $onShow->contains(strtolower($p->login)))
            ->map(function (Profile $p) {
                [$github] = $p->split();

                return is_array($github) && ! empty($github['login']) ? [
                    'key' => "profile:{$p->login}",
                    'label' => ($github['name'] ?? '') !== '' ? $github['name'] : $github['login'],
                    'sub' => '@'.$github['login'],
                    'group' => 'Generated',
                ] : null;
            })
            ->filter()
            ->values();

        return $showcase->concat($users)->concat($generated)->values()->all();
    }

    /** Resolve a "type:id" handle into a renderable card, or null when it names nothing. */
    public function find(string $key): ?array
    {
        [$type, $id] = array_pad(explode(':', $key, 2), 2, null);

        if ($type === 'showcase' && $id) {
            $row = ShowcaseCard::find($id);
            if (! $row) {
                return null;
            }
            // The GitHub half comes from the cached profile; only the styling is editable. One
            // find() and split(), so the prose comes from the same row as the profile and a legacy
            // payload-only row still resolves instead of reading as a stub.
            [$profile, $card] = Profile::find($row->login)?->split() ?? [null, null];
            if (! is_array($profile) || empty($profile['login'])) {
                return null;
            }

            $lore = $card['ai'] ?? null;

            return [
                'key' => $key,
                'label' => $row->name,
                'sub' => "@{$row->login}",
                'card' => [
                    'profile' => $profile + ['ai' => $lore],
                    'rarity' => $row->rarity ?: config('pokehub.default_rarity', 'common'),
                    'axes' => (object) ($row->axes ?? []),
                ],
                'text' => $this->text($profile['name'] ?? '', $lore, ['why' => $row->why]),
            ];
        }

        if ($type === 'user' && $id) {
            $row = User::find($id);
            if (! $row || ! is_array($row->card) || empty($row->card['profile'])) {
                return null;
            }

            return [
                'key' => $key,
                'label' => $row->name,
                'sub' => $row->github_login ? "@{$row->github_login}" : '',
                'card' => [
                    'profile' => $row->card['profile'],
                    'rarity' => $row->card['rarity'] ?? config('pokehub.default_rarity', 'common'),
                    'axes' => (object) ($row->card['axes'] ?? []),
                ],
                'text' => $this->text($row->card['profile']['name'] ?? '', $row->card['profile']['ai'] ?? null),
            ];
        }

        if ($type === 'profile' && $id) {
            $row = Profile::find(strtolower($id));
            [$github, $card] = $row?->split() ?? [null, null];
            if (! is_array($github) || empty($github['login'])) {
                return null;
            }

            return [
                'key' => $key,
                'label' => ($github['name'] ?? '') !== '' ? $github['name'] : $github['login'],
                'sub' => '@'.$github['login'],
                'card' => [
                    'profile' => $github + ['ai' => $card['ai'] ?? null],
                    'rarity' => $card['rarity'] ?? config('pokehub.default_rarity', 'common'),
                    'axes' => (object) ($card['axes'] ?? []),
                ],
                'text' => $this->text($github['name'] ?? '', $card['ai'] ?? null),
            ];
        }

        return null;
    }

    /** The card's editable prose, in one shape for both kinds of target. */
    private function text(string $name, ?array $lore, array $extra = []): array
    {
        $attacks = array_values(array_filter((array) ($lore['attacks'] ?? []), 'is_array'));

        return $extra + [
            'name' => $name,
            'species' => (string) ($lore['species'] ?? ''),
            'flavor' => (string) ($lore['flavor'] ?? ''),
            'effect' => (string) ($lore['effect'] ?? ''),
            'attacks' => array_map(fn (array $a) => [
                'name' => (string) ($a['name'] ?? ''),
                'cost' => (int) ($a['cost'] ?? 1),
                'damage' => (string) ($a['damage'] ?? ''),
                'desc' => (string) ($a['desc'] ?? ''),
            ], array_slice($attacks, 0, 2)),
        ];
    }

    /**
     * Fold edited prose back into a stored lore blob, keeping keys the form does not own.
     *
     * Checked key by key, because every `text.*` rule is nullable and the two absences mean
     * different things: a missing key was not edited, while a present null was cleared by
     * ConvertEmptyStringsToNull and should stay empty.
     */
    private function mergeLore(?array $lore, array $text): array
    {
        $out = (array) $lore;
        foreach (['species', 'flavor', 'effect'] as $k) {
            if (array_key_exists($k, $text)) {
                $out[$k] = (string) $text[$k];
            }
        }
        if (array_key_exists('attacks', $text)) {
            $out['attacks'] = (array) $text['attacks'];
        }

        return $out;
    }

    /** Persist axes + rarity + text for either kind of target. False when the key names nothing. */
    public function save(string $key, array $axes, string $rarity, ?array $text = null): bool
    {
        [$type, $id] = array_pad(explode(':', $key, 2), 2, null);

        if ($type === 'showcase' && $id) {
            $row = ShowcaseCard::find($id);
            if (! $row) {
                return false;
            }
            // array_key_exists rather than `??`, so clearing the caption actually clears it: the
            // middleware turns an empty field into null, which `??` would read as "not sent".
            $why = array_key_exists('why', (array) $text) ? ['why' => $text['why']] : [];
            $row->update(['axes' => $axes, 'rarity' => $rarity] + $why);

            if ($text) {
                // Card prose lives on the cached profile row, which is what renders. The showcase
                // row only carries the editorial caption.
                $profileRow = Profile::find($row->login);
                // split() rather than casting the columns: on a legacy row `github_json` is null,
                // so `(array) null` plus a name wrote the whole profile away as `{"name": "..."}` -
                // renaming a showcase card would have destroyed the card it renames.
                [$github, $card] = $profileRow?->split() ?? [null, null];
                if (is_array($github) && ! empty($github['login'])) {
                    $card = (array) $card;
                    $card['ai'] = $this->mergeLore($card['ai'] ?? null, $text);
                    $github['name'] = $text['name'];
                    $profileRow->update(['card_json' => $card, 'github_json' => $github]);
                }
            }
            // The landing page caches its showcase for an hour, so drop the key rather than let an
            // edit sit invisible until it expires.
            Cache::forget(LandingController::CACHE_KEY);

            return true;
        }

        if ($type === 'user' && $id) {
            $row = User::find($id);
            if (! $row || ! is_array($row->card)) {
                return false;
            }
            // Merge, never replace: everything the panel does not own is generated data.
            $card = ['axes' => $axes, 'rarity' => $rarity] + $row->card;
            if ($text) {
                $card['profile']['name'] = $text['name'];
                $card['profile']['ai'] = $this->mergeLore($card['profile']['ai'] ?? null, $text);
            }
            $row->card = $card;
            $row->save();

            return true;
        }

        if ($type === 'profile' && $id) {
            $row = Profile::find(strtolower($id));
            [$github, $card] = $row?->split() ?? [null, null];
            if (! is_array($github) || empty($github['login'])) {
                return false;
            }

            $card = (array) $card;
            $card['axes'] = $axes;
            $card['rarity'] = $rarity;
            if ($text) {
                // The prose lives on the profile's own github_json/card_json, the same split the
                // showcase branch above writes through - a generated card has no user row to hold
                // it, and rewriting it here is what makes the lab's text fields do anything.
                $card['ai'] = $this->mergeLore($card['ai'] ?? null, $text);
                $github['name'] = $text['name'];
            }
            $row->update(['github_json' => $github, 'card_json' => $card]);

            // A generated login can also be a showcase card's source row, so the homepage may be
            // rendering exactly what just changed.
            Cache::forget(LandingController::CACHE_KEY);

            return true;
        }

        return false;
    }
}
