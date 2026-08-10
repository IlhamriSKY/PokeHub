import { DataTable, Pagination, type Paginated } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Users', href: '/admin/users' },
];

type Row = {
    id: number;
    name: string;
    email: string;
    slug: string | null;
    is_public: boolean;
    avatar: string | null;
    roles: string[];
    has_card: boolean;
    created_at: string | null;
};

/** Laravel paginator, as Inertia serialises it. */
export default function AdminUsers({ users, roles, filters }: { users: Paginated<Row>; roles: string[]; filters: { q: string } }) {
    const { flash } = usePage<SharedData>().props;
    const [editing, setEditing] = useState<number | null>(null);
    const [form, setForm] = useState<Row | null>(null);
    const [q, setQ] = useState(filters?.q ?? '');

    const startEdit = (u: Row) => {
        setEditing(u.id);
        setForm({ ...u });
    };
    const cancel = () => {
        setEditing(null);
        setForm(null);
    };

    const save = () => {
        if (!form) return;
        router.put(
            `/admin/users/${form.id}`,
            { name: form.name, email: form.email, slug: form.slug || null, is_public: form.is_public, roles: form.roles },
            { preserveScroll: true, onSuccess: cancel },
        );
    };

    const del = (id: number) => {
        if (confirm('Delete this user? This cannot be undone.')) router.delete(`/admin/users/${id}`, { preserveScroll: true });
    };

    const toggleRole = (r: string) =>
        setForm((f) => (f ? { ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] } : f));

    const search = (e: React.FormEvent) => {
        e.preventDefault();
        router.get('/admin/users', q ? { q } : {}, { preserveState: true, replace: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users - Admin" />
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
                            <form onSubmit={search} className="flex items-center gap-2">
                                <div className="relative flex-1 sm:max-w-xs">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        className="pl-9"
                                        placeholder="Search name, e-mail or slug"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" variant="secondary">
                                    Search
                                </Button>
                                <span className="text-muted-foreground ml-auto text-sm">
                                    {users.total} user{users.total === 1 ? '' : 's'}
                                </span>
                            </form>
                        </>
                    }
                    head={
                        <>
                            <th scope="col">User</th>
                            <th scope="col">Slug</th>
                            <th scope="col">Roles</th>
                            <th scope="col">Public</th>
                            <th scope="col">Card</th>
                            <th scope="col" className="text-right">
                                <span className="sr-only">Actions</span>
                            </th>
                        </>
                    }
                    isEmpty={users.data.length === 0}
                    empty={filters?.q ? `No users match “${filters.q}”.` : 'No users yet.'}
                    colSpan={6}
                    footer={<Pagination page={users} />}
                >
                    {users.data.map((u) =>
                        editing === u.id && form ? (
                            <tr key={u.id} className="border-border bg-muted/30 border-b align-top">
                                <td className="space-y-1.5 p-3">
                                    <Label className="sr-only" htmlFor={`name-${u.id}`}>
                                        Name
                                    </Label>
                                    <Input id={`name-${u.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                    <Label className="sr-only" htmlFor={`email-${u.id}`}>
                                        E-mail
                                    </Label>
                                    <Input
                                        id={`email-${u.id}`}
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    />
                                </td>
                                <td className="p-3">
                                    <Label className="sr-only" htmlFor={`slug-${u.id}`}>
                                        Public slug
                                    </Label>
                                    <Input
                                        id={`slug-${u.id}`}
                                        value={form.slug ?? ''}
                                        onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                                    />
                                </td>
                                <td className="p-3">
                                    <div className="flex flex-col gap-2">
                                        {roles.map((r) => (
                                            <div key={r} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`role-${u.id}-${r}`}
                                                    checked={form.roles.includes(r)}
                                                    onCheckedChange={() => toggleRole(r)}
                                                />
                                                <Label htmlFor={`role-${u.id}-${r}`} className="text-xs font-normal">
                                                    {r}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-3">
                                    <Checkbox
                                        aria-label="Card is public"
                                        checked={form.is_public}
                                        onCheckedChange={(v) => setForm({ ...form, is_public: v === true })}
                                    />
                                </td>
                                <td className="text-muted-foreground p-3">{u.has_card ? 'yes' : '—'}</td>
                                <td className="p-3">
                                    <div className="flex gap-1.5">
                                        <Button size="sm" onClick={save}>
                                            Save
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={cancel}>
                                            Cancel
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            <tr key={u.id} className="border-border hover:bg-muted/40 border-b">
                                <td className="p-3">
                                    <div className="font-medium">{u.name}</div>
                                    <div className="text-muted-foreground text-xs">{u.email}</div>
                                </td>
                                <td className="p-3">
                                    {u.slug ? (
                                        <a className="text-primary hover:underline" href={`/${u.slug}`} target="_blank" rel="noreferrer">
                                            /{u.slug}
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <div className="flex flex-wrap gap-1">
                                        {u.roles.map((r) => (
                                            <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'}>
                                                {r}
                                            </Badge>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-3">
                                    <Badge variant={u.is_public ? 'secondary' : 'outline'}>{u.is_public ? 'public' : 'private'}</Badge>
                                </td>
                                <td className="text-muted-foreground p-3">{u.has_card ? 'yes' : '—'}</td>
                                <td className="p-3">
                                    <div className="flex justify-end gap-1.5">
                                        <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                                            Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(u.id)}>
                                            Delete
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ),
                    )}
                </DataTable>
            </div>
        </AppLayout>
    );
}
