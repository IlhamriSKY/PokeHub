import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Activity, IdCard, Images, Search, ShieldCheck, Users, Wand2 } from 'lucide-react';
import AppLogo from './app-logo';

export function AppSidebar() {
    const { props, url } = usePage<SharedData>();
    const auth = props.auth;

    // Read off the URL, not the session: no second source of truth to drift.
    const adminMode = auth?.is_admin && url.startsWith('/admin');

    const mainNavItems: NavItem[] = adminMode
        ? [
              { title: 'Admin', url: '/admin', icon: ShieldCheck },
              { title: 'Users', url: '/admin/users', icon: Users },
              { title: 'Cards', url: '/admin/cards', icon: IdCard },
              { title: 'Card lab', url: '/admin/lab', icon: Wand2 },
              { title: 'Card assets', url: '/admin/assets', icon: Images },
              { title: 'Activity log', url: '/admin/activity', icon: Activity },
          ]
        : [
              { title: 'My card', url: '/dashboard', icon: IdCard },
              { title: 'Public cards', url: '/cards', icon: Search },
          ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                {auth?.is_admin && (
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip={adminMode ? 'Back to user view' : 'Switch to admin'}>
                                <Link href={adminMode ? '/dashboard' : '/admin'}>
                                    {adminMode ? <IdCard /> : <ShieldCheck />}
                                    <span>{adminMode ? 'Back to user view' : 'Switch to admin'}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                )}
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
