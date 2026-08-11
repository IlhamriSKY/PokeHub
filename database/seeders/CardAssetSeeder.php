<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Default card options, ported verbatim from api/seed_assets.php. Mirrors
 * pokecardgenerator.com. Inserted with insertOrIgnore so re-running only adds
 * missing rows and never clobbers admin edits.
 */
class CardAssetSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [];
        $add = function (string $category, string $slug, string $label, string $generation = '', string $asset = '', ?array $meta = null, int $sort = 0) use (&$rows) {
            $rows[] = [
                'category' => $category,
                'slug' => $slug,
                'label' => $label,
                'generation' => $generation,
                'asset_url' => $asset,
                'meta' => $meta !== null ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
                'sort_order' => $sort,
                'enabled' => 1,
            ];
        };

        // --- generations ---
        $i = 0;
        foreach ([['1-gen', '1st Gen (classic)'], ['tcg-gen', 'TCG Pocket'], ['scarlet-violet', 'Scarlet & Violet']] as $g) {
            $add('generation', $g[0], $g[1], '', '', null, $i++);
        }

        // --- elements (energy types) with per-type frame colours [base, dark] ---
        $typeFrame = [
            'colorless' => ['#b7bcbf', '#969b9f'], 'grass' => ['#66c05c', '#4f9f4a'], 'fire' => ['#ec4b34', '#c5341f'],
            'water' => ['#4fa0dd', '#3a7fbc'], 'lightning' => ['#f4cb3a', '#d3a415'], 'psychic' => ['#a862b0', '#8a4d92'],
            'fighting' => ['#c65f2f', '#a04820'], 'darkness' => ['#5a6873', '#3d4850'], 'metal' => ['#adb3b7', '#8b9195'],
            'dragon' => ['#cba634', '#a9861b'], 'fairy' => ['#ec74ac', '#d4548e'],
        ];
        $i = 0;
        foreach ($typeFrame as $t => $c) {
            $add('element', $t, ucfirst($t), '', "/img/types/$t.png", ['frame' => $c], $i++);
        }

        // --- variants / templates, scoped per generation ---
        $variantsByGen = [
            '1-gen' => [['regular', 'Regular'], ['trainer', 'Trainer']],
            'tcg-gen' => [['regular', 'Regular'], ['full-art', 'Full Art'], ['trainer', 'Trainer'], ['trainer-full-art', 'Trainer Full Art']],
            'scarlet-violet' => [['regular', 'Regular'], ['regular-ex', 'Regular EX'], ['full-art', 'Full Art'],
                ['full-art-ex', 'Full Art EX'], ['trainer', 'Trainer'], ['trainer-full-art', 'Trainer Full Art']],
        ];
        foreach ($variantsByGen as $gen => $vs) {
            $i = 0;
            foreach ($vs as $v) {
                $add('variant', $v[0], $v[1], $gen, '', null, $i++);
            }
        }

        // --- frames (TCG Pocket frame styles) ---
        $frames = [['grey', 'Grey'], ['black-ex', 'Black'], ['full-art', 'Full Art'], ['ex-frame', 'Ex'], ['ex-full-art', 'Ex Full Art'],
            ['immersive', 'Immersive'], ['rainbow', 'Rainbow'], ['crown', 'Crown'], ['shining', 'Shining'],
            ['holo1', 'Holo 1'], ['holo2', 'Holo 2'], ['holo3', 'Holo 3'], ['holo4', 'Holo 4']];
        $i = 0;
        foreach ($frames as $f) {
            $add('frame', $f[0], $f[1], 'tcg-gen', "/img/pcg/tcg-gen/{$f[0]}.webp", null, $i++);
        }

        // --- visual effects (fx overlays) ---
        $fx = ['tera', 'thunder-1', 'thunder-2', 'thunder-3', 'thunder-4', 'thunder-5', 'flame-1', 'flame-2', 'flame-3', 'flame-4',
            'rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-5', 'leaf-1', 'leaf-2', 'leaf-3', 'leaf-4', 'leaf-5', 'leaf-6',
            'sparkle-1', 'sparkle-2', 'sparkle-3', 'sparkle-4', 'sparkle-5', 'dark-1', 'water-1', 'ice-1', 'ice-2',
            'rainbow-1', 'rainbow-2', 'rainbow-3', 'rainbow-4'];
        for ($n = 1; $n <= 16; $n++) {
            $fx[] = "abstract-$n";
        }
        $i = 0;
        foreach ($fx as $x) {
            $add('effect', $x, ucwords(str_replace('-', ' ', $x)), '', "/img/pcg/fx/fx-$x.webp", null, $i++);
        }

        // --- glare / foil finishes (drive the holo engine via data-rarity) ---
        // Every foil recipe public/holo.css defines, so the glare picker can reach all of them.
        // Each `dr` must match a [data-rarity] selector in holo.css: one without a selector
        // silently renders no foil, so do not invent values here.
        // `ball holo` is omitted on purpose. It is not a finish of its own, but the shared suffix
        // that pokeball and masterball holo both end with.
        $glare = [
            ['none', 'None', ''],
            // -- SwSh --
            ['reverse', 'Reverse Holo', 'reverse holo'],
            ['holo', 'Holofoil', 'rare holo'],
            ['cosmos', 'Cosmos Holo', 'rare holo cosmos'],
            ['radiant', 'Radiant Rare', 'radiant rare'],
            ['amazing', 'Amazing Rare', 'amazing rare'],
            ['v', 'Pokemon V', 'rare holo v'],
            ['vmax', 'VMAX', 'rare holo vmax'],
            ['vstar', 'VSTAR', 'rare holo vstar'],
            ['ultra', 'Full Art V (Ultra)', 'rare ultra'],
            ['rainbow', 'Rainbow', 'rare rainbow'],
            ['rainbowalt', 'Rainbow Alt Art', 'rare rainbow alt'],
            ['secret', 'Gold Secret', 'rare secret'],
            ['shiny', 'Shiny', 'rare shiny'],
            ['shinyv', 'Shiny V', 'rare shiny v'],
            ['shinyvmax', 'Shiny VMAX', 'rare shiny vmax'],
            ['tg', 'Trainer Gallery', 'trainer gallery rare holo'],
            // -- Scarlet & Violet / 151 --
            ['double', 'Double Rare (ex)', 'double rare'],
            ['exultra', 'Ultra Rare (ex)', 'ultra rare'],
            ['illust', 'Illustration Rare', 'illustration rare'],
            ['specialillust', 'Special Illustration', 'special illustration rare'],
            ['hyper', 'Hyper Rare', 'hyper rare'],
            ['pokeball', 'Poke Ball Holo', 'pokeball holo'],
            ['masterball', 'Master Ball Holo', 'masterball holo'],
        ];
        $i = 0;
        foreach ($glare as $g) {
            $add('glare', $g[0], $g[1], '', '', ['dr' => $g[2]], $i++);
        }

        // --- rarity pips (footer) ---
        $rar = [['d1', '1 Diamond', 'diamond', 1], ['d2', '2 Diamonds', 'diamond', 2], ['d3', '3 Diamonds', 'diamond', 3],
            ['d4', '4 Diamonds', 'diamond', 4], ['s1', '1 Star', 'star', 1], ['s2', '2 Stars', 'star', 2],
            ['s3', '3 Stars', 'star', 3], ['crown', 'Crown', 'crown', 1]];
        $i = 0;
        foreach ($rar as $r) {
            $add('rarity', $r[0], $r[1], '', "/img/pcg/tcg-gen/rarity-option-{$r[2]}.webp", ['symbol' => $r[2], 'count' => $r[3]], $i++);
        }
        // TCG Pocket adds a 4th star and 1-2 shinings to the rarity ladder. Scoped to
        // tcg-gen (generation column) so they only appear on the Pocket picker, not on
        // 1-gen/SV which have their own rarity systems. Assets already on disk.
        $tcgRar = [['s4', '4 Stars', 'star', 4], ['sh1', '1 Shining', 'shining', 1], ['sh2', '2 Shinings', 'shining', 2]];
        $i = 8;
        foreach ($tcgRar as $r) {
            $add('rarity', $r[0], $r[1], 'tcg-gen', "/img/pcg/tcg-gen/rarity-option-{$r[2]}.webp", ['symbol' => $r[2], 'count' => $r[3]], $i++);
        }

        // --- name icons (ex / gx / v / vmax / vstar / lv.x) ---
        $icons = [['tcg-ex', 'ex (Pocket)'], ['ex-sv', 'ex'], ['ex-tera', 'ex Tera'], ['ss-ex', 'ex (SS)'], ['ex-mega', 'Mega ex'],
            ['ex-black-yellow', 'ex (Black)'], ['gx', 'GX'], ['gx-tag-team', 'GX Tag Team'], ['gx-ultra-beast', 'GX Ultra Beast'],
            ['lvx', 'Lv.X'], ['v', 'V'], ['vmax', 'VMAX'], ['vstar', 'VSTAR']];
        $i = 0;
        foreach ($icons as $ic) {
            $add('icon', $ic[0], $ic[1], '', "/img/pcg/tcg-gen/icon-{$ic[0]}.webp", null, $i++);
        }
        // The two extra name icons TCG Pocket offers (15 upstream vs the 13 shared above).
        // Scoped to tcg-gen so they don't appear on 1-gen/SV pickers.
        $tcgIcons = [['gold-star', 'Gold Star'], ['tcg-ex-white', 'ex (Pocket, white)']];
        $i = 13;
        foreach ($tcgIcons as $ic) {
            $add('icon', $ic[0], $ic[1], 'tcg-gen', "/img/pcg/tcg-gen/icon-{$ic[0]}.webp", null, $i++);
        }

        // --- ex rule banner (TCG Pocket only) ---
        // Full-width band (asset 493x67 on a 501x700 frame) that replaces the flavor line on
        // ex cards. tcg-gen scoped: 1-gen/SV have no rule asset and no such control upstream.
        foreach ([['ex', 'ex rule'], ['mega-ex', 'Mega ex rule']] as $j => $r) {
            $add('rule', $r[0], $r[1], 'tcg-gen', "/img/pcg/tcg-gen/rule-{$r[0]}.webp", null, $j);
        }

        // --- tags ---
        $tags = [['ultra-beast', 'Ultra Beast'], ['ancient', 'Ancient'], ['future', 'Future'], ['single-strike', 'Single Strike'],
            ['rapid-strike', 'Rapid Strike'], ['fusion-strike', 'Fusion Strike'], ['mega', 'Mega']];
        $i = 0;
        foreach ($tags as $t) {
            $add('tag', $t[0], $t[1], '', "/img/pcg/tags/tag-{$t[0]}.webp", null, $i++);
        }

        // --- badges (set stamps) ---
        $badges = [['chansey', 'Chansey'], ['square-ball', 'Square Ball'], ['scarlet-violet', 'Scarlet & Violet'],
            ['paradox-rift', 'Paradox Rift'], ['paldean-fates', 'Paldean Fates'], ['paldea-evolved', 'Paldea Evolved'],
            ['obsidian-flames', 'Obsidian Flames']];
        $i = 0;
        foreach ($badges as $b) {
            $add('badge', $b[0], $b[1], '', "/img/pcg/badges/badge-{$b[0]}.webp", null, $i++);
        }

        // --- subtypes (card stage / trainer kind), mirrors resources/js/lib/rarities.ts SUBTYPES ---
        $subtypes = [['basic', 'Basic'], ['stage1', 'Stage 1'], ['stage2', 'Stage 2'],
            ['supporter', 'Supporter'], ['item', 'Item'], ['stadium', 'Stadium']];
        $i = 0;
        foreach ($subtypes as $s) {
            $add('subtype', $s[0], $s[1], '', '', null, $i++);
        }

        // --- rarity presets (the 31 holo effects), mirrors rarities.ts RARITIES. meta carries the
        // holo engine's data-rarity (dr) + tier/era/full/etc. New presets need a matching holo.css rule. ---
        $presets = [
            ['common', 'Common', ['era' => 'SwSh', 'dr' => 'common', 'tier' => 'common']],
            ['reverse', 'Reverse Holo', ['era' => 'SwSh', 'dr' => 'reverse holo', 'tier' => 'uncommon']],
            ['holo', 'Holofoil', ['era' => 'SwSh', 'dr' => 'rare holo', 'tier' => 'rare']],
            ['cosmos', 'Cosmos Holo', ['era' => 'SwSh', 'dr' => 'rare holo cosmos', 'tier' => 'rare']],
            ['radiant', 'Radiant Rare', ['era' => 'SwSh', 'dr' => 'radiant rare', 'tier' => 'rare']],
            ['double', 'Double Rare (ex)', ['era' => '151', 'dr' => 'double rare', 'tier' => 'rare']],
            ['amazing', 'Amazing Rare', ['era' => 'SwSh', 'dr' => 'amazing rare', 'tier' => 'ultra', 'full' => true]],
            ['v', 'Pokemon V', ['era' => 'SwSh', 'dr' => 'rare holo v', 'tier' => 'rare', 'full' => true]],
            ['vmax', 'VMAX', ['era' => 'SwSh', 'dr' => 'rare holo vmax', 'tier' => 'ultra', 'full' => true]],
            ['vstar', 'VSTAR', ['era' => 'SwSh', 'dr' => 'rare holo vstar', 'tier' => 'ultra', 'full' => true]],
            ['ultra', 'Full Art V', ['era' => 'SwSh', 'dr' => 'rare ultra', 'tier' => 'ultra', 'full' => true, 'sup' => 'pokémon']],
            ['trainer', 'Trainer Full Art', ['era' => 'SwSh', 'dr' => 'rare ultra', 'tier' => 'ultra', 'full' => true, 'sup' => 'trainer', 'sub' => 'supporter']],
            ['rainbow', 'Rainbow Rare', ['era' => 'SwSh', 'dr' => 'rare rainbow', 'tier' => 'ultra', 'full' => true]],
            ['rainbowalt', 'Rainbow Alt Art', ['era' => 'SwSh', 'dr' => 'rare rainbow alt', 'tier' => 'ultra', 'full' => true]],
            ['secret', 'Gold Secret', ['era' => 'SwSh', 'dr' => 'rare secret', 'tier' => 'ultra', 'full' => true]],
            ['shiny', 'Shiny Rare', ['era' => 'SwSh', 'dr' => 'rare shiny', 'tier' => 'ultra', 'full' => true]],
            ['shinyv', 'Shiny V', ['era' => 'SwSh', 'dr' => 'rare shiny v', 'tier' => 'ultra', 'full' => true]],
            ['shinyvmax', 'Shiny VMAX', ['era' => 'SwSh', 'dr' => 'rare shiny vmax', 'tier' => 'ultra', 'full' => true]],
            ['tg', 'Trainer Gallery', ['era' => 'SwSh', 'dr' => 'trainer gallery rare holo', 'tier' => 'rare', 'full' => true, 'tg' => true]],
            ['exultra', 'Ultra Rare (ex)', ['era' => '151', 'dr' => 'ultra rare', 'tier' => 'ultra', 'full' => true]],
            ['illust', 'Illustration Rare', ['era' => '151', 'dr' => 'illustration rare', 'tier' => 'rare', 'full' => true]],
            ['specialillust', 'Special Illustration', ['era' => '151', 'dr' => 'special illustration rare', 'tier' => 'ultra', 'full' => true]],
            ['hyper', 'Hyper Rare', ['era' => '151', 'dr' => 'hyper rare', 'tier' => 'ultra', 'full' => true]],
            ['pokeball', 'Poké Ball Holo', ['era' => '151', 'dr' => 'pokeball holo', 'tier' => 'uncommon']],
            ['masterball', 'Master Ball Holo', ['era' => '151', 'dr' => 'masterball holo', 'tier' => 'rare']],
            ['tgv', 'Trainer Gallery V', ['era' => 'SwSh', 'dr' => 'rare holo v', 'tier' => 'rare', 'full' => true, 'tg' => true]],
            ['tgvmax', 'Trainer Gallery VMAX', ['era' => 'SwSh', 'dr' => 'rare holo vmax', 'tier' => 'ultra', 'full' => true, 'tg' => true]],
            ['tgsecret', 'Trainer Gallery Secret', ['era' => 'SwSh', 'dr' => 'rare secret', 'tier' => 'ultra', 'full' => true, 'tg' => true]],
            ['pika020', 'Pikachu · Trainer Gallery Promo', ['era' => 'Promo', 'dr' => 'trainer gallery rare holo', 'tier' => 'rare', 'full' => true, 'tg' => true, 'set' => 'swshp', 'num' => 'swsh020']],
            ['pika145', 'Pikachu · Secret Promo', ['era' => 'Promo', 'dr' => 'rare secret', 'tier' => 'ultra', 'full' => true, 'set' => 'swshp', 'num' => 'swsh145']],
            ['pika160', 'Pikachu · Crown Zenith Gallery', ['era' => 'Promo', 'dr' => 'rare secret', 'tier' => 'ultra', 'full' => true, 'set' => 'swsh12pt5', 'num' => '160']],
        ];
        $i = 0;
        foreach ($presets as $p) {
            $add('rarity_preset', $p[0], $p[1], '', '', $p[2], $i++);
        }

        DB::table('card_assets')->insertOrIgnore($rows);
    }
}
