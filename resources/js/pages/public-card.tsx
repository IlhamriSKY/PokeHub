import AppLogoIcon from '@/components/app-logo-icon';
import { CardZoom } from '@/components/card-zoom';
import { PokeCard } from '@/components/PokeCard';
import { Button } from '@/components/ui/button';
import { resolveOverrides, type Axes } from '@/lib/cardModel';
import { useCardOptions } from '@/lib/options';
import { langColor, langType, raritiesFromOptions, rarityOf, type Profile } from '@/lib/rarities';
import { Head, Link } from '@inertiajs/react';
import { ArrowRight, Check, Link2, MapPin } from 'lucide-react';
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

/** A stat plate, outlined in the card's energy colour so the row reads as one set. */
function Stat({ label, value, accent, icon }: { label: string; value: string; accent: string; icon?: string }) {
    return (
        <div
            className="bg-muted/40 rounded-lg border px-2 py-2 text-center"
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

export default function PublicCard({ owner, card }: { owner: { name: string; slug: string; avatar: string | null }; card: CardData }) {
    const { options } = useCardOptions();
    const rarity = rarityOf(raritiesFromOptions(options), card.rarity);
    const profile: Profile = { ...card.profile, rarity: card.rarity };
    const overrides = useMemo(() => resolveOverrides(options, card.axes, rarity), [options, card.axes, rarity]);

    const [zoomed, setZoomed] = useState(false);
    const closeZoom = useCallback(() => setZoomed(false), []);
    const [copied, setCopied] = useState(false);

    const accent = langColor(profile.top_lang);
    // The card's own element(s), read back from the resolved overrides rather than re-derived, so
    // an admin-set element or dual type shows here too instead of only on the card face.
    const element = overrides.element ?? langType(profile.top_lang);
    const elements = overrides.dualType && overrides.dualType !== element ? [element, overrides.dualType] : [element];

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
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
                {/* Hairline ball behind the card - the same mark as the logo, just huge and faint.
                    Strokes rather than a filled blob: flat line art is what reads as printed. */}
                <AppLogoIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 -left-32 h-[34rem] w-[34rem] opacity-[0.05] sm:-left-24"
                    strokeWidth={1}
                />

                <div className="relative mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
                    <header className="flex justify-center">
                        <Link href="/" className="flex items-center gap-2">
                            <AppLogoIcon className="h-5 w-5" strokeWidth={5} />
                            <span className="text-xl font-black tracking-tight">
                                <span className="text-primary">Poke</span>
                                <span className="text-amber-400">Hub</span>
                            </span>
                        </Link>
                    </header>

                    {/* items-start, not items-center: the card is far taller than the details, and
                        centring left the name floating in the middle of a column of nothing. */}
                    <div className="grid items-start gap-8 sm:grid-cols-[300px_1fr]">
                        <button
                            type="button"
                            onClick={() => setZoomed(true)}
                            aria-label="View card full size"
                            className="animate-pop focus-visible:ring-ring mx-auto w-full max-w-[300px] cursor-zoom-in rounded-xl transition-transform duration-300 hover:-translate-y-2 focus-visible:ring-2 focus-visible:outline-none"
                        >
                            <PokeCard profile={profile} rarity={rarity} {...overrides} />
                        </button>

                        {/* space-y-3, not 5: the column is short items (name, species, one line of
                            bio, a stat row) and the wider gap left it reading as five detached
                            blocks rather than one profile. The rarity is on the card itself - its
                            symbol and its foil - so repeating it as a badge here said nothing new. */}
                        <div className="min-w-0 space-y-3 text-center sm:text-left">
                            <div>
                                <div className="flex items-center justify-center gap-2 sm:justify-start">
                                    <h1 className="truncate text-2xl font-bold tracking-tight">{owner.name}</h1>
                                    {/* Both types when the card is dual, in the same order the
                                        face stacks them: primary first, secondary behind it. */}
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

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <Stat label="Followers" value={compact(profile.followers)} accent={accent} />
                                <Stat label="Repos" value={compact(profile.repos)} accent={accent} />
                                <Stat label="Stars" value={compact(profile.stars)} accent={accent} />
                                {/* No icon here - the element(s) sit next to the name now, and
                                    showing the same symbol twice just made the row noisier. */}
                                <Stat label="Type" value={profile.top_lang || '—'} accent={accent} />
                            </div>

                            {profile.location && (
                                <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs sm:justify-start">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {profile.location}
                                </p>
                            )}

                            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
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
                            </div>
                        </div>
                    </div>

                    {/* Section divider: a hairline broken by a small ball, same device the landing
                        page uses between its sections. */}
                    <div aria-hidden="true" className="flex items-center gap-4">
                        <span className="bg-border h-px flex-1" />
                        <AppLogoIcon className="text-muted-foreground/50 h-5 w-5" strokeWidth={5} />
                        <span className="bg-border h-px flex-1" />
                    </div>

                    {/* The whole point of a shared card is the next person making one, so the CTA
                        is a real button rather than a text link at the bottom of the page. */}
                    <section className="pb-4 text-center">
                        <h2 className="text-lg font-bold tracking-tight">Your GitHub profile is a card too</h2>
                        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm text-pretty">
                            Sign in with GitHub and yours is generated from your public stats. No repository access.
                        </p>
                        <Button asChild size="lg" className="group mt-4 h-11 px-6">
                            <Link href="/login">
                                <AppLogoIcon className="mr-2 h-4 w-4" strokeWidth={5} />
                                Catch your own card
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
