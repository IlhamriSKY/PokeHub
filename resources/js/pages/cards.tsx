import { CardZoom } from '@/components/card-zoom';
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

type Paginated = {
    data: CardRow[];
    links: { url: string | null; label: string; active: boolean }[];
    total: number;
};

/** One landing-page showcase card, resolved the way every other surface resolves one. */
function ShowcaseTile({ entry }: { entry: ShowcaseEntry }) {
    const { options } = useCardOptions();
    const rarity = rarityOf(raritiesFromOptions(options), entry.rarity);

    return <PokeCard profile={entry.profile} rarity={rarity} {...resolveOverrides(options, entry.axes, rarity)} />;
}

export default function Cards({ cards, q, rarity, showcase = [] }: { cards: Paginated; q: string; rarity: string; showcase?: ShowcaseEntry[] }) {
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
                // Partial reload: skips recomputing the shared auth/permission props.
                { preserveState: true, replace: true, only: ['cards', 'q', 'rarity'] },
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
                {/* The same four the landing page opens with. They are the only cards on a young
                    site with recognisable names, so they give the gallery something to be before
                    it has enough real members to fill a page. Hidden as soon as a filter is on. */}
                {showcase.length > 0 && (
                    <section>
                        <h2 className="text-sm font-semibold">Four developers you already know</h2>
                        <p className="text-muted-foreground mt-0.5 text-xs">Real profiles, real numbers, made the same way yours was.</p>
                        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
                            {showcase.map((s) => (
                                <li key={s.login} className="flex flex-col items-center gap-1.5">
                                    <Link
                                        href={`/${s.login}`}
                                        className="focus-visible:ring-ring w-full rounded-lg transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:outline-none"
                                        aria-label={`${s.name} card`}
                                    >
                                        <ShowcaseTile entry={s} />
                                    </Link>
                                    <span className="w-full truncate text-center text-xs font-medium">{s.name}</span>
                                    <span className="text-muted-foreground w-full truncate text-center text-[11px]">@{s.login}</span>
                                </li>
                            ))}
                        </ul>
                        <div aria-hidden="true" className="bg-border mt-6 h-px w-full" />
                    </section>
                )}

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
                        {cards.total} card{cards.total === 1 ? '' : 's'}
                    </span>
                </div>

                {cards.data.length === 0 ? (
                    <p className="text-muted-foreground py-16 text-center text-sm">
                        {q || rarity ? 'No public cards match those filters.' : 'No public cards yet.'}
                    </p>
                ) : (
                    /* auto-fill + a 200px cap: fixed column counts on a full-width page
                       stretch each card to ~400px wide, which is ~560px tall at 63:88. */
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6">
                        {cards.data.map((row) => (
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

                {cards.links.length > 3 && (
                    <div className="mt-1 flex flex-wrap justify-center gap-1 border-t pt-4">
                        {cards.links.map((l, i) =>
                            l.url ? (
                                <Link
                                    key={i}
                                    href={l.url}
                                    preserveState
                                    className={`rounded-md px-2.5 py-1 text-xs ${l.active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                                    dangerouslySetInnerHTML={{ __html: l.label }}
                                />
                            ) : (
                                <span key={i} className="text-muted-foreground px-2.5 py-1 text-xs" dangerouslySetInnerHTML={{ __html: l.label }} />
                            ),
                        )}
                    </div>
                )}
            </div>

            {zoom && (
                <CardZoom caption={zoom.name} sub={zoom.github_login ? `@${zoom.github_login}` : undefined} onClose={closeZoom}>
                    {render(zoom)}
                </CardZoom>
            )}
        </AppLayout>
    );
}
