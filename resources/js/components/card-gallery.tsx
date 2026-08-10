import { PokeCard } from '@/components/PokeCard';
import {
    attributeFramesForGen,
    DEFAULT_AXES,
    elementsForGen,
    isTrainerVariant,
    resolveOverrides,
    rollElement,
    subtypesForGen,
    supportsChrome,
    type Axes,
} from '@/lib/cardModel';
import { type CardOptions } from '@/lib/options';
import { langType, rarityOf, subtypesFromOptions, type Profile, type Rarity } from '@/lib/rarities';
import { X } from 'lucide-react';
import { useEffect } from 'react';

type Tile = { label: string; axes: Partial<Axes>; rarity: string };
type Section = { title: string; tiles: Tile[] };

/**
 * Every scenario the lab can produce for the card in hand, one axis at a time: each tile holds
 * the current draft and varies a single value, so the grid answers "what does THIS card look
 * like as X" rather than showing a stranger's card in every frame.
 */
export function buildSections(options: CardOptions, axes: Partial<Axes>, rarity: string, rarities: Rarity[]): Section[] {
    const a: Axes = { ...DEFAULT_AXES, ...axes };
    const gen = a.generation;
    const isTrainer = isTrainerVariant(gen, a.variant);
    const out: Section[] = [];

    const push = (title: string, tiles: Tile[]) => {
        if (tiles.length > 1) out.push({ title, tiles });
    };

    push(
        'Rarity',
        rarities.map((r) => ({ label: r.label, axes: a, rarity: r.key })),
    );

    push(
        'Generation',
        (options.generation ?? []).map((o) => ({
            // Frame/variant are generation-scoped, so a preview of another generation has to
            // reset them or it renders a frame that generation does not ship.
            label: o.label,
            axes: { ...a, generation: o.slug, frame: 'none', variant: 'regular' },
            rarity,
        })),
    );

    push(
        'Variant / template',
        (options.variant ?? []).filter((v) => v.generation === gen).map((o) => ({ label: o.label, axes: { ...a, variant: o.slug }, rarity })),
    );

    if (!isTrainer) {
        push(
            'Element / type',
            elementsForGen(options.element ?? [], gen).map((o) => ({ label: o.label, axes: { ...a, element: o.slug }, rarity })),
        );

        push('Subtype (stage)', [
            { label: 'Auto', axes: { ...a, subtype: 'auto' }, rarity },
            ...subtypesForGen(subtypesFromOptions(options), gen).map((s) => ({ label: s.label, axes: { ...a, subtype: s.slug }, rarity })),
        ]);
    }

    push('Frame', [
        { label: 'None', axes: { ...a, frame: 'none' }, rarity },
        ...(options.frame ?? []).filter((f) => f.generation === gen).map((o) => ({ label: o.label, axes: { ...a, frame: o.slug }, rarity })),
    ]);

    push('Glare / holo', [
        { label: 'Auto', axes: { ...a, glare: 'auto' }, rarity },
        ...(options.glare ?? []).map((o) => ({ label: o.label, axes: { ...a, glare: o.slug }, rarity })),
    ]);

    push('Rarity mark', [
        { label: 'Auto', axes: { ...a, rarityMark: 'auto' }, rarity },
        { label: 'None', axes: { ...a, rarityMark: 'none' }, rarity },
        ...(options.rarity ?? [])
            .filter((o) => !o.generation || o.generation === gen)
            .map((o) => ({ label: o.label, axes: { ...a, rarityMark: o.slug }, rarity })),
    ]);

    if (attributeFramesForGen(gen).length) {
        push('Attribute frame', [
            { label: 'None', axes: { ...a, attributeFrame: 'none' }, rarity },
            ...attributeFramesForGen(gen).map((s) => ({ label: s, axes: { ...a, attributeFrame: s }, rarity })),
        ]);
    }

    if (supportsChrome(gen)) {
        push('Tag stamp', [
            { label: 'None', axes: { ...a, tag: 'none' }, rarity },
            ...(options.tag ?? [])
                .filter((o) => !(o.slug === 'mega' && (gen === '1-gen' || gen === 'tcg-gen')))
                .map((o) => ({ label: o.label, axes: { ...a, tag: o.slug }, rarity })),
        ]);

        push('Set badge', [
            { label: 'None', axes: { ...a, badge: 'none' }, rarity },
            ...(options.badge ?? []).map((o) => ({ label: o.label, axes: { ...a, badge: o.slug }, rarity })),
        ]);

        if (!isTrainer) {
            push('Name icon', [
                { label: 'None', axes: { ...a, icon: 'none' }, rarity },
                ...(options.icon ?? [])
                    .filter((o) => !o.generation || o.generation === gen)
                    .map((o) => ({ label: o.label, axes: { ...a, icon: o.slug }, rarity })),
            ]);
        }
    }

    push('Visual effect', [
        { label: 'None', axes: { ...a, effect: 'none' }, rarity },
        ...(options.effect ?? []).map((o) => ({ label: o.label, axes: { ...a, effect: o.slug }, rarity })),
    ]);

    if (gen === '1-gen') {
        push('1st edition stamp', [
            { label: 'Off', axes: { ...a, firstEdition: false }, rarity },
            { label: 'On', axes: { ...a, firstEdition: true }, rarity },
        ]);
    }

    return out;
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const chance = (p: number) => Math.random() < p;

/**
 * Visual effect -> the element it belongs to, by asset-name prefix (`thunder-3`, `leaf-2`...).
 * A lightning card throwing leaves is legal but reads wrong, and matching costs one lookup.
 * Anything not listed falls back to the whole pool.
 */
const EFFECT_FAMILY: Record<string, string[]> = {
    lightning: ['thunder', 'sparkle'],
    fire: ['flame'],
    grass: ['leaf'],
    water: ['water', 'ice'],
    fighting: ['rock'],
    darkness: ['dark'],
    psychic: ['sparkle', 'abstract'],
    fairy: ['sparkle'],
    dragon: ['rainbow'],
    metal: ['abstract'],
    colorless: ['abstract'],
};

/**
 * A whole card, rolled locally - no AI involved, the model only ever writes the text.
 *
 * Every axis is drawn from the SAME tiles the lab offers for the card in hand (buildSections), so
 * a rolled card can never be a combination the lab cannot produce: chrome only on the generations
 * that have it, frames only from that generation's set, no type or stage on a Trainer template.
 * Reusing those tiles is the point - a second copy of the gating rules here would drift from the
 * first one the day an asset is added.
 *
 * Legality is not the whole of it though. These stay grounded rather than uniform, because a
 * random value would contradict what the card claims:
 *   - element    from the languages this dev actually writes (rollElement)
 *   - dualType   their SECOND language, and only sometimes - most real cards have one type
 *   - subtype    the stage is earned from account age; a one-year-old account is not a Stage 2
 *   - icon       the ex/V/VMAX emblem needs a card with that mechanic, i.e. the rarity preset
 *   - effect     matched to the element (EFFECT_FAMILY)
 *   - badge      always, on the generations that print one: a real modern card always carries
 *                its set symbol
 *   - glare + rarityMark stay 'auto', which follows the rarity tier. A rainbow foil or a
 *     two-star mark on a Common says the exact opposite of what the rarity says.
 * `firstEdition` is not rolled at all - the server derives it from account age.
 */
export function rollAxes(options: CardOptions, base: Partial<Axes>, rarity: Rarity, rarities: Rarity[], profile?: Profile): Partial<Axes> {
    const gens = options.generation ?? [];
    // Options load asynchronously; with none there are no legal values to roll, and returning
    // an empty blob leaves the saved card exactly as it was rather than flattening it.
    if (!gens.length) return {};

    // Generation first: it decides which frames, variants and chrome exist at all.
    let a: Axes = { ...DEFAULT_AXES, ...base, generation: pick(gens).slug, frame: 'none', variant: 'regular' };

    // The legal slugs for one axis, from the lab's own tiles for the CURRENT draft - so every
    // call reflects the generation/variant picked a line earlier.
    const legal = (title: string, key: keyof Axes): string[] =>
        (buildSections(options, a, rarity.key, rarities).find((s) => s.title === title)?.tiles ?? []).map((t) => String(t.axes[key]));

    // An optional layer: present with probability p, otherwise off. Never picks the tile that
    // means "off"/"derive" - that is what the p is for.
    const maybe = (title: string, key: keyof Axes, p: number): string => {
        const xs = legal(title, key).filter((s) => s !== 'none' && s !== 'auto');

        return xs.length && chance(p) ? pick(xs) : 'none';
    };

    const others = legal('Variant / template', 'variant').filter((v) => v !== 'regular');
    a = { ...a, variant: others.length && chance(0.4) ? pick(others) : 'regular' };

    // Trainer templates have no type: the section disappears and both stay as they are. The roll
    // is narrowed to this generation's frames, so a fairy-typed dev on Base Set (no fairy frame)
    // gets another language of theirs rather than a stranger's type.
    const elements = legal('Element / type', 'element');
    const langEl = rollElement(profile?.langs, base.element, elements);
    if (elements.length) a = { ...a, element: langEl ?? pick(elements) };

    // Guarded on the LANGUAGE, not on what it maps to: langType defaults anything it does not
    // know to 'grass', and `undefined` is one of those - so a dev with a single language was
    // rolling a Grass second type a quarter of the time with no language behind it.
    const second = profile?.langs?.[1] ? langType(profile.langs[1]) : '';
    a = { ...a, dualType: second && elements.includes(second) && second !== a.element && chance(0.25) ? second : 'auto' };

    // Stage = time served. Under 3 years nothing has evolved yet; Stage 2 is a veteran account.
    const years = profile?.age_years ?? 0;
    const stages = legal('Subtype (stage)', 'subtype').filter(
        (s) => s === 'basic' || (s === 'stage1' && years >= 3) || (s === 'stage2' && years >= 7),
    );
    const stage = stages.length ? pick(stages) : a.subtype;
    // A Stage 1/2 evolves FROM something, so give the box a real name: the language they wrote
    // before this one. Basic cards must carry none, or the frame prints an evolution it has not.
    a = {
        ...a,
        subtype: stage,
        evolvesFrom: stage === 'stage1' || stage === 'stage2' ? (profile?.langs?.[stage === 'stage2' ? 2 : 1] ?? profile?.langs?.[1] ?? '') : '',
    };

    a = {
        ...a,
        frame: maybe('Frame', 'frame', 0.5),
        attributeFrame: maybe('Attribute frame', 'attributeFrame', 0.4),
        tag: maybe('Tag stamp', 'tag', 0.35),
        badge: maybe('Set badge', 'badge', 1),
        effect: maybe('Visual effect', 'effect', 0.5),
    };

    // The emblem is a mechanic, not decoration: take the one named after this card's rarity
    // preset (a 'vmax' preset earns the VMAX emblem). Failing an exact match, only the ultra
    // tier - the ex/V-class cards - may wear one at all.
    const icons = legal('Name icon', 'icon').filter((s) => s !== 'none');
    a = {
        ...a,
        icon: icons.includes(rarity.key) ? rarity.key : icons.length && rarity.tier === 'ultra' && chance(0.5) ? pick(icons) : 'none',
    };

    // Re-pick the effect inside the element's family when that family has anything to offer.
    const family = EFFECT_FAMILY[a.element] ?? [];
    const matched = legal('Visual effect', 'effect').filter((s) => family.some((f) => s.startsWith(f)));
    if (a.effect !== 'none' && matched.length) a = { ...a, effect: pick(matched) };

    // firstEdition is the server's to derive, so it is not returned.
    const rolled: Partial<Axes> = { ...a };
    delete rolled.firstEdition;

    return rolled;
}

export function CardGallery({
    options,
    profile,
    axes,
    rarity,
    rarities,
    onPick,
    onClose,
}: {
    options: CardOptions;
    profile: Profile;
    axes: Partial<Axes>;
    rarity: string;
    rarities: Rarity[];
    onPick: (axes: Partial<Axes>, rarity: string) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const sections = buildSections(options, axes, rarity, rarities);
    const total = sections.reduce((n, s) => n + s.tiles.length, 0);

    return (
        <div className="bg-background fixed inset-0 z-50 overflow-y-auto">
            <div className="bg-background/95 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
                <h2 className="text-sm font-semibold">All variants</h2>
                <span className="text-muted-foreground text-xs">
                    {total} scenarios · {sections.length} axes · click one to apply
                </span>
                <button type="button" onClick={onClose} aria-label="Close" className="hover:bg-muted ml-auto rounded-full p-2 transition-colors">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-8 p-4">
                {sections.map((s) => (
                    <section key={s.title}>
                        <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{s.title}</h3>
                        <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-4">
                            {s.tiles.map((t) => {
                                const r = rarityOf(rarities, t.rarity);

                                return (
                                    <li key={`${s.title}-${t.label}`} className="mx-auto flex w-full max-w-[160px] flex-col items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onPick(t.axes, t.rarity);
                                                onClose();
                                            }}
                                            className="focus-visible:ring-ring w-full cursor-pointer rounded-lg transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            <PokeCard
                                                profile={{ ...profile, rarity: t.rarity }}
                                                rarity={r}
                                                {...resolveOverrides(options, t.axes, r)}
                                            />
                                        </button>
                                        <span className="text-muted-foreground w-full truncate text-center text-[11px]">{t.label}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
