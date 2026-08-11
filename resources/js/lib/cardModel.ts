import { elementHasFrame, type AssetGen } from '@/components/PcgFace';
import type { CardOverrides } from '@/components/PokeCard';
import { assetOf, type CardOptions } from '@/lib/options';
import { langType, type Element, type Rarity, type Subtype } from '@/lib/rarities';

/**
 * The 15 independent card-lab axes, as slug strings. "auto" derives from the profile/config;
 * "none" omits the layer. Shared by the dashboard, the public card page and the gallery, so every
 * stored card resolves the same way.
 */
export type Axes = {
    element: string;
    subtype: string;
    generation: string;
    dualType: string;
    evolvesFrom: string;
    glare: string;
    frame: string;
    variant: string;
    rarityMark: string;
    /** TCG Pocket "Attribute frame": 'none' or one of ATTRIBUTE_FRAMES. */
    attributeFrame: string;
    tag: string;
    badge: string;
    icon: string;
    effect: string;
    /** Base Set "EDITION 1" stamp. The only non-string axis, and a toggle rather than a slug,
     *  matching the reference generator: a switch offered on 1st gen alone, on both Regular and
     *  Trainer, and never on tcg-gen or scarlet-violet. */
    firstEdition: boolean;
};

/**
 * Filter element options to those the given generation ships a frame for.
 *
 * Derived from PcgFace's FRAMES, which mirrors what is on disk, rather than a hand-kept list that
 * could drift from the assets. Not database-driven either: a card_assets row claiming Scarlet &
 * Violet has a Fairy frame would not make `basic-fairy.webp` exist, and file existence is the real
 * bound.
 */
export function elementsForGen<T extends { slug: string }>(elements: T[], generation: string): T[] {
    return elements.filter((e) => elementHasFrame(generation as AssetGen, e.slug));
}

/**
 * True when `slug` still renders on `generation`, which is what decides whether a currently
 * picked element survives a generation change or has to be reset. The sentinels 'auto' and 'none'
 * always pass, since they resolve later and have no frame of their own.
 */
export const elementSupported = (generation: string, slug: string): boolean =>
    slug === 'auto' || slug === 'none' || elementHasFrame(generation as AssetGen, slug);

// Upstream's DUAL TYPE list drops Dark. 1-gen ships no dark frame at all, so this only bites here.
const DUAL_DROPS_DARK = new Set(['tcg-gen', 'scarlet-violet']);

/**
 * Can `slug` be this generation's SECOND type?
 *
 * Not the same question as `elementSupported`, which asks for a frame. A dual type only draws an
 * energy disc beside the primary one, so the reference offers Fairy as a dual on Scarlet & Violet
 * even though SV ships no Fairy frame. Deriving the list from the frame-gated one alone loses
 * exactly that entry.
 *
 * Lives here rather than in the settings panel, because the All-variants gallery needs the same
 * answer and a second copy of the rule would be a second thing to forget.
 */
export const dualSupported = (generation: string, slug: string): boolean =>
    DUAL_DROPS_DARK.has(generation)
        ? slug !== 'darkness' && (slug === 'fairy' || elementSupported(generation, slug))
        : elementSupported(generation, slug);

/**
 * The second element a card takes when no axis names one, derived from the developer's second
 * language exactly as the primary is derived from their first.
 *
 * A generated card carries no stored axes, so its `dualType` is always the 'auto' sentinel. Without
 * this it could never show two elements however many languages the profile lists.
 *
 * Undefined when there is no second language, when it resolves to the same element as the primary
 * (a card cannot be dual with itself), or when this generation does not offer that element as a
 * dual.
 */
export function autoDualType(langs: string[] | undefined, generation: string, primary: string): Element | undefined {
    const second = langs?.[1] ? langType(langs[1]) : undefined;

    return second && second !== primary && dualSupported(generation, second) ? (second as Element) : undefined;
}

/**
 * Does this generation offer the "chrome" axes - Name icon, Tag stamp, Set badge?
 *
 * 1st gen does NOT. Verified live on pokecardgenerator: its Information panel is Generation,
 * Template, Name, Type, Dual type, HP and 1st edition - there is no Frame, Icon, Tag or Badge
 * control at all, unlike TCG Pocket and Scarlet & Violet which offer all three. Badge was already
 * gated everywhere; icon and tag were not, so a 1-gen card could carry chrome the reference can
 * never produce. Same reasoning as `elementsForGen`: code-driven, because a card_assets row
 * cannot make a control exist upstream.
 */
export const supportsChrome = (generation: string): boolean => generation !== '1-gen';

/**
 * TCG Pocket's attribute frame: the decorative border around the artwork window and the attribute
 * strip below it. It is a border rather than artwork, so it is driven by CSS here instead of a
 * card_assets row. A database row cannot make a CSS style exist, which is the same reasoning
 * `elementsForGen` uses for frames.
 */
export const ATTRIBUTE_FRAMES = ['grey', 'shining', 'black', 'mega'] as const;

/** Only TCG Pocket offers the control upstream. */
export const attributeFramesForGen = (generation: string): readonly string[] => (generation === 'tcg-gen' ? ATTRIBUTE_FRAMES : []);

/**
 * The element the picker shows.
 *
 * The picker offers concrete types only, with no "Auto" row, but 'auto' survives as the stored
 * sentinel meaning "derive from the profile language", so it is resolved here. A generation that
 * ships no frame for the derived type renders the normal one (see frameName), so this reports
 * colorless rather than leaving the select blank.
 */
export const pickerElement = (generation: string, element: string, topLang?: string): string => {
    if (element !== 'auto') return element;
    const derived = langType(topLang);
    return elementSupported(generation, derived) ? derived : 'colorless';
};

/**
 * The type a fresh print comes out as.
 *
 * `element: 'auto'` derives from the single top language, which would make every Regenerate hand
 * back an identically typed card. This draws from all the languages the developer writes and drops
 * the current type, so the card always visibly changes.
 *
 * `allowed` narrows the pool to the types the chosen generation actually ships a frame for, so a
 * CSS-writing dev on Base Set (no fairy frame there) is not handed one.
 *
 * Undefined when there is nothing to roll (no card yet, a one-language dev, or none of their
 * languages survive `allowed`): the caller then leaves the element alone, so a first card keeps
 * its honest derived type.
 */
export function rollElement(langs: string[] | undefined, current: string | undefined, allowed?: string[]): string | undefined {
    const pool = [...new Set((langs ?? []).map(langType))].filter((e) => e !== current && (!allowed || allowed.includes(e)));

    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined;
}

/**
 * Subtypes a generation offers, when it offers fewer than the full DB list.
 *
 * 1st gen offers Pokemon stages only, matching the reference generator's [basic, stage1, stage2].
 * The trainer subtypes are not a Base Set stage: Trainer is a template there, which the `variant`
 * axis already models, so offering them here too would expose the same idea twice.
 *
 * A generation absent from this map keeps the full list.
 */
const GEN_SUBTYPES: Record<string, string[]> = {
    '1-gen': ['basic', 'stage1', 'stage2'],
};

/** Filter DB subtype options to those `generation` actually offers. */
export function subtypesForGen<T extends { slug: string }>(subtypes: T[], generation: string): T[] {
    const allowed = GEN_SUBTYPES[generation];
    return allowed ? subtypes.filter((s) => allowed.includes(s.slug)) : subtypes;
}

/** True when a picked subtype survives a generation change. 'auto' always resolves later. */
export const subtypeSupported = (generation: string, slug: string): boolean =>
    slug === 'auto' || !GEN_SUBTYPES[generation] || GEN_SUBTYPES[generation].includes(slug);

/**
 * Is this variant a Trainer template, meaning a card with no type, stage, name emblem or
 * evolution? Those axes are Pokemon-only, so the lab hides them and resolveOverrides drops them.
 *
 * Narrower than the reference generator, which drops them on every generation: only 1st gen ships
 * `trainer.webp` and the PcgFace branch that renders it. On the other generations a 'trainer'
 * variant still falls through to the Pokemon face and draws a type-coloured frame, so hiding
 * Element there would take away control of something the card visibly uses. Gating on the same
 * predicate the renderer branches on keeps what you can edit equal to what gets drawn.
 *
 * Widen to `slug.startsWith('trainer')` once the other generations grow real trainer templates.
 * Those are composited from frame styles upstream rather than shipped as an asset, so it is its
 * own piece of work.
 */
export const isTrainerVariant = (generation: string, slug: string): boolean => generation === '1-gen' && slug === 'trainer';

export const DEFAULT_AXES: Axes = {
    element: 'auto',
    subtype: 'auto',
    generation: '1-gen',
    dualType: 'auto',
    evolvesFrom: '',
    glare: 'auto',
    frame: 'none',
    variant: 'regular',
    rarityMark: 'auto',
    attributeFrame: 'none',
    tag: 'none',
    badge: 'none',
    icon: 'none',
    effect: 'none',
    firstEdition: false,
};

type Meta = Record<string, unknown> | null;

/** Resolve axis slugs + the active rarity into the CardOverrides PokeCard consumes. */
export function resolveOverrides(options: CardOptions, rawAxes: Partial<Axes> | null | undefined, activeRarity: Rarity): CardOverrides {
    // Merge over defaults so a partial/absent saved card (older rows, missing keys)
    // never crashes on an undefined axis (e.g. evolvesFrom.trim()).
    const axes: Axes = { ...DEFAULT_AXES, ...(rawAxes ?? {}) };
    const genFrames = (options.frame ?? []).filter((f) => f.generation === axes.generation);
    const genVariants = (options.variant ?? []).filter((v) => v.generation === axes.generation);
    // A Trainer card has no type / stage / name emblem / evolution. The lab hides those five
    // controls, but hiding is not dropping: dashboard saves the whole axes blob, so a card
    // saved as Pokemon and later switched to Trainer keeps `element: 'fire'` in the DB and the
    // public page would render it. Drop them here, where every consumer resolves.
    // Gen-membership is checked FIRST (like `variant` below) so a 'trainer' slug saved against
    // a generation that has no trainer row cannot gate anything.
    const trainer = genVariants.some((v) => v.slug === axes.variant) && isTrainerVariant(axes.generation, axes.variant);

    let rarityMark: { url: string; count: number } | undefined;
    if (axes.rarityMark !== 'none') {
        const rr = options.rarity ?? [];
        if (axes.rarityMark === 'auto') {
            const [sym, count] = (
                { common: ['diamond', 1], uncommon: ['diamond', 2], rare: ['star', 1], ultra: ['star', 2] } as Record<string, [string, number]>
            )[activeRarity.tier] ?? ['star', 1];
            const o = rr.find((x) => (x.meta as Meta)?.symbol === sym && (x.meta as Meta)?.count === count);
            rarityMark = o ? { url: o.asset_url, count } : undefined;
        } else {
            const o = rr.find((x) => x.slug === axes.rarityMark);
            rarityMark = o ? { url: o.asset_url, count: ((o.meta as Meta)?.count as number) ?? 1 } : undefined;
        }
    }

    return {
        element: axes.element === 'auto' || trainer ? undefined : (axes.element as Element),
        // Fall back to auto for a subtype the generation does not offer, the same way `variant`
        // below drops a frame the generation has no asset for. Without this, a hand-edited row can
        // render a Trainer subtype on a Base Set frame.
        subtype: axes.subtype === 'auto' || trainer || !subtypeSupported(axes.generation, axes.subtype) ? undefined : (axes.subtype as Subtype),
        generation: axes.generation as CardOverrides['generation'],
        dualType: axes.dualType === 'auto' || trainer ? undefined : (axes.dualType as Element),
        // "Evolves from" is a Stage 1 and Stage 2 concept only: a Basic card evolves from
        // nothing, so a name saved against one must never render.
        evolvesFrom: !trainer && (axes.subtype === 'stage1' || axes.subtype === 'stage2') ? (axes.evolvesFrom || '').trim() || undefined : undefined,
        iconUrl: axes.icon === 'none' || trainer || !supportsChrome(axes.generation) ? undefined : assetOf(options, 'icon', axes.icon),
        // Gated on the generation as well as the value: only TCG Pocket offers the control, so a
        // stale value saved before a generation switch must not paint on 1-gen or SV.
        attributeFrame:
            axes.attributeFrame && axes.attributeFrame !== 'none' && attributeFramesForGen(axes.generation).includes(axes.attributeFrame)
                ? axes.attributeFrame
                : undefined,
        // The saved axes blob stores one effect slug, so a stored card renders a single layer.
        // Wrapped in a list because the face can paint several.
        effectUrls: axes.effect === 'none' ? undefined : ([assetOf(options, 'effect', axes.effect)].filter(Boolean) as string[]),
        tagUrl: axes.tag === 'none' || !supportsChrome(axes.generation) ? undefined : assetOf(options, 'tag', axes.tag),
        tagSlug: axes.tag === 'none' || !supportsChrome(axes.generation) ? undefined : axes.tag,
        // A set badge is a TCG Pocket and SV concept; Base Set has none. Enforced here rather than
        // only in the picker, so a card saved before a generation switch cannot render a modern
        // badge on a Base Set frame.
        badgeUrl: axes.badge === 'none' || axes.generation === '1-gen' ? undefined : assetOf(options, 'badge', axes.badge),
        // The "EDITION 1" stamp is Base Set art, and the reference offers the switch on 1st gen
        // alone. Guarded here so a card that had it on and was later moved to another generation
        // cannot render a stamp those frames have no art for.
        firstEdition: axes.generation === '1-gen' && !!axes.firstEdition,
        frameOverlayUrl: axes.frame === 'none' ? undefined : genFrames.find((f) => f.slug === axes.frame)?.asset_url,
        rarityMark,
        // 'auto' means no override, so the rarity's own holo applies. A picked glare uses its
        // stored `dr`, and "None" has an empty one, which must fall back to 'common' (a
        // data-rarity carrying no foil rules) rather than to undefined: PokeCard renders
        // `data-rarity={glareDr || rarity.dr}`, so undefined would let the rarity's holo back in
        // and "None" would never turn the foil off.
        glareDr: axes.glare === 'auto' ? undefined : ((options.glare?.find((o) => o.slug === axes.glare)?.meta as Meta)?.dr as string) || 'common',
        variant: axes.variant === 'none' || !genVariants.some((v) => v.slug === axes.variant) ? undefined : axes.variant,
    };
}
