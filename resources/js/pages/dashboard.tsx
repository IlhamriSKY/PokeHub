import { rollAxes } from '@/components/card-gallery';
import { CardZoom } from '@/components/card-zoom';
import { PokeCard } from '@/components/PokeCard';
import { Turnstile } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { langColor, raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My card', href: '/dashboard' }];

type CardData = { profile: Profile; rarity: string; axes: Partial<Axes> };
/** `used` keeps counting past `limit` for an admin - see RegenQuota::unlimited(). */
type Quota = { limit: number; used: number; resets_in: number; unlimited: boolean };
type PageProps = SharedData & {
    profile: {
        slug: string | null;
        is_public: boolean;
        card: CardData | null;
        github_login: string | null;
        public_url: string | null;
    };
    quota: Quota;
};

export default function Dashboard() {
    const page = usePage<PageProps>();
    const { profile, quota, flash } = page.props;
    const spent = !quota.unlimited && quota.used >= quota.limit;
    const { options } = useCardOptions();
    const errors = page.props.errors as Record<string, string>;

    const [busy, setBusy] = useState(false);
    const [captcha, setCaptcha] = useState('');
    // Which button was last pressed, not a bare boolean: the link and the README snippet share
    // the copied tick, and a boolean would flash both.
    const [copied, setCopied] = useState('');
    const [zoomed, setZoomed] = useState(false);
    const closeZoom = useCallback(() => setZoomed(false), []);
    // One shot per page load, so a failed generation cannot loop on captcha refreshes.
    const autoFired = useRef(false);

    const regenerate = () => {
        setBusy(true);
        router.post(
            '/dashboard/card/regenerate',
            // A whole fresh card each press - type, stage, frame, chrome, foil - rolled locally
            // from the same tiles the lab offers. See rollAxes; the AI only writes the text.
            { 'cf-turnstile-response': captcha, axes: rollAxes(options, card?.axes ?? {}, activeRarity, rarities, card?.profile) },
            {
                preserveScroll: true,
                onFinish: () => {
                    setBusy(false);
                    // Tokens are single-use, so the widget must be reset for the next press.
                    window.turnstile?.reset();
                    setCaptcha('');
                },
            },
        );
    };

    // Generate as soon as the captcha clears, so a new account never sees an empty dashboard.
    useEffect(() => {
        if (profile.card || autoFired.current || !profile.github_login || busy || spent) return;
        if (turnstileRequired(page.props) && !captcha) return;
        autoFired.current = true;
        regenerate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captcha, profile.card, profile.github_login]);

    const card = profile.card;
    const rarities = raritiesFromOptions(options);
    const activeRarity = rarityOf(rarities, card?.rarity ?? '');
    const overrides = useMemo(() => resolveOverrides(options, card?.axes, activeRarity), [options, card?.axes, activeRarity]);

    const accent = langColor(card?.profile.top_lang);

    const toggleVisibility = () => {
        router.put('/dashboard/card/visibility', { is_public: !profile.is_public }, { preserveScroll: true });
    };

    // Held in a const so the narrowing survives into the copy callbacks below.
    const publicUrl = profile.public_url;

    const copy = (key: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(''), 1500);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My card" />

            <div className="flex w-full flex-col p-4">
                {/* The card's energy colour lives on the panel border. A rarity badge next to the
                    handle said nothing the card was not already saying with its own symbol and foil. */}
                <div
                    className="bg-card overflow-hidden rounded-2xl border shadow-sm"
                    style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}
                >
                    <div className="grid gap-5 p-5 sm:grid-cols-[240px_1fr]">
                        <div className="mx-auto w-full max-w-[240px]">
                            {card ? (
                                <button
                                    type="button"
                                    onClick={() => setZoomed(true)}
                                    aria-label="View card full size"
                                    className="focus-visible:ring-ring w-full cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-1.5 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    <PokeCard profile={{ ...card.profile, rarity: card.rarity }} rarity={activeRarity} {...overrides} />
                                </button>
                            ) : profile.github_login ? (
                                <CardSkeleton />
                            ) : (
                                <div className="text-muted-foreground flex aspect-[63/88] items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs">
                                    Sign in with GitHub to generate your card.
                                </div>
                            )}
                        </div>

                        <div className="flex min-w-0 flex-col gap-4">
                            <h1 className="min-w-0 truncate text-base font-semibold">
                                {profile.github_login ? `@${profile.github_login}` : 'No GitHub handle'}
                            </h1>

                            {flash?.success && (
                                <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-500">
                                    {flash.success}
                                </p>
                            )}
                            {errors.card && (
                                <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-1.5 text-xs">
                                    {errors.card}
                                </p>
                            )}

                            {/* Visibility */}
                            <div className="rounded-lg border p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{profile.is_public ? 'Public' : 'Private'}</p>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {profile.is_public ? 'Anyone with the link can see it.' : 'Only you can see it.'}
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" className="shrink-0" onClick={toggleVisibility}>
                                        {profile.is_public ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
                                        {profile.is_public ? 'Make private' : 'Make public'}
                                    </Button>
                                </div>

                                {/* Shown while private too: the snippet is yours to keep either way, and a
                                    disabled button just makes people toggle public to find out what it says.
                                    Both URLs 404 until the card is public, so the sub-line says so rather
                                    than letting a dead embed land in someone's README unannounced. */}
                                {publicUrl && (
                                    <>
                                        <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
                                            <a
                                                className="text-primary min-w-0 flex-1 truncate text-xs hover:underline"
                                                href={publicUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {publicUrl}
                                            </a>
                                            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => copy('url', publicUrl)}>
                                                {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>

                                        {/* Copies the Markdown, not the URL: pasting a bare link into a README shows a
                                            link, not the card. Wrapped in an anchor so the image is clickable there. */}
                                        <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
                                            <div className="min-w-0 flex-1">
                                                {/* Named after the repo it belongs in, not the file: GitHub shows a
                                                    profile README from `github.com/<you>/<you>`, so the handle is what
                                                    tells you where the snippet goes. */}
                                                <p className="truncate text-xs font-medium">{profile.github_login ?? 'your profile'}.md</p>
                                                <p className="text-muted-foreground truncate text-[11px]">
                                                    {profile.is_public ? 'Markdown for your GitHub profile' : 'Renders once your card is public'}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 shrink-0 px-2 text-xs"
                                                onClick={() => {
                                                    copy('svg', `[![PokeHub card](${publicUrl}.svg)](${publicUrl})`);
                                                    // Warm the capture. It is taken on the first request (3-5s), and
                                                    // GitHub's camo proxy gives up well before a cold one finishes, so
                                                    // an unwarmed URL renders as a broken image the first time. Nothing
                                                    // to warm while private: the route 404s until then.
                                                    if (profile.is_public) void fetch(`${publicUrl}.svg`).catch(() => {});
                                                }}
                                            >
                                                {copied === 'svg' ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                                                SVG
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <QuotaMeter quota={quota} />

                            {/* h-auto + whitespace-normal so a long wait line is not clipped. */}
                            <Button
                                onClick={regenerate}
                                disabled={busy || !profile.github_login || spent}
                                className="h-auto min-h-10 w-full overflow-hidden py-2 text-sm leading-snug whitespace-nowrap"
                            >
                                {busy ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                        <WaitLine />
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4 shrink-0" />
                                        Regenerate
                                    </>
                                )}
                            </Button>

                            <Turnstile onVerify={setCaptcha} />
                        </div>
                    </div>
                </div>
            </div>

            {zoomed && card && (
                <CardZoom caption={profile.github_login ? `@${profile.github_login}` : undefined} onClose={closeZoom}>
                    <PokeCard profile={{ ...card.profile, rarity: card.rarity }} rarity={activeRarity} {...overrides} />
                </CardZoom>
            )}
        </AppLayout>
    );
}

function turnstileRequired(props: SharedData): boolean {
    return !!props.turnstile?.enabled && !!props.turnstile?.site_key;
}

const hhmmss = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');

/**
 * Ticks the server's `resets_in` down locally, and pulls a fresh count when it lands on zero -
 * without that the window has cleared server-side while the page still shows 5/5 and a disabled
 * button, which reads as the reset having failed.
 */
function useCountdown(seconds: number): number {
    const [left, setLeft] = useState(seconds);

    useEffect(() => setLeft(seconds), [seconds]);

    useEffect(() => {
        if (left <= 0) return;
        const t = setTimeout(() => setLeft(left - 1), 1000);

        return () => clearTimeout(t);
    }, [left]);

    useEffect(() => {
        if (seconds > 0 && left === 0) router.reload({ only: ['quota'] });
    }, [left, seconds]);

    return left;
}

/**
 * Every press is a paid AI completion, so the cap is worth showing rather than discovering at the
 * fifth press. An admin sees the same meter and the same countdown - they are counted like anyone
 * else, they are just not blocked, which is what the badge says.
 */
function QuotaMeter({ quota }: { quota: Quota }) {
    const left = useCountdown(quota.resets_in);
    const spent = !quota.unlimited && quota.used >= quota.limit;
    const pct = Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100);

    return (
        <div className="mt-auto rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                    Daily generations
                    {quota.unlimited && (
                        <span className="text-muted-foreground ml-1.5 rounded border px-1 py-0.5 align-middle text-[10px] font-normal">admin</span>
                    )}
                </p>
                <p className={`text-sm tabular-nums ${spent ? 'text-destructive' : ''}`}>
                    <span className="font-semibold">{quota.used}</span>
                    <span className="text-muted-foreground"> / {quota.limit}</span>
                </p>
            </div>

            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                <div className={`h-full rounded-full ${spent ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>

            <p className="text-muted-foreground mt-2 text-[11px]">
                {quota.unlimited && 'Not blocked at the cap. '}
                {left > 0 ? (
                    <>
                        Resets in <span className="tabular-nums">{hhmmss(left)}</span>
                    </>
                ) : (
                    'The 24h window starts on your next generation.'
                )}
            </p>
        </div>
    );
}

// The self-hosted model can take two minutes; a bare spinner that long reads as broken.
const WAIT_LINES = [
    'Waking the AI…',
    'Evolving… do not press B.',
    'It used Splash. Nothing.',
    'Asking Professor Oak.',
    'Stuck behind a Slowpoke.',
    'Reading your Pokedex.',
    'Charging a two-turn move.',
    'Nurse Joy says: one sec.',
    'Rare Candy used. Level 5.',
    'Grinding Route 1.',
    'Team Rocket took a GPU.',
    'The AI fainted. Reviving.',
    'Surfing the queue.',
    'The ball wobbled once…',
];

function WaitLine() {
    const [i, setI] = useState(0);
    const [typed, setTyped] = useState(0);
    const line = WAIT_LINES[i % WAIT_LINES.length];

    useEffect(() => {
        // Randomised here, not during render, so SSR hydration still matches.
        setI(Math.floor(Math.random() * WAIT_LINES.length));
    }, []);

    useEffect(() => {
        if (typed < line.length) {
            const t = setTimeout(() => setTyped(typed + 1), 45);

            return () => clearTimeout(t);
        }
        // Line finished: hold it long enough to read, then start the next one.
        const t = setTimeout(() => {
            setI((n) => n + 1);
            setTyped(0);
        }, 1800);

        return () => clearTimeout(t);
    }, [typed, line]);

    // The full line sits underneath, invisible, to reserve the box. Without it the button
    // resizes on every character and the whole panel twitches for two minutes.
    return (
        <span className="relative inline-block whitespace-nowrap">
            <span className="invisible">{line}</span>
            <span className="absolute inset-0 text-left">{line.slice(0, typed)}</span>
        </span>
    );
}

function CardSkeleton() {
    return (
        <div className="bg-muted/30 flex aspect-[63/88] animate-pulse flex-col gap-2.5 rounded-xl border border-dashed p-3">
            <div className="bg-muted h-2.5 w-2/3 rounded" />
            <div className="bg-muted h-1/2 w-full rounded-lg" />
            <div className="bg-muted h-2.5 w-1/2 rounded" />
            <div className="bg-muted h-2.5 w-full rounded" />
            <div className="bg-muted mt-auto h-2.5 w-1/3 rounded" />
        </div>
    );
}
