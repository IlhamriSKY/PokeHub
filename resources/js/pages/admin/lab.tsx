import { CardGallery } from '@/components/card-gallery';
import { CardSettings } from '@/components/card-settings';
import { CardText, type CardText as CardTextValue } from '@/components/card-text';
import { CardZoom } from '@/components/card-zoom';
import { PokeCard } from '@/components/PokeCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { LayoutGrid, Loader2, Save } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Card lab', href: '/admin/lab' },
];

type CardData = { profile: Profile; rarity: string; axes: Partial<Axes> };
type Target = { key: string; label: string; sub: string; group: string };
type Editing = { key: string; label: string; sub: string; card: CardData; text: CardTextValue };

export default function AdminLab({ targets, editing }: { targets: Target[]; editing: Editing | null }) {
    const { flash } = usePage<SharedData>().props;
    const { options } = useCardOptions();
    const rarities = raritiesFromOptions(options);

    const [axes, setAxes] = useState<Partial<Axes>>(editing?.card.axes ?? {});
    const [rarity, setRarity] = useState(editing?.card.rarity ?? '');
    const [text, setText] = useState<CardTextValue | null>(editing?.text ?? null);
    const [tab, setTab] = useState<'style' | 'text'>('style');
    const [saving, setSaving] = useState(false);
    const [gallery, setGallery] = useState(false);
    const [zoomed, setZoomed] = useState(false);
    const closeZoom = useCallback(() => setZoomed(false), []);
    // Reset the draft when the target changes, so edits never carry onto another card.
    const loaded = useRef(editing?.key);

    if (loaded.current !== editing?.key) {
        loaded.current = editing?.key;
        setAxes(editing?.card.axes ?? {});
        setRarity(editing?.card.rarity ?? '');
        setText(editing?.text ?? null);
    }

    const pick = (key: string) => router.get('/admin/lab', { edit: key }, { preserveState: true, preserveScroll: true, only: ['editing'] });

    const save = () => {
        if (!editing) return;
        setSaving(true);
        router.put('/admin/lab', { key: editing.key, axes, rarity, text }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    const activeRarity = rarityOf(rarities, rarity);
    const groups = [...new Set(targets.map((t) => t.group))];

    // The preview must show the DRAFT prose, not the stored row, or editing the name looks broken.
    const preview = (e: Editing): Profile => ({
        ...e.card.profile,
        rarity,
        ...(text ? { name: text.name, ai: { ...e.card.profile.ai, ...text } } : {}),
    });

    // One place, because the card is rendered twice - inline and zoomed - and a second copy of
    // this argument list is a second thing to forget when an axis is added.
    const cardProps = (e: Editing) => ({ profile: preview(e), rarity: activeRarity, ...resolveOverrides(options, axes, activeRarity) });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Card lab" />

            <div className="flex w-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={editing?.key ?? ''} onValueChange={pick}>
                        <SelectTrigger className="w-full sm:w-[280px]">
                            <SelectValue placeholder="Pick a card to restyle" />
                        </SelectTrigger>
                        <SelectContent>
                            {groups.map((g) => (
                                <SelectGroup key={g}>
                                    <SelectLabel>{g}</SelectLabel>
                                    {targets
                                        .filter((t) => t.group === g)
                                        .map((t) => (
                                            <SelectItem key={t.key} value={t.key}>
                                                {t.label} {t.sub && <span className="text-muted-foreground">{t.sub}</span>}
                                            </SelectItem>
                                        ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>

                    {flash?.success && <span className="text-xs text-emerald-500">{flash.success}</span>}

                    {/* Default size, not `sm`: these share a toolbar row with the target Select, and
                        the scale reserves h-8 for actions inside a table row. */}
                    {editing && (
                        <Button variant="outline" className="ml-auto" onClick={() => setGallery(true)}>
                            <LayoutGrid className="mr-1.5 h-4 w-4" />
                            All variants
                        </Button>
                    )}

                    {editing && (
                        <Button onClick={save} disabled={saving}>
                            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                            Save
                        </Button>
                    )}
                </div>

                {editing ? (
                    <div className="bg-card grid gap-5 rounded-xl border p-5 sm:grid-cols-[260px_1fr]">
                        <div className="mx-auto w-full max-w-[260px] sm:sticky sm:top-4 sm:self-start">
                            {/* The preview is 260px wide, which is too small to judge a foil or a
                                rarity pip against - the same reason the dashboard card zooms. */}
                            <button
                                type="button"
                                onClick={() => setZoomed(true)}
                                aria-label="View card full size"
                                className="focus-visible:ring-ring w-full cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-1.5 focus-visible:ring-1 focus-visible:outline-none"
                            >
                                <PokeCard {...cardProps(editing)} />
                            </button>
                            <p className="text-muted-foreground mt-2 truncate text-center text-xs">
                                {editing.label} {editing.sub}
                            </p>
                        </div>
                        <div className="min-w-0">
                            {/* The same default/outline pair the card list uses for its filter tabs,
                                rather than a second hand-rolled pill strip. It was the one segmented
                                control in the app that was not a Button, which put it at 27px beside
                                36px everywhere else. */}
                            <div className="mb-4 flex gap-1">
                                {(['style', 'text'] as const).map((t) => (
                                    <Button
                                        key={t}
                                        type="button"
                                        variant={tab === t ? 'default' : 'outline'}
                                        className="capitalize"
                                        aria-pressed={tab === t}
                                        onClick={() => setTab(t)}
                                    >
                                        {t}
                                    </Button>
                                ))}
                            </div>

                            {tab === 'style' ? (
                                <CardSettings
                                    options={options}
                                    axes={axes}
                                    rarities={rarities}
                                    rarity={rarity}
                                    topLang={editing.card.profile.top_lang}
                                    onChange={setAxes}
                                    onRarityChange={setRarity}
                                    // The lab is the map of what the product can draw, so it lists
                                    // every option including the ones this generation cannot use.
                                    showAll
                                />
                            ) : (
                                text && <CardText text={text} onChange={setText} showWhy={editing.key.startsWith('showcase:')} />
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
                        Pick a card above to restyle it.
                    </p>
                )}
            </div>
            {gallery && editing && (
                <CardGallery
                    options={options}
                    profile={preview(editing)}
                    axes={axes}
                    rarity={rarity}
                    rarities={rarities}
                    onPick={(nextAxes, nextRarity) => {
                        setAxes(nextAxes);
                        setRarity(nextRarity);
                    }}
                    onClose={() => setGallery(false)}
                />
            )}
            {zoomed && editing && (
                <CardZoom caption={editing.label} sub={editing.sub} onClose={closeZoom}>
                    <PokeCard {...cardProps(editing)} />
                </CardZoom>
            )}
        </AppLayout>
    );
}
