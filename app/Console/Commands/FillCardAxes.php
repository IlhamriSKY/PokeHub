<?php

namespace App\Console\Commands;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use App\Services\GithubCardService;
use Illuminate\Console\Command;

/**
 * Fill in the card fields that were never stored, so no card is left deciding them at render time.
 *
 * Three things could be missing, and all three have the same cause: card_json was written by a path
 * that only knew about `ai`.
 *
 *   rarity     - absent, so every reader recomputed one from the live GitHub stats. A card whose
 *                followers moved could change rarity without anyone touching it.
 *   generation - absent, so the axes blob meant "every default", and the default is 1-gen. Every
 *                generated card on the site was a Base Set card.
 *   glare      - absent, so the foil read `auto`: not a foil, but "whatever the rarity implies".
 *
 * Only ever fills a MISSING key. A value someone chose in the lab is editorial and is never
 * overwritten, which is what makes this safe to run again - and it will be, since it is the repair
 * for rows written before the writers were fixed.
 */
class FillCardAxes extends Command
{
    protected $signature = 'pokehub:card-axes {--dry-run : Report what would change and write nothing}';

    protected $description = 'Give every stored card an explicit rarity, generation and foil';

    public function handle(GithubCardService $svc): int
    {
        $dry = (bool) $this->option('dry-run');
        $touched = 0;

        // Generated cards. The rarity has to be derived from the profile itself when absent, which
        // is exactly what every reader was silently doing on each render.
        foreach (Profile::all() as $row) {
            [$github, $card] = $row->split();
            if (! is_array($github) || empty($github['login'])) {
                $this->warn("  skip {$row->login}: no usable profile");

                continue;
            }

            $card = is_array($card) ? $card : [];
            $filled = $this->fill($card, $svc, $github['login'], $github);
            if (! $filled) {
                continue;
            }

            $touched++;
            $this->line(sprintf('  %-24s %s', $row->login, implode(', ', $filled)));
            if (! $dry) {
                $row->update(['card_json' => $card]);
            }
        }

        // Claimed accounts keep their own copy of the card, with the same three keys.
        foreach (User::whereNotNull('card')->get() as $user) {
            $card = is_array($user->card) ? $user->card : [];
            $login = $card['profile']['login'] ?? $user->github_login;
            if (! $login) {
                continue;
            }

            $filled = $this->fill($card, $svc, (string) $login, is_array($card['profile'] ?? null) ? $card['profile'] : []);
            if (! $filled) {
                continue;
            }

            $touched++;
            $this->line(sprintf('  %-24s %s', 'user:'.$user->slug, implode(', ', $filled)));
            if (! $dry) {
                $user->update(['card' => $card]);
            }
        }

        // Showcase cards hold rarity and axes in their own columns rather than in a card blob, so
        // only the foil is ever missing here - the rarity is picked by hand when the card is added.
        foreach (ShowcaseCard::all() as $show) {
            $axes = is_array($show->axes) ? $show->axes : [];
            if (($axes['glare'] ?? '') !== '' && $axes['glare'] !== 'auto') {
                continue;
            }

            $axes['glare'] = $svc->glareFor((string) $show->rarity);
            $touched++;
            $this->line(sprintf('  %-24s glare=%s', 'showcase:'.$show->login, $axes['glare']));
            if (! $dry) {
                $show->update(['axes' => $axes]);
            }
        }

        $this->info($dry
            ? "{$touched} cards would be filled in. Run without --dry-run to write."
            : "{$touched} cards filled in.");

        return self::SUCCESS;
    }

    /**
     * Add whatever is missing to `$card`, by reference. Returns the labels of what it added, so an
     * unchanged card can be skipped without a second comparison.
     *
     * @param  array<string, mixed>  $card
     * @param  array<string, mixed>  $profile
     * @return list<string>
     */
    private function fill(array &$card, GithubCardService $svc, string $login, array $profile): array
    {
        $filled = [];

        if (($card['rarity'] ?? '') === '') {
            $card['rarity'] = $svc->rarityFor($login, $profile);
            $filled[] = 'rarity='.$card['rarity'];
        }

        $axes = is_array($card['axes'] ?? null) ? $card['axes'] : [];
        // Derived together, because the generation is hashed off the login and the foil off the
        // rarity - asking for one at a time would read the asset table twice per row.
        $derived = $svc->axesFor($login, (string) $card['rarity']);

        foreach (['generation', 'glare'] as $axis) {
            // 'auto' is stored by the lab to mean "no override", and for the foil that is the very
            // thing being repaired, so it counts as missing.
            if (($axes[$axis] ?? '') !== '' && $axes[$axis] !== 'auto') {
                continue;
            }
            if (! isset($derived[$axis])) {
                continue;
            }
            $axes[$axis] = $derived[$axis];
            $filled[] = $axis.'='.$derived[$axis];
        }

        if ($filled) {
            $card['axes'] = $axes;
        }

        return $filled;
    }
}
