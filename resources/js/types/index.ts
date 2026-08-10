import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User;
    roles?: string[];
    permissions?: string[];
    is_admin?: boolean;
    has_password?: boolean;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    turnstile?: { enabled: boolean; site_key: string | null };
    flash?: { status?: string | null; success?: string | null; error?: string | null };
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
