import { DataTable, Pagination, Row, type Paginated } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { EyeOff, Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Cards', href: '/admin/cards' },
];

type CardRow = {
    id: number;
    name: string;
    slug: string | null;
    is_public: boolean;
    avatar: string | null;
    github: string | null;
    rarity: string | null;
    followers: number | null;
    stars: number | null;
    updated_at: string | null;
};

const fmt = (n: number | null) => (n === null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export default function AdminCards({
    cards,
    filters,
    totals,
}: {
    cards: Paginated<CardRow>;
    filters: { q: string; filter: string | null };
    totals: { all: number; public: number };
}) {
    const { flash } = usePage<SharedData>().props;
    const [q, setQ] = useState(filters?.q ?? '');

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
                                            size="sm"
                                            variant={(filters.filter ?? null) === t.key ? 'default' : 'outline'}
                                            onClick={() => go({ ...(q ? { q } : {}), ...(t.key ? { filter: t.key } : {}) })}
                                        >
                                            {t.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </>
                    }
                    head={
                        <>
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
                    colSpan={7}
                    footer={<Pagination page={cards} />}
                >
                    {cards.data.map((c) => (
                        <Row key={c.id}>
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
                                    {c.is_public && c.slug ? (
                                        <Button size="sm" variant="outline" className="h-8" onClick={() => moderate(c, 'unpublish')}>
                                            <EyeOff className="mr-1 h-3.5 w-3.5" />
                                            Unpublish
                                        </Button>
                                    ) : (
                                        <Button size="sm" variant="ghost" className="h-8" disabled={!c.slug} onClick={() => moderate(c, 'publish')}>
                                            Publish
                                        </Button>
                                    )}
                                    {c.slug && (
                                        <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={() => moderate(c, 'clear_slug')}>
                                            Release slug
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </Row>
                    ))}
                </DataTable>
            </div>
        </AppLayout>
    );
}
