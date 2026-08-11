import { CardZoom } from '@/components/card-zoom';
import { Pagination, type Paginated as SharedPaginated } from '@/components/data-table';
import { PokeCard } from '@/components/PokeCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Public cards', href: '/cards' }];

// Radix forbids an empty SelectItem value.
const ALL = 'all';

type CardData = { profile: Profile; rarity: string; axes: Partial<Axes> };

/** Same shape the landing page receives, straight from LandingController::props(). */
type ShowcaseEntry = { login: string; name: string; why: string; profile: Profile; rarity: string; axes: Partial<Axes> };
type CardRow = { name: string; slug: string; github_login: string | null; card: CardData };

/** The shared pager's shape, so this page and the admin tables cannot disagree about a page. */
type Paginated = SharedPaginated<CardRow>;

export default function Cards({ cards, q, rarity, showcase = [] }: { cards: Paginated; q: string; rarity: string; showcase?: ShowcaseEntry[] }) {
    /*
     * The showcase four, wearing the same shape as everyone else so the grid, the zoom and the
     * name link all treat them as ordinary cards. `login` is both the slug and the handle for
     * them - their public page is /<login>, the same address the landing page links to.
     *
     * Ahead of the user rows rather than mixed in: the server only sends them on page one, and
     * the user list has its own ordering that interleaving would quietly break.
     */
    const rows: CardRow[] = [
        ...showcase.map((s) => ({
            name: s.name,
            slug: s.login,
            github_login: s.login,
            card: { profile: s.profile, rarity: s.rarity, axes: s.axes },
        })),
        ...cards.data,
    ];

    const [term, setTerm] = useState(q);
    const [tier, setTier] = useState(rarity || ALL);
    const [zoom, setZoom] = useState<CardRow | null>(null);
    const closeZoom = useCallback(() => setZoom(null), []);
    const { options } = useCardOptions();
    const rarities = raritiesFromOptions(options);

    // Skip the debounce on mount, or landing on /cards immediately fires a redundant request.
    const mounted = useRef(false);

    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        const t = setTimeout(() => {
            router.get(
                '/cards',
                { ...(term ? { q: term } : {}), ...(tier !== ALL ? { rarity: tier } : {}) },
                // Partial reload: skips recomputing the shared auth/permission props. `showcase`
                // MUST be in the list even though it looks like a constant - it is filtered by the
                // same query, and leaving it out meant the first page kept the four homepage cards
                // from the initial load no matter what you typed.
                { preserveState: true, replace: true, only: ['cards', 'q', 'rarity', 'showcase'] },
            );
        }, 300);

        return () => clearTimeout(t);
    }, [term, tier]);

    const render = (row: CardRow) => {
        const rarity = rarityOf(rarities, row.card?.rarity);

        return (
            <PokeCard
                profile={{ ...row.card.profile, rarity: row.card.rarity }}
                rarity={rarity}
                {...resolveOverrides(options, row.card?.axes, rarity)}
            />
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Public cards" />

            <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[12rem] flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input
                            value={term}
                            spellCheck={false}
                            placeholder="Search by name or GitHub handle"
                            className="h-9 pl-9"
                            onChange={(e) => setTerm(e.target.value)}
                        />
                    </div>

                    <Select value={tier} onValueChange={setTier}>
                        <SelectTrigger className="h-9 w-[190px] shrink-0">
                            <SelectValue placeholder="All rarities" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All rarities</SelectItem>
                            {rarities.map((r) => (
                                <SelectItem key={r.key} value={r.key}>
                                    {r.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {cards.total + showcase.length} card{cards.total + showcase.length === 1 ? '' : 's'}
                    </span>
                </div>

                {rows.length === 0 ? (
                    <p className="text-muted-foreground py-16 text-center text-sm">
                        {q || rarity ? 'No public cards match those filters.' : 'No public cards yet.'}
                    </p>
                ) : (
                    /* auto-fill + a 200px cap: fixed column counts on a full-width page
                       stretch each card to ~400px wide, which is ~560px tall at 63:88. */
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6">
                        {rows.map((row) => (
                            <li key={row.slug} className="mx-auto flex w-full max-w-[200px] flex-col items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setZoom(row)}
                                    aria-label={`View card: ${row.name}`}
                                    className="focus-visible:ring-ring w-full cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-2 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {render(row)}
                                </button>
                                {/* Card zooms, name navigates - no hidden gesture. */}
                                <Link href={`/${row.slug}`} className="w-full truncate text-center text-xs font-medium hover:underline">
                                    {row.github_login ? `@${row.github_login}` : row.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {/* The same pager the admin tables use. This page had its own, which is how the
                    two drifted into different type sizes, different hit areas and one of them
                    rendering Laravel's raw `&laquo;` label as markup. */}
                <Pagination page={cards} only={['cards', 'q', 'rarity', 'showcase']} />
            </div>

            {zoom && (
                <CardZoom caption={zoom.name} sub={zoom.github_login ? `@${zoom.github_login}` : undefined} onClose={closeZoom}>
                    {render(zoom)}
                </CardZoom>
            )}
        </AppLayout>
    );
}
