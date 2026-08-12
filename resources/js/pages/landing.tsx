import { BackToTop } from '@/components/back-to-top';
import { CardZoom } from '@/components/card-zoom';
import GenerateForm from '@/components/generate-form';
import GridBackdrop from '@/components/grid-backdrop';
import LinePokeball from '@/components/line-pokeball';
import LoginPanel from '@/components/login-panel';
import { PokeCard } from '@/components/PokeCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/hooks/use-appearance';
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
 * Poké Ball as line art. Everything on this page is drawn with strokes rather than fills, glows or
 * gradients, so it reads as printed rather than rendered.
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

/** The source. GPL-3.0, and the one link on the page that leaves for something other than a card. */
const REPO_URL = 'https://github.com/IlhamriSKY/PokeHub';

/**
 * The GitHub mark, the same path the login screen draws. On the button because GitHub is the only
 * way in, so a bare "Sign in" would leave people guessing what the next screen asks for.
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

/**
 * The four "how it works" steps.
 *
 * Step 1 is the search box rather than the sign-in, because looking a developer up needs no
 * account and step 4 is the only thing an account buys.
 */
const STEPS = [
    { n: 1, title: 'Type any GitHub username', body: 'Yours, or a developer you admire. No account needed.' },
    { n: 2, title: 'We read the public profile', body: 'Followers, public repos, stars, and their top language.' },
    { n: 3, title: 'The card is generated once', body: 'Then cached, so the next person to search that handle gets it instantly.' },
    // GitHub is the only provider wired up (see routes/auth.php), so this must not imply a second.
    { n: 4, title: 'Sign in to claim your own', body: 'Claiming lets you regenerate it, restyle it, or make it private.' },
];

/**
 * The FAQ, kept as data beside STEPS so the answers are one place to edit. The last two are
 * disclaimers rather than questions, and their wording is deliberate.
 */
const FAQ = [
    {
        q: 'Do I need an account to make a card?',
        a: 'No. The search box at the top of this page works signed out: type a GitHub username and the card is built from that account’s public profile. Signing in does one thing - it claims the card for the handle you signed in as, which is what lets you regenerate it, restyle it, or take it down.',
    },
    {
        q: 'If I generate someone else’s card, is it mine?',
        a: 'No. Generating a card is not owning it - you can look up anyone, but the card still belongs to the handle it was made from. Signing in claims exactly one card: the one for the GitHub account you signed in with. Nobody can take over a handle they cannot log in as, however many cards they have searched.',
    },
    {
        q: 'Can I generate a card for someone else?',
        a: 'Yes, that is what the box is for. Every card here is made from the public profile page anyone can already read on github.com. A handle is only ever generated once: if someone has searched it before you, you get that same card immediately instead of a new one, and nothing is re-fetched.',
    },
    {
        q: 'Someone made a card for my username. Can I take it down?',
        a: 'Yes, and only you can. Sign in with that GitHub account and the card becomes yours - the dashboard has a switch that makes it private, and a private card disappears from the site completely: the link, the gallery and the README image all stop answering. Nobody can generate it again while it is private, either.',
    },
    {
        q: 'How many times can I regenerate my card?',
        a: 'Five times a day, and only for your own card. The very first one on a new account is on the house and does not count, so signing in never costs you a regeneration just to see yourself. The window is a rolling 24 hours from your first press rather than midnight, and the dashboard shows how many you have left and when they come back. The cap exists because every regeneration is a real AI writing job on our own hardware - looking other people up is not, so searching handles from the home page never spends it, and opening a card that already exists costs nothing at all.',
    },
    {
        q: 'Do you read anything private from my GitHub?',
        a: 'No, and there is nothing to read: a card is built from the public profile page - followers, public repo count, stars, top languages, and your public README - which is the same data any visitor to your GitHub sees. We never take private repositories, private emails, hidden organisations or anything else non-public. Signing in is OAuth for identity only, and the token it hands us carries no repository scope at all.',
    },
    {
        q: 'Why does generating a card take so long?',
        a: 'The species name, the flavour text and both attacks are written by an AI, and it is a Qwen model running locally on our own hardware rather than a paid API. That is slower - budget up to two minutes for a first card. Once it is generated it is cached, so opening it again is instant.',
    },
    {
        q: 'Can I pick my own type and rarity?',
        a: 'No, and that is the point - a card you can choose is a wallpaper. Your element comes from the language you write most, HP from followers, attack damage from stars, retreat cost from public repos, and rarity from all of it together. You can restyle the frame afterwards, not the numbers.',
    },
    {
        q: 'Is this official? Is it connected to Pokémon or Nintendo?',
        a: 'No. PokeHub is an unofficial fan project built for fun, with no affiliation with, endorsement by, or connection to Nintendo, Game Freak, Creatures Inc. or The Pokémon Company. Pokémon and every related name are their trademarks. Nothing here is for sale.',
    },
    {
        q: 'Where do the card assets come from?',
        a: 'From several places, and none of them are ours. The card frames, stamps and badges come from pokecardgenerator.com, and the holo / foil shine is built on poke-holo.simey.me (simeydotme). Credit and thanks to the original authors - if you own something here and would rather it were not, get in touch and it comes down.',
    },
];

/** Shared by the icon buttons in the header, so the pair reads as one control group. */
const ICON_BUTTON = 'text-muted-foreground hover:text-foreground hover:bg-muted/70 grid h-8 w-8 place-items-center rounded-full transition-colors';

/**
 * One button, not two. There are only ever two themes (see useAppearance), and with no "system"
 * option to pick out of a set, a segmented control was two controls to say one bit.
 *
 * The icon is the DESTINATION rather than the current theme: on a dark page the button offers a
 * sun. Showing the state instead reads as "you are here" on a thing that is only ever clicked to
 * leave, which is the coin-flip every one-button toggle has to call one way.
 */
function ThemeSwitch() {
    const { appearance, updateAppearance } = useAppearance();
    const dark = appearance === 'dark';
    const Icon = dark ? Sun : Moon;
    const label = `Switch to ${dark ? 'light' : 'dark'} theme`;

    return (
        <button type="button" onClick={() => updateAppearance(dark ? 'light' : 'dark')} aria-label={label} title={label} className={ICON_BUTTON}>
            <Icon className="h-4 w-4" />
        </button>
    );
}

/** One showcase card, resolved the same way every other surface resolves one. */
function ShowcaseCard({
    entry,
    rarities,
    options,
    idle,
}: {
    entry: ShowcaseEntry;
    rarities: Rarity[];
    options: CardOptions;
    idle?: { index: number; count: number };
}) {
    const rarity = rarityOf(rarities, entry.rarity);

    return <PokeCard profile={entry.profile} rarity={rarity} idle={idle} {...resolveOverrides(options, entry.axes, rarity)} />;
}

/**
 * The showcase cards fanned in from both edges of the hero, two per side, framing the search box.
 *
 * The outer card of each pair tilts hardest and rides high while the inner one straightens and
 * drops, which is what reads as a fan rather than four cards leaning at random. Widths are a share
 * of the column so the pair keeps its proportions in a wide gutter.
 *
 * `lift` is a margin rather than a translate, because `hover:-translate-y-2` owns the `translate`
 * property and an inline value would beat the class and kill the hover.
 *
 * The widths look conservative for the space, and that slack is holding the rotation overhang: a
 * turned card's bounding box is wider than its layout width, which layout does not account for and
 * the section's overflow-hidden would otherwise shear off.
 */
const FAN = [
    { rotate: '-15deg', width: '46%', lift: '-1.75rem', z: 1, overlap: '0' },
    { rotate: '-6deg', width: '52%', lift: '1.25rem', z: 2, overlap: '-12%' },
    { rotate: '6deg', width: '52%', lift: '1.25rem', z: 2, overlap: '0' },
    { rotate: '15deg', width: '46%', lift: '-1.75rem', z: 1, overlap: '-12%' },
];

/**
 * The same cards below xl, closed into a single hand, since a narrow screen has no gutters to
 * open into.
 *
 * The middle pair rides high and the outer pair drops, which is the arc a hand makes when fanned
 * about a pivot below the cards. z rises left to right so each card overlaps the one before it;
 * a symmetric stack reads as a shuffled pile.
 *
 * The widths leave the same rotation overhang as FAN above.
 */
const HAND = [
    { rotate: '-14deg', width: '32%', lift: '1.5rem', z: 1, overlap: '0' },
    { rotate: '-5deg', width: '32%', lift: '0rem', z: 2, overlap: '-14%' },
    { rotate: '5deg', width: '32%', lift: '0rem', z: 3, overlap: '-14%' },
    { rotate: '14deg', width: '32%', lift: '1.5rem', z: 4, overlap: '-14%' },
];

function FanCard({
    entry,
    index,
    count,
    rarities,
    options,
    onZoom,
    fan,
    className,
}: {
    entry: ShowcaseEntry;
    index: number;
    /** How many cards share the idle rotation, so each one knows when its turn comes. */
    count: number;
    rarities: Rarity[];
    options: CardOptions;
    onZoom: (e: ShowcaseEntry) => void;
    fan?: (typeof FAN)[number];
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onZoom(entry)}
            aria-label={`View ${entry.name}'s card`}
            title={`${entry.name} - ${entry.why}`}
            className={`focus-visible:ring-ring cursor-zoom-in rounded-xl transition-[translate,filter] duration-300 hover:-translate-y-2 focus-visible:ring-1 focus-visible:outline-none ${className ?? ''}`}
            style={{
                // Staggered entrance so the gate assembles rather than appearing. The keyframe is
                // `pokehub-pop` (card.css) - a bare `pop` silently animates nothing. It animates
                // `transform`, which composes with the `rotate`/`translate` properties below rather
                // than fighting them.
                animation: `pokehub-pop .45s ease ${index * 90}ms both`,
                ...(fan && { rotate: fan.rotate, width: fan.width, marginTop: fan.lift, marginLeft: fan.overlap, zIndex: fan.z }),
            }}
        >
            <ShowcaseCard entry={entry} rarities={rarities} options={options} idle={{ index, count }} />
        </button>
    );
}

function ZoomOverlay({ entry, rarities, options, onClose }: { entry: ShowcaseEntry; rarities: Rarity[]; options: CardOptions; onClose: () => void }) {
    return (
        <CardZoom
            caption={entry.name}
            sub={entry.why}
            onClose={onClose}
            /* Links to the card's own page rather than the GitHub profile. The fanned tiles carry
               no caption, so without this the showcase pages have nothing linking to them from
               the home page. */
            actions={
                <Button asChild size="sm" variant="secondary">
                    <Link href={`/${entry.login}`}>{`Open @${entry.login}`}</Link>
                </Button>
            }
        >
            <ShowcaseCard entry={entry} rarities={rarities} options={options} />
        </CardZoom>
    );
}

export default function Landing({ showcase, showLogin, status }: { showcase: ShowcaseEntry[]; showLogin?: boolean; status?: string }) {
    const { auth } = usePage<SharedData>().props;
    const { options } = useCardOptions();
    const rarities = useMemo(() => raritiesFromOptions(options), [options]);
    const [zoom, setZoom] = useState<ShowcaseEntry | null>(null);
    const closeZoom = useCallback(() => setZoom(null), []);

    // The gate and the hand both draw the same four cards, so they share one idle rotation and a
    // card keeps its turn across the breakpoint.
    const fanned = Math.min(showcase.length, 4);

    const signedIn = !!auth?.user;
    const ctaHref = signedIn ? '/dashboard' : '/login';
    // Signed out, /login is this same page with the panel open, so the visit must not reset scroll
    // or tear this component down: opening the panel would otherwise throw the visitor back to the
    // top of the page. Signed in, /dashboard is a real navigation and should behave normally.
    const ctaProps = signedIn ? {} : { preserveScroll: true, preserveState: true };

    return (
        <div className="bg-background text-foreground min-h-screen">
            {/* Matches the server-rendered <title> in LandingController's Seo block. Inertia
                rewrites it after hydration, so a stale string here would make the tab disagree
                with the share card and with what Google indexed. */}
            <Head title="PokeHub - any GitHub profile as a Pokémon card" />

            {/* First, not last: this renders its own mark at the point it sits in the document, and
                that mark is what "the top of the page" means to it. The button itself is `fixed`
                with a z-index, so nothing about where it appears on screen depends on being here.
                The landing is by far the longest scroll in the app - hero, four sections, the FAQ
                and the CTA - which is what makes it worth having here and nowhere shorter. */}
            <BackToTop />

            <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
                    <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
                        <Pokeball className="h-5 w-5" strokeWidth={4} />
                        <span>
                            <span className="text-primary">Poke</span>
                            <span className="text-amber-400">Hub</span>
                        </span>
                    </Link>
                    <div className="ml-auto flex items-center gap-0.5">
                        <ThemeSwitch />
                        {/* Not a Link: an external destination, so it must be a real anchor that a
                            middle click opens and a crawler follows. rel closes the reverse-tabnabbing
                            hole target="_blank" opens. */}
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="PokeHub source on GitHub"
                            title="PokeHub source on GitHub"
                            className={ICON_BUTTON}
                        >
                            <GithubMark />
                        </a>
                        <Button asChild size="sm" variant={signedIn ? 'outline' : 'default'} className="ml-1.5">
                            <Link href={ctaHref} {...ctaProps}>
                                {signedIn ? 'Dashboard' : 'Sign in'}
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            {/* ---------- hero ---------- */}
            <section className="relative isolate overflow-hidden">
                {/* A hairline grid and one oversized Poké Ball outline carry the whole backdrop:
                    no blur, no gradient wash, nothing competing with the cards. */}
                <GridBackdrop />

                {/* One rhythm for the page: every section below is py-14, so the hero closes on the
                    same value and only its top is larger. Wider than the rest of the page, because
                    the fanned cards need the extra gutter to open into. */}
                <div className="mx-auto max-w-7xl px-4 pt-12 pb-14 sm:pt-16">
                    {/* A real 3-column grid, not absolutely positioned decoration: the gate can then
                        never land on the headline at any width, which is exactly what percentage
                        offsets could not promise. The centre column is a fixed measure, so the two
                        gutters are whatever is left and the cards scale into them. */}
                    <div className="grid items-center gap-8 xl:grid-cols-[1fr_minmax(0,40rem)_1fr]">
                        <div className="hidden items-center justify-end xl:flex">
                            {showcase.slice(0, 2).map((s, i) => (
                                <FanCard
                                    key={s.login}
                                    entry={s}
                                    index={i}
                                    count={fanned}
                                    fan={FAN[i]}
                                    rarities={rarities}
                                    options={options}
                                    onZoom={setZoom}
                                />
                            ))}
                        </div>

                        <div className="text-center">
                            <Badge variant="secondary" className="mb-4 gap-1.5 px-3 py-1">
                                <Sparkles className="h-3 w-3" />
                                {'Straight from live GitHub data'}
                            </Badge>
                            {/* hyphens-none + break-normal: the browser was splitting "GitHub-mu" across
                                lines, which read as a typo on the most prominent line of the page. */}
                            <h1 className="text-4xl leading-[1.08] font-black tracking-tight text-balance hyphens-none sm:text-5xl lg:text-6xl">
                                {'Turn any GitHub profile into a Pokémon card'}
                            </h1>
                            <p className="text-muted-foreground mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
                                {
                                    'Type a username - yours or anyone’s. Their public GitHub stats are read once and printed onto a real card frame. No sign-in, nothing to fill in.'
                                }
                            </p>

                            {/* The page's primary action, and it is not the sign-in any more: the search box
                                is the product, and asking for an account before anyone has seen a card was
                                the whole problem with the old hero. Signing in is offered where it means
                                something - on a card, to claim it. */}
                            <GenerateForm />

                            {/* A real control, not a line of underlined text. The search box above
                                is the page's primary action, so this one has to read as the button
                                that lost the argument rather than as prose that happens to be
                                clickable - outline keeps the hierarchy without giving up the
                                target size. Still a plain anchor: it is a hash jump, not a visit. */}
                            <div className="mt-5">
                                <Button asChild variant="outline">
                                    <a href="#how">
                                        {'See how it works'}
                                        <ArrowRight />
                                    </a>
                                </Button>
                            </div>
                        </div>

                        <div className="hidden items-center justify-start xl:flex">
                            {showcase.slice(2, 4).map((s, i) => (
                                <FanCard
                                    key={s.login}
                                    entry={s}
                                    index={i + 2}
                                    count={fanned}
                                    fan={FAN[i + 2]}
                                    rarities={rarities}
                                    options={options}
                                    onZoom={setZoom}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Below xl the gutters are too narrow to open a gate into, so the four cards
                        close into a held hand under the search box instead - same fan, one arc
                        rather than two. Hiding them entirely would mean a phone never sees a card
                        before scrolling past the whole pitch. */}
                    <div className="mx-auto mt-12 flex w-full max-w-lg items-start justify-center xl:hidden">
                        {showcase.slice(0, 4).map((s, i) => (
                            <FanCard
                                key={s.login}
                                entry={s}
                                index={i}
                                count={fanned}
                                fan={HAND[i]}
                                rarities={rarities}
                                options={options}
                                onZoom={setZoom}
                            />
                        ))}
                    </div>
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

                        Cropped by the bottom-right corner, the same treatment and the same inset as
                        the types panel further up, so the page has one corner-ball idiom rather than
                        two. It used to sit bottom-centre, which put a moving hairline behind the
                        button and the badges - everything on this panel is centred, so the centre
                        was the one column it could not have. The corner is the only region no
                        content reaches at any width, which is what lets the wobble stay. */}
                    <LinePokeball className="-right-16 -bottom-16 -z-10 opacity-[0.10] dark:opacity-[0.14]" size="h-40 w-40" tilt="12deg" />
                    {/* Only the button says "Sign in": it is the thing being clicked, and repeating
                        it in the heading and the body reads as nagging. */}
                    <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                        {signedIn ? 'Your card is waiting' : 'Claim the card with your name on it'}
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-pretty">
                        {signedIn
                            ? 'Open your dashboard to restyle it, publish it, or copy the README embed.'
                            : 'Anyone can generate your card up there, and someone may already have. Signing in makes it yours - regenerate it, restyle it, or make it private.'}
                    </p>
                    {/* Two buttons on one row, not a button with a text link hanging under it: the
                        gallery is the other half of what an account is for, and underlined prose
                        beneath a solid button reads as a footnote rather than as the second of two
                        choices. Outline, so the primary still wins the eye; the same h-12, so the
                        pair sits on one baseline.

                        The gallery is behind the sign-in, which is what makes this a second reason
                        for a guest to press the button beside it rather than a link that dead-ends:
                        `auth` stores /cards as the intended URL, so the trip through GitHub lands
                        them there. Stacked below sm, where two of these will not share a row. */}
                    <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                        <Button asChild size="lg" className="h-12 gap-2.5 px-7 text-base">
                            <Link href={ctaHref} {...ctaProps}>
                                {!signedIn && <GithubMark />}
                                {signedIn ? 'Go to dashboard' : 'Continue with GitHub'}
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="h-12 gap-2.5 px-7 text-base">
                            <Link href="/cards">
                                {'Browse cards from other trainers'}
                                <ArrowRight />
                            </Link>
                        </Button>
                    </div>

                    {/* The objections that stop a signup, answered where the click happens rather
                        than three sections up in the FAQ. One claim per badge: run together on a
                        single line with interpuncts they read as one long phrase and neither
                        landed. Same Badge the hero opens with, so the page starts and ends on the
                        same shape. */}
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        <Badge variant="secondary" className="px-3 py-1 font-normal">
                            {'Free'}
                        </Badge>
                        <Badge variant="secondary" className="px-3 py-1 font-normal">
                            {'Public Data Only'}
                        </Badge>
                    </div>
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
            {/* Driven by the URL, not by local state: /login renders this page with showLogin set,
                so the panel survives a reload and a shared link, and Back closes it. */}
            {showLogin && !signedIn && <LoginPanel status={status} />}
        </div>
    );
}
