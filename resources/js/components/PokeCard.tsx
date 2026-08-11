import { usePointerTilt } from '@/hooks/usePointerTilt';
import { avatarUrl, langType, loreOf, matchOf, type Element, type Generation, type Profile, type Rarity, type Subtype } from '@/lib/rarities';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { PcgFace, type AssetGen, type RarityMark } from './PcgFace';

// Independent axes fed into the pokecardgenerator asset faces (see PcgFace). Every
// asset-backed axis is a DB-provided URL so new options are pure admin/config work.
export type CardOverrides = {
    element?: Element; // primary type -> frame + energy symbols
    subtype?: Subtype; // stage label (Basic / Stage 1 / Stage 2)
    dualType?: Element; // second type -> diagonal split (secondary bottom-right)
    evolvesFrom?: string; // "Evolves from <name>" chip
    generation?: Generation; // which real pokecardgenerator frame set (1-gen / tcg / sv)
    iconUrl?: string; // name emblem (DB icon asset: ex/gx/v/...)
    effectUrls?: string[]; // full-card visual-effect overlays, painted in order (up to 5)
    attributeFrame?: string; // TCG Pocket "Attribute frame" border style (grey/shining/black/mega)
    tagUrl?: string; // corner tag stamp (DB tag asset)
    tagSlug?: string; // which tag -> data-tag, for per-tag size tuning in pcg.css
    firstEdition?: boolean; // Base Set "EDITION 1" stamp (1st gen only)
    badgeUrl?: string; // corner set badge (DB badge asset)
    ruleUrl?: string; // TCG Pocket "ex rule" band (DB rule asset) - tcg-gen only
    frameOverlayUrl?: string; // frame-style finish overlay (DB frame asset)
    rarityMark?: RarityMark; // bottom rarity pips (DB rarity asset x count)
    glareDr?: string; // holo finish -> data-rarity for the foil engine (DB glare)
    variant?: string; // template/variant slug (DB)
};

/**
 * A GitHub-as-Pokemon card rendered from the real pokecardgenerator WebP frames
 * (see {@link PcgFace}), with the holo shine/glare layers (holo.css) on top.
 * Pointer tilt is wired by {@link usePointerTilt}.
 *
 * @param profile     Shaped GitHub data to render.
 * @param rarity      Rarity preset (holo effect + data-rarity for the foil engine).
 * @param onActivate  Called on click/Enter, e.g. to open the card in a zoom overlay.
 * @param active      Marks this instance as the enlarged/active copy.
 * @param idle        Position in a group that tilts on its own, one card at a time.
 */
export function PokeCard({
    profile: d,
    rarity,
    onActivate,
    active,
    idle,
    element,
    subtype,
    dualType,
    evolvesFrom,
    generation,
    iconUrl,
    effectUrls,
    attributeFrame,
    tagUrl,
    tagSlug,
    firstEdition,
    badgeUrl,
    ruleUrl,
    frameOverlayUrl,
    rarityMark,
    glareDr,
    variant,
}: {
    profile: Profile;
    rarity: Rarity;
    /** Called on click/Enter with the card's on-screen rect (the zoom origin). */
    onActivate?: (rect: DOMRect) => void;
    active?: boolean;
    /** Omit for a card that only moves under the pointer. */
    idle?: { index: number; count: number };
} & CardOverrides) {
    const ref = usePointerTilt<HTMLDivElement>(idle);
    const type = element ?? langType(d.top_lang);
    const lore = loreOf(d);
    // Dual type: a distinct secondary element that splits the frame diagonally.
    const dual = dualType && dualType !== type ? dualType : undefined;
    const gen = (generation ?? '1-gen') as AssetGen;
    // Per-profile, not per-element: the amounts are era constants, so the TYPES are the only place
    // the bottom row can tell two cards apart. See matchOf.
    const match = matchOf(type as Element, d);
    // Retreat cost reads as bulk, so it comes off the public repo count: the profile signal with
    // real spread. Language count cannot drive it, since the stored list is capped at three.
    const retreat = d.repos >= 200 ? 4 : d.repos >= 75 ? 3 : d.repos >= 25 ? 2 : 1;

    // subtype -> visible stage label + a form suffix on the name.
    const st = subtype ?? rarity.sub ?? 'basic';
    const stageLabel = ['supporter', 'item', 'stadium'].includes(st)
        ? st.charAt(0).toUpperCase() + st.slice(1)
        : st === 'stage1'
          ? 'Stage 1'
          : st === 'stage2'
            ? 'Stage 2'
            : 'Basic';
    const displayName = d.name;

    /**
     * Seeds the holo engine reads for the shine/cosmos foils. Derived from the login + rarity, not
     * Math.random(): the grid card and the zoom overlay are two separate PokeCard mounts, so random
     * seeds gave the SAME card two different foil patterns the moment you enlarged it. A hash makes
     * a card look like itself everywhere, and across reloads.
     *
     * It also makes the dependency array honest - these values really are computed from the deps.
     */
    const style = React.useMemo(() => {
        const seed = `${d.login}:${rarity.key}`;
        // FNV-1a: a few lines, well spread on short strings, and stable across engines.
        let h = 0x811c9dc5;
        for (let i = 0; i < seed.length; i++) {
            h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
        }
        const unit = (n: number) => (((h >>> (n * 8)) & 0xff) + 0.5) / 256;

        return {
            ['--seedx']: unit(0),
            ['--seedy']: unit(1),
            ['--cosmosbg']: `${Math.floor(unit(2) * 734)}px ${Math.floor(unit(3) * 1280)}px`,
        } as React.CSSProperties;
    }, [d.login, rarity.key]);

    return (
        <div
            ref={ref}
            className={cn('card', 'interactive', type, `tier-${rarity.tier}`, `gen-${gen}`, active && 'active', onActivate && 'cursor-zoom-in')}
            data-rarity={glareDr || rarity.dr}
            data-supertype={rarity.sup ?? 'pokémon'}
            data-subtypes={st}
            data-variant={variant || undefined}
            data-set={rarity.set}
            data-number={rarity.num}
            // 28 holo.css selectors gate the Trainer Gallery etch on this. Without it the
            // tg / tgv / tgvmax / tgsecret presets render pixel-identical to their base
            // rarity. Upstream derives it from the card number (/^[tg]g/i); we carry an
            // explicit `tg` flag on the preset instead, so read that.
            data-trainer-gallery={rarity.tg ? 'true' : undefined}
            style={style}
            onClick={onActivate ? (e) => onActivate(e.currentTarget.getBoundingClientRect()) : undefined}
        >
            <div className="card__translater">
                <div
                    className="card__rotator"
                    tabIndex={0}
                    role={onActivate ? 'button' : undefined}
                    aria-label={`${displayName}, ${rarity.label}`}
                    onKeyDown={(e) => {
                        if (onActivate && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            onActivate(ref.current!.getBoundingClientRect());
                        }
                    }}
                >
                    <div className="card__front">
                        <PcgFace
                            gen={gen}
                            d={d}
                            type={type as Element}
                            dual={dual}
                            lore={lore}
                            stageLabel={stageLabel}
                            subtype={st}
                            displayName={displayName}
                            retreat={retreat}
                            match={match}
                            evolvesFrom={evolvesFrom}
                            iconUrl={iconUrl}
                            effectUrls={effectUrls}
                            attributeFrame={attributeFrame}
                            tagUrl={tagUrl}
                            tagSlug={tagSlug}
                            firstEdition={firstEdition}
                            badgeUrl={badgeUrl}
                            ruleUrl={ruleUrl}
                            frameOverlayUrl={frameOverlayUrl}
                            rarityMark={rarityMark}
                            variant={variant}
                        />
                        <div className="card__shine" />
                        <div className="card__glitter" />
                        <div className="card__glare" />
                        <div className="card__glare2" />
                        {/* TCG Pocket stage chrome is rendered HERE, after the foil, on purpose.
                            The holo must only cover the MAIN artwork, but `.pcg` creates its own
                            stacking context (transform-style: preserve-3d), so nothing inside the
                            face can paint above `.card__shine` (z-index 3) - neither translateZ
                            (card__front has overflow:hidden, which flattens 3D so Z is ignored)
                            nor a child z-index (trapped in .pcg's context). Being a SIBLING that
                            comes later is the only thing that actually works. */}
                        {gen === 'tcg-gen' &&
                            (st === 'stage1' || st === 'stage2') &&
                            !['full-art', 'trainer', 'trainer-full-art'].includes(variant ?? '') && (
                                <div className={`pcg gen-tcg-gen is-stage pcg-chrome-layer ${evolvesFrom ? '' : 'no-evo'}`}>
                                    {/* Original pokecardgenerator chrome (stage1/stage2.webp): its octagon
                                    well is an OPAQUE pearl placeholder, so the avatar sits ON TOP of the
                                    chrome and marking.png masks it to the octagon (see pcg.css
                                    .gen-tcg-gen.is-stage .pcg-evolve-photo). The masked photo covers the
                                    pearl; the chrome's silver rim frames it. Above the holo because the
                                    whole chrome layer paints after the foil. */}
                                    <img className="pcg-stage-chrome" src={`/img/pcg/tcg-gen/${st}.webp`} alt="" />
                                    <div className="pcg-evolve-photo" style={{ backgroundImage: `url(${avatarUrl(d.avatar, 96)})` }} />
                                    <span className="pcg-stage">{stageLabel}</span>
                                    {evolvesFrom && (
                                        <div className="pcg-evolve">
                                            <span>
                                                <em>Evolves from</em>
                                                <b>{evolvesFrom}</b>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
}
