import { avatarUrl, cardHp, fmt, resistanceAmount, weaknessAmount, type Element, type Lore, type Profile } from '@/lib/rarities';

/** Generations that render from real pokecardgenerator WebP frame assets. */
export type AssetGen = '1-gen' | 'tcg-gen' | 'scarlet-violet';

// PokeHub element -> pokecardgenerator asset basename.
const BASE: Record<Element, string> = {
    colorless: 'normal',
    grass: 'grass',
    fire: 'fire',
    water: 'water',
    lightning: 'electric',
    psychic: 'psychic',
    fighting: 'fighting',
    darkness: 'dark',
    metal: 'steel',
    dragon: 'dragon',
    fairy: 'fairy',
};
// Which type frames/symbols each generation actually ships (rest fall back to "normal").
const FRAMES: Record<AssetGen, Set<string>> = {
    '1-gen': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal']),
    'tcg-gen': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal', 'dark', 'dragon', 'steel', 'fairy']),
    'scarlet-violet': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal', 'dark', 'dragon', 'steel']),
};
const SYMBOLS: Record<AssetGen, Set<string>> = {
    '1-gen': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal', 'dark', 'steel']),
    'tcg-gen': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal', 'colorless', 'dark', 'dragon', 'steel', 'fairy']),
    'scarlet-violet': new Set(['fire', 'grass', 'water', 'electric', 'psychic', 'fighting', 'normal', 'colorless', 'dark', 'dragon', 'fairy']),
};
// The `generation` option is DB-driven, but RENDERING a generation is bound by code and
// shipped assets (the /img/pcg/<gen> dir, the frameUrl naming split below, bakedPrimary,
// the 1-gen trainer template, and ~97 .gen-* geometry rules in pcg.css). So a generation
// row added in the admin UI that has no code support must degrade, not crash: without the
// `??` fallback `FRAMES[gen]` is undefined and `.has()` throws a TypeError -> white screen.
const framesFor = (gen: AssetGen) => FRAMES[gen] ?? FRAMES['tcg-gen'];
const symbolsFor = (gen: AssetGen) => SYMBOLS[gen] ?? SYMBOLS['tcg-gen'];
const frameName = (gen: AssetGen, t: Element) => (framesFor(gen).has(BASE[t]) ? BASE[t] : 'normal');
// Prefer the raw element key when the gen ships that symbol (only `colorless` differs from its BASE
// alias): the retreat cost must use the grey colorless energy, not `normal`, on tcg / sv. 1-gen has no
// colorless symbol, so it still falls back through BASE['colorless']='normal'.
const symbolName = (gen: AssetGen, t: Element) => (symbolsFor(gen).has(t) ? t : symbolsFor(gen).has(BASE[t]) ? BASE[t] : null);

/**
 * Does this generation actually ship a frame for this element?
 * FRAMES is the on-disk truth (verified against public/img/pcg/<gen>), so this is what the
 * Element picker must filter on: an element with no frame silently renders the normal one.
 * NOTE: deliberately keyed off FRAMES, not SYMBOLS -- the two sets differ on purpose.
 * SYMBOLS is a superset (1-gen ships dark/steel symbols with no dark/steel frame) because
 * the weakness/resistance row renders emblems for types that are not selectable as a frame.
 */
export const elementHasFrame = (gen: AssetGen, element: string) => framesFor(gen).has(BASE[element as Element]);

/**
 * The energy disc for `t`, borrowing from tcg-gen when this generation ships none.
 *
 * The old fallback was the string 'normal', which does not mean "no art" - it means COLORLESS. So
 * a Metal card on Scarlet & Violet (a real, selectable type: `basic-steel.webp` exists, but
 * `scarlet-violet/steel.webp` does not) printed a colourless disc in its header socket, and a
 * Dragon or Fairy weakness on Base Set printed one in the weakness row. Wrong element beats
 * missing element for nobody. tcg-gen is the only complete symbol set, and the reference borrows
 * across generations the same way - it fetches `tcg-gen/water.webp` while rendering an SV card.
 */
const energyUrl = (gen: AssetGen, t: Element): string => {
    for (const g of [gen, 'tcg-gen' as AssetGen]) {
        const name = symbolName(g, t);
        if (name) return `/img/pcg/${g}/${name}.webp`;
    }

    return `/img/pcg/${gen}/normal.webp`;
};
/**
 * 1st gen ships TWO frames per type: `<type>-basic.webp` and `<type>-stage.webp`. The stage
 * art bakes the gold sunburst pre-evolution box + the "evolves from" rule into the header.
 * Stage 1 and Stage 2 SHARE that one asset -- pokecardgenerator has no per-stage frame beyond
 * the pair (probed: `<type>-stage1.webp` 404s), only the stage label text differs.
 * tcg-gen/scarlet-violet ship no stage art, so they keep their single `basic-<type>.webp`.
 */
const frameUrl = (gen: AssetGen, t: Element, stage = false) =>
    gen === '1-gen' ? `/img/pcg/1-gen/${frameName(gen, t)}-${stage ? 'stage' : 'basic'}.webp` : `/img/pcg/${gen}/basic-${frameName(gen, t)}.webp`;

/** The subtypes that render on the 1st-gen evolution frame. */
const STAGE_SUBTYPES = new Set(['stage1', 'stage2']);

type Match = { weak: Element; resist?: Element };

/** A rarity pip: the DB asset URL repeated `count` times. */
export type RarityMark = { url: string; count: number };

/**
 * A card face rendered from the real pokecardgenerator frame WebPs, with the
 * card content driven by GitHub + AI data (name, followers as HP, avatar as the
 * artwork, AI attacks). Dual type reveals the secondary frame on a diagonal.
 */
export function PcgFace({
    gen,
    d,
    type,
    dual,
    lore,
    stageLabel,
    subtype,
    displayName,
    retreat,
    match,
    evolvesFrom,
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
    variant,
}: {
    gen: AssetGen;
    d: Profile;
    type: Element;
    dual?: Element;
    lore: Lore;
    stageLabel: string;
    subtype?: string; // drives the 1st-gen basic/stage frame swap
    displayName: string;
    retreat: number;
    match: Match;
    evolvesFrom?: string;
    iconUrl?: string; // name emblem (DB icon asset, e.g. ex/gx/v)
    /* Full-card visual-effect overlays (DB effect assets), painted in order. A LIST because the
       reference offers "Visual Effects (Up to 5)" and stacks them; each layer is screen-blended so
       they compose. */
    effectUrls?: string[];
    /* TCG Pocket "Attribute frame": a decorative BORDER around the art window + attribute strip,
       drawn on canvas upstream rather than composited from a file, so we reproduce it in CSS. */
    attributeFrame?: string;
    tagUrl?: string; // corner tag stamp (DB tag asset)
    tagSlug?: string; // -> data-tag, so one tag's size can be nudged without touching the rest
    firstEdition?: boolean; // Base Set "EDITION 1" stamp - 1st gen only, on Regular AND Trainer
    badgeUrl?: string; // corner set badge (DB badge asset)
    ruleUrl?: string; // TCG Pocket "ex rule" band (DB rule asset) - tcg-gen only
    frameOverlayUrl?: string; // frame-style finish overlay (DB frame asset)
    rarityMark?: RarityMark; // bottom rarity pips (DB rarity asset x count)
    variant?: string; // template slug (DB) - "trainer" swaps to the Trainer face
}) {
    const Emblem = ({ t }: { t: Element }) => <img className="pcg-emblem" src={energyUrl(gen, t)} alt={t} />;
    // Stage 1/2 on 1st gen swap to the evolution frame, which BAKES the sunburst pre-evo box
    // into the top-left of the name band. The name has to shift right to clear it whether or
    // not an "evolves from" name was given -- so the layout keys off the stage, not off
    // `evolvesFrom` (which only fills the baked box in). `is-stage` drives that in pcg.css.
    // Keyed off the SUBTYPE only, not the generation: TCG Pocket also needs it (its frames bake
    // the word "BASIC", so a Stage card must get the chrome overlay + a real label). Safe for the
    // other gens - `frameUrl` ignores the stage flag unless gen==='1-gen', and only the gen-scoped
    // `.gen-1-gen.is-stage` / `.gen-tcg-gen.is-stage` rules read the class.
    const isStage = STAGE_SUBTYPES.has(subtype ?? '');
    // Base Set "EDITION 1" stamp. Only 1st gen has the art (and upstream only offers the switch
    // there), but it appears on BOTH the Regular and Trainer faces -- at different spots, which
    // `.gen-1-gen.pcg-trainer .pcg-first-edition` re-anchors.
    const FirstEdition = () =>
        gen === '1-gen' && firstEdition ? <img className="pcg-first-edition" src="/img/pcg/1-gen/first-edition.webp" alt="1st edition" /> : null;
    // Frames that BAKE the primary type emblem into the art, so overlaying it in the name row
    // just produces a second disc peeking out from behind. Only the dual overlays are drawn on
    // these, sized to fully COVER the baked badge. SV still overlays its own.
    //
    // tcg-gen is in this list for the name-row rule but is NOT actually baked (only
    // basic-steel.webp is - see the single-type overlay further down, which every tcg card now
    // gets). It stays because the tcg disc belongs in an absolutely-positioned corner box, not in
    // the flex row next to HP: `.pcg-head` stops at right:14%, so the row cannot reach the badge's
    // real position at x87.1-93.6%.
    const bakedPrimary = gen === '1-gen' || gen === 'tcg-gen';

    // 1st-gen TRAINER template (pokecardgenerator's Base Set trainer): a distinct
    // frame with just a name + artwork + effect text - no HP / attacks / weakness.
    if (gen === '1-gen' && variant === 'trainer') {
        return (
            <div className="pcg gen-1-gen pcg-trainer">
                <img className="pcg-photo" src={avatarUrl(d.avatar, 360)} alt={d.login} loading="lazy" />
                <img className="pcg-frame" src="/img/pcg/1-gen/trainer.webp" alt="" />
                {effectUrls?.map((u, i) => <img key={`${u}-${i}`} className="pcg-effect" src={u} alt="" />)}
                <span className="pcg-trainer-name">{displayName}</span>
                {/* A real Base Set Trainer has NO attacks -- just rules/effect text. The
                    attacks were being rendered here as pseudo-effect lines ("Kernel Panic.
                    ..."), which read as skills and contradicted this template's own intent.
                    The flavor alone is the effect text now, and it is budgeted longer
                    (GithubCardService::aiGenerate) to fill the plate that freed up. */}
                <div className="pcg-trainer-text">
                    <p className="pcg-trainer-flavor">{lore.effect || lore.flavor}</p>
                </div>
                <span className="pcg-trainer-dex">
                    NO.{d.join_year ?? '0000'} · {d.top_lang || type} · {fmt(d.repos)} REPOS · {fmt(d.stars)} STARS
                </span>
                <FirstEdition />
                {tagUrl && <img className="pcg-tag" data-tag={tagSlug} src={tagUrl} alt="" />}
                {rarityMark && (
                    <div className="pcg-rarity">
                        {Array.from({ length: rarityMark.count }).map((_, i) => (
                            <img key={i} src={rarityMark.url} alt="" />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // TCG Pocket TRAINER templates (Trainer + Trainer Full Art). A trainer card has no type / HP /
    // attacks / weakness -- just a name, artwork and rules text. Frames are real pokecardgenerator
    // assets: trainer-<sub>.webp (windowed: photo window x8.8-91% y14.6-51.3%, rules area below) for
    // Trainer, or trainer-full-art.webp (a holo border with a transparent centre -> full-bleed art)
    // for Trainer Full Art. The trainer sub-type (Supporter/Item/Stadium/Tool) rides the subtype axis.
    if (gen === 'tcg-gen' && (variant === 'trainer' || variant === 'trainer-full-art')) {
        const fa = variant === 'trainer-full-art';
        const trSub = ['supporter', 'item', 'stadium', 'tool'].includes(subtype ?? '') ? subtype : 'supporter';
        const trSubLabel = (trSub ?? 'supporter').charAt(0).toUpperCase() + (trSub ?? 'supporter').slice(1);
        const trFrame = fa ? '/img/pcg/tcg-gen/trainer-full-art.webp' : `/img/pcg/tcg-gen/trainer-${trSub}.webp`;
        return (
            <div className={`pcg gen-tcg-gen pcg-tcg-trainer ${fa ? 'is-fullbleed tcg-tr-fa' : ''}`}>
                <img className="pcg-photo" src={avatarUrl(d.avatar, 360)} alt={d.login} loading="lazy" />
                <img className="pcg-frame" src={trFrame} alt="" />
                {effectUrls?.map((u, i) => <img key={`${u}-${i}`} className="pcg-effect" src={u} alt="" />)}
                {/* Trainer Full Art's holo-border asset has a transparent centre (no baked header/footer),
                    so we composite pokecardgenerator's OWN trainer-full-art pieces over the art: the silver
                    "TRAINER" header band + the "Supporter" label plate + the two gold side rails. The regular
                    trainer frame bakes these in, hence fa-only. */}
                {fa && (
                    <>
                        <img className="pcg-tr-fa-side pcg-tr-fa-side-l" src="/img/pcg/tcg-gen/trainer-supporter-left-side.webp" alt="" />
                        <img className="pcg-tr-fa-side pcg-tr-fa-side-r" src="/img/pcg/tcg-gen/trainer-supporter-right-side.webp" alt="" />
                        <img className="pcg-tr-fa-header" src="/img/pcg/tcg-gen/trainer-supporter-header-full-art.webp" alt="" />
                        {/* The label plate is the ONE kind-specific piece, and upstream only ships it for
                            Supporter (there is no trainer-item-icon.webp / -stadium- / -tool-). It used to
                            render unconditionally, so a Full Art ITEM card was labelled "Supporter" - the
                            side rails and the "TRAINER" band are kind-agnostic, this is not. Same gate the
                            supporter rule bar below already uses. */}
                        {trSub === 'supporter' && (
                            <img className="pcg-tr-fa-sup" src="/img/pcg/tcg-gen/trainer-supporter-icon.webp" alt={trSubLabel} />
                        )}
                    </>
                )}
                {/* name is a big LEFT-aligned title on its own row below the "Supporter | TRAINER"
                    header, with HP on the right -- exactly like pokecardgenerator's trainer layout. */}
                <span className="pcg-tr-name">{displayName}</span>
                <span className="pcg-tr-hp">
                    <small>HP</small> {fmt(d.followers)}
                </span>
                <div className="pcg-tr-text">
                    <p>{lore.effect || lore.flavor}</p>
                </div>
                {/* No STARS on the trainer face: its frame bakes a coloured footer band starting at
                    x32%, leaving only 6.25-32% of light strip for this line. The full four-fact
                    string measures 36.9% of card width - it ran straight onto the band, which is
                    why "252k STARS" sat on the orange. Dropping the last fact measures 23.64% and
                    fits with room to spare; shrinking to fit instead would need 0.698x (~3.6px).
                    The stars figure still shows on every Pokemon face. */}
                <span className="pcg-tr-dex">
                    NO.{d.join_year ?? '0000'} · {d.top_lang || type} · {fmt(d.repos)} REPOS
                </span>
                {/* Orange supporter rule bar (baked into the regular trainer frame; the real footer asset
                    over the art for fa, with the rule text drawn on top). */}
                {fa && trSub === 'supporter' && (
                    <div className="pcg-tr-rule">
                        <img className="pcg-tr-rule-bg" src="/img/pcg/tcg-gen/trainer-supporter-footer.webp" alt="" />
                        <p>You may play only 1 Supporter card during your turn.</p>
                    </div>
                )}
                {tagUrl && <img className="pcg-tag" data-tag={tagSlug} src={tagUrl} alt="" />}
                {badgeUrl && <img className="pcg-badge" src={badgeUrl} alt="" />}
                {rarityMark && (
                    <div className="pcg-rarity">
                        {Array.from({ length: rarityMark.count }).map((_, i) => (
                            <img key={i} src={rarityMark.url} alt="" />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // TCG Pocket FULL ART (Pokemon): full-bleed artwork + the holo `full-art.webp` border (transparent
    // centre), with the normal Pokemon content painted over the art. Not a type-coloured frame, so the
    // dual-type second frame does not apply.
    const tcgFullArt = gen === 'tcg-gen' && variant === 'full-art';

    return (
        <div className={`pcg gen-${gen} ${dual ? 'has-dual' : ''} ${isStage ? 'is-stage' : ''} ${tcgFullArt ? 'is-fullbleed tcg-full-art' : ''}`}>
            {/* avatar sits BEHIND the frame; the frame's photo window is transparent */}
            <img className="pcg-photo" src={avatarUrl(d.avatar, 360)} alt={d.login} loading="lazy" />
            <img className="pcg-frame" src={tcgFullArt ? '/img/pcg/tcg-gen/full-art.webp' : frameUrl(gen, type, isStage)} alt="" />
            {dual && !tcgFullArt && <img className="pcg-frame pcg-frame2" src={frameUrl(gen, dual, isStage)} alt="" />}
            {frameOverlayUrl && <img className="pcg-frame pcg-frame-overlay" src={frameOverlayUrl} alt="" />}
            {/* TCG Pocket bakes the word "BASIC" into every `basic-<type>.webp`, so a Stage card
                would still read BASIC. Upstream covers it with a blank chrome overlay
                (`stage1.webp` = blank pill + pre-evolution octagon + "evolves from" bar) and draws
                the stage text itself. stage1/stage2 are byte-identical upstream, hence one asset.
                Sits after the frames (so it hides the baked pill) but before the effect/text. */}
            {/* Basic only. A tcg STAGE card gets its chrome from the overlay PokeCard renders
                after the foil layers - nothing inside `.pcg` can paint above the holo. */}
            {gen === 'tcg-gen' && !isStage && <img className="pcg-stage-chrome" src="/img/pcg/tcg-gen/basic.webp" alt="" />}
            {/* Attribute frame: a CSS border on the measured rect, not an asset (see cardModel). */}
            {attributeFrame && <div className="pcg-attr-frame" data-style={attributeFrame} />}
            {effectUrls?.map((u, i) => <img key={`${u}-${i}`} className="pcg-effect" src={u} alt="" />)}

            {!(gen === 'tcg-gen' && isStage) && <span className="pcg-stage">{stageLabel}</span>}
            {/* name + HP live in one wrapper so a gen can lay them out as a single
                baseline-aligned row (1-gen does; `.pcg-head` is display:contents
                elsewhere, so every other gen keeps its own absolute positions). */}
            <div className="pcg-head">
                <span className="pcg-name">
                    <span className="pcg-name-txt">{displayName}</span>
                    {iconUrl && <img className="pcg-name-emblem" src={iconUrl} alt="" />}
                </span>
                <div className="pcg-topright">
                    <span className="pcg-hp">
                        {gen === '1-gen' ? (
                            <>
                                <b>{cardHp(d)}</b>
                                <small>HP</small>
                            </>
                        ) : (
                            <>
                                <small>HP</small>
                                <b>{cardHp(d)}</b>
                            </>
                        )}
                    </span>
                </div>
            </div>
            {/* Type discs are placed absolutely for EVERY gen, never as items in the HP row.
          pokecardgenerator shows dual types as two discs STACKED in that corner - the
          primary in front, the secondary tucked behind it toward the edge - and 1-gen /
          tcg additionally have to cover a disc baked into their frame art. */}
            {dual && (
                <>
                    <img className="pcg-emblem pcg-dual-sec" src={energyUrl(gen, dual)} alt={dual} />
                    <img className="pcg-emblem pcg-dual-pri" src={energyUrl(gen, type)} alt={type} />
                </>
            )}
            {/* Every single-type tcg card draws its disc here, NOT just Full Art.
                `bakedPrimary` claimed all of tcg-gen bakes the disc into `basic-<type>.webp`, but
                that was generalised from one sample. Sampling the measured badge box
                (x87.1-93.6%, y2.77-7.5%) across all twelve frames: only basic-steel.webp has a
                dark ring there (min luminance 0). water 161, grass 167, electric 186, dragon 165,
                fire 142, fighting 154, psychic 110, normal 202 - all flat frame colour, no disc.
                So ten of twelve types were rendering with NO element badge at all. The overlay is
                sized to swallow steel's baked one, so it is correct on every frame. Dual covers
                itself above; full-art.webp is a transparent-centre border and bakes nothing. */}
            {gen === 'tcg-gen' && !dual && <img className="pcg-emblem pcg-tcg-emblem" src={energyUrl(gen, type)} alt={type} />}
            {/* Scarlet & Violet bakes NO disc - its frame punches a transparent circular SOCKET in
                the header (measured on all ten basic-*.webp: a disc at cx91.6% cy6.10%, 7.31% of
                the card wide, alpha 0 inside). This emblem is what fills that hole. It used to be
                an item inside `.pcg-topright`, whose right edge is measured on the HP's own ink at
                14.52% - so the disc rendered ~10% of the card width LEFT of the socket, leaving the
                hole showing the artwork through it and shunting HP off its mark at the same time. */}
            {!bakedPrimary && !dual && <img className="pcg-emblem pcg-sv-emblem" src={energyUrl(gen, type)} alt={type} />}

            {/* Pre-evolution well. The 1st-gen stage frames BAKE an empty sunburst box, so fill it
                with the card's own avatar even when no "evolves from" name was given -- an empty
                box reads as unfinished. The name line still only shows when a pre-evolution was
                actually named. Other gens keep the old behaviour (chip only when a name exists). */}
            {((gen === '1-gen' && isStage) || (evolvesFrom && !(gen === 'tcg-gen' && isStage))) && (
                <div className="pcg-evolve">
                    <img src={avatarUrl(d.avatar, 64)} alt="" />
                    {evolvesFrom && (
                        <span>
                            <em>Evolves from</em>
                            <b>{evolvesFrom}</b>
                        </span>
                    )}
                </div>
            )}

            {/* The raw follower count lives here now that HP prints a real card value. */}
            <span className="pcg-species">
                NO.{d.join_year ?? '0000'} · {d.top_lang || type} · {fmt(d.followers)} FOLLOWERS
                {/* TCG Pocket shows the same full dex line as 1st gen, STARS included. */}
                {gen !== 'scarlet-violet' && <> · {fmt(d.stars)} STARS</>}
            </span>

            <div className="pcg-attacks">
                {lore.attacks.slice(0, 2).map((a, i) => {
                    const n = Math.max(1, Math.min(4, Number(a.cost) || 2));
                    return (
                        <div className="pcg-atk" key={i}>
                            <span className="pcg-cost">
                                {Array.from({ length: n }).map((_, j) => (
                                    <Emblem key={j} t={type} />
                                ))}
                            </span>
                            <span className="pcg-atkname">{a.name}</span>
                            <span className="pcg-dmg">{a.damage}</span>
                            <p className="pcg-atkdesc">{a.desc}</p>
                        </div>
                    );
                })}
            </div>

            {/* On a real ex card the "ex rule" band takes the flavor slot, so swap rather than stack. */}
            {ruleUrl ? <img className="pcg-rule" src={ruleUrl} alt="" /> : <p className="pcg-flavor">{lore.flavor}</p>}

            {/* Full Art has no baked frame, so it keeps the regular card's silver weakness/retreat
                pills via bottom-card-no-name.webp (the words + emblems are drawn over it below). */}
            {tcgFullArt && <img className="pcg-fa-bottom" src="/img/pcg/tcg-gen/bottom-card-no-name.webp" alt="" />}
            {/* Weakness / Resistance / Retreat. The "weakness"/"retreat" words are baked into the frame on
                a normal card, so the .pcg-wrr-lbl labels only show for full-art (where no frame bakes them). */}
            <div className="pcg-wrr">
                <span>
                    <span className="pcg-wrr-lbl">weakness</span>
                    <Emblem t={match.weak} />
                    <span className="pcg-wk-amt">{weaknessAmount(gen)}</span>
                </span>
                <span>
                    {match.resist ? (
                        <>
                            <Emblem t={match.resist} />
                            {resistanceAmount()}
                        </>
                    ) : (
                        '—'
                    )}
                </span>
                <span>
                    <span className="pcg-wrr-lbl">retreat</span>
                    {Array.from({ length: retreat }).map((_, j) => (
                        <Emblem key={j} t={'colorless'} />
                    ))}
                </span>
            </div>

            <FirstEdition />
            {tagUrl && <img className="pcg-tag" data-tag={tagSlug} src={tagUrl} alt="" />}
            {badgeUrl && <img className="pcg-badge" src={badgeUrl} alt="" />}
            {rarityMark && (
                <div className="pcg-rarity">
                    {Array.from({ length: rarityMark.count }).map((_, i) => (
                        <img key={i} src={rarityMark.url} alt="" />
                    ))}
                </div>
            )}
        </div>
    );
}
