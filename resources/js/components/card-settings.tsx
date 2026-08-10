import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DEFAULT_AXES,
    attributeFramesForGen,
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
import { type ReactNode } from 'react';

const AUTO = 'auto';
// pokecardgenerator's TCG Pocket picker labels three types by their older TCG names.
// Slugs stay lightning/metal/darkness everywhere; only this label changes.
const TCG_TYPE_LABEL: Record<string, string> = { lightning: 'Electric', metal: 'Steel', darkness: 'Dark' };
// Upstream's DUAL TYPE list drops Dark. 1-gen ships no dark frame at all, so this only bites here.
const DUAL_DROPS_DARK = new Set(['tcg-gen', 'scarlet-violet']);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            {children}
        </div>
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
}: {
    options: CardOptions;
    axes: Partial<Axes>;
    rarities: Rarity[];
    rarity: string;
    topLang?: string;
    onChange: (next: Partial<Axes>) => void;
    onRarityChange: (next: string) => void;
}) {
    const a: Axes = { ...DEFAULT_AXES, ...axes };
    const set = (patch: Partial<Axes>) => onChange({ ...a, ...patch });

    // Frames and variants are generation-scoped exactly like pokecardgenerator: 1st gen has no
    // frame styles at all, and each generation offers its own template set.
    const genFrames = (options.frame ?? []).filter((f) => f.generation === a.generation);
    const genVariants = (options.variant ?? []).filter((v) => v.generation === a.generation);
    const elementOptions = elementsForGen(options.element ?? [], a.generation);
    const shownElement = pickerElement(a.generation, a.element, topLang);
    const dualOptions = DUAL_DROPS_DARK.has(a.generation) ? elementOptions.filter((o) => o.slug !== 'darkness') : elementOptions;
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
        if (!elementSupported(g, a.dualType)) next.dualType = AUTO;
        if (!subtypeSupported(g, a.subtype)) next.subtype = AUTO;
        if (!supportsChrome(g)) {
            next.badge = 'none';
            next.icon = 'none';
            next.tag = 'none';
        }
        // "EDITION 1" is Base Set art; no other generation has it.
        if (g !== '1-gen') next.firstEdition = false;
        if (!attributeFramesForGen(g).length) next.attributeFrame = 'none';
        if (DUAL_DROPS_DARK.has(g) && a.dualType === 'darkness') next.dualType = AUTO;
        if ((g === '1-gen' || g === 'tcg-gen') && a.tag === 'mega') next.tag = 'none';
        set(next);
    };

    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
                <Field label="Rarity">
                    <Select value={rarity} onValueChange={onRarityChange}>
                        <SelectTrigger className="h-9">
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
                <Field label="Generation (card frame)">
                    <Select value={a.generation} onValueChange={changeGeneration}>
                        <SelectTrigger className="h-9">
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
                <Field label="Variant / template">
                    <Select value={a.variant} onValueChange={changeVariant}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {genVariants.map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            {!isTrainer && (
                <Field label="Element / type">
                    <Select value={shownElement} onValueChange={(v) => set({ element: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {elementOptions.map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {typeLabel(o)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {!isTrainer && (
                <Field label="Dual type">
                    <Select value={a.dualType} onValueChange={(v) => set({ dualType: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={AUTO}>None</SelectItem>
                            {dualOptions.map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {typeLabel(o)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {genFrames.length > 0 && (
                <Field label="Frame">
                    <Select value={a.frame} onValueChange={(v) => set({ frame: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {genFrames.map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            <Field label="Glare / holo">
                <Select value={a.glare} onValueChange={(v) => set({ glare: v })}>
                    <SelectTrigger className="h-9">
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
                <Field label="Subtype (stage)">
                    <Select value={a.subtype} onValueChange={(v) => set({ subtype: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={AUTO}>Auto</SelectItem>
                            {subtypeOptions.map((s) => (
                                <SelectItem key={s.slug} value={s.slug}>
                                    {s.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            <Field label="Rarity mark">
                <Select value={a.rarityMark} onValueChange={(v) => set({ rarityMark: v })}>
                    <SelectTrigger className="h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                        {(options.rarity ?? [])
                            .filter((o) => !o.generation || o.generation === a.generation)
                            .map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </Field>

            {/* Attribute frame: the border around the art window. TCG Pocket only. */}
            {attributeFramesForGen(a.generation).length > 0 && (
                <Field label="Attribute frame">
                    <Select value={a.attributeFrame} onValueChange={(v) => set({ attributeFrame: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {attributeFramesForGen(a.generation).map((s) => (
                                <SelectItem key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {/* Tag / badge / name icon are TCG + SV only: 1st gen has none of them upstream. */}
            {supportsChrome(a.generation) && (
                <Field label="Tag stamp">
                    <Select value={a.tag} onValueChange={(v) => set({ tag: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {tagOptions.map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {supportsChrome(a.generation) && (
                <Field label="Set badge">
                    <Select value={a.badge} onValueChange={(v) => set({ badge: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(options.badge ?? []).map((o) => (
                                <SelectItem key={o.slug} value={o.slug}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {!isTrainer && supportsChrome(a.generation) && (
                <Field label="Name icon">
                    <Select value={a.icon} onValueChange={(v) => set({ icon: v })}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(options.icon ?? [])
                                .filter((o) => !o.generation || o.generation === a.generation)
                                .map((o) => (
                                    <SelectItem key={o.slug} value={o.slug}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {/* One effect, not the playground's stack of five: the saved blob holds a single slug,
                so offering five here would silently drop four on save. */}
            <Field label="Visual effect">
                <Select value={a.effect} onValueChange={(v) => set({ effect: v })}>
                    <SelectTrigger className="h-9">
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
                    <Field label="Evolves from">
                        <Input
                            className="h-9"
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
    );
}
