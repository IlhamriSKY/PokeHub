import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { router } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';

export type PaginatorLink = { url: string | null; label: string; active: boolean };
export type Paginated<T> = {
    data: T[];
    links: PaginatorLink[];
    from: number | null;
    to: number | null;
    total: number;
};

/**
 * The shell every admin table shares: card frame, toolbar row, header styling, empty state and
 * footer. One copy, so the admin pages cannot drift into different table treatments.
 */
export function DataTable({
    toolbar,
    head,
    children,
    isEmpty,
    empty,
    colSpan,
    footer,
}: {
    toolbar?: ReactNode;
    head: ReactNode;
    children: ReactNode;
    isEmpty: boolean;
    empty: string;
    colSpan: number;
    footer?: ReactNode;
}) {
    return (
        <Card className="overflow-hidden">
            {toolbar && <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center">{toolbar}</CardHeader>}

            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-muted-foreground bg-muted/40 text-xs">
                            <tr className="border-border border-y [&>th]:p-3 [&>th]:text-left [&>th]:font-medium">{head}</tr>
                        </thead>
                        <tbody>
                            {isEmpty ? (
                                <tr>
                                    <td colSpan={colSpan} className="text-muted-foreground p-10 text-center">
                                        {empty}
                                    </td>
                                </tr>
                            ) : (
                                children
                            )}
                        </tbody>
                    </table>
                </div>

                {footer}
            </CardContent>
        </Card>
    );
}

/** A table row with the shared hover/border treatment. `muted` dims a disabled record. */
export function Row({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
    return <tr className={`border-border hover:bg-muted/40 border-b transition-colors last:border-0 ${muted ? 'opacity-55' : ''}`}>{children}</tr>;
}

/** A header cell that sorts client-side. Only used where the whole set is already in memory. */
export function SortableTh<K extends string>({
    k,
    sort,
    onSort,
    children,
    className = '',
}: {
    k: K;
    sort: { key: K; dir: 'asc' | 'desc' };
    onSort: (k: K) => void;
    children: ReactNode;
    className?: string;
}) {
    return (
        <th scope="col" className={className}>
            <button type="button" onClick={() => onSort(k)} className="hover:text-foreground inline-flex items-center gap-1">
                {children}
                {sort.key === k && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
        </th>
    );
}

/**
 * One pager, two sources. The server paginator's labels arrive as HTML entities
 * ("&laquo; Previous", "Next &raquo;") while the client pager has none, which is how one table
 * ended up with arrows and another without. Both go through these primitives instead, so the
 * arrows are icons and the wording is decided in exactly one place.
 */
const PREV = 'Previous';
const NEXT = 'Next';

function PageButton({
    children,
    active = false,
    disabled = false,
    label,
    onClick,
}: {
    children: ReactNode;
    active?: boolean;
    disabled?: boolean;
    label?: string;
    onClick: () => void;
}) {
    return (
        <Button
            size="sm"
            variant={active ? 'default' : 'outline'}
            className="h-8 min-w-8 gap-1 px-2.5"
            disabled={disabled}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

function PagerShell({ summary, children }: { summary: ReactNode; children: ReactNode }) {
    return (
        <nav className="flex flex-wrap items-center justify-end gap-1 border-t p-3" aria-label="Pagination">
            <span className="text-muted-foreground mr-auto text-xs tabular-nums">{summary}</span>
            {children}
        </nav>
    );
}

/** Strip Laravel's entity arrows; the icons below replace them. */
const cleanLabel = (raw: string) => raw.replace(/&laquo;|&raquo;|«|»|‹|›/g, '').trim();

export function Pagination({ page, only }: { page: Paginated<unknown>; only?: string[] }) {
    if (page.links.length <= 3) return null;

    const go = (url: string | null) => () => {
        if (url) router.get(url, {}, { preserveScroll: true, preserveState: true, ...(only ? { only } : {}) });
    };
    const last = page.links.length - 1;

    return (
        <PagerShell
            summary={
                <>
                    {page.from ?? 0}–{page.to ?? 0} of {page.total}
                </>
            }
        >
            {page.links.map((l, i) => {
                const text = cleanLabel(l.label);

                // Laravel emits a literal "..." for a gap: it is a label, not a destination.
                if (!l.url && text === '...') {
                    return <Gap key={i} />;
                }

                if (i === 0 || i === last) {
                    const prev = i === 0;

                    return (
                        <PageButton key={i} disabled={!l.url} label={prev ? PREV : NEXT} onClick={go(l.url)}>
                            {prev && <ChevronLeft className="h-3.5 w-3.5" />}
                            <span className="hidden sm:inline">{prev ? PREV : NEXT}</span>
                            {!prev && <ChevronRight className="h-3.5 w-3.5" />}
                        </PageButton>
                    );
                }

                return (
                    <PageButton key={i} active={l.active} disabled={!l.url} label={`Page ${text}`} onClick={go(l.url)}>
                        {text}
                    </PageButton>
                );
            })}
        </PagerShell>
    );
}

/** An ellipsis, rendered as a label rather than a dead button - the same shape Laravel emits. */
function Gap() {
    return <span className="text-muted-foreground px-1.5 text-xs">…</span>;
}

/**
 * The page numbers to print: first, last, and a window around the current one, with gaps between.
 * Mirrors Laravel's own paginator shape so the client-side pager is indistinguishable from it -
 * the assets table showed only Previous/Next while every other table showed numbers.
 */
function pageWindow(current: number, pages: number): (number | 'gap')[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

    const out: (number | 'gap')[] = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(pages - 1, current + 1);

    if (from > 2) out.push('gap');
    for (let n = from; n <= to; n++) out.push(n);
    if (to < pages - 1) out.push('gap');
    out.push(pages);

    return out;
}

/** Client-side pager, for tables whose rows are all already on the page. */
export function LocalPagination({ page, pages, onChange }: { page: number; pages: number; onChange: (n: number) => void }) {
    if (pages <= 1) return null;

    return (
        <PagerShell
            summary={
                <>
                    Page {page} of {pages}
                </>
            }
        >
            <PageButton disabled={page === 1} label={PREV} onClick={() => onChange(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{PREV}</span>
            </PageButton>

            {pageWindow(page, pages).map((n, i) =>
                n === 'gap' ? (
                    <Gap key={`gap-${i}`} />
                ) : (
                    <PageButton key={n} active={n === page} label={`Page ${n}`} onClick={() => onChange(n)}>
                        {n}
                    </PageButton>
                ),
            )}

            <PageButton disabled={page === pages} label={NEXT} onClick={() => onChange(page + 1)}>
                <span className="hidden sm:inline">{NEXT}</span>
                <ChevronRight className="h-3.5 w-3.5" />
            </PageButton>
        </PagerShell>
    );
}
