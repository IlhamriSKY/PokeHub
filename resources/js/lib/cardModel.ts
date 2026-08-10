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
    /** Base Set "EDITION 1" stamp. 1st gen only, and a toggle rather than a slug -- the only
     *  non-string axis, matching pokecardgenerator, where it is a switch (`name="firstEdition"`)
     *  offered on 1st gen alone (Regular AND Trainer), never on tcg-gen/scarlet-violet. */
    firstEdition: boolean;
};

/**
 * Filter DB element options to those the given generation actually ships a frame for.
 * Derived from PcgFace's FRAMES (the on-disk truth) rather than a hand-kept list, so it
 * cannot drift from the assets.
 *
 * This replaced a hardcoded GEN1_UNSUPPORTED_ELEMENTS = [darkness, metal, dragon, fairy],
 * which only ever described 1-gen. It could not express that scarlet-violet ships no
 * `basic-fairy.webp` -- so fairy WAS selectable on SV and silently rendered a normal frame.
 * Deriving from FRAMES fixes SV for free and keeps one source of truth.
 *
 * Not DB-driven on purpose: a card_assets row claiming SV has a fairy frame would not make
 * `basic-fairy.webp` exist. File existence is the real bound, and FRAMES already encodes it.
 */
export function elementsForGen<T extends { slug: string }>(elements: T[], generation: string): T[] {
    return elements.filter((e) => elementHasFrame(generation as AssetGen, e.slug));
}

/**
 * True when `slug` still renders on `generation` -- i.e. whether a currently-picked element
 * survives a generation change, or has to be reset. The sentinels 'auto' and 'none' always
 * pass (they resolve later and have no frame of their own).
 * Replaces `GEN1_UNSUPPORTED_ELEMENTS.includes(...)` at the same call sites.
 */
export const elementSupported = (generation: string, slug: string): boolean =>
    slug === 'auto' || slug === 'none' || elementHasFrame(generation as AssetGen, slug);

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
 * TCG Pocket's "Attribute frame" - the decorative border around the artwork window and the
 * attribute strip below it. Measured on pokecardgenerator: switching styles repaints only ~11% of
 * the pixels inside L7.17-92.83% / T8.79-50.66%, i.e. it is a BORDER, not artwork - which is why
 * this is code+CSS driven rather than a card_assets row. A DB row cannot make a CSS style exist,
 * the same reasoning `elementsForGen` uses for frames.
 */
export const ATTRIBUTE_FRAMES = ['grey', 'shining', 'black', 'mega'] as const;

/** Only TCG Pocket offers the control upstream. */
export const attributeFramesForGen = (generation: string): readonly string[] => (generation === 'tcg-gen' ? ATTRIBUTE_FRAMES : []);

/**
 * The element the picker SHOWS. The picker offers concrete types only -- no "Auto" row -- but
 * 'auto' survives as the stored/reset sentinel meaning "derive from the profile language", so
 * resolve it here. A generation that ships no frame for that type renders the normal one
 * (see frameName), so name colorless: the slug whose frame IS normal. Keeps the label honest
 * about what the card actually renders instead of leaving the Select blank.
 */
export const pickerElement = (generation: string, element: string, topLang?: string): string => {
    if (element !== 'auto') return element;
    const derived = langType(topLang);
    return elementSupported(generation, derived) ? derived : 'colorless';
};

/**
 * The type a fresh print comes out as. `element: 'auto'` derives from the ONE top language, so
 * every Regenerate handed back an identically-typed card - a re-roll that re-rolled nothing. Draw
 * from the languages the developer actually writes instead, dropping the current type so the card
 * always visibly changes.
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
 * 1st gen is Pokemon-stages-only: verified live against pokecardgenerator, whose 1st-gen
 * stage picker is exactly [basic, stage1, stage2]. The trainer subtypes (supporter/item/
 * stadium) are not a Base Set stage -- "Trainer" is a TEMPLATE there, which PokeHub already
 * models on the separate `variant` axis (1-gen variants = Regular | Trainer), so offering
 * them as subtypes too both contradicted the reference and double-exposed the same idea.
 * A generation absent from this map keeps the full DB list.
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
 * Is this variant a Trainer template -- i.e. a card with no type, stage, name emblem or
 * evolution? Those five axes are Pokemon-only, so the lab hides them and resolveOverrides
 * drops them (a Trainer card has nothing to hang them on).
 *
 * Verified on pokecardgenerator: picking Trainer removes Type / Dual type / Icon and the whole
 * Evolution panel on EVERY generation. PokeHub is deliberately narrower -- only 1st gen ships
 * `trainer.webp` + the PcgFace branch that renders it (PcgFace.tsx). On tcg-gen/scarlet-violet
 * a 'trainer' variant still falls through to the Pokemon face and renders a type-coloured
 * `basic-<type>.webp` frame, so hiding Element there would take away control of something the
 * card visibly still uses. Gating on the SAME predicate the renderer branches on keeps the lab
 * honest: what you can edit is exactly what gets drawn.
 *
 * Widen to `slug.startsWith('trainer')` once tcg-gen/SV grow real trainer templates -- note
 * those are composited from frame styles upstream (no trainer frame asset exists to copy),
 * so that is its own piece of work, not a missing download.
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
        // Fall back to auto for a subtype the generation does not offer, the same way
        // `variant` below drops a frame the gen has no asset for. Without this a row saved
        // before 1st gen was stage-only (or hand-edited) renders "Supporter" on a Base Set
        // frame -- a combination the lab can no longer produce.
        subtype: axes.subtype === 'auto' || trainer || !subtypeSupported(axes.generation, axes.subtype) ? undefined : (axes.subtype as Subtype),
        generation: axes.generation as CardOverrides['generation'],
        dualType: axes.dualType === 'auto' || trainer ? undefined : (axes.dualType as Element),
        // "Evolves from" is a Stage 1 / Stage 2 concept only -- a Basic (or Auto) card
        // evolves from nothing, so a name saved against it must never render.
        evolvesFrom: !trainer && (axes.subtype === 'stage1' || axes.subtype === 'stage2') ? (axes.evolvesFrom || '').trim() || undefined : undefined,
        iconUrl: axes.icon === 'none' || trainer || !supportsChrome(axes.generation) ? undefined : assetOf(options, 'icon', axes.icon),
        // Gated on the generation as well as the value: only TCG Pocket has the control upstream,
        // so a stale 'black' saved before a gen switch must not paint on 1-gen or SV.
        attributeFrame:
            axes.attributeFrame && axes.attributeFrame !== 'none' && attributeFramesForGen(axes.generation).includes(axes.attributeFrame)
                ? axes.attributeFrame
                : undefined,
        // The saved axes blob stores ONE effect slug, so a stored card renders a single layer.
        // Wrapped in a list because the face now paints N of them (the playground can pick 5).
        effectUrls: axes.effect === 'none' ? undefined : ([assetOf(options, 'effect', axes.effect)].filter(Boolean) as string[]),
        tagUrl: axes.tag === 'none' || !supportsChrome(axes.generation) ? undefined : assetOf(options, 'tag', axes.tag),
        tagSlug: axes.tag === 'none' || !supportsChrome(axes.generation) ? undefined : axes.tag,
        // A set badge is a TCG/SV concept -- 1st gen (Base Set) has none. The playground has
        // always enforced that (hides the field, clears on gen switch, drops it here), but this
        // shared copy did not, and CardAxes did not gate the picker: so a card built on the
        // DASHBOARD could carry a SwSh/SV badge on a Base Set frame and render it here and on
        // the public page -- a combination /card makes impossible. All three agree now.
        badgeUrl: axes.badge === 'none' || axes.generation === '1-gen' ? undefined : assetOf(options, 'badge', axes.badge),
        // The "EDITION 1" stamp is Base Set art -- 1st gen only, exactly like pokecardgenerator,
        // which offers the switch on 1st gen alone. Guarded here so a saved card that had it on
        // and was later moved to tcg-gen/SV cannot render a stamp those frames have no art for.
        firstEdition: axes.generation === '1-gen' && !!axes.firstEdition,
        frameOverlayUrl: axes.frame === 'none' ? undefined : genFrames.find((f) => f.slug === axes.frame)?.asset_url,
        rarityMark,
        // 'auto' -> no override (use the config rarity's holo). Any picked glare uses its
        // DB `dr`; 'None' has an EMPTY dr, so it must fall back to 'common' (a data-rarity
        // with no foil rules) and NOT to undefined -- PokeCard renders
        // `data-rarity={glareDr || rarity.dr}`, so undefined leaks the config holo straight
        // back in and "None" never turns the foil off. card.tsx:293 has always had this
        // right; this copy did not, which broke "None" on the dashboard + public card while
        // it worked in the playground.
        glareDr: axes.glare === 'auto' ? undefined : ((options.glare?.find((o) => o.slug === axes.glare)?.meta as Meta)?.dr as string) || 'common',
        variant: axes.variant === 'none' || !genVariants.some((v) => v.slug === axes.variant) ? undefined : axes.variant,
    };
}
