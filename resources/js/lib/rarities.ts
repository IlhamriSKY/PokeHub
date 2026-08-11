export type Tier = 'common' | 'uncommon' | 'rare' | 'ultra';

export type Attack = { name: string; cost: number; damage: string; desc: string };
/**
 * `flavor` and `effect` are deliberately SEPARATE and differently sized, because the two
 * templates give them wildly different room:
 *  - flavor -> the Pokemon face, in the frame's printed flavour box at the very bottom. That box
 *    is two lines and `.pcg-flavor` line-clamps to them, so an over-long sentence is cut rather
 *    than spilling past the rule the frame art draws.
 *  - effect -> the Trainer face, which has no attacks, so this is its only prose and it
 *    carries a whole 23%-tall plate.
 * Feeding the long `effect` into the Pokemon flavour box is what overflowed it.
 */
export type Lore = { species: string; flavor: string; effect?: string; attacks: Attack[]; ai?: boolean };

export type Profile = {
    login: string;
    name: string;
    avatar: string;
    bio: string;
    html_url: string;
    location: string;
    company: string;
    followers: number;
    following: number;
    repos: number;
    gists: number;
    stars: number;
    forks: number;
    top_lang: string;
    langs: string[];
    join_year: number | null;
    age_years: number;
    rarity: string;
    ai?: Lore | null;
};

export type Era = 'SwSh' | '151' | 'Promo';
export type Rarity = {
    key: string;
    label: string;
    era: Era;
    dr: string;
    tier: Tier;
    full?: boolean;
    sup?: string;
    tg?: boolean;
    sub?: string; // default data-subtypes when the effect needs one (e.g. trainer -> "supporter")
    set?: string; // data-set, only for bespoke signature/promo cards
    num?: string; // data-number
};

// ---- Lab vocabulary: the axes the asset card faces key off ----

// element/type -> the frame WebP + energy symbols
export const ELEMENTS = ['colorless', 'grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'fairy'] as const;
export type Element = (typeof ELEMENTS)[number];

// data-subtypes (holo.css matches ^="stage", ^="item", *="supporter", ="v-union"...)
// Stage/category only (Basic/Stage 1/Stage 2 + trainer kinds). ex/gx/v etc. are
// the "Name icon" option now (a DB icon asset), matching pokecardgenerator.
export const SUBTYPES = ['basic', 'stage1', 'stage2', 'supporter', 'item', 'stadium'] as const;
export type Subtype = (typeof SUBTYPES)[number];

export const SUBTYPE_LABELS: Record<Subtype, string> = {
    basic: 'Basic',
    stage1: 'Stage 1',
    stage2: 'Stage 2',
    supporter: 'Supporter',
    item: 'Item',
    stadium: 'Stadium',
};

// Generation = which real pokecardgenerator WebP frame set the card renders from
// (see PcgFace). PokeHub's old CSS card has been removed.
export const GENERATIONS = ['1-gen', 'tcg-gen', 'scarlet-violet'] as const;
export type Generation = (typeof GENERATIONS)[number];
// Generation/subtype/tag/rarity LABELS are DB-driven now (card_assets); the
// generation labels come from options.generation, subtypes from options.subtype, etc.

// full: true -> avatar fills the whole card (full-art, no border).
export const RARITIES: Rarity[] = [
    { key: 'common', label: 'Common', era: 'SwSh', dr: 'common', tier: 'common' },
    { key: 'reverse', label: 'Reverse Holo', era: 'SwSh', dr: 'reverse holo', tier: 'uncommon' },
    { key: 'holo', label: 'Holofoil', era: 'SwSh', dr: 'rare holo', tier: 'rare' },
    { key: 'cosmos', label: 'Cosmos Holo', era: 'SwSh', dr: 'rare holo cosmos', tier: 'rare' },
    { key: 'radiant', label: 'Radiant Rare', era: 'SwSh', dr: 'radiant rare', tier: 'rare' },
    { key: 'double', label: 'Double Rare (ex)', era: '151', dr: 'double rare', tier: 'rare' },
    { key: 'amazing', label: 'Amazing Rare', era: 'SwSh', dr: 'amazing rare', full: true, tier: 'ultra' },
    { key: 'v', label: 'Pokemon V', era: 'SwSh', dr: 'rare holo v', full: true, tier: 'rare' },
    { key: 'vmax', label: 'VMAX', era: 'SwSh', dr: 'rare holo vmax', full: true, tier: 'ultra' },
    { key: 'vstar', label: 'VSTAR', era: 'SwSh', dr: 'rare holo vstar', full: true, tier: 'ultra' },
    { key: 'ultra', label: 'Full Art V', era: 'SwSh', dr: 'rare ultra', sup: 'pokémon', full: true, tier: 'ultra' },
    { key: 'trainer', label: 'Trainer Full Art', era: 'SwSh', dr: 'rare ultra', sup: 'trainer', sub: 'supporter', full: true, tier: 'ultra' },
    { key: 'rainbow', label: 'Rainbow Rare', era: 'SwSh', dr: 'rare rainbow', full: true, tier: 'ultra' },
    { key: 'rainbowalt', label: 'Rainbow Alt Art', era: 'SwSh', dr: 'rare rainbow alt', full: true, tier: 'ultra' },
    { key: 'secret', label: 'Gold Secret', era: 'SwSh', dr: 'rare secret', full: true, tier: 'ultra' },
    { key: 'shiny', label: 'Shiny Rare', era: 'SwSh', dr: 'rare shiny', full: true, tier: 'ultra' },
    { key: 'shinyv', label: 'Shiny V', era: 'SwSh', dr: 'rare shiny v', full: true, tier: 'ultra' },
    { key: 'shinyvmax', label: 'Shiny VMAX', era: 'SwSh', dr: 'rare shiny vmax', full: true, tier: 'ultra' },
    { key: 'tg', label: 'Trainer Gallery', era: 'SwSh', dr: 'trainer gallery rare holo', tg: true, full: true, tier: 'rare' },
    { key: 'exultra', label: 'Ultra Rare (ex)', era: '151', dr: 'ultra rare', full: true, tier: 'ultra' },
    { key: 'illust', label: 'Illustration Rare', era: '151', dr: 'illustration rare', full: true, tier: 'rare' },
    { key: 'specialillust', label: 'Special Illustration', era: '151', dr: 'special illustration rare', full: true, tier: 'ultra' },
    { key: 'hyper', label: 'Hyper Rare', era: '151', dr: 'hyper rare', full: true, tier: 'ultra' },
    // 151 signature reverse-holo energy patterns (assets already in /img/151)
    { key: 'pokeball', label: 'Poké Ball Holo', era: '151', dr: 'pokeball holo', tier: 'uncommon' },
    { key: 'masterball', label: 'Master Ball Holo', era: '151', dr: 'masterball holo', tier: 'rare' },
    // Trainer-Gallery combos: the TG etch layered over the V / VMAX / Secret foils.
    // (Reachable before only by picking the base rarity AND toggling Trainer Gallery.)
    { key: 'tgv', label: 'Trainer Gallery V', era: 'SwSh', dr: 'rare holo v', full: true, tier: 'rare', tg: true },
    { key: 'tgvmax', label: 'Trainer Gallery VMAX', era: 'SwSh', dr: 'rare holo vmax', full: true, tier: 'ultra', tg: true },
    { key: 'tgsecret', label: 'Trainer Gallery Secret', era: 'SwSh', dr: 'rare secret', full: true, tier: 'ultra', tg: true },
    // Bespoke signature cards (keyed by data-set + data-number). Foils are tuned to
    // one specific card's art, so over an avatar they show that card's foil pattern.
    {
        key: 'pika020',
        label: 'Pikachu · Trainer Gallery Promo',
        era: 'Promo',
        dr: 'trainer gallery rare holo',
        tg: true,
        set: 'swshp',
        num: 'swsh020',
        full: true,
        tier: 'rare',
    },
    { key: 'pika145', label: 'Pikachu · Secret Promo', era: 'Promo', dr: 'rare secret', set: 'swshp', num: 'swsh145', full: true, tier: 'ultra' },
    {
        key: 'pika160',
        label: 'Pikachu · Crown Zenith Gallery',
        era: 'Promo',
        dr: 'rare secret',
        set: 'swsh12pt5',
        num: '160',
        full: true,
        tier: 'ultra',
    },
];

export const RARITY_BY_KEY: Record<string, Rarity> = Object.fromEntries(RARITIES.map((r) => [r.key, r]));

type OptionRow = { slug: string; label: string; meta?: Record<string, unknown> | null };

/**
 * Build the rarity presets from DB options (category `rarity_preset`), falling
 * back to the built-in RARITIES when the table has none. Keeps the holo engine
 * fully DB-driven (admin-manageable) while guaranteeing the presets always exist,
 * so the first render (before options load) is identical to the seeded DB.
 */
export function raritiesFromOptions(options: Record<string, OptionRow[]>): Rarity[] {
    const rows = options?.rarity_preset;
    if (!rows || rows.length === 0) return RARITIES;
    return rows.map((r) => {
        const m = (r.meta ?? {}) as Record<string, unknown>;
        return {
            key: r.slug,
            label: r.label,
            era: (m.era as Era) ?? 'SwSh',
            dr: (m.dr as string) ?? '',
            tier: (m.tier as Tier) ?? 'common',
            full: m.full as boolean | undefined,
            sup: m.sup as string | undefined,
            tg: m.tg as boolean | undefined,
            sub: m.sub as string | undefined,
            set: m.set as string | undefined,
            num: m.num as string | undefined,
        };
    });
}

/**
 * The rarity a card renders with. Always a real Rarity, never undefined.
 *
 * Every consumer dereferences it unconditionally, so returning undefined white-screens the page.
 * An inline `map[key] ?? map.common` is not enough either: `rarity_preset` rows are admin-managed
 * and /api/options serves only enabled ones, so disabling the `common` preset would take down
 * every public card at once.
 *
 * The chain degrades instead: asked-for key -> DB `common` -> any surviving preset -> the
 * built-in `common`. The built-in floor is deliberate; a preset row being disabled is an
 * admin's call about what to OFFER, not permission to break rendering.
 */
export const rarityOf = (rarities: Rarity[], key?: string | null): Rarity =>
    rarities.find((r) => r.key === key) ?? rarities.find((r) => r.key === 'common') ?? rarities[0] ?? RARITY_BY_KEY.common;

/** Subtypes from DB options (category `subtype`), falling back to the built-in list. */
export function subtypesFromOptions(options: Record<string, OptionRow[]>): { slug: string; label: string }[] {
    const rows = options?.subtype;
    if (!rows || rows.length === 0) return SUBTYPES.map((s) => ({ slug: s, label: SUBTYPE_LABELS[s] }));
    return rows.map((r) => ({ slug: r.slug, label: r.label }));
}

const LANG_TYPE: Record<string, string> = {
    JavaScript: 'lightning',
    TypeScript: 'water',
    Python: 'psychic',
    Java: 'fire',
    Go: 'water',
    Rust: 'fire',
    'C++': 'metal',
    C: 'metal',
    'C#': 'psychic',
    PHP: 'psychic',
    Ruby: 'fire',
    Swift: 'fire',
    Kotlin: 'psychic',
    Dart: 'water',
    HTML: 'fairy',
    CSS: 'fairy',
    Shell: 'darkness',
    Vue: 'grass',
    Svelte: 'fire',
    Lua: 'water',
    Elixir: 'psychic',
    Haskell: 'dragon',
    Scala: 'fire',
    R: 'water',
    'Jupyter Notebook': 'psychic',
    Zig: 'fire',
    Nix: 'water',
};
export const langType = (l?: string) => LANG_TYPE[l ?? ''] ?? 'grass';

// Same values as CardAssetSeeder::$typeFrame, so chrome matches the card art.
const TYPE_COLOR: Record<string, string> = {
    grass: '#66c05c',
    fire: '#ec4b34',
    water: '#4fa0dd',
    lightning: '#f4cb3a',
    psychic: '#a862b0',
    fighting: '#c65f2f',
    darkness: '#5a6873',
    metal: '#adb3b7',
    dragon: '#cba634',
    fairy: '#ec74ac',
    colorless: '#b7bcbf',
};

export const langColor = (l?: string) => TYPE_COLOR[langType(l)] ?? TYPE_COLOR.colorless;

/**
 * Weakness and resistance AMOUNTS. Fixed per generation, NOT per profile, because the real game
 * fixes them per era - every card in a set prints the same modifier:
 *
 *   1-gen (Base Set)      weakness ×2,  resistance −30
 *   tcg-gen (TCG Pocket)  weakness +20, NO resistance at all
 *   scarlet-violet        weakness ×2,  no resistance on the frame
 *
 * These were briefly derived from stars/age to give each card a distinct bottom row. That printed
 * cards that cannot exist: a Base Set card with "+10" weakness (flat modifiers are Diamond &
 * Pearl / Platinum, 2007-2010; Black & White went back to ×2 in 2011) and a Pocket card with
 * "+30" (Pocket is always +20). Per-card variety comes from the weakness/resistance TYPE and the
 * retreat cost instead - the things the rules genuinely let vary.
 *
 * Resistance −30 is correct only for the original series through EX; Diamond & Pearl onward it is
 * −20. 1-gen is the only frame here that shows a resistance at all, so −30 is the right constant.
 */
export const weaknessAmount = (gen: Generation) => (gen === 'tcg-gen' ? '+20' : '×2');
export const resistanceAmount = () => '−30';

/**
 * Does this era's card print a Resistance at all?
 *
 * Only Base Set does. TCG Pocket never had the stat, and Scarlet & Violet dropped it: a real SV
 * card shows Weakness and Retreat with nothing between them. Both frames still bake the empty
 * cell, so the row stays three columns wide and leaves the middle blank.
 *
 * Enforced here rather than by hiding the cell in CSS, because `matchOf` derives a resistance type
 * from the profile's second language on every generation.
 */
export const hasResistance = (gen: Generation) => gen === '1-gen';

/**
 * HP as a card actually prints it: a multiple of 10, floor 30, ceiling 340. Still the follower
 * count, mapped onto the range real cards use; the raw number moves to the dex line.
 *
 * 50 HP per order of magnitude rather than 44. Quantising to 10 leaves only 32 legal values for
 * the whole of GitHub, and a shallower curve rounds accounts an order of magnitude apart onto the
 * same value. At 50, a million followers still reaches only 330, so the clamp stays out of reach.
 *   0 -> 30    100 -> 130    10k -> 230    91k -> 280    312k -> 300
 */
export const cardHp = (d: Profile) => {
    const raw = 30 + 50 * Math.log10(Math.max(0, d.followers || 0) + 1);
    return Math.min(340, Math.max(30, Math.round(raw / 10) * 10));
};

/**
 * Attack damage as a card prints it: a multiple of 10, 10..300. Same log shape as HP, so a big
 * number still reads as big without printing a raw star count.
 */
export const attackDamage = (n: number, per = 34) =>
    String(Math.min(300, Math.max(10, Math.round((10 + per * Math.log10(Math.max(0, n) + 1)) / 10) * 10)));

/**
 * Every weakness the TCG has printed for this element, most common first.
 *
 * Weakness is NOT one value per type in the real game - it is per species, and a single set prints
 * several answers for one type: Base Set alone has Squirtle weak to Lightning and Poliwag weak to
 * Grass, both Water. Others moved between eras and both readings stayed legal (Psychic was weak to
 * Psychic in 1999 and to Darkness from Diamond & Pearl on; Fighting went Psychic -> Grass;
 * Darkness went Fighting -> Grass). Dragon has printed four.
 *
 * Types with one entry never varied, so they do not vary here either. This list is the whole room
 * the rules leave - a weakness outside it is not a Pokemon card, which is what the check pins down.
 */
const WEAKNESSES: Record<Element, Element[]> = {
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

/**
 * The weakness / resistance row for ONE profile.
 *
 * The amounts cannot carry per-card identity - `weaknessAmount`/`resistanceAmount` are era
 * constants, and every card on a frame prints the same modifier. So the two fields real sets DO
 * vary card-by-card have to do the work, and both are driven off the profile:
 *
 *  - weakness TYPE: one of the answers WEAKNESSES says the element has actually been printed with,
 *    picked by the account's join year so an older account leans to the older matchup. Species of
 *    one type differ here on real cards, so this is per-card variety, not a broken chart.
 *  - resistance: the TCG has no resistance chart. It is per-species, and most cards print none at
 *    all, so it is the one field free to follow the profile outright: the SECOND language, dropped
 *    when that lands on the card's own type or on its weakness. That collision is what leaves a
 *    good share of cards printing "-", which is what a real set looks like.
 *
 * Before this the row was a pure function of the element, so every C dev on the site shared a
 * bottom row with every other C dev.
 */
export function matchOf(type: Element, d: Profile): { weak: Element; resist?: Element } {
    const opts = WEAKNESSES[type] ?? WEAKNESSES.colorless;
    // GitHub opened in 2008; a 4-year step keeps the index inside the list for every real join
    // year, and clamps rather than wrapping so a 2008 account cannot land back on the first entry.
    const weak = opts[Math.max(0, Math.min(opts.length - 1, Math.floor((2018 - (d.join_year || 2018)) / 4)))];

    const second = d.langs?.[1];
    const resist = second ? (langType(second) as Element) : undefined;

    return { weak, resist: !resist || resist === type || resist === weak ? undefined : resist };
}

export const fmt = (n: number) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
};

/**
 * The card's face, addressed through OUR origin rather than GitHub's CDN (App\Services\AvatarCache).
 *
 * It used to hand `<img>` the raw `avatars.githubusercontent.com` url, which made the picture on
 * every card depend on a host the visitor's network may not reach - and GitHub caps its own avatar
 * caching at 300 seconds, so browsers re-downloaded all four faces on the landing page every five
 * minutes. `/avatar/{login}` is same-origin, cached for a day, and served from disk.
 *
 * `s` only ever takes the sizes AvatarCache stores; anything else silently becomes 360 there.
 * A profile with no avatar at all still returns '' rather than a url that can only 404.
 *
 * Lower-cased for the same reason the public card page lower-cases its canonical slug: the stored
 * login keeps its display casing ("IlhamriSKY"), the cache file does not, and two spellings of one
 * address are two entries in every browser and proxy cache between here and the visitor.
 */
export const avatarUrl = (d: Pick<Profile, 'avatar' | 'login'>, s: number) =>
    !d.avatar
        ? ''
        : d.login
          ? `/avatar/${encodeURIComponent(d.login.toLowerCase())}?s=${s}`
          : d.avatar + (d.avatar.includes('?') ? '&' : '?') + 's=' + s;

export function loreOf(d: Profile): Lore {
    if (d.ai && d.ai.flavor) return d.ai;
    const lang = d.top_lang || 'Code';
    return {
        species: `${lang} Coder`.slice(0, 22),
        flavor: `A ${d.age_years || 0}-yr ${lang} veteran with ${fmt(d.stars)} stars.`.slice(0, 90),
        // The Trainer face has no attacks, so its plate needs more than the one-line flavor.
        effect: `A ${d.age_years || 0}-yr ${lang} veteran with ${fmt(d.stars)} stars across ${fmt(d.repos)} repos, followed by ${fmt(d.followers)} developers.`.slice(
            0,
            190,
        ),
        // Damage is scaled, not printed raw: these were `fmt(d.repos * 10)` and `fmt(d.stars)`,
        // which handed Linus a "252k" attack. The real numbers stay in the descriptions.
        attacks: [
            { name: 'Commit Storm', cost: 2, damage: attackDamage(d.repos), desc: `Ships across ${fmt(d.repos)} repos.` },
            { name: 'Star Surge', cost: 3, damage: attackDamage(d.stars), desc: `Draws ${fmt(d.followers)} followers.` },
        ],
    };
}
