# Parity with pokecardgenerator.com

Audit of 2026-08-10. Everything below was measured rather than eyeballed. The reference draws its
card to a single `<canvas>`, so each element's box was obtained by blanking a field, snapshotting,
refilling and diffing the pixels. Anchors were confirmed by measuring two different string lengths
and checking that they share an edge.

## How to re-measure

The reference is an Ark UI app, and its dropdowns portal the listbox to `<body>`, so the trigger is
not an ancestor of the option and `closest()` always fails. Pair them by id instead:

```
item.closest('[data-part="content"]').id   ->  "select:_r_X_:content"
document.getElementById(id.replace(/:content$/, ':trigger')).click()   // open it
item.click()                                                          // then pick
```

The hidden `<select name=...>` elements are mirrors only; setting `.value` does not drive the app.
For controls with no text field, such as HP, nudge the stepper and diff.

The card sits at x326 y148, 544x762 inside the 1196x1058 canvas. For strings with no descenders the
ink bottom is the baseline, which is what makes the CSS here comparable.

## Positions matched

| Generation | Verified against reference |
|---|---|
| 1-gen | name baseline 10.45 (ref 10.50, within the ±0.13% one-pixel precision), HP right edge 82.17 exact, Basic and Stage share one baseline as upstream does |
| tcg-gen | name baseline 7.481 (ref 7.48), dex centre 49.018 (ref 49.02), tag box pinned to R97.13 ≤30.68 wide, rarity band 91.73 to 94.63, Trainer name 4.78 / HP 93.01 / NO. 91.73, Full Art name 18.57 and type disc 87.11 to 93.60 |
| scarlet-violet | name 19.2 / baseline 7.61, HP right 85.49 / ink 8.27, dex centre 48.69, rarity 5.15 / 94.75, weakness row centred 87.54, photo window and all four foil clips |

## Options matched

- **1-gen**: no Frame, Icon, Tag or Badge control, which is what the reference offers there too.
- **tcg-gen**: 4 templates, 13 frames, 11 types, 10 duals, 15 icons, 6 tags, 7 badges, 11 rarity pips.
- **scarlet-violet**: 6 templates, 10 types, and a dual list that drops Dark to match the reference.
- **Visual effects**: the reference stacks up to 5. The card face can paint several, but a saved
  card stores one slug, so the settings panel offers one. See the note in `resolveOverrides`.
- **Attribute frame** (tcg-gen: grey, shining, black, mega): built in CSS rather than shipped as
  art. Switching styles repaints only about 11% of the pixels inside L7.17-92.83%, T8.79-50.66%,
  so it is a decorative border around the art window and the attribute strip, not a layer. It lives
  in `ATTRIBUTE_FRAMES` (`cardModel.ts`) and `.pcg-attr-frame` (`pcg.css`).

## Options not matched, and why

Every remaining gap needs an image asset that is not in this repo. No CSS can synthesise a frame
whose file does not exist, and copying more of the reference's artwork into a GPL-3.0 project is a
licensing decision for the project owner rather than a default.

| Gap | Generation | Needs |
|---|---|---|
| Frame styles (grey / gold / stellar / rare) | scarlet-violet | 4 border assets |
| Era (ancient / future / tera) | scarlet-violet | era frame art |
| 12 rarity marks | scarlet-violet | rarity icons. Some are geometric primitives and could be drawn in CSS; ace-spec, illustration-rare and amazing-rare are not |
| Overlay | scarlet-violet | Artwork rather than a tint, verified 2026-08-10: picking an overlay type repaints the whole card (L4.04-96.14%, T2.89-97.24%, roughly 200k px), so it is one full-card layer per type. 10 assets, the same class as the frames |
| Fairy as a dual type | scarlet-violet | `basic-fairy.webp`. Without it the diagonal falls back to the grey `normal` frame |
| Mega card | tcg-gen | frame art |

This repo ships 21 scarlet-violet assets: 10 type frames and 11 energy symbols.

## Where the checks live

`resources/js/lib/cardModel.check.ts` holds the coverage assertions for `resolveOverrides` and
`rollAxes`. There is no JS test runner in this project, so it is run directly:

```bash
npx esbuild resources/js/lib/cardModel.check.ts --bundle --platform=node \
  --alias:@=./resources/js --outfile=/tmp/check.mjs --format=esm && node /tmp/check.mjs
```

The admin card lab (`/admin/lab`) renders every option against a real card, which is how the tag
over-sizing, the empty stage bar, the Supporter plate on an Item and the `--clip-invert` bugs were
found.
