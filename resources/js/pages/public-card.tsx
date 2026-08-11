import AppLogoIcon from '@/components/app-logo-icon';
import { CardZoom } from '@/components/card-zoom';
import LinePokeball from '@/components/line-pokeball';
import { PokeCard } from '@/components/PokeCard';
import { Button } from '@/components/ui/button';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { langColor, langType, raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, Check, Download, Link2, Loader2, MapPin } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

type CardData = { profile: Profile; rarity: string; axes: Axes };

const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

// Same mark as the login button; lucide deprecated its brand icons.
function GithubMark() {
    return (
        <svg className="mr-1.5 h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

/**
 * Where a card can be shared.
 *
 * Plain intent URLs rather than platform SDKs: nothing to load, no third-party script, and they
 * still work with trackers blocked. The marks are inline paths for the same reason GithubMark is.
 */
const SHARE: { key: string; label: string; href: (url: string, text: string) => string; path: string }[] = [
    {
        key: 'x',
        label: 'X',
        href: (u, t) => `https://x.com/intent/tweet?text=${t}&url=${u}`,
        path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    },
    {
        key: 'facebook',
        label: 'Facebook',
        href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
        path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
    },
    {
        key: 'linkedin',
        label: 'LinkedIn',
        href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
        path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    },
    {
        key: 'whatsapp',
        label: 'WhatsApp',
        href: (u, t) => `https://api.whatsapp.com/send?text=${t}%20${u}`,
        path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z',
    },
    {
        key: 'telegram',
        label: 'Telegram',
        href: (u, t) => `https://t.me/share/url?url=${u}&text=${t}`,
        path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
    },
];

/** A stat plate, outlined in the card's energy colour so the row reads as one set. */
function Stat({ label, value, accent, icon, className }: { label: string; value: string; accent: string; icon?: string; className?: string }) {
    return (
        <div
            className={`bg-muted/40 rounded-lg border px-2 py-2 text-center ${className ?? ''}`}
            style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}
        >
            <p className="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums">
                {icon && <img src={icon} alt="" className="h-3.5 w-3.5" />}
                <span className="truncate">{value}</span>
            </p>
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
        </div>
    );
}

/**
 * What the footer offers, given who is reading.
 *
 * Anyone can generate any handle, so the visitor may well be the person on the card. Signing in
 * claims the handle GitHub authenticates, never the card being viewed, so the signed-out copy says
 * so rather than promising something the server will not do.
 */
function ctaFor(signedIn: boolean, mine: boolean, login: string) {
    if (mine) {
        return {
            title: 'This one is yours',
            body: 'Open the dashboard to regenerate it, restyle the frame, or make it private.',
            label: 'Go to dashboard',
            href: '/dashboard',
        };
    }

    return signedIn
        ? {
              title: 'Your GitHub profile is a card too',
              body: 'This one belongs to @' + login + '. Yours is in your dashboard, built from your public stats the same way this was.',
              label: 'Go to dashboard',
              href: '/dashboard',
          }
        : {
              title: `Is @${login} you?`,
              body: `Then sign in with GitHub and this card is yours to regenerate, restyle or take down. You can only claim the handle you sign in as - if you are not @${login}, signing in gets you your own card instead.`,
              label: 'Log in to claim or regenerate',
              href: '/login',
          };
}

export default function PublicCard({ owner, card }: { owner: { name: string; slug: string; avatar: string | null }; card: CardData }) {
    const { auth } = usePage<SharedData>().props;
    const { options } = useCardOptions();
    const rarity = rarityOf(raritiesFromOptions(options), card.rarity);
    const profile: Profile = { ...card.profile, rarity: card.rarity };
    const overrides = useMemo(() => resolveOverrides(options, card.axes, rarity), [options, card.axes, rarity]);

    const [zoomed, setZoomed] = useState(false);
    const closeZoom = useCallback(() => setZoomed(false), []);
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    // Guarded for SSR: package.json has a `build:ssr` script, where a bare `window` would throw.
    const origin = typeof window === 'undefined' ? '' : window.location.origin;

    // Matched on the GitHub handle rather than the slug, since an unclaimed card has no owner row
    // and the handle is the only thing both sides can agree on.
    const mine = !!auth?.user?.github_login && auth.user.github_login.toLowerCase() === (profile.login || '').toLowerCase();
    const cta = ctaFor(!!auth?.user, mine, profile.login);

    const accent = langColor(profile.top_lang);
    // Read back from the resolved overrides rather than re-derived, so an admin-set element or
    // dual type shows here as well as on the card face.
    const element = overrides.element ?? langType(profile.top_lang);
    const elements = overrides.dualType && overrides.dualType !== element ? [element, overrides.dualType] : [element];

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Built from the slug rather than location.href, so a link pasted with a query string or the
    // other casing of the login does not propagate.
    const shareUrl = encodeURIComponent(`${origin}/${owner.slug}`);
    const shareText = encodeURIComponent(`${owner.name} as a Pokémon card`);

    const savePng = async () => {
        setSaving(true);
        try {
            // Fetched into a blob rather than a plain `<a download>`, because the first request
            // for a card renders it in headless Chromium and takes several seconds. This way the
            // button can show that something is happening.
            const res = await fetch(`/${owner.slug}.png`);
            if (!res.ok) throw new Error(String(res.status));
            const href = URL.createObjectURL(await res.blob());
            const a = document.createElement('a');
            a.href = href;
            a.download = `${owner.slug}-pokehub.png`;
            a.click();
            URL.revokeObjectURL(href);
        } catch {
            // Throttled, or the capture failed. Opening the URL shows what happened rather than
            // leaving a button that quietly does nothing.
            window.open(`/${owner.slug}.png`, '_blank', 'noopener');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Head title={`${owner.name} - PokeHub`} />

            <div className="bg-background text-foreground relative min-h-screen overflow-hidden">
                {/* One wash of the card's own energy colour, so the page feels like the card. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.14] blur-3xl"
                    style={{ background: `radial-gradient(60% 60% at 50% 0%, ${accent}, transparent)` }}
                />
                {/* The logo mark again, huge and faint, behind the card. */}
                <AppLogoIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 -left-32 h-[34rem] w-[34rem] opacity-[0.05] sm:-left-24"
                    strokeWidth={1}
                />

                <div className="relative mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
                    <header className="flex justify-center">
                        <Link href="/" className="flex items-center gap-2">
                            <AppLogoIcon className="h-5 w-5" strokeWidth={5} />
                            <span className="text-xl font-black tracking-tight">
                                <span className="text-primary">Poke</span>
                                <span className="text-amber-400">Hub</span>
                            </span>
                        </Link>
                    </header>

                    {/* One panel holding the card and everything said about it, tinted with the
                        card's energy colour like the dashboard's.

                        No overflow-hidden, and that is load-bearing: the card tilts in 3D
                        (usePointerTilt) and carries a drop shadow, both of which paint outside its
                        layout box, and there is less panel padding above it than the tilt needs. */}
                    <div className="bg-card rounded-2xl border shadow-sm" style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}>
                        {/* items-start: the card is far taller than the details beside it. */}
                        <div className="grid items-start gap-5 p-4 sm:grid-cols-[224px_1fr] sm:p-5">
                            {/* Uncapped on a phone, fixed-width beside the details from sm up. The
                                tilt is driven by pointer and touch events over the card itself, so
                                on a touch screen the card is the input surface and a thumbnail
                                would leave a thumb nothing to work with. */}
                            <button
                                type="button"
                                onClick={() => setZoomed(true)}
                                aria-label="View card full size"
                                className="animate-pop focus-visible:ring-ring mx-auto w-full cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-2 focus-visible:ring-2 focus-visible:outline-none sm:max-w-[224px]"
                            >
                                <PokeCard profile={profile} rarity={rarity} {...overrides} />
                            </button>

                            {/* The rarity is not repeated here: the card prints its own symbol and
                                wears its own foil. */}
                            <div className="min-w-0 space-y-3 text-center sm:text-left">
                                <div>
                                    <div className="flex items-center justify-center gap-2 sm:justify-start">
                                        <h1 className="truncate text-2xl font-bold tracking-tight">{owner.name}</h1>
                                        {/* Both types on a dual card, in the order the face stacks
                                            them: primary first. */}
                                        <span className="flex shrink-0 items-center gap-1">
                                            {elements.map((e) => (
                                                <img key={e} src={`/img/types/${e}.png`} alt={e} title={e} className="h-6 w-6" />
                                            ))}
                                        </span>
                                    </div>
                                    <span className="text-muted-foreground mt-0.5 block text-sm">@{profile.login}</span>
                                </div>

                                {profile.ai?.species && (
                                    <p className="text-base font-semibold" style={{ color: accent }}>
                                        {profile.ai.species}
                                    </p>
                                )}
                                {profile.bio && <p className="text-muted-foreground text-sm text-pretty">{profile.bio}</p>}

                                {/* Always one row. The counts fit any share of it, but a language
                                    name does not, so Type is dropped on a phone: the card's own dex
                                    line prints it, and its energy symbol sits beside the name. */}
                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
                                    <Stat label="Followers" value={compact(profile.followers)} accent={accent} />
                                    <Stat label="Repos" value={compact(profile.repos)} accent={accent} />
                                    <Stat label="Stars" value={compact(profile.stars)} accent={accent} />
                                    <Stat label="Type" value={profile.top_lang || '—'} accent={accent} className="hidden sm:block" />
                                </div>

                                {profile.location && (
                                    <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs sm:justify-start">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {profile.location}
                                    </p>
                                )}

                                {/* Equal thirds on a phone, where a flex row wraps 2 + 1 and leaves
                                    a stray button on its own line. A natural row from sm up. */}
                                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-start">
                                    {profile.html_url && (
                                        <Button asChild variant="outline" size="sm">
                                            <a href={profile.html_url} target="_blank" rel="noreferrer">
                                                <GithubMark />
                                                GitHub
                                            </a>
                                        </Button>
                                    )}
                                    <Button variant="outline" size="sm" onClick={copyLink}>
                                        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                                        {copied ? 'Copied' : 'Copy link'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={savePng} disabled={saving}>
                                        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                                        {saving ? 'Rendering' : 'Download'}
                                    </Button>
                                </div>

                                {/* Its own line rather than five more chips in the row above: those
                                    are three separate actions, these are one action five ways. */}
                                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                                    <span className="text-muted-foreground mr-0.5 text-xs">Share</span>
                                    {SHARE.map((s) => (
                                        <a
                                            key={s.key}
                                            href={s.href(shareUrl, shareText)}
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label={`Share on ${s.label}`}
                                            title={s.label}
                                            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border p-1.5 transition-colors"
                                        >
                                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                                                <path d={s.path} />
                                            </svg>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* The visitor is as likely to be this card's subject as a passer-by, so the
                        call to action answers whichever they are. See ctaFor. */}
                    <section className="bg-card rounded-2xl border p-5 text-center">
                        <h2 className="text-base font-bold tracking-tight">{cta.title}</h2>
                        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm text-pretty">{cta.body}</p>
                        <Button asChild className="group mt-3.5 h-10 px-5">
                            <Link href={cta.href}>
                                {/* decorative={false} keeps the ball in flow and click-through, so
                                    it cannot swallow the link's own click. Heavier stroke than the
                                    large decorative ones, where a hairline reads as a smudge. */}
                                <LinePokeball decorative={false} size="size-4" strokeWidth={5} tilt="12deg" className="mr-2" />
                                {cta.label}
                                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </Button>
                    </section>
                </div>
            </div>

            {zoomed && (
                <CardZoom caption={owner.name} sub={`@${profile.login}`} onClose={closeZoom}>
                    <PokeCard profile={profile} rarity={rarity} {...overrides} />
                </CardZoom>
            )}
        </>
    );
}
