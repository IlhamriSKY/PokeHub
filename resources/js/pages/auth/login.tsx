import { Head } from '@inertiajs/react';

import AuthLayout from '@/layouts/auth-layout';

interface LoginProps {
    status?: string;
}

/**
 * GitHub is the only way in: a PokeHub card IS a GitHub profile, so an account without
 * one has nothing to show. No password form, no sign-up - the callback creates the user.
 *
 * No captcha here on purpose. GitHub's own OAuth screen is already the bot check, so a Turnstile
 * in front of it would just be a challenge guarding a challenge. Turnstile stays where the cost
 * is real: the dashboard's card regeneration, which spends a paid AI call per press.
 */
export default function Login({ status }: LoginProps) {
    return (
        <AuthLayout title="Log in to PokeHub" description="Sign in with GitHub - your card is generated from your profile">
            <Head title="Log in" />

            <div className="flex flex-col gap-6">
                <a
                    href={route('github.redirect')}
                    className="bg-foreground text-background inline-flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                    </svg>
                    Continue with GitHub
                </a>

                <p className="text-muted-foreground text-center text-xs">New here? Signing in creates your account.</p>
            </div>

            {status && <div className="mt-4 text-center text-sm font-medium text-green-600">{status}</div>}
        </AuthLayout>
    );
}
