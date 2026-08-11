<?php

namespace Database\Seeders;

use App\Models\ShowcaseCard;
use Illuminate\Database\Seeder;

/**
 * Seed for the four landing-page cards. This is the STARTING data only - `showcase_cards` is the
 * source of truth afterwards and the admin card lab edits it, so nothing here is read at runtime.
 *
 * Chosen for recognition and for four different element types, so the row is not four cards of the
 * same colour. `generation` is an editorial call about the PERSON's era, not their join year.
 *
 * `rarity` and `mark` live here rather than in config/pokehub.php. The config map is the override
 * for a LOGIN's own generated card; a showcase card is a different thing that happens to share a
 * handle, and reading one from the other left two places to disagree.
 */
class ShowcaseCardSeeder extends Seeder
{
    /**
     * All four sit at the top of the ladder - they are famous accounts - but each prints a
     * DIFFERENT symbol, ordered by the rarity score their real profiles earn (torvalds 9.6,
     * gaearon 9.1, t3dotgg 7.8, gvanrossum 7.4). Every preset here is ultra-tier, so leaving the
     * mark on 'auto' gave all four the same two stars, which is what made the row look identical.
     */
    private const ROWS = [
        [
            'login' => 'torvalds',
            'name' => 'Linus Torvalds',
            'why' => 'Created Linux and Git.',
            'rarity' => 'secret',
            'gen' => '1-gen',
            'mark' => 'crown',
            'dual' => 'auto',
        ],
        [
            'login' => 'gaearon',
            'name' => 'Dan Abramov',
            'why' => "Co-created Redux and wrote React's docs.",
            'rarity' => 'specialillust',
            'gen' => 'tcg-gen',
            'mark' => 's3',
            'dual' => 'auto',
        ],
        [
            'login' => 't3dotgg',
            'name' => 'Theo Browne',
            'why' => 'Builds T3 Stack and teaches TypeScript.',
            'rarity' => 'rainbow',
            'gen' => 'tcg-gen',
            'mark' => 's2',
            // His second language is JavaScript. Stored as the resolved element rather than a
            // language name, since a seed is a one-time editorial choice and a PHP copy of
            // langType() would only drift from the TypeScript original.
            'dual' => 'lightning',
        ],
        [
            'login' => 'gvanrossum',
            'name' => 'Guido van Rossum',
            'why' => 'Created Python.',
            'rarity' => 'shinyv',
            'gen' => '1-gen',
            'mark' => 's1',
            'dual' => 'auto',
        ],
    ];

    public function run(): void
    {
        foreach (self::ROWS as $i => $row) {
            ShowcaseCard::updateOrCreate(
                ['login' => $row['login']],
                [
                    'name' => $row['name'],
                    'why' => $row['why'],
                    'rarity' => $row['rarity'],
                    'axes' => [
                        'generation' => $row['gen'],
                        // Base Set stamp is 1-gen art; resolveOverrides drops it elsewhere.
                        'firstEdition' => $row['gen'] === '1-gen',
                        'rarityMark' => $row['mark'],
                        'dualType' => $row['dual'],
                    ],
                    'sort_order' => $i,
                    'is_active' => true,
                ]
            );
        }
    }
}
