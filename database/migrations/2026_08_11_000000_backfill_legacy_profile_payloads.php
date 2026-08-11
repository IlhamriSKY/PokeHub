<?php

use App\Models\Profile;
use App\Services\GithubCardService;
use Illuminate\Database\Migrations\Migration;

/**
 * Move rows still holding everything in `payload` into the `github_json` / `card_json` split.
 *
 * Profile::split() teaches every reader to understand the legacy shape, but four of them read
 * `github_json` straight (AvatarCache::locate, ShowcaseCard::cardPayload, CardSettingsService)
 * and so saw nothing at all. The visible symptom was `GET /avatar/{login}` answering 404 for those
 * logins at all four sizes - a card with a hole where the face goes - because locate() had no url
 * to fetch or even to redirect to.
 *
 * Fixed here rather than in the four readers because nothing has written `payload` since the
 * columns were split, so this is a fixed set of historical rows, not a shape that can come back.
 * Backfilling them retires the legacy branch instead of asking every future reader to remember it.
 *
 * Uses split() itself, so the one definition of "what the old shape means" stays in the model.
 */
return new class extends Migration
{
    public function up(): void
    {
        $svc = app(GithubCardService::class);

        foreach (Profile::whereNull('github_json')->get() as $row) {
            [$github, $card] = $row->split();
            if (! is_array($github) || empty($github['login'])) {
                continue; // a stub row: nothing to carry forward
            }

            // AI inputs only - the current writer keeps github_json compact.
            unset($github['readme'], $github['orgs']);

            $row->update([
                'github_json' => $github,
                // Matches what ensureProfile() writes today: rarity is stored, not derived on
                // render, so the admin lab can restyle these like any other card - and the gallery
                // stops re-scoring them on every page load.
                'card_json' => [
                    'ai' => $card['ai'] ?? null,
                    'rarity' => $svc->rarityFor($github['login'], $github),
                    'axes' => [],
                ],
            ]);
        }
    }

    /**
     * Nothing to undo: `payload` is left untouched above, so the original rows are still there and
     * split() keeps preferring github_json while it exists. Clearing the two columns here would
     * also have to know which rows this migration wrote, since five rows already had both.
     */
    public function down(): void {}
};
