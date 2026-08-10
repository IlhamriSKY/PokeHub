# Parity with pokecardgenerator.com

Audit of 2026-08-10. Everything below was **measured**, not eyeballed: the reference draws its card
to a single `<canvas>`, so each element's box was obtained by blanking a field, snapshotting,
refilling and diffing the pixels. Anchors were confirmed by measuring two different string lengths
and checking they share an edge.

## How to re-measure (this is the part that is easy to lose)

The reference is an Ark UI app and its dropdowns **portal the listbox to `<body>`**, so the trigger
is not an ancestor of the option — `closest()` always fails. Pair them by id instead:

```
item.closest('[data-part="content"]').id   ->  "select:_r_X_:content"
document.getElementById(id.replace(/:content$/, ':trigger')).click()   // open it
item.click()                                                          // then pick
```

The hidden `<select name=...>` elements are **mirrors only** — setting `.value` does not drive the
app. For controls with no text field (HP), nudge the +/- stepper and diff.

Card sits at **x326 y148, 544x762** inside the 1196x1058 canvas. For strings with no descenders the
ink bottom **is** the baseline, which is what makes our CSS comparable.

## Positions — matched

| Generation | Verified against reference |
|---|---|
| 1-gen | name baseline 10.45 (ref 10.50, within the ±0.13% one-pixel precision), HP right edge 82.17 exact, Basic and Stage share one baseline as upstream does |
| tcg-gen | name baseline 7.481 (ref 7.48), dex centre 49.018 (ref 49.02), tag box pinned to R97.13 ≤30.68 wide, rarity band 91.73–94.63, Trainer name 4.78 / HP 93.01 / NO. 91.73, Full Art name 18.57 + type disc 87.11–93.60 |
| scarlet-violet | name 19.2 / baseline 7.61, HP right 85.49 / ink 8.27, dex centre 48.69, rarity 5.15 / 94.75, W/R/R centred 87.54, photo window and all four foil clips |

## Options — matched

- **1-gen**: no Frame, Icon, Tag or Badge control — the reference offers none of them there either.
- **tcg-gen**: 4 templates, 13 frames, 11 types, 10 duals, 15 icons, 6 tags, 7 badges, 11 rarity pips.
- **scarlet-violet**: 6 templates, 10 types; dual list drops Dark, matching the reference.
- **Visual effects**: up to 5 stacked, matching the reference's "Visual Effects (Up to 5)".

## Options — NOT matched, and why

Every remaining gap needs an **image asset that is not in this repo**. No CSS can synthesise a frame
whose file does not exist, and copying more of the reference's artwork into a GPL-3.0 project is a
licensing decision for the project owner, not something to do by default.

| Gap | Generation | Needs |
|---|---|---|
| Frame styles (grey / gold / stellar / rare) | scarlet-violet | 4 border assets |
| Era (ancient / future / tera) | scarlet-violet | era frame art |
| 12 rarity marks | scarlet-violet | rarity icons (some are geometric primitives and could be drawn in CSS; ace-spec / illustration-rare / amazing-rare are not) |
| Overlay | scarlet-violet | **verified 2026-08-10: artwork, not a tint.** Picking an overlay type repaints the whole card (L4.04–96.14%, T2.89–97.24%, ~200k px), so it is a full-card layer per type — 10 assets, same class as the frames. Not CSS-closable. |
| Fairy as a dual type | scarlet-violet | `basic-fairy.webp`; without it the diagonal falls back to the grey `normal` frame |
| Attribute frame (grey / shining / black / mega) | tcg-gen | **NOT asset-blocked — this one is buildable.** Measured 2026-08-10: switching grey→black repaints only ~11% of the pixels inside **L7.17–92.83%, T8.79–50.66%**, i.e. it is a thin decorative BORDER around the art window plus the attribute strip, not a filled layer or artwork. Reproduce as a CSS border/outline on that rect in four styles. Remaining work: sample each style's colours (grey and black are flat; shining and mega will need gradients), add an `attributeFrame` DB category + axis to both UIs, `resolveOverrides`, `CardOverrides`, a `.pcg-attr-frame` element in PcgFace, and the CSS. |
| Mega card | tcg-gen | frame art |

We ship 21 scarlet-violet assets: 10 type frames plus 11 energy symbols.

## Deliberately not aligned

`SHOW_EX_RULE = false` in `pages/card.tsx` hides the ex rule band. It is off **at the owner's
request**, not by oversight. Flip the flag to restore it; its position is still unmeasured because
the band does not render in any reference state reached so far (the Mega switch is not the trigger —
try selecting an ex **icon**).

## Where the checks live

`resources/js/lib/labScenarios.ts` builds every scenario from the DB options; the coverage
assertions are in `resources/js/lib/cardModel.check.ts` (run with esbuild + node, no test runner).
`/lab/1-gen`, `/lab/tcg-gen`, `/lab/scarlet-violet` render every option at once — that is how the
tag over-sizing, the empty stage bar, the Supporter-plate-on-Item and the `--clip-invert` bugs were
all found.
