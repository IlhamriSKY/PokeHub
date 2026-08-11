import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    ATTRIBUTE_FRAMES,
    DEFAULT_AXES,
    attributeFramesForGen,
    dualSupported,
    elementSupported,
    elementsForGen,
    isTrainerVariant,
    pickerElement,
    subtypeSupported,
    subtypesForGen,
    supportsChrome,
    type Axes,
} from '@/lib/cardModel';
import { type CardOptions } from '@/lib/options';
import { subtypesFromOptions, type Rarity } from '@/lib/rarities';
import { createContext, useContext, useState, type ReactNode } from 'react';

const AUTO = 'auto';
// pokecardgenerator's TCG Pocket picker labels three types by their older TCG names.
// Slugs stay lightning/metal/darkness everywhere; only this label changes.
const TCG_TYPE_LABEL: Record<string, string> = { lightning: 'Electric', metal: 'Steel', darkness: 'Dark' };

/**
 * The lab's search box, read by every Field. A context rather than a prop because the fields are
 * rendered inline under their own generation conditions - threading a query through each one would
 * mean touching fourteen call sites to add a filter that is off by default anyway.
 */
const SearchCtx = createContext('');

/**
 * One labelled control. Under an active search it removes itself unless its own name or one of its
 * option labels matches, so the box finds an option buried in a dropdown as readily as a field
 * name.
 */
function Field({ label, keywords, children }: { label: string; keywords?: string[]; children: ReactNode }) {
    const q = useContext(SearchCtx).trim().toLowerCase();
    if (q && !`${label} ${(keywords ?? []).join(' ')}`.toLowerCase().includes(q)) return null;

    return (
        <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            {children}
        </div>
    );
}

/** Option labels for the search index, so a Field can be found by what is inside it. */
const kw = (list: { label: string }[] | undefined) => (list ?? []).map((o) => o.label);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const GEN_LABEL: Record<string, string> = {
    '1-gen': 'Base Set',
    'tcg-gen': 'TCG Pocket',
    'scarlet-violet': 'Scarlet & Violet',
};

type Opt = { slug: string; label: string; generation?: string | null };

/**
 * A select body split into what THIS generation can draw and what it cannot.
 *
 * With `showAll` off (the user dashboard) only the drawable half is listed, which is how this panel
 * has always behaved. With it on (the admin lab) the rest is listed too but DISABLED, under a
 * heading naming the generation that owns it - so an admin can see the whole possibility space at a
 * glance instead of discovering it by cycling the Generation dropdown.
 *
 * Disabled rather than selectable on purpose. The lab's rule is that what you can pick is what gets
 * drawn: a variant or frame with no asset for the current generation does not error, it silently
 * falls back to the plain frame, so making these selectable would let an admin save a card whose
 * stored axes disagree with every render of it.
 */
function GenOptions({ all, ok, showAll, label }: { all: Opt[]; ok: Opt[]; showAll: boolean; label?: (o: Opt) => string }) {
    const text = label ?? ((o: Opt) => o.label);

    /*
     * Deduped by SLUG, not taken as rows. card_assets stores one variant row PER GENERATION, so
     * `regular` and `trainer` each exist three times and `full-art` twice - twelve rows for six
     * distinct templates. Emitting a row per record would put duplicate values in the Select, which
     * Radix cannot address (two items answering to "regular") and React warns about as a duplicate
     * key. `seen` is primed with what is already on offer so a template stays in the enabled half.
     */
    const rest: Opt[] = [];
    if (showAll) {
        const seen = new Set(ok.map((o) => o.slug));
        for (const o of all) {
            if (seen.has(o.slug)) continue;
            seen.add(o.slug);
            rest.push(o);
        }
    }

    // Which generations DO own this slug - all of them, not just whichever row happened to be first.
    // "Full art" is a tcg-gen and an SV template both, and naming only one of them would be a lie.
    const gensFor = (slug: string) =>
        [...new Set(all.filter((o) => o.slug === slug && o.generation).map((o) => o.generation as string))].map((g) => GEN_LABEL[g] ?? g).join(', ');

    return (
        <>
            {ok.map((o) => (
                <SelectItem key={o.slug} value={o.slug}>
                    {text(o)}
                </SelectItem>
            ))}
            {rest.length > 0 && (
                <SelectGroup>
                    <SelectLabel className="text-muted-foreground text-[10px] font-normal">Not on this generation</SelectLabel>
                    {rest.map((o) => {
                        const gens = gensFor(o.slug);
                        return (
                            <SelectItem key={o.slug} value={o.slug} disabled>
                                {text(o)}
                                {gens ? ` · ${gens}` : ''}
                            </SelectItem>
                        );
                    })}
                </SelectGroup>
            )}
        </>
    );
}

/**
 * Every frame/effect axis of one card. Controlled: the parent owns the blob and persists it, so
 * the same panel edits a user's card and a landing-page showcase card.
 */
export function CardSettings({
    options,
    axes,
    rarities,
    rarity,
    topLang,
    onChange,
    onRarityChange,
    showAll = false,
}: {
    options: CardOptions;
    axes: Partial<Axes>;
    rarities: Rarity[];
    rarity: string;
    topLang?: string;
    onChange: (next: Partial<Axes>) => void;
    onRarityChange: (next: string) => void;
    /**
     * Admin lab: list every option the product has, greying out the ones this generation cannot
     * draw, and keep generation-only controls on screen instead of unmounting them. Off for the
     * user dashboard, which only wants the choices that apply to the card in front of it.
     */
    showAll?: boolean;
}) {
    const a: Axes = { ...DEFAULT_AXES, ...axes };
    const set = (patch: Partial<Axes>) => onChange({ ...a, ...patch });

    const [query, setQuery] = useState('');
    // Lets the lab collapse back to "only what I can actually pick" without losing the full map.
    const [hideUnavailable, setHideUnavailable] = useState(false);
    const listAll = showAll && !hideUnavailable;

    // Frames and variants are generation-scoped exactly like pokecardgenerator: 1st gen has no
    // frame styles at all, and each generation offers its own template set.
    const genFrames = (options.frame ?? []).filter((f) => f.generation === a.generation);
    const genVariants = (options.variant ?? []).filter((v) => v.generation === a.generation);
    const elementOptions = elementsForGen(options.element ?? [], a.generation);
    const shownElement = pickerElement(a.generation, a.element, topLang);
    const dualOptions = (options.element ?? []).filter((o) => dualSupported(a.generation, o.slug));
    const tagOptions = (options.tag ?? []).filter((o) => !(o.slug === 'mega' && (a.generation === '1-gen' || a.generation === 'tcg-gen')));
    const subtypeOptions = subtypesForGen(subtypesFromOptions(options), a.generation);
    const typeLabel = (o: { slug: string; label: string }) => (a.generation === 'tcg-gen' ? (TCG_TYPE_LABEL[o.slug] ?? o.label) : o.label);

    // A Trainer template has no type / stage / name emblem / evolution.
    const isTrainer = genVariants.some((v) => v.slug === a.variant) && isTrainerVariant(a.generation, a.variant);
    // "Evolves from" is a Stage 1 / Stage 2 concept - a Basic evolves from nothing.
    const canEvolve = !isTrainer && (a.subtype === 'stage1' || a.subtype === 'stage2');

    // Switching template to Trainer clears the Pokemon-only axes. Hiding a control must not leave
    // a stale value behind it: the whole blob is persisted, so the card would keep rendering it.
    const changeVariant = (v: string) =>
        set(
            isTrainerVariant(a.generation, v)
                ? { variant: v, element: AUTO, dualType: AUTO, subtype: AUTO, icon: 'none', evolvesFrom: '' }
                : { variant: v },
        );

    // Switching generation drops anything the new one cannot render.
    const changeGeneration = (g: string) => {
        const next: Partial<Axes> = { generation: g, frame: 'none', variant: 'regular' };
        if (!elementSupported(g, a.element)) next.element = AUTO;
        if (!dualSupported(g, a.dualType)) next.dualType = AUTO;
        if (!subtypeSupported(g, a.subtype)) next.subtype = AUTO;
        if (!supportsChrome(g)) {
            next.badge = 'none';
            next.icon = 'none';
            next.tag = 'none';
        }
        // "EDITION 1" is Base Set art; no other generation has it.
        if (g !== '1-gen') next.firstEdition = false;
        if (!attributeFramesForGen(g).length) next.attributeFrame = 'none';
        if ((g === '1-gen' || g === 'tcg-gen') && a.tag === 'mega') next.tag = 'none';
        set(next);
    };

    return (
        <SearchCtx.Provider value={showAll ? query : ''}>
            <div className="grid grid-cols-2 gap-3">
                {/* Lab only. Fourteen controls is a lot to scan, and the answer to "where is Dual type"
                should not be "scroll". Matches field names AND the labels inside them, so a search
                for an option finds the dropdown holding it. */}
                {showAll && (
                    <div className="col-span-2 flex flex-wrap items-center gap-2">
                        <Input
                            className="flex-1 basis-48"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search settings and options - e.g. dual, fairy, holo"
                        />
                        {query && (
                            <Button type="button" variant="outline" onClick={() => setQuery('')}>
                                Clear
                            </Button>
                        )}
                        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs whitespace-nowrap">
                            <Checkbox checked={hideUnavailable} onCheckedChange={(v) => setHideUnavailable(v === true)} />
                            Hide unavailable
                        </label>
                    </div>
                )}

                <div className="col-span-2">
                    <Field label="Rarity" keywords={rarities.map((r) => `${r.label} ${r.era}`)}>
                        <Select value={rarity} onValueChange={onRarityChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {rarities.map((r) => (
                                    <SelectItem key={r.key} value={r.key}>
                                        {r.label} · {r.era}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>

                <div className="col-span-2">
                    <Field label="Generation (card frame)" keywords={kw(options.generation)}>
                        <Select value={a.generation} onValueChange={changeGeneration}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(options.generation ?? []).map((o) => (
                                    <SelectItem key={o.slug} value={o.slug}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>

                {/* Variant sits under Generation because it GATES the rest. */}
                <div className="col-span-2">
                    <Field label="Variant / template" keywords={kw(options.variant)}>
                        <Select value={a.variant} onValueChange={changeVariant}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <GenOptions all={options.variant ?? []} ok={genVariants} showAll={listAll} />
                            </SelectContent>
                        </Select>
                    </Field>
                </div>

                {!isTrainer && (
                    <Field label="Element / type" keywords={kw(options.element)}>
                        <Select value={shownElement} onValueChange={(v) => set({ element: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <GenOptions all={options.element ?? []} ok={elementOptions} showAll={listAll} label={typeLabel} />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {!isTrainer && (
                    <Field label="Dual type" keywords={kw(options.element)}>
                        <Select value={a.dualType} onValueChange={(v) => set({ dualType: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={AUTO}>None</SelectItem>
                                <GenOptions all={options.element ?? []} ok={dualOptions} showAll={listAll} label={typeLabel} />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {/* Every frame style upstream ships belongs to TCG Pocket, so on Base Set and Scarlet &
                Violet this control has nothing to offer and normally unmounts. In the lab it stays,
                greyed, rather than vanishing - "no frame styles on this generation" is itself a fact
                an admin is looking for. */}
                {(genFrames.length > 0 || listAll) && (
                    <Field label="Frame" keywords={kw(options.frame)}>
                        <Select value={a.frame} onValueChange={(v) => set({ frame: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <GenOptions all={options.frame ?? []} ok={genFrames} showAll={listAll} />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                <Field label="Glare / holo" keywords={kw(options.glare)}>
                    <Select value={a.glare} onValueChange={(v) => set({ glare: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto (from rarity)</SelectItem>
                            {(options.glare ?? []).map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                {!isTrainer && (
                    <Field label="Subtype (stage)" keywords={kw(subtypesFromOptions(options))}>
                        <Select value={a.subtype} onValueChange={(v) => set({ subtype: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={AUTO}>Auto</SelectItem>
                                <GenOptions all={subtypesFromOptions(options)} ok={subtypeOptions} showAll={listAll} />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                <Field label="Rarity mark" keywords={kw(options.rarity)}>
                    <Select value={a.rarityMark} onValueChange={(v) => set({ rarityMark: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                            <GenOptions
                                all={options.rarity ?? []}
                                ok={(options.rarity ?? []).filter((o) => !o.generation || o.generation === a.generation)}
                                showAll={listAll}
                            />
                        </SelectContent>
                    </Select>
                </Field>

                {/* Attribute frame: the border around the art window. TCG Pocket only. */}
                {(attributeFramesForGen(a.generation).length > 0 || listAll) && (
                    <Field label="Attribute frame" keywords={ATTRIBUTE_FRAMES.map(cap)}>
                        <Select value={a.attributeFrame} onValueChange={(v) => set({ attributeFrame: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <GenOptions
                                    all={ATTRIBUTE_FRAMES.map((s) => ({ slug: s, label: cap(s), generation: 'tcg-gen' }))}
                                    ok={attributeFramesForGen(a.generation).map((s) => ({ slug: s, label: cap(s) }))}
                                    showAll={listAll}
                                />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {/* Tag / badge / name icon are TCG + SV only: 1st gen has none of them upstream. In the
                lab they stay on screen greyed, so the absence is visible rather than invisible. */}
                {(supportsChrome(a.generation) || listAll) && (
                    <Field label="Tag stamp" keywords={kw(options.tag)}>
                        <Select value={a.tag} onValueChange={(v) => set({ tag: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <GenOptions all={options.tag ?? []} ok={supportsChrome(a.generation) ? tagOptions : []} showAll={listAll} />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {(supportsChrome(a.generation) || listAll) && (
                    <Field label="Set badge" keywords={kw(options.badge)}>
                        <Select value={a.badge} onValueChange={(v) => set({ badge: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <GenOptions
                                    all={options.badge ?? []}
                                    ok={supportsChrome(a.generation) ? (options.badge ?? []) : []}
                                    showAll={listAll}
                                />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {!isTrainer && (supportsChrome(a.generation) || listAll) && (
                    <Field label="Name icon" keywords={kw(options.icon)}>
                        <Select value={a.icon} onValueChange={(v) => set({ icon: v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <GenOptions
                                    all={options.icon ?? []}
                                    ok={
                                        supportsChrome(a.generation)
                                            ? (options.icon ?? []).filter((o) => !o.generation || o.generation === a.generation)
                                            : []
                                    }
                                    showAll={listAll}
                                />
                            </SelectContent>
                        </Select>
                    </Field>
                )}

                {/* One effect rather than a stack: the saved blob holds a single slug, so
                    offering several here would silently drop all but one on save. */}
                <Field label="Visual effect" keywords={kw(options.effect)}>
                    <Select value={a.effect} onValueChange={(v) => set({ effect: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(options.effect ?? []).map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                {canEvolve && (
                    <div className="col-span-2">
                        <Field label="Evolves from" keywords={['stage', 'evolution']}>
                            <Input
                                value={a.evolvesFrom}
                                onChange={(e) => set({ evolvesFrom: e.target.value })}
                                placeholder="e.g. Charmeleon (blank = none)"
                            />
                        </Field>
                    </div>
                )}

                {a.generation === '1-gen' && (
                    <div className="col-span-2">
                        <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox checked={a.firstEdition} onCheckedChange={(v) => set({ firstEdition: v === true })} />
                            <span className="text-muted-foreground text-xs">1st edition stamp</span>
                        </label>
                    </div>
                )}
            </div>
        </SearchCtx.Provider>
    );
}
