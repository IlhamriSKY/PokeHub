import { DataTable, Pagination, Row, type Paginated } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Radix forbids an empty SelectItem value.
const ALL = 'all';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Admin', href: '/admin' },
    { title: 'Activity log', href: '/admin/activity' },
];

type ActivityRow = { id: number; log_name: string; description: string; subject: string | null; causer: string | null; created_at: string };
export default function AdminActivity({
    activities,
    logs,
    filters,
}: {
    activities: Paginated<ActivityRow>;
    logs: string[];
    filters: { q: string; log: string };
}) {
    const [q, setQ] = useState(filters.q);
    const [log, setLog] = useState(filters.log || ALL);
    // Skip the debounce on mount, or opening the page fires a redundant request.
    const mounted = useRef(false);

    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        const t = setTimeout(() => {
            router.get(
                '/admin/activity',
                { ...(q ? { q } : {}), ...(log !== ALL ? { log } : {}) },
                // Partial reload: the shared auth/permission props are unchanged, and as closures
                // they are not recomputed server-side either.
                { preserveState: true, replace: true, only: ['activities', 'filters'] },
            );
        }, 300);

        return () => clearTimeout(t);
    }, [q, log]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Activity log - Admin" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <DataTable
                    toolbar={
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative w-full max-w-sm">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        value={q}
                                        spellCheck={false}
                                        placeholder="Search description or who did it"
                                        className="h-9 pl-9"
                                        onChange={(e) => setQ(e.target.value)}
                                    />
                                </div>

                                <Select value={log} onValueChange={setLog}>
                                    <SelectTrigger className="h-9 w-[170px]">
                                        <SelectValue placeholder="All channels" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>All channels</SelectItem>
                                        {logs.map((l) => (
                                            <SelectItem key={l} value={l}>
                                                {l}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <span className="text-muted-foreground ml-auto text-xs tabular-nums">{activities.total} events</span>
                            </div>
                        </>
                    }
                    head={
                        <>
                            <th scope="col">Log</th>
                            <th scope="col">Description</th>
                            <th scope="col">Subject</th>
                            <th scope="col">By</th>
                            <th scope="col">When</th>
                        </>
                    }
                    isEmpty={activities.data.length === 0}
                    empty={filters.q || filters.log ? 'No activity matches those filters.' : 'No activity recorded yet.'}
                    colSpan={5}
                    footer={<Pagination page={activities} only={['activities', 'filters']} />}
                >
                    {activities.data.map((a) => (
                        <Row key={a.id}>
                            <td className="p-3">
                                <Badge variant="secondary">{a.log_name}</Badge>
                            </td>
                            <td className="p-3">{a.description}</td>
                            <td className="text-muted-foreground p-3 text-xs">{a.subject ?? '—'}</td>
                            <td className="p-3">{a.causer ?? <span className="text-muted-foreground">system</span>}</td>
                            <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">{a.created_at}</td>
                        </Row>
                    ))}
                </DataTable>
            </div>
        </AppLayout>
    );
}
