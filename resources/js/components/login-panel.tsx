import LinePokeball from '@/components/line-pokeball';
import { router } from '@inertiajs/react';
import { useCallback, useEffect } from 'react';

/**
 * The sign-in panel that floats over the landing page.
 *
 * Not a route change in the usual sense: /login renders the landing component with `showLogin`
 * set, so opening and closing this is a visit between / and /login with the page behind it left
 * in place. Both visits use preserveScroll + preserveState, which is what keeps the landing from
 * jumping back to the top and re-running the showcase render underneath.
 *
 * Deliberately not the shadcn Dialog: that portals to document.body, and the whole point here is
 * that the landing stays visibly behind a blur rather than being replaced. The focus and Escape
 * behaviour a dialog would have given us is wired by hand below.
 */
export default function LoginPanel({ status }: { status?: string }) {
    const close = useCallback(() => {
        router.visit('/', { preserveScroll: true, preserveState: true });
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKey);
        // The landing behind is still a scrollable page; letting it scroll under an open panel
        // reads as a bug on a trackpad.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [close]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Log in to PokeHub">
            {/* The landing stays readable through this rather than being covered by a flat sheet -
                that visible continuity is the entire reason the panel exists instead of a page. */}
            <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="animate-in fade-in absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm duration-200 dark:bg-black/60"
            />

            <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-2 bg-card relative w-full max-w-sm rounded-2xl border p-8 shadow-2xl duration-200">
                <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-md p-1.5 text-sm transition-colors"
                >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                </button>

                <div className="flex flex-col items-center gap-4">
                    <div className="text-foreground flex h-9 w-9 items-center justify-center">
                        <LinePokeball decorative={false} size="size-9" strokeWidth={4} tilt="12deg" />
                    </div>
                    <div className="space-y-2 text-center">
                        <h1 className="text-xl font-medium">Log in to PokeHub</h1>
                        <p className="text-muted-foreground text-sm">Sign in with GitHub - your card is generated from your profile</p>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-6">
                    {/* A plain anchor, not an Inertia Link: this leaves the SPA for github.com, and
                        an XHR visit cannot follow a cross-origin redirect. */}
                    <a
                        href={route('github.redirect')}
                        className="bg-foreground text-background inline-flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                        </svg>
                        Continue with GitHub
                    </a>

                    <p className="text-muted-foreground text-center text-xs">
                        New here? Signing in creates your account. We never ask for repository access.
                    </p>

                    {status && <div className="text-center text-sm font-medium text-green-600">{status}</div>}
                </div>
            </div>
        </div>
    );
}
