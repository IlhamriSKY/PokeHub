import GridBackdrop from '@/components/grid-backdrop';
import LinePokeball from '@/components/line-pokeball';
import { Link } from '@inertiajs/react';

interface AuthLayoutProps {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="bg-background relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-6 md:p-10">
            {/* Same hairline grid as the landing hero, fading out downward from the top edge.
                `isolate` matters: it pins the -z-10 backdrop inside this container's stacking
                context, so it paints over `bg-background` instead of disappearing behind the page. */}
            <GridBackdrop />
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-4">
                        <Link href={route('home')} className="flex flex-col items-center gap-2 font-medium">
                            {/* Same ball, same draw-then-wobble, as the closing CTA on the landing
                                page. `decorative={false}` keeps it in flow and clickable, since a
                                Link wraps it here rather than it sitting behind a panel.
                                strokeWidth 4 matches the weight the static logo had - the landing
                                page's 0.8 hairline is tuned for a 160px ball and disappears at 36px. */}
                            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground)] dark:text-white">
                                <LinePokeball decorative={false} size="size-9" strokeWidth={4} tilt="12deg" />
                            </div>
                            <span className="sr-only">{title}</span>
                        </Link>

                        <div className="space-y-2 text-center">
                            <h1 className="text-xl font-medium">{title}</h1>
                            <p className="text-muted-foreground text-center text-sm">{description}</p>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
