import { CardZoom } from '@/components/card-zoom';
import { DataTable, Pagination, Row, type Paginated } from '@/components/data-table';
import { PokeCard } from '@/components/PokeCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { EyeOff, ImageOff, Search, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Cards', href: '/admin/cards' },
];

type CardData = { profile: Profile; rarity: string; axes: Partial<Axes> };

type CardRow = {
    /** "user:12" or "profile:torvalds". Null `id` means the second kind: nobody owns it. */
    key: string;
    id: number | null;
    name: string;
    slug: string | null;
    is_public: boolean;
    avatar: string | null;
    github: string | null;
    rarity: string | null;
    followers: number | null;
    stars: number | null;
    updated_at: string | null;
    /** Null when the stored card has no profile to draw. */
    card: CardData | null;
};

/** Radix forbids an empty-string item value, so the "no filter" row needs a sentinel. */
const ALL = '__all__';

const fmt = (n: number | null) => (n === null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export default function AdminCards({
    cards,
    filters,
    rarities = [],
    totals,
}: {
    cards: Paginated<CardRow>;
    filters: { q: string; filter: string | null; rarity: string | null };
    rarities?: string[];
    totals: { all: number; public: number };
}) {
    const { flash } = usePage<SharedData>().props;
    const [q, setQ] = useState(filters?.q ?? '');
    const [zoom, setZoom] = useState<CardRow | null>(null);
    const closeZoom = useCallback(() => setZoom(null), []);
    const { options } = useCardOptions();
    // Distinct from the `rarities` prop above, which is the slug list the filter offers. These are
    // the full presets the face needs to draw a foil.
    const rarityPresets = raritiesFromOptions(options);

    /** The card as it really renders, so a moderator judges the thing itself. */
    const render = (row: CardRow) => {
        if (!row.card) return null;
        const rarity = rarityOf(rarityPresets, row.card.rarity);

        return (
            <PokeCard
                profile={{ ...row.card.profile, rarity: row.card.rarity }}
                rarity={rarity}
                {...resolveOverrides(options, row.card.axes, rarity)}
            />
        );
    };

    const go = (params: Record<string, string>) => router.get('/admin/cards', params, { preserveState: true, replace: true });

    const search = (e: React.FormEvent) => {
        e.preventDefault();
        go({ ...(q ? { q } : {}), ...(filters.filter ? { filter: filters.filter } : {}) });
    };

    const moderate = (u: CardRow, action: 'unpublish' | 'publish' | 'clear_slug') => {
        const msg =
            action === 'clear_slug'
                ? `Release the slug /${u.slug} and make this card private?`
                : action === 'unpublish'
                  ? `Take ${u.name}'s card down from /${u.slug}?`
                  : `Publish ${u.name}'s card again?`;
        if (confirm(msg)) router.put(`/admin/cards/${u.id}`, { action }, { preserveScroll: true });
    };

    /*
     * Delete, for either kind of row. The wording has to differ, because the two are not the same
     * act: a generated card is a cached lookup and can be made again by searching that handle,
     * while a user row is somebody's account and their styling goes with it.
     *
     * `confirm` rather than a dialog component, matching the users page - this is the same
     * irreversible action in the same admin panel, and one of them growing its own modal would
     * just make the pair read as two different kinds of dangerous.
     */
    const remove = (u: CardRow) => {
        const msg =
            u.id === null
                ? `Delete the generated card for @${u.github}? Its rendered images and cached avatar go too. Searching that handle again would build a new one.`
                : `Delete ${u.name}'s account? Their card and everything they styled goes with it. This cannot be undone.`;

        if (confirm(msg)) router.delete(`/admin/cards/key/${encodeURIComponent(u.key)}`, { preserveScroll: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Cards - Admin" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                {flash?.success && (
                    <Alert>
                        <AlertDescription>{flash.success}</AlertDescription>
                    </Alert>
                )}
                {flash?.error && (
                    <Alert variant="destructive">
                        <AlertDescription>{flash.error}</AlertDescription>
                    </Alert>
                )}

                <DataTable
                    toolbar={
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <form onSubmit={search} className="flex flex-1 items-center gap-2">
                                    <div className="relative flex-1 sm:max-w-xs">
                                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <Input
                                            className="pl-9"
                                            placeholder="Search name, slug or GitHub handle"
                                            value={q}
                                            onChange={(e) => setQ(e.target.value)}
                                        />
                                    </div>
                                    <Button type="submit" variant="secondary">
                                        Search
                                    </Button>
                                </form>
                                <div className="flex gap-1">
                                    {[
                                        { key: null, label: `All ${totals.all}` },
                                        { key: 'public', label: `Public ${totals.public}` },
                                        { key: 'private', label: 'Private' },
                                    ].map((t) => (
                                        <Button
                                            key={t.label}
                                            variant={(filters.filter ?? null) === t.key ? 'default' : 'outline'}
                                            onClick={() =>
                                                go({
                                                    ...(q ? { q } : {}),
                                                    ...(t.key ? { filter: t.key } : {}),
                                                    ...(filters.rarity ? { rarity: filters.rarity } : {}),
                                                })
                                            }
                                        >
                                            {t.label}
                                        </Button>
                                    ))}
                                    {/* Same vocabulary the public gallery filters on. */}
                                    {/* The shared Select, so this filter searches like every
                                        other dropdown; a bare <select> could not. */}
                                    <Select
                                        value={filters.rarity || ALL}
                                        onValueChange={(v) =>
                                            go({
                                                ...(q ? { q } : {}),
                                                ...(filters.filter ? { filter: filters.filter } : {}),
                                                ...(v !== ALL ? { rarity: v } : {}),
                                            })
                                        }
                                    >
                                        <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filter by rarity">
                                            <SelectValue placeholder="All rarities" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ALL}>All rarities</SelectItem>
                                            {rarities.map((r) => (
                                                <SelectItem key={r} value={r}>
                                                    {r}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </>
                    }
                    head={
                        <>
                            <th scope="col">Card</th>
                            <th scope="col">Owner</th>
                            <th scope="col">GitHub</th>
                            <th scope="col">Rarity</th>
                            <th scope="col">Stats</th>
                            <th scope="col">Share</th>
                            <th scope="col">Updated</th>
                            <th scope="col" className="text-right">
                                <span className="sr-only">Actions</span>
                            </th>
                        </>
                    }
                    isEmpty={cards.data.length === 0}
                    empty="No cards match this view."
                    colSpan={8}
                    footer={<Pagination page={cards} />}
                >
                    {cards.data.map((c) => (
                        <Row key={c.key}>
                            {/* The real card, not the public image route: that one 404s on exactly
                                the private cards this page exists to moderate. */}
                            <td className="p-3">
                                {c.card ? (
                                    <button
                                        type="button"
                                        onClick={() => setZoom(c)}
                                        aria-label={`View ${c.name}'s card full size`}
                                        className="focus-visible:ring-ring block w-14 cursor-zoom-in rounded-md transition-transform duration-200 hover:scale-105 focus-visible:ring-1 focus-visible:outline-none"
                                    >
                                        {render(c)}
                                    </button>
                                ) : (
                                    <span
                                        title="This card has no profile data to draw"
                                        className="bg-muted text-muted-foreground flex h-[76px] w-14 items-center justify-center rounded-md"
                                    >
                                        <ImageOff className="h-4 w-4" />
                                    </span>
                                )}
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-2">
                                    {c.avatar && <img src={c.avatar} alt="" className="h-7 w-7 rounded-full" loading="lazy" />}
                                    <span className="font-medium">{c.name}</span>
                                </div>
                            </td>
                            <td className="p-3">
                                {c.github ? (
                                    <a
                                        className="text-primary hover:underline"
                                        href={`https://github.com/${c.github}`}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                    >
                                        @{c.github}
                                    </a>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </td>
                            <td className="p-3">
                                {c.rarity ? <Badge variant="secondary">{c.rarity}</Badge> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">
                                {fmt(c.followers)} followers · {fmt(c.stars)} stars
                            </td>
                            <td className="p-3">
                                {c.is_public && c.slug ? (
                                    <a className="text-primary hover:underline" href={`/${c.slug}`} target="_blank" rel="noreferrer">
                                        /{c.slug}
                                    </a>
                                ) : (
                                    <Badge variant="outline">private</Badge>
                                )}
                            </td>
                            <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">{c.updated_at}</td>
                            <td className="p-2 pr-3">
                                <div className="flex justify-end gap-1">
                                    <Button asChild size="sm" variant="ghost">
                                        <Link href={`/admin/lab?edit=${encodeURIComponent(c.key)}`}>
                                            <Wand2 className="mr-1 h-3.5 w-3.5" />
                                            Card lab
                                        </Link>
                                    </Button>
                                    {/* Moderation acts on a user row. A generated card has none: it is
                                        public because it is unclaimed, and there is no slug to release. */}
                                    {c.id === null ? null : c.is_public && c.slug ? (
                                        <Button size="sm" variant="outline" onClick={() => moderate(c, 'unpublish')}>
                                            <EyeOff className="mr-1 h-3.5 w-3.5" />
                                            Unpublish
                                        </Button>
                                    ) : (
                                        <Button size="sm" variant="ghost" disabled={!c.slug} onClick={() => moderate(c, 'publish')}>
                                            Publish
                                        </Button>
                                    )}
                                    {c.id !== null && c.slug && (
                                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => moderate(c, 'clear_slug')}>
                                            Release slug
                                        </Button>
                                    )}
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c)}>
                                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                                        Delete
                                    </Button>
                                </div>
                            </td>
                        </Row>
                    ))}
                </DataTable>
            </div>

            {zoom && (
                <CardZoom
                    caption={zoom.name}
                    sub={zoom.github ? `@${zoom.github}` : undefined}
                    onClose={closeZoom}
                    actions={
                        zoom.is_public && zoom.slug ? (
                            <Button asChild size="sm" variant="secondary">
                                <a href={`/${zoom.slug}`} target="_blank" rel="noreferrer">
                                    {`Open /${zoom.slug}`}
                                </a>
                            </Button>
                        ) : (
                            <Badge variant="outline">private</Badge>
                        )
                    }
                >
                    {render(zoom)}
                </CardZoom>
            )}
        </AppLayout>
    );
}
