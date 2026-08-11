<?php

namespace Database\Seeders;

use App\Services\GithubCardService;
use Illuminate\Database\Seeder;

/**
 * Fills `profiles` with well-known developers so a fresh install has real cards to browse.
 *
 * Deliberately NOT in DatabaseSeeder: every login here costs four GitHub calls and one AI
 * completion, so `db:seed` would sit for minutes on the network. Run it on demand:
 *
 *   php artisan db:seed --class=FamousProfileSeeder
 *
 * The data is real rather than faked. ensureProfile() already fetches, writes the lore and scores
 * the rarity, and a hand-written github_json would have to mirror thirty fields to render at all -
 * more code than this, and wrong the moment the payload shape moves.
 *
 * Idempotent: ensureProfile() returns an existing row untouched, so re-running costs nothing and
 * a login that was rate-limited last time is picked up on the next run.
 */
class FamousProfileSeeder extends Seeder
{
    /**
     * Picked for recognition and for a spread of top languages, since the card takes its element
     * from the language - ten JavaScript developers would print ten cards of the same colour.
     */
    private const LOGINS = [
        'yyx990803',    // Evan You - Vue, Vite
        'antfu',        // Anthony Fu - VueUse, Vitest
        'Rich-Harris',  // Rich Harris - Svelte, Rollup
        'tj',           // TJ Holowaychuk - Express, Koa
        'kentcdodds',   // Kent C. Dodds - Testing Library
        'dhh',          // David Heinemeier Hansson - Rails
        'taylorotwell', // Taylor Otwell - Laravel
        'fabpot',       // Fabien Potencier - Symfony
        'mitchellh',    // Mitchell Hashimoto - Terraform, Ghostty
        'bradfitz',     // Brad Fitzpatrick - memcached, Go, Tailscale
    ];

    public function run(): void
    {
        $svc = app(GithubCardService::class);

        foreach (self::LOGINS as $login) {
            [$row, $err] = $svc->ensureProfile($login);

            if ($err !== null) {
                $this->command->warn("  $login - $err");

                continue;
            }

            $card = $row->card_json ?? [];
            $this->command->info(sprintf(
                '  %-14s %-14s %s',
                $row->login,
                $card['rarity'] ?? '?',
                empty($card['ai']['flavor']) ? '(no AI lore)' : $card['ai']['flavor']
            ));
        }
    }
}
