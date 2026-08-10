/**
 * Self-check for the resolveOverrides guards. No test framework on purpose: this project has
 * no JS runner, and one pure function does not earn one.
 *
 *   npx esbuild resources/js/lib/cardModel.check.ts --bundle --platform=node \
 *     --alias:@=./resources/js --outfile=<tmp>/check.mjs --format=esm && node <tmp>/check.mjs
 *
 * Covers the two rules that are invisible in the UI and only bite on SAVED cards:
 *   - a Trainer card drops element/dualType/subtype/icon/evolvesFrom (they are Pokemon-only),
 *   - a subtype the generation does not offer falls back to auto.
 */
import { buildSections, rollAxes } from '@/components/card-gallery';
import { elementsForGen, pickerElement, resolveOverrides, rollElement, type Axes } from '@/lib/cardModel';
import type { CardOptions } from '@/lib/options';
import {
    attackDamage,
    cardHp,
    ELEMENTS,
    matchOf,
    raritiesFromOptions,
    rarityOf,
    resistanceAmount,
    weaknessAmount,
    type Element,
    type Profile,
    type Rarity,
} from '@/lib/rarities';

const ELEMENT_ROWS = ELEMENTS.map((slug) => ({ slug, label: slug }));

const options = {
    variant: [
        { slug: 'regular', label: 'Regular', generation: '1-gen', asset_url: '', meta: null },
        { slug: 'trainer', label: 'Trainer', generation: '1-gen', asset_url: '', meta: null },
        { slug: 'trainer', label: 'Trainer', generation: 'tcg-gen', asset_url: '', meta: null },
    ],
    icon: [{ slug: 'gx', label: 'GX', generation: '', asset_url: '/img/pcg/tcg-gen/icon-gx.webp', meta: null }],
    badge: [{ slug: 'paldea-evolved', label: 'Paldea Evolved', generation: '', asset_url: '/img/pcg/badges/badge-paldea-evolved.webp', meta: null }],
} as unknown as CardOptions;

const rarity = { key: 'common', label: 'Common', tier: 'common', dr: 'common', era: 'SwSh' } as unknown as Rarity;

const pokemonAxes: Partial<Axes> = {
    generation: '1-gen',
    variant: 'regular',
    element: 'fire',
    dualType: 'water',
    subtype: 'stage1',
    icon: 'gx',
    evolvesFrom: 'Charmeleon',
};

let failures = 0;
const check = (name: string, cond: boolean) => {
    if (!cond) {
        failures++;
        console.error(`FAIL  ${name}`);
    } else {
        console.log(`ok    ${name}`);
    }
};

// 1. Trainer drops every Pokemon-only axis, but keeps the variant itself.
{
    const r = resolveOverrides(options, { ...pokemonAxes, variant: 'trainer' }, rarity);
    check('trainer drops element', r.element === undefined);
    check('trainer drops dualType', r.dualType === undefined);
    check('trainer drops subtype', r.subtype === undefined);
    check('trainer drops iconUrl', r.iconUrl === undefined);
    check('trainer drops evolvesFrom', r.evolvesFrom === undefined);
    check('trainer keeps variant', r.variant === 'trainer');
}

// 2. The same axes on a Regular card all survive -- the guard must not over-fire.
{
    const r = resolveOverrides(options, pokemonAxes, rarity);
    check('regular keeps element', r.element === 'fire');
    check('regular keeps dualType', r.dualType === 'water');
    check('regular keeps subtype', r.subtype === 'stage1');
    // The fixture is a 1-gen card, and 1-gen now has no icon control at all, so the icon is
    // dropped here by GENERATION rather than by variant. The "a regular card keeps its icon"
    // coverage therefore moves to a generation that actually offers the control.
    check('1-gen regular drops iconUrl (no icon control upstream)', r.iconUrl === undefined);
    check(
        'tcg-gen regular keeps iconUrl',
        resolveOverrides(options, { ...pokemonAxes, generation: 'tcg-gen' }, rarity).iconUrl === '/img/pcg/tcg-gen/icon-gx.webp',
    );
    check('regular keeps evolvesFrom', r.evolvesFrom === 'Charmeleon');
}

// 3. Only 1-gen renders a trainer face, so only 1-gen gates. On tcg-gen the element must
//    survive -- the card still draws a type-coloured basic-<type>.webp frame there.
{
    const r = resolveOverrides(options, { ...pokemonAxes, generation: 'tcg-gen', variant: 'trainer' }, rarity);
    check('tcg-gen trainer KEEPS element (no trainer face there)', r.element === 'fire');
}

// 4. A trainer slug saved against a generation with no trainer row must not gate anything.
{
    const r = resolveOverrides(options, { ...pokemonAxes, generation: 'scarlet-violet', variant: 'trainer' }, rarity);
    check('unknown-gen trainer slug gates nothing', r.element === 'fire' && r.variant === undefined);
}

// 5. Pre-existing rule still holds: 1-gen offers no trainer subtypes.
{
    const r = resolveOverrides(options, { ...pokemonAxes, subtype: 'supporter' }, rarity);
    check('1-gen drops a supporter subtype', r.subtype === undefined);
}

// 6. A set badge is TCG/SV-only. The playground always enforced this; the dashboard did not,
//    so a saved 1-gen card can still carry one -- it must not render.
{
    const r = resolveOverrides(options, { ...pokemonAxes, badge: 'paldea-evolved' }, rarity);
    check('1-gen drops a set badge', r.badgeUrl === undefined);
    const t = resolveOverrides(options, { ...pokemonAxes, generation: 'tcg-gen', badge: 'paldea-evolved' }, rarity);
    check('tcg-gen keeps a set badge', t.badgeUrl === '/img/pcg/badges/badge-paldea-evolved.webp');
}

// 7. The "EDITION 1" stamp is Base Set art -- 1st gen only, on Regular AND Trainer.
{
    const one = resolveOverrides(options, { ...pokemonAxes, firstEdition: true }, rarity);
    check('1-gen keeps firstEdition', one.firstEdition === true);
    const tr = resolveOverrides(options, { ...pokemonAxes, variant: 'trainer', firstEdition: true }, rarity);
    check('1-gen trainer keeps firstEdition', tr.firstEdition === true);
    const tcg = resolveOverrides(options, { ...pokemonAxes, generation: 'tcg-gen', firstEdition: true }, rarity);
    check('tcg-gen drops firstEdition (no Base Set art)', tcg.firstEdition === false);
    check('firstEdition defaults off', resolveOverrides(options, pokemonAxes, rarity).firstEdition === false);
}

// 7b. The rarity SYMBOL is the one option ON by default (`rarityMark: 'auto'`), so every card
//     carries one and its tier mapping has to hold: Common ◆, Uncommon ◆◆, Rare ★, Ultra ★★.
{
    const marks = [
        { slug: 'd1', label: '', generation: '', asset_url: '/d.webp', meta: { symbol: 'diamond', count: 1 } },
        { slug: 'd2', label: '', generation: '', asset_url: '/d.webp', meta: { symbol: 'diamond', count: 2 } },
        { slug: 's1', label: '', generation: '', asset_url: '/s.webp', meta: { symbol: 'star', count: 1 } },
        { slug: 's2', label: '', generation: '', asset_url: '/s.webp', meta: { symbol: 'star', count: 2 } },
    ];
    const opts = { ...options, rarity: marks } as unknown as CardOptions;
    const markFor = (tier: string) => resolveOverrides(opts, pokemonAxes, { ...rarity, tier } as Rarity).rarityMark;

    check('rarityMark: common is one diamond', markFor('common')?.count === 1 && markFor('common')?.url === '/d.webp');
    check('rarityMark: uncommon is two diamonds', markFor('uncommon')?.count === 2 && markFor('uncommon')?.url === '/d.webp');
    check('rarityMark: rare is one star', markFor('rare')?.count === 1 && markFor('rare')?.url === '/s.webp');
    check('rarityMark: ultra is two stars', markFor('ultra')?.count === 2 && markFor('ultra')?.url === '/s.webp');
    check('rarityMark: "none" omits the symbol', resolveOverrides(opts, { ...pokemonAxes, rarityMark: 'none' }, rarity).rarityMark === undefined);
}

// 8. rarityOf must ALWAYS return a Rarity. `activeRarity.tier` is dereferenced unconditionally,
//    so an admin disabling the rarity_preset/common row used to white-screen every card.
{
    const presets = (rows: { slug: string; label: string; meta: unknown }[]) => raritiesFromOptions({ rarity_preset: rows } as never);

    // normal: the asked-for preset wins
    const full = presets([
        { slug: 'common', label: 'Common', meta: { dr: 'common', tier: 'common', era: 'SwSh' } },
        { slug: 'hyper', label: 'Hyper', meta: { dr: 'hyper rare', tier: 'ultra', era: '151' } },
    ]);
    check('rarityOf finds the asked-for preset', rarityOf(full, 'hyper').key === 'hyper');
    check('rarityOf falls back to common for an unknown key', rarityOf(full, 'nope').key === 'common');

    // the reported break: `common` disabled, so /api/options.php never serves it
    const noCommon = presets([{ slug: 'hyper', label: 'Hyper', meta: { dr: 'hyper rare', tier: 'ultra', era: '151' } }]);
    const r = rarityOf(noCommon, 'nope');
    check('rarityOf survives a DB with NO common preset', r !== undefined && typeof r.tier === 'string');
    check('  ...and resolveOverrides does not throw on it', resolveOverrides(options, pokemonAxes, r) !== undefined);

    // and the pathological case: every preset disabled -> options.rarity_preset empty
    const none = rarityOf(raritiesFromOptions({} as never), 'nope');
    check('rarityOf survives an empty preset list', none !== undefined && none.key === 'common');
}

// 9. pickerElement: the element picker has no "Auto" row, so a stored/reset 'auto' must still
//    show SOME concrete type, and it has to be the one the card actually renders.
{
    check('an explicit pick is shown as-is', pickerElement('1-gen', 'fire', 'C') === 'fire');
    check('auto names the language type', pickerElement('tcg-gen', 'auto', 'Java') === 'fire');
    check('auto with no language falls to grass (langType default)', pickerElement('tcg-gen', 'auto', undefined) === 'grass');
    // C -> metal, and 1-gen ships no steel frame -> the card renders normal-*.webp, so the
    // label must read Colorless (BASE.colorless === 'normal'), never a blank Select.
    check('auto drops to colorless when the gen has no frame for it', pickerElement('1-gen', 'auto', 'C') === 'colorless');
    check(
        '  ...and that fallback IS in the picker list',
        elementsForGen(ELEMENT_ROWS, '1-gen').some((o) => o.slug === 'colorless'),
    );
    // an explicit pick the gen cannot render is NOT rewritten here - changeGeneration resets it
    // to 'auto' first; masking it here would hide that reset going missing.
    check('an unsupported explicit pick is left alone', pickerElement('1-gen', 'dragon', 'C') === 'dragon');
}

// 10. The rarity SYMBOL is the one option ON by default (`rarityMark: 'auto'`), so every card
//     carries one and the tier mapping has to hold: Common ◆, Uncommon ◆◆, Rare ★, Ultra ★★.
{
    const marks = [
        { slug: 'd1', label: '', generation: '', asset_url: '/d.webp', meta: { symbol: 'diamond', count: 1 } },
        { slug: 'd2', label: '', generation: '', asset_url: '/d.webp', meta: { symbol: 'diamond', count: 2 } },
        { slug: 's1', label: '', generation: '', asset_url: '/s.webp', meta: { symbol: 'star', count: 1 } },
        { slug: 's2', label: '', generation: '', asset_url: '/s.webp', meta: { symbol: 'star', count: 2 } },
    ];
    const opts = { ...options, rarity: marks } as unknown as CardOptions;
    const markFor = (tier: string) => resolveOverrides(opts, pokemonAxes, { ...rarity, tier } as Rarity).rarityMark;

    check('rarityMark: common is one diamond', markFor('common')?.count === 1 && markFor('common')?.url === '/d.webp');
    check('rarityMark: uncommon is two diamonds', markFor('uncommon')?.count === 2);
    check('rarityMark: rare is one star', markFor('rare')?.count === 1 && markFor('rare')?.url === '/s.webp');
    check('rarityMark: ultra is two stars', markFor('ultra')?.count === 2 && markFor('ultra')?.url === '/s.webp');
    check(
        'rarityMark: an explicit slug beats the tier',
        resolveOverrides(opts, { ...pokemonAxes, rarityMark: 's1' }, rarity).rarityMark?.count === 1,
    );
    check('rarityMark: "none" omits the symbol', resolveOverrides(opts, { ...pokemonAxes, rarityMark: 'none' }, rarity).rarityMark === undefined);
}

// 11. Numbers the card PRINTS must be ones a real card could carry. These come off unbounded
//     GitHub stats, so the failure mode is silent: the face showed "312k HP" and a "252k" attack
//     for months because nothing asserted the range.
{
    const FOLLOWERS = [0, 1, 7, 42, 300, 2_500, 19_248, 91_232, 312_185, 5_000_000];
    const hpOf = (f: number) => cardHp({ followers: f } as Profile);

    check(
        'hp: always a multiple of 10 in 30..340',
        FOLLOWERS.every((f) => hpOf(f) >= 30 && hpOf(f) <= 340 && hpOf(f) % 10 === 0),
    );
    check('hp: floor is 30 for a brand-new account', hpOf(0) === 30);
    check(
        'hp: rises with followers and never inverts',
        FOLLOWERS.every((f, i) => i === 0 || hpOf(f) >= hpOf(FOLLOWERS[i - 1])),
    );
    // Quantising to 10 leaves only 32 legal values, so a shallow curve collides. At 44 HP per
    // decade Guido (27k followers) and Theo (19k) both landed on 220 - a 39% gap printing the
    // same number, which reads as two identical cards.
    check('hp: the four showcase follower counts all separate', new Set([312_185, 91_232, 26_733, 19_248].map(hpOf)).size === 4);

    const STATS = [0, 1, 12, 130, 299, 11_810, 252_392, 9_999_999];
    check(
        'damage: always a multiple of 10 in 10..300',
        STATS.every((n) => /^\d+$/.test(attackDamage(n)) && +attackDamage(n) >= 10 && +attackDamage(n) <= 300 && +attackDamage(n) % 10 === 0),
    );

    // Era rules, not per-card variation: every card on a frame prints the same modifier.
    check('weakness: tcg (Pocket) is a flat +20', weaknessAmount('tcg-gen') === '+20');
    check('weakness: Base Set and SV use the x2 multiplier', weaknessAmount('1-gen') === '×2' && weaknessAmount('scarlet-violet') === '×2');
    check('resistance: -30, the value the only frame that shows one prints', resistanceAmount() === '−30');
}

// 12. The weakness/resistance row is the only part of the card the amounts cannot make unique, so
//     the TYPES have to. Guards both halves: it must stay inside the printed chart (a weakness the
//     TCG never printed is not a Pokemon card), and it must actually separate two profiles that
//     share a top language - the bug this replaced, where the row was a pure function of element.
{
    const p = (o: Partial<Profile>) => ({ langs: [], join_year: 2018, ...o }) as Profile;
    const row = (t: Element, o: Partial<Profile>) => {
        const m = matchOf(t, p(o));
        return `${m.weak}/${m.resist ?? '-'}`;
    };

    // A weakness outside the chart is the failure that matters - everything else is taste.
    const PRINTED: Record<string, string[]> = {
        colorless: ['fighting'],
        grass: ['fire'],
        fire: ['water'],
        water: ['lightning', 'grass'],
        lightning: ['fighting'],
        psychic: ['darkness', 'psychic'],
        fighting: ['grass', 'psychic'],
        darkness: ['grass', 'fighting'],
        metal: ['fire'],
        dragon: ['fairy', 'water', 'dragon', 'grass'],
        fairy: ['metal'],
    };
    const YEARS = [2008, 2011, 2012, 2014, 2018, 2021, 2026];
    check(
        'match: every weakness is one the TCG has actually printed for that type',
        ELEMENTS.every((t) => YEARS.every((y) => PRINTED[t].includes(matchOf(t, p({ join_year: y })).weak))),
    );
    check(
        'match: a missing join_year still lands on a real weakness',
        ELEMENTS.every((t) => PRINTED[t].includes(matchOf(t, p({ join_year: null })).weak)),
    );

    // Resistance is per-species in the real game, so it may never repeat the card's own type or
    // its weakness - that combination does not exist on a printed card.
    check(
        'match: resistance never collides with the card type or its weakness',
        ELEMENTS.every((t) =>
            ELEMENTS.every((other) => {
                const m = matchOf(t, p({ langs: ['X', other === 'psychic' ? 'Python' : 'X'] }));
                return m.resist !== t && m.resist !== m.weak;
            }),
        ),
    );
    check('match: no second language means no resistance, not a default one', matchOf('metal', p({ langs: ['C'] })).resist === undefined);

    // The actual complaint: four showcase profiles printing one bottom row between them.
    const showcase = [
        row('metal', { langs: ['C', 'OpenSCAD', 'C++'], join_year: 2011 }),
        row('lightning', { langs: ['JavaScript', 'TypeScript', 'CSS'], join_year: 2011 }),
        row('water', { langs: ['TypeScript', 'JavaScript', 'Astro'], join_year: 2014 }),
        row('psychic', { langs: ['Python', 'C', 'HTML'], join_year: 2012 }),
    ];
    check(`match: the four showcase rows all differ (${showcase.join(' ')})`, new Set(showcase).size === 4);

    // Two Python devs used to be indistinguishable here. Second language alone must split them.
    check(
        'match: same top language, different second language -> different row',
        row('psychic', { langs: ['Python', 'Go'] }) !== row('psychic', { langs: ['Python', 'Rust'] }),
    );
}

// 11. The lab gallery must offer EVERY axis the settings panel offers, and gate them the same
//     way. This replaced the old /lab page's coverage check: a wrong filter here silently drops
//     a whole axis from "All variants" and the screen still looks fine.
{
    const rows = (cat: string, slugs: string[], generation = '') =>
        slugs.map((slug) => ({ id: 0, category: cat, slug, label: slug, generation, asset_url: `/x/${slug}.webp`, meta: null }));

    // Mirrors database/seeders/CardAssetSeeder.php. Only the generation column matters here -
    // this checks the FILTERING, not the DB contents.
    const galleryOptions = {
        generation: rows('generation', ['1-gen', 'tcg-gen', 'scarlet-violet']),
        element: rows('element', [...ELEMENTS]),
        subtype: rows('subtype', ['basic', 'stage1', 'stage2', 'supporter', 'item', 'stadium']),
        variant: [
            ...rows('variant', ['regular', 'trainer'], '1-gen'),
            ...rows('variant', ['regular', 'full-art', 'trainer', 'trainer-full-art'], 'tcg-gen'),
        ],
        frame: rows('frame', ['grey', 'rainbow'], 'tcg-gen'),
        badge: rows('badge', ['chansey', 'square-ball']),
        tag: rows('tag', ['ancient', 'future', 'mega']),
        icon: [...rows('icon', ['gx', 'v', 'vmax']), ...rows('icon', ['gold-star'], 'tcg-gen')],
        rarity: [...rows('rarity', ['d1', 's1']), ...rows('rarity', ['s4'], 'tcg-gen')],
        glare: rows('glare', ['none', 'holo', 'rainbow']),
        effect: rows('effect', ['tera', 'flame-1']),
    } as unknown as CardOptions;

    const preset = [rarity, { ...rarity, key: 'holo', label: 'Holo' } as Rarity];
    const titles = (axes: Partial<Axes>) => buildSections(galleryOptions, axes, 'common', preset).map((s) => s.title);
    const sizeOf = (axes: Partial<Axes>, title: string) =>
        buildSections(galleryOptions, axes, 'common', preset).find((s) => s.title === title)?.tiles.length ?? -1;

    const one = { generation: '1-gen', variant: 'regular' };
    const tcg = { generation: 'tcg-gen', variant: 'regular' };

    // Every axis the settings panel can change must be reachable from the gallery too.
    for (const t of [
        'Rarity',
        'Generation',
        'Variant / template',
        'Element / type',
        'Subtype (stage)',
        'Glare / holo',
        'Rarity mark',
        'Visual effect',
    ])
        check(`gallery(tcg-gen) offers "${t}"`, titles(tcg).includes(t));

    // 1-gen ships no frame styles, and no tag / badge / name-icon control upstream.
    check('gallery(1-gen): no Frame section', !titles(one).includes('Frame'));
    check('gallery(1-gen): no Tag stamp section', !titles(one).includes('Tag stamp'));
    check('gallery(1-gen): no Set badge section', !titles(one).includes('Set badge'));
    check('gallery(1-gen): no Name icon section', !titles(one).includes('Name icon'));
    check('gallery(1-gen): offers the 1st edition stamp', titles(one).includes('1st edition stamp'));

    // tcg-gen has all three chrome controls, and 1-gen must not offer the stamp twice.
    check('gallery(tcg-gen): has Frame', titles(tcg).includes('Frame'));
    check('gallery(tcg-gen): has Tag stamp', titles(tcg).includes('Tag stamp'));
    check('gallery(tcg-gen): no 1st edition stamp', !titles(tcg).includes('1st edition stamp'));

    // Element counts follow the frame sets: 1-gen ships 7, tcg-gen all 11.
    check('gallery(1-gen): 7 element tiles', sizeOf(one, 'Element / type') === 7);
    check('gallery(tcg-gen): 11 element tiles', sizeOf(tcg, 'Element / type') === 11);

    // "mega" is hidden on 1-gen and tcg-gen, so tcg-gen shows None + ancient + future.
    check('gallery(tcg-gen): mega tag is hidden', sizeOf(tcg, 'Tag stamp') === 3);

    // A Trainer template has no type / stage, in the gallery as in the panel. Only 1-gen
    // renders a trainer FACE, so only 1-gen gates - tcg-gen's trainer keeps its element, which
    // is the rule check #3 pins down for resolveOverrides.
    const trainer = { generation: '1-gen', variant: 'trainer' };
    check('gallery(1-gen trainer): no Element section', !titles(trainer).includes('Element / type'));
    check('gallery(1-gen trainer): no Subtype section', !titles(trainer).includes('Subtype (stage)'));
    check('gallery(1-gen trainer): still offers Rarity', titles(trainer).includes('Rarity'));
    const tcgTrainer = { generation: 'tcg-gen', variant: 'trainer' };
    check('gallery(tcg-gen trainer): KEEPS Element (no trainer face there)', titles(tcgTrainer).includes('Element / type'));

    // A generation tile must reset frame/variant, or it previews a frame that gen never ships.
    const genTiles = buildSections(galleryOptions, tcg, 'common', preset).find((s) => s.title === 'Generation')!.tiles;
    check(
        'gallery: generation tiles reset frame/variant',
        genTiles.every((t) => t.axes.frame === 'none' && t.axes.variant === 'regular'),
    );

    // ---- rollAxes: the dashboard's local card roll ----
    // Every rule below is one the LAB enforces but a random draw could quietly break, so they are
    // checked over many rolls rather than one: a 1-in-20 illegal combination is still a bug.
    const rollProfile = { langs: ['JavaScript', 'PHP', 'CSS'], age_years: 9 } as unknown as Profile;
    const young = { langs: ['JavaScript', 'PHP'], age_years: 1 } as unknown as Profile;
    const ultra = { ...rarity, key: 'vmax', tier: 'ultra' } as Rarity;
    const rolls = Array.from({ length: 300 }, () => rollAxes(galleryOptions, {}, rarity, preset, rollProfile));

    check(
        'rollAxes: never claims the 1st edition stamp',
        rolls.every((r) => !('firstEdition' in r)),
    );
    // 'auto' is the Trainer case: the section is gone, so nothing was picked at all.
    check(
        'rollAxes: element is one this dev writes',
        rolls.every((r) => ['lightning', 'psychic', 'fairy', 'auto'].includes(r.element!)),
    );
    check(
        'rollAxes: a dual type is only ever the second language',
        rolls.every((r) => r.dualType === 'auto' || r.dualType === 'psychic'),
    );
    check(
        'rollAxes: glare and rarity mark stay on auto',
        rolls.every((r) => r.glare === 'auto' && r.rarityMark === 'auto'),
    );
    check(
        'rollAxes: only a stage carries an "evolves from" name',
        rolls.every((r) => (r.subtype === 'stage1' || r.subtype === 'stage2' ? !!r.evolvesFrom : r.evolvesFrom === '')),
    );
    check(
        'rollAxes: chrome only where the generation prints it',
        rolls.every((r) =>
            r.generation === '1-gen'
                ? r.tag === 'none' && r.badge === 'none' && r.icon === 'none' && r.attributeFrame === 'none'
                : r.attributeFrame === 'none' || r.generation === 'tcg-gen',
        ),
    );
    // A modern card always carries its set symbol, so this one is not a maybe.
    check(
        'rollAxes: every chrome-generation card gets a set badge',
        rolls.every((r) => r.generation === '1-gen' || r.badge !== 'none'),
    );
    check(
        'rollAxes: a common card never wears an ex/V emblem',
        rolls.every((r) => r.icon === 'none'),
    );
    check(
        'rollAxes: the emblem matches the rarity that earned it',
        Array.from({ length: 100 }, () => rollAxes(galleryOptions, {}, ultra, preset, rollProfile)).every(
            (r) => r.icon === 'none' || r.icon === 'vmax' || r.generation !== '1-gen',
        ),
    );
    check(
        'rollAxes: a one-year-old account has not evolved',
        Array.from({ length: 100 }, () => rollAxes(galleryOptions, {}, rarity, preset, young)).every(
            (r) => r.subtype === 'basic' || r.subtype === 'auto',
        ),
    );
    check(
        'rollAxes: a nine-year-old account reaches Stage 2',
        rolls.some((r) => r.subtype === 'stage2'),
    );
    // Coverage: the point of the roll is that the axes actually move.
    for (const key of ['generation', 'variant', 'element', 'frame', 'tag', 'badge', 'effect', 'subtype'] as const)
        check(`rollAxes: ${key} varies across rolls`, new Set(rolls.map((r) => r[key])).size > 1);
    // Nothing rolled may render as a combination resolveOverrides has to throw away.
    check(
        'rollAxes: every roll survives resolveOverrides',
        rolls.every((r) => !!resolveOverrides(galleryOptions, r, rarity).generation),
    );
    // Options not loaded yet -> nothing to roll, and the saved card must be left alone.
    check('rollAxes: no options -> empty roll', Object.keys(rollAxes({} as CardOptions, {}, rarity, preset, rollProfile)).length === 0);
}

// rollElement: the dashboard's re-roll. The point of it is that a Regenerate CHANGES the type,
// so the two rules worth pinning are "never the current one" and "never a type this dev's
// languages cannot produce". Looped, because the pick is random.
{
    const langs = ['JavaScript', 'PHP', 'CSS']; // -> lightning, psychic, fairy
    const sawTwo = new Set<string>();
    for (let i = 0; i < 200; i++) {
        const rolled = rollElement(langs, 'lightning')!;
        sawTwo.add(rolled);
        if (rolled === 'lightning' || !['psychic', 'fairy'].includes(rolled)) {
            check(`rollElement: rolled ${rolled} off a 3-language dev`, false);
            break;
        }
    }
    check('rollElement: never repeats the current type', !sawTwo.has('lightning'));
    check('rollElement: uses the whole remaining pool', sawTwo.size === 2);
    check('rollElement: one language and nothing to change to -> undefined', rollElement(['Go'], 'water') === undefined);
    check('rollElement: no card yet -> undefined', rollElement(undefined, undefined) === undefined);
    // An unlisted language still resolves (langType falls back to grass), so it stays rollable.
    check('rollElement: unknown language rolls grass', rollElement(['Brainfuck'], 'water') === 'grass');
}

if (failures) throw new Error(`${failures} check(s) FAILED`);
console.log('\nall passed');
