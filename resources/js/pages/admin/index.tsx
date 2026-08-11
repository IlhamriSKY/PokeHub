import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Activity, IdCard, Images, Layers, Users } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Admin', href: '/admin' }];

type Stats = { users: number; public_cards: number; card_assets: number; cached_profiles: number; activities: number };
type ActivityRow = { id: number; description: string; log_name: string; causer: string | null; created_at: string };

export default function AdminIndex({ stats, recent_activity }: { stats: Stats; recent_activity: ActivityRow[] }) {
    const tiles = [
        { label: 'Users', value: stats.users, icon: Users, href: '/admin/users', hint: 'accounts' },
        // Public cards now deep-links to the cards screen filtered to public, rather than dumping
        // the admin on the users list and leaving them to find them.
        { label: 'Public cards', value: stats.public_cards, icon: IdCard, href: '/admin/cards?filter=public', hint: 'shared publicly' },
        { label: 'Card assets', value: stats.card_assets, icon: Images, href: '/admin/assets', hint: 'lab options' },
        { label: 'Cached profiles', value: stats.cached_profiles, icon: Layers, href: '/admin/cards', hint: 'GitHub fetches' },
        { label: 'Activity events', value: stats.activities, icon: Activity, href: '/admin/activity', hint: 'audit trail' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Admin" />
            <div className="flex flex-1 flex-col gap-6 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {tiles.map((t) => (
                        <Link
                            key={t.label}
                            href={t.href}
                            className="group focus-visible:ring-ring rounded-xl focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <Card className="group-hover:border-primary h-full transition-colors">
                                <CardContent className="p-4">
                                    <t.icon className="text-muted-foreground h-5 w-5" aria-hidden="true" />
                                    <p className="mt-3 text-2xl font-bold tabular-nums">{t.value.toLocaleString()}</p>
                                    <p className="text-sm font-medium">{t.label}</p>
                                    <p className="text-muted-foreground text-xs">{t.hint}</p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm">Recent activity</CardTitle>
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/admin/activity">View full log</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-border divide-y text-sm">
                            {recent_activity.length === 0 && <li className="text-muted-foreground py-6 text-center">No activity yet.</li>}
                            {recent_activity.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                    <span className="flex items-center gap-2">
                                        <Badge variant="secondary">{a.log_name}</Badge>
                                        {a.description}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                        {a.causer ?? 'system'} · {a.created_at}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
