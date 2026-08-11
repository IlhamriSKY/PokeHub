import { DataTable, LocalPagination, Row, SortableTh } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Check, ImageOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Card assets', href: '/admin/assets' },
];

const ALL = 'all';
const PER_PAGE = 10;

type Asset = {
    id: number;
    category: string;
    slug: string;
    label: string;
    generation: string;
    asset_url: string;
    meta: unknown;
    sort_order: number;
    enabled: boolean;
};
type Form = {
    id: number | null;
    category: string;
    slug: string;
    label: string;
    generation: string;
    asset_url: string;
    sort_order: number;
    enabled: boolean;
    meta: string;
    file: File | null;
};
type SortKey = 'category' | 'slug' | 'label' | 'generation' | 'sort_order';

const blank = (category: string): Form => ({
    id: null,
    category,
    slug: '',
    label: '',
    generation: '',
    asset_url: '',
    sort_order: 0,
    enabled: true,
    meta: '',
    file: null,
});

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            {children}
            {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
    );
}

/** Thumbnail with a real placeholder: hiding a broken image made a bad URL look like no URL. */
function Thumb({ url }: { url: string }) {
    const [broken, setBroken] = useState(false);

    if (!url || broken) {
        return (
            <div className="bg-muted text-muted-foreground/60 flex h-9 w-9 items-center justify-center rounded" title={url || 'No asset URL'}>
                <ImageOff className="h-3.5 w-3.5" />
            </div>
        );
    }

    return (
        <div className="bg-muted/50 flex h-9 w-9 items-center justify-center overflow-hidden rounded">
            <img src={url} alt="" loading="lazy" className="max-h-9 max-w-9 object-contain" onError={() => setBroken(true)} />
        </div>
    );
}

export default function AdminAssets({ categories, assets }: { categories: string[]; assets: Record<string, Asset[]> }) {
    const page = usePage<SharedData>();
    const { flash } = page.props;
    const errors = page.props.errors as Record<string, string>;

    const [form, setForm] = useState<Form>(blank(categories[0] ?? 'frame'));
    const [q, setQ] = useState('');
    const [cat, setCat] = useState(ALL);
    const [status, setStatus] = useState(ALL);
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'category', dir: 'asc' });
    const [pageNo, setPageNo] = useState(1);
    const formRef = useRef<HTMLDivElement>(null);

    const rows = useMemo(() => Object.values(assets).flat(), [assets]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const out = rows.filter(
            (a) =>
                (cat === ALL || a.category === cat) &&
                (status === ALL || (status === 'enabled') === a.enabled) &&
                (needle === '' ||
                    a.slug.toLowerCase().includes(needle) ||
                    a.label.toLowerCase().includes(needle) ||
                    a.generation.toLowerCase().includes(needle)),
        );

        return [...out].sort((x, y) => {
            const a = x[sort.key];
            const b = y[sort.key];
            const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));

            return sort.dir === 'asc' ? cmp : -cmp;
        });
    }, [rows, q, cat, status, sort]);

    // Clamp rather than reset: filtering down to fewer pages must not strand you on page 7.
    const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const current = Math.min(pageNo, pageCount);
    const shown = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

    const sortBy = (key: SortKey) => {
        setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
        setPageNo(1);
    };

    const edit = (a: Asset) => {
        setForm({
            id: a.id,
            category: a.category,
            slug: a.slug,
            label: a.label,
            generation: a.generation,
            asset_url: a.asset_url,
            sort_order: a.sort_order,
            enabled: a.enabled,
            meta: a.meta ? JSON.stringify(a.meta) : '',
            file: null,
        });
        // The form is above a long table, so editing row 80 otherwise looks like nothing happened.
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const submit = () =>
        router.post('/admin/assets', { ...form }, { forceFormData: true, preserveScroll: true, onSuccess: () => setForm(blank(form.category)) });

    const toggle = (id: number) => router.post(`/admin/assets/${id}/toggle`, {}, { preserveScroll: true });
    const del = (a: Asset) => {
        if (confirm(`Delete ${a.category}/${a.slug}? Cards already using it fall back to their default.`)) {
            router.delete(`/admin/assets/${a.id}`, { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Card assets - Admin" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                {flash?.success && (
                    <Alert>
                        <AlertDescription>{flash.success}</AlertDescription>
                    </Alert>
                )}
                {/* The server validates JSON meta, slug clashes and asset_url origin, so those
                    errors have to surface here or a rejected save looks like a no-op. */}
                {Object.keys(errors).length > 0 && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            <ul className="list-inside list-disc">
                                {Object.entries(errors).map(([k, v]) => (
                                    <li key={k}>{v}</li>
                                ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                <Card ref={formRef}>
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                        <CardTitle className="text-sm">{form.id ? `Edit asset #${form.id}` : 'Add a card option'}</CardTitle>
                        {form.id && <Badge variant="secondary">{form.category}</Badge>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                            <Field label="Category" error={errors.category}>
                                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((c) => (
                                            <SelectItem key={c} value={c} className="capitalize">
                                                {c.replace('_', ' ')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Slug *" error={errors.slug}>
                                <Input className="h-9 font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                            </Field>
                            <Field label="Label" error={errors.label}>
                                <Input
                                    className="h-9"
                                    value={form.label}
                                    placeholder="defaults to the slug"
                                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                                />
                            </Field>
                            <Field label="Generation" error={errors.generation}>
                                <Input
                                    className="h-9"
                                    value={form.generation}
                                    placeholder="blank = all"
                                    onChange={(e) => setForm({ ...form, generation: e.target.value })}
                                />
                            </Field>
                            <Field label="Sort order" error={errors.sort_order}>
                                <Input
                                    className="h-9"
                                    type="number"
                                    value={form.sort_order}
                                    onChange={(e) => setForm({ ...form, sort_order: +e.target.value })}
                                />
                            </Field>

                            <div className="sm:col-span-2 lg:col-span-3">
                                <Field label="Asset URL (or upload below)" error={errors.asset_url}>
                                    <Input
                                        className="h-9 font-mono text-xs"
                                        value={form.asset_url}
                                        placeholder="/img/uploads/frame/rainbow.webp"
                                        onChange={(e) => setForm({ ...form, asset_url: e.target.value })}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-1 lg:col-span-2">
                                {/* SVG is rejected server-side (executable document, same origin),
                                    so the picker must not advertise it either. */}
                                <Field label="Upload (webp/png/jpg/gif, max 4MB)" error={errors.file}>
                                    <Input
                                        className="h-9"
                                        type="file"
                                        accept="image/webp,image/png,image/jpeg,image/gif"
                                        onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-3 lg:col-span-5">
                                <Field label="Meta (JSON, optional)" error={errors.meta}>
                                    <Input
                                        className="h-9 font-mono text-xs"
                                        value={form.meta}
                                        placeholder='{"dr":"rare holo cosmos"}'
                                        onChange={(e) => setForm({ ...form, meta: e.target.value })}
                                    />
                                </Field>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="asset-enabled"
                                    checked={form.enabled}
                                    onCheckedChange={(v) => setForm({ ...form, enabled: v === true })}
                                />
                                <Label htmlFor="asset-enabled" className="text-sm font-normal">
                                    Enabled
                                </Label>
                            </div>
                            <Button size="sm" onClick={submit} disabled={!form.slug}>
                                {form.id ? <Check className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
                                {form.id ? 'Update asset' : 'Add asset'}
                            </Button>
                            {form.id && (
                                <Button size="sm" variant="ghost" onClick={() => setForm(blank(form.category))}>
                                    <X className="mr-1.5 h-4 w-4" />
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <DataTable
                    toolbar={
                        <>
                            <div className="relative w-full sm:max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={q}
                                    spellCheck={false}
                                    placeholder="Search slug, label or generation"
                                    className="h-9 pl-9"
                                    onChange={(e) => {
                                        setQ(e.target.value);
                                        setPageNo(1);
                                    }}
                                />
                            </div>

                            <Select
                                value={cat}
                                onValueChange={(v) => {
                                    setCat(v);
                                    setPageNo(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-[170px] capitalize">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All categories</SelectItem>
                                    {categories.map((c) => (
                                        <SelectItem key={c} value={c} className="capitalize">
                                            {c.replace('_', ' ')} ({(assets[c] ?? []).length})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={status}
                                onValueChange={(v) => {
                                    setStatus(v);
                                    setPageNo(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>Any status</SelectItem>
                                    <SelectItem value="enabled">Enabled</SelectItem>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                </SelectContent>
                            </Select>

                            <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                                {filtered.length} of {rows.length}
                            </span>
                        </>
                    }
                    head={
                        <>
                            <th scope="col" className="w-14">
                                Art
                            </th>
                            <SortableTh k="category" sort={sort} onSort={sortBy}>
                                Category
                            </SortableTh>
                            <SortableTh k="slug" sort={sort} onSort={sortBy}>
                                Slug
                            </SortableTh>
                            <SortableTh k="label" sort={sort} onSort={sortBy}>
                                Label
                            </SortableTh>
                            <SortableTh k="generation" sort={sort} onSort={sortBy}>
                                Generation
                            </SortableTh>
                            <SortableTh k="sort_order" sort={sort} onSort={sortBy} className="w-16">
                                Sort
                            </SortableTh>
                            <th scope="col" className="w-24">
                                Status
                            </th>
                            <th scope="col" className="w-40 text-right">
                                Actions
                            </th>
                        </>
                    }
                    isEmpty={shown.length === 0}
                    empty="No options match those filters."
                    colSpan={8}
                    footer={<LocalPagination page={current} pages={pageCount} onChange={setPageNo} />}
                >
                    {shown.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-muted-foreground p-10 text-center">
                                No options match those filters.
                            </td>
                        </tr>
                    )}
                    {shown.map((a) => (
                        <Row key={a.id} muted={!a.enabled}>
                            <td className="p-2 pl-3">
                                <Thumb url={a.asset_url} />
                            </td>
                            <td className="text-muted-foreground p-3 text-xs capitalize">{a.category.replace('_', ' ')}</td>
                            <td className="p-3 font-mono text-xs">{a.slug}</td>
                            <td className="p-3">{a.label}</td>
                            <td className="text-muted-foreground p-3 text-xs">{a.generation || <span className="opacity-60">all</span>}</td>
                            <td className="text-muted-foreground p-3 text-xs tabular-nums">{a.sort_order}</td>
                            <td className="p-3">
                                <Badge variant={a.enabled ? 'default' : 'secondary'} className="text-[10px]">
                                    {a.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                            </td>
                            <td className="p-2 pr-3 text-right">
                                <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="outline" className="h-8" onClick={() => edit(a)}>
                                        <Pencil className="mr-1 h-3.5 w-3.5" />
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8" onClick={() => toggle(a.id)}>
                                        {a.enabled ? 'Disable' : 'Enable'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive h-8 px-2"
                                        aria-label={`Delete ${a.category}/${a.slug}`}
                                        onClick={() => del(a)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </td>
                        </Row>
                    ))}
                </DataTable>
            </div>
        </AppLayout>
    );
}
