import { CardZoom } from '@/components/card-zoom';
import { PokeCard } from '@/components/PokeCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppearance, type Appearance } from '@/hooks/use-appearance';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions, type CardOptions } from '@/lib/options';
import { raritiesFromOptions, rarityOf, type Profile, type Rarity } from '@/lib/rarities';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, ChevronDown, Moon, Sparkles, Sun } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

/** Editable per login in the dashboard's admin panel; `axes` is the saved frame/effect blob. */
type ShowcaseEntry = {
    login: string;
    name: string;
    why: string;
    profile: Profile;
    rarity: string;
    axes: Partial<Axes>;
};

/**
 * The eleven energy types, with the frame colours the seeder already assigns them
 * (CardAssetSeeder::$typeFrame) and the energy icons the app already ships in /img/types.
 * Reusing the product's own palette rather than inventing one keeps the landing page and the
 * cards visually the same system.
 */
const TYPES: { slug: string; label: string; color: string }[] = [
    { slug: 'grass', label: 'Grass', color: '#66c05c' },
    { slug: 'fire', label: 'Fire', color: '#ec4b34' },
    { slug: 'water', label: 'Water', color: '#4fa0dd' },
    { slug: 'lightning', label: 'Lightning', color: '#f4cb3a' },
    { slug: 'psychic', label: 'Psychic', color: '#a862b0' },
    { slug: 'fighting', label: 'Fighting', color: '#c65f2f' },
    { slug: 'darkness', label: 'Darkness', color: '#5a6873' },
    { slug: 'metal', label: 'Metal', color: '#adb3b7' },
    { slug: 'dragon', label: 'Dragon', color: '#cba634' },
    { slug: 'fairy', label: 'Fairy', color: '#ec74ac' },
    { slug: 'colorless', label: 'Colorless', color: '#b7bcbf' },
];

/** The rarity ladder the product actually uses, lowest to highest. */
const RARITY_LADDER = [
    { label: 'Common', dots: 1, symbol: 'diamond' },
    { label: 'Uncommon', dots: 2, symbol: 'diamond' },
    { label: 'Rare', dots: 1, symbol: 'star' },
    { label: 'Ultra', dots: 2, symbol: 'star' },
    { label: 'Crown', dots: 1, symbol: 'crown' },
];

/** One flat colour per step, borrowed from the type palette above. */
const STEP_COLORS = ['#66c05c', '#ec4b34', '#4fa0dd', '#a862b0'];

/**
 * Poké Ball as pure line art. Everything Pokémon on this page is drawn with strokes rather than
 * fills, glows or gradients - flat hairlines are what makes printed stationery look expensive,
 * and a blurred coloured blob is what makes it look like a 2015 startup template.
 */
function Pokeball({ className, strokeWidth = 3 }: { className?: string; strokeWidth?: number }) {
    return (
        <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
            <circle cx="32" cy="32" r="29" />
            <path d="M3 32h17M44 32h17" />
            <circle cx="32" cy="32" r="12" />
            <circle cx="32" cy="32" r="4.5" />
        </svg>
    );
}

/**
 * The big hairline ball: draws itself in, then loops the capture wobble - tilt, counter-tilt,
 * settle, button flashes twice. Keyframes live in card.css next to `pokehub-pop`, and the whole
 * thing stands still for anyone with `prefers-reduced-motion` set.
 *
 * `still` keeps the drawing and drops the wobble, for the panel corners - one moving thing per
 * page is the budget, and it belongs on the closing CTA, not behind body copy.
 *
 * The WRAPPER owns positioning, not the svg: the wobble animates `transform`, which would
 * overwrite a `-translate-x-1/2` on the same element the instant the animation started. So the
 * caller's className goes on the wrapper and only the size lands on the svg.
 *
 * `--tilt` scales with the drawn size, not with taste: the degrees that read as a lively rock on
 * an 80px ball swing the edge of a 30rem one by tens of pixels.
 */
function LinePokeball({ className, size, tilt = '9deg', still }: { className?: string; size: string; tilt?: string; still?: boolean }) {
    return (
        <div
            aria-hidden="true"
            className={`pokehub-ball pointer-events-none absolute ${still ? 'is-still' : ''} ${className}`}
            style={{ '--tilt': tilt } as React.CSSProperties}
        >
            <svg viewBox="0 0 64 64" className={size} fill="none" stroke="currentColor" strokeWidth={0.8} strokeLinecap="round">
                <circle className="pokehub-ball__draw" pathLength={1} cx="32" cy="32" r="29" />
                <path className="pokehub-ball__draw" pathLength={1} d="M3 32h17M44 32h17" />
                <circle className="pokehub-ball__draw" pathLength={1} cx="32" cy="32" r="12" />
                <circle className="pokehub-ball__btn" cx="32" cy="32" r="4.5" />
            </svg>
        </div>
    );
}

/**
 * The GitHub mark, same path the login screen draws. On the button because GitHub is the ONLY way
 * in (routes/auth.php) - a bare "Sign in" made people guess what the next screen asks for.
 */
function GithubMark() {
    return (
        <svg className="h-[1.15em] w-[1.15em]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

/** Section divider: a hairline rule broken by a small ball. */
function BallRule() {
    return (
        <div aria-hidden="true" className="mx-auto flex max-w-6xl items-center gap-4 px-4">
            <span className="bg-border h-px flex-1" />
            <Pokeball className="text-muted-foreground/50 h-5 w-5" />
            <span className="bg-border h-px flex-1" />
        </div>
    );
}

/** The four "how it works" steps. */
const STEPS = [
    // GitHub is the only provider wired up (routes/auth.php has just the github redirect +
    // callback, and login.tsx offers one button), so the step must not promise a second one.
    { n: 1, title: 'Sign in with GitHub', body: 'One click, and no repository access is ever requested.' },
    { n: 2, title: 'We read your public stats', body: 'Followers, public repos, stars, and your top language.' },
    { n: 3, title: 'Your card is generated', body: 'Your stats land on a real card frame.' },
    { n: 4, title: 'Publish it or keep it private', body: 'Give it a public link, or keep it in your dashboard.' },
];

/**
 * The FAQ. Kept as data next to STEPS rather than inline JSX so the answers are one place to edit,
 * and so the two that are really disclaimers - the Nintendo one and the asset credits - cannot be
 * quietly reworded into something softer than they need to be.
 */
const FAQ = [
    {
        q: 'Is this official? Is it connected to Pokémon or Nintendo?',
        a: 'No. PokeHub is an unofficial fan project built for fun, with no affiliation with, endorsement by, or connection to Nintendo, Game Freak, Creatures Inc. or The Pokémon Company. Pokémon and every related name are their trademarks. Nothing here is for sale.',
    },
    {
        q: 'Where do the card assets come from?',
        a: 'From several places, and none of them are ours. The card frames, stamps and badges come from pokecardgenerator.com, and the holo / foil shine is built on poke-holo.simey.me (simeydotme). Credit and thanks to the original authors - if you own something here and would rather it were not, get in touch and it comes down.',
    },
    {
        q: 'Why does generating a card take so long?',
        a: 'The species name, the flavour text and both attacks are written by an AI, and it is a Qwen model running locally on our own hardware rather than a paid API. That is slower - budget up to two minutes for a first card. Once it is generated it is cached, so opening it again is instant.',
    },
    {
        q: 'Do you get access to my repositories?',
        a: 'No. Signing in is GitHub OAuth for identity only, and the card is built from the same public profile data anyone can see on your GitHub page: followers, public repo count, stars, and your top languages. Private repositories are never requested and never read.',
    },
    {
        q: 'Can I pick my own type and rarity?',
        a: 'No, and that is the point - a card you can choose is a wallpaper. Your element comes from the language you write most, HP from followers, attack damage from stars, retreat cost from public repos, and rarity from all of it together. You can restyle the frame afterwards, not the numbers.',
    },
    {
        q: 'Is my card public?',
        a: 'Only if you say so. A new card stays in your dashboard until you publish it, and publishing gives it a link at pokehub.dev/your-username plus an .svg of the same card you can embed in a README. You can make it private again at any time.',
    },
];

function ThemeSwitch() {
    const { appearance, updateAppearance } = useAppearance();
    // Light and dark only - no "system".
    const themes: { key: Appearance; icon: typeof Sun; label: string }[] = [
        { key: 'light', icon: Sun, label: 'Light' },
        { key: 'dark', icon: Moon, label: 'Dark' },
    ];
    return (
        <div className="bg-muted/70 flex items-center rounded-full p-0.5" role="group" aria-label="Theme">
            {themes.map((th) => (
                <button
                    key={th.key}
                    type="button"
                    onClick={() => updateAppearance(th.key)}
                    aria-pressed={appearance === th.key}
                    aria-label={th.label}
                    title={th.label}
                    className={`rounded-full p-1.5 transition-colors ${
                        appearance === th.key ? 'bg-background text-foreground ring-border ring-1' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <th.icon className="h-3.5 w-3.5" />
                </button>
            ))}
        </div>
    );
}

/** One showcase card, resolved the same way every other surface resolves one. */
function ShowcaseCard({ entry, rarities, options }: { entry: ShowcaseEntry; rarities: Rarity[]; options: CardOptions }) {
    const rarity = rarityOf(rarities, entry.rarity);

    return <PokeCard profile={entry.profile} rarity={rarity} {...resolveOverrides(options, entry.axes, rarity)} />;
}

function ZoomOverlay({ entry, rarities, options, onClose }: { entry: ShowcaseEntry; rarities: Rarity[]; options: CardOptions; onClose: () => void }) {
    return (
        <CardZoom caption={entry.name} sub={entry.why} onClose={onClose}>
            <ShowcaseCard entry={entry} rarities={rarities} options={options} />
        </CardZoom>
    );
}

export default function Landing({ showcase }: { showcase: ShowcaseEntry[] }) {
    const { auth } = usePage<SharedData>().props;
    const { options } = useCardOptions();
    const rarities = useMemo(() => raritiesFromOptions(options), [options]);
    const [zoom, setZoom] = useState<ShowcaseEntry | null>(null);
    const closeZoom = useCallback(() => setZoom(null), []);

    const signedIn = !!auth?.user;
    const ctaHref = signedIn ? '/dashboard' : '/login';

    return (
        <div className="bg-background text-foreground min-h-screen">
            <Head title="PokeHub: your GitHub profile as a Pokémon card" />

            <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
                    <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
                        <Pokeball className="h-5 w-5" strokeWidth={4} />
                        <span>
                            <span className="text-primary">Poke</span>
                            <span className="text-amber-400">Hub</span>
                        </span>
                    </Link>
                    <div className="ml-auto flex items-center gap-1.5">
                        <ThemeSwitch />
                        <Button asChild size="sm" variant={signedIn ? 'outline' : 'default'}>
                            <Link href={ctaHref}>{signedIn ? 'Dashboard' : 'Sign in'}</Link>
                        </Button>
                    </div>
                </div>
            </header>

            {/* ---------- hero ---------- */}
            <section className="relative isolate overflow-hidden">
                {/* The three coloured radial glows that used to sit here are gone. A flat hairline
                    grid plus one oversized Poké Ball outline carries the whole backdrop - no blur,
                    no gradient wash, nothing competing with the cards for attention. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 opacity-[0.16] dark:opacity-[0.10]"
                    style={{
                        backgroundImage:
                            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                        backgroundSize: '56px 56px',
                        maskImage: 'radial-gradient(70% 62% at 50% 0%, #000 0%, transparent 100%)',
                    }}
                />

                {/* One rhythm for the whole page: every section below is py-14, so the hero closes
                    on the same 14 and only its TOP is bigger. The showcase heading used to sit 48px
                    under the CTA buttons and read as part of the hero. */}
                <div className="mx-auto max-w-6xl px-4 pt-12 pb-14 text-center sm:pt-16">
                    <Badge variant="secondary" className="mb-4 gap-1.5 px-3 py-1">
                        <Sparkles className="h-3 w-3" />
                        {'Straight from live GitHub data'}
                    </Badge>
                    {/* hyphens-none + break-normal: the browser was splitting "GitHub-mu" across
                        lines, which read as a typo on the most prominent line of the page. */}
                    <h1 className="mx-auto max-w-4xl text-4xl leading-[1.08] font-black tracking-tight text-balance hyphens-none sm:text-5xl lg:text-6xl">
                        {'Turn your GitHub profile into a Pokémon card'}
                    </h1>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
                        {
                            'Sign in, and your public GitHub stats are read once and printed onto a real card frame. No repository access, nothing to fill in.'
                        }
                    </p>

                    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                        <Button asChild size="lg" className="h-12 gap-2.5 px-7 text-base">
                            <Link href={ctaHref}>
                                {!signedIn && <GithubMark />}
                                {signedIn ? 'Go to dashboard' : 'Sign in with GitHub'}
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="h-12 gap-2 px-6 text-base">
                            <a href="#how">
                                {'See how it works'}
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </div>
            </section>

            {/* ---------- showcase ---------- */}
            <section className="mx-auto max-w-6xl px-4 py-14">
                <div className="mb-7 text-center">
                    <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{'Four developers you already know'}</h2>
                    <p className="text-muted-foreground mt-2 text-sm text-pretty">
                        {'Real profiles, real numbers, made the same way yours will be.'}
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {showcase.map((s, i) => (
                        <figure key={s.login} className="flex flex-col items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => setZoom(s)}
                                aria-label={`${'View card'}: ${s.name}`}
                                className="focus-visible:ring-ring w-full max-w-[248px] cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-2 focus-visible:ring-2 focus-visible:outline-none"
                                /* Staggered entrance so the four cards land in sequence. The
                                   keyframe is `pokehub-pop` (card.css) - a bare `pop` silently
                                   animates nothing. */
                                style={{ animation: `pokehub-pop .45s ease ${i * 90}ms both` }}
                            >
                                <ShowcaseCard entry={s} rarities={rarities} options={options} />
                            </button>
                            <figcaption className="text-center">
                                <p className="font-semibold">{s.name}</p>
                                <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{s.why}</p>
                                {/* The card's own PokeHub page, not their GitHub profile - the
                                    point of the link is the card, and the gallery already uses
                                    this same /{slug} shape. */}
                                <Link href={`/${s.login}`} className="text-primary mt-1.5 inline-block text-xs hover:underline">
                                    @{s.login}
                                </Link>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </section>

            {/* ---------- types + rarity ---------- */}
            <BallRule />
            <section className="mx-auto max-w-6xl px-4 py-14">
                <div className="grid gap-4 lg:grid-cols-2">
                    {/* energy types */}
                    <div className="bg-card relative overflow-hidden rounded-2xl border p-6">
                        {/* Cropped by its corner to 41.6% of the disc (grid-sampled, target was
                            40%). The 160px box at a -64px inset is what produces that: it leaves
                            the shell's centre ~16px inside each edge, and the two circular segments
                            the corner cuts away take the rest. Move the inset and the fraction moves
                            with it - they are not independent.

                            This panel keeps its ball because the type pills leave the bottom-right
                            corner empty. The rarity panel next door used to carry the opposite half
                            of the pair off its top-left, and had nowhere to put it: a 160px disc
                            centred 16px inside that corner drew a hairline straight through "Every
                            card has a rarity". Pushing it out far enough to clear the heading left a
                            16px tick, so the decoration went instead of the text moving. */}
                        <LinePokeball still className="text-muted-foreground/25 -right-16 -bottom-16" size="h-40 w-40" />
                        <h3 className="text-xl font-bold tracking-tight">{'Eleven energy types'}</h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
                            {'The language you write most decides your element. Mostly Python? Psychic. Mostly Rust? Fire.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {TYPES.map((ty) => (
                                <span
                                    key={ty.slug}
                                    className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-medium"
                                    /* The label is mixed toward the theme foreground rather than set to the raw
                                       type colour: Lightning (#f4cb3a) and Colorless (#b7bcbf) are unreadable as
                                       text on a light background. Mixing keeps the hue and passes contrast in
                                       both themes, since --foreground flips with the theme. */
                                    style={{
                                        background: `${ty.color}1f`,
                                        color: `color-mix(in oklab, ${ty.color} 45%, var(--foreground))`,
                                        border: `1px solid ${ty.color}55`,
                                    }}
                                >
                                    <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: ty.color }}>
                                        <img src={`/img/types/${ty.slug}.png`} alt="" className="h-3 w-3 object-contain" loading="lazy" />
                                    </span>
                                    {ty.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* rarity ladder */}
                    <div className="bg-card relative overflow-hidden rounded-2xl border p-6">
                        <h3 className="text-xl font-bold tracking-tight">{'Every card has a rarity'}</h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
                            {'From a single diamond to the crown. Your profile decides the foil and the shine, not you.'}
                        </p>
                        <ol className="mt-4 space-y-2">
                            {RARITY_LADDER.map((r, i) => (
                                <li key={r.label} className="flex items-center gap-3">
                                    <span className="flex w-14 shrink-0 items-center gap-0.5">
                                        {Array.from({ length: r.dots }).map((_, d) => (
                                            <span
                                                key={d}
                                                aria-hidden="true"
                                                className={`inline-block h-2.5 w-2.5 ${r.symbol === 'diamond' ? 'rotate-45' : ''}`}
                                                style={{
                                                    background: ['#b7bcbf', '#b7bcbf', '#f4cb3a', '#f4cb3a', '#ec74ac'][i],
                                                    clipPath:
                                                        r.symbol === 'star'
                                                            ? 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)'
                                                            : r.symbol === 'crown'
                                                              ? 'polygon(0 100%,15% 30%,35% 60%,50% 10%,65% 60%,85% 30%,100% 100%)'
                                                              : undefined,
                                                    borderRadius: r.symbol === 'diamond' ? '2px' : undefined,
                                                }}
                                            />
                                        ))}
                                    </span>
                                    <span className="text-sm font-medium">{r.label}</span>
                                    {/* a widening bar reads as "rarer" without needing a number */}
                                    <span className="bg-muted ml-auto h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full">
                                        <span
                                            className="block h-full rounded-full"
                                            style={{
                                                width: `${20 + i * 20}%`,
                                                background: ['#b7bcbf', '#8fa3ad', '#f4cb3a', '#ec8a34', '#ec74ac'][i],
                                            }}
                                        />
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </section>

            {/* ---------- how it works ---------- */}
            {/* Plain ground on purpose: the FAQ band sits directly below, and two `bg-muted/30`
                sections back to back merge into one slab with a stray hairline through it. */}
            <section id="how">
                <div className="mx-auto max-w-6xl px-4 py-14">
                    <h2 className="mb-7 text-center text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                        {'From profile to card in four steps'}
                    </h2>

                    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {STEPS.map((s) => (
                            <li key={s.n} className="bg-card hover:border-primary/50 relative rounded-xl border p-5 transition-colors">
                                {/* Outlined, not filled: the same hairline language as the balls and
                                   rules, and it keeps Lightning-yellow off a white pill. */}
                                <span
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 font-mono text-sm font-bold"
                                    style={{
                                        borderColor: STEP_COLORS[s.n - 1],
                                        color: `color-mix(in oklab, ${STEP_COLORS[s.n - 1]} 45%, var(--foreground))`,
                                    }}
                                >
                                    {s.n}
                                </span>
                                <h3 className="mt-4 font-semibold">{s.title}</h3>
                                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed text-pretty">{s.body}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ---------- faq ---------- */}
            {/* Its own band rather than more cards on the page background: the four steps above and
                the CTA below are both card grids, so without a change of ground the questions read
                as a third one. The step section drops its band so two never sit edge to edge. */}
            <section id="faq" className="border-border/60 bg-muted/30 border-y">
                <div className="mx-auto max-w-6xl px-4 py-14">
                    <h2 className="mb-7 text-center text-2xl font-bold tracking-tight text-balance sm:text-3xl">{'Questions'}</h2>

                    {/* <details>, not a state-driven accordion: open/close, keyboard, and find-in-page
                        all come from the browser, and the answers are in the DOM for search engines
                        whether or not React has hydrated. */}
                    <div className="space-y-3">
                        {FAQ.map((f) => (
                            <details key={f.q} className="bg-card group rounded-xl border px-5 open:pb-1">
                                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                                    {f.q}
                                    <ChevronDown className="text-muted-foreground ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                                </summary>
                                {/* One row per question, but the ANSWER keeps a readable measure -
                                    the row is 1150px wide and prose is not. */}
                                <p className="text-muted-foreground max-w-3xl pb-4 text-sm leading-relaxed text-pretty">{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---------- closing ---------- */}
            <section className="mx-auto max-w-6xl px-4 py-14">
                <div className="bg-card relative isolate overflow-hidden rounded-2xl border px-6 py-14 text-center">
                    {/* The page's one moving thing, moved here from the hero: behind a closing CTA
                        the capture wobble is the point, whereas behind the headline it was 34rem of
                        motion under text people were trying to read.

                        Anchored to the BOTTOM, not the panel's centre. Centred, a 160px disc lands
                        exactly on the body copy and drew a moving hairline through the sentence.
                        From `bottom-4` it spans 16-176px off the floor, which is the badge and the
                        button - both opaque, so the ball reads as a ring around the button instead
                        of a line through a paragraph. Growing it past h-40 puts the apex back into
                        the copy, and a bigger --tilt buys the liveliness the small radius costs. */}
                    <LinePokeball
                        className="bottom-4 left-1/2 -z-10 -translate-x-1/2 opacity-[0.10] dark:opacity-[0.14]"
                        size="h-40 w-40"
                        tilt="12deg"
                    />
                    {/* The heading, the body and the button used to open with "Sign in" three times
                        in a row. Only the button says it now - it is the thing being clicked. */}
                    <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                        {signedIn ? 'Your card is waiting' : 'Your card is one click away'}
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-pretty">
                        {signedIn
                            ? 'Open your dashboard to restyle it, publish it, or copy the README embed.'
                            : 'Signing in creates your account and generates the card from your public profile. Nothing to fill in.'}
                    </p>
                    <div className="mt-7">
                        <Button asChild size="lg" className="h-12 gap-2.5 px-7 text-base">
                            <Link href={ctaHref}>
                                {!signedIn && <GithubMark />}
                                {signedIn ? 'Go to dashboard' : 'Continue with GitHub'}
                            </Link>
                        </Button>
                    </div>
                    {/* The two objections that stop a signup, answered where the click happens
                        rather than three sections up in the FAQ. Same Badge the hero opens with, so
                        the page starts and ends on the same shape. */}
                    <Badge variant="secondary" className="mt-5 px-3 py-1 font-normal">
                        {'Free · Public Data Only · No Repository Access'}
                    </Badge>
                </div>
            </section>

            {/* Centred, and wide enough to stay on one line: every other block on the page is
                centred, so `sm:text-left` on a max-w-xl paragraph left the page ending on a
                two-line ragged block hanging off the left rail. */}
            <footer className="border-border/60 border-t">
                <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-7 text-center text-xs">
                    <p className="mx-auto max-w-3xl text-pretty">
                        {'Built from public GitHub data. An unofficial fan project, not affiliated with Nintendo or The Pokémon Company.'}
                    </p>
                </div>
            </footer>

            {zoom && <ZoomOverlay entry={zoom} rarities={rarities} options={options} onClose={closeZoom} />}
        </div>
    );
}
