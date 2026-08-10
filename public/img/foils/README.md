# Foil / mask etch textures

Two different things live here:

- `*.webp` in this folder — per-card **etch** textures read by `--foil` / `--mask`.
- `151/` — the **iridescent / noise tiles** read by `--iri1`, `--iri7`, `--iri8`, `--iri9`,
  `--noise`, `--noise-over`, `--birthday-dank`, `--birthday-dank2`.

## `151/` — why it exists

`public/holo.css` is a flatten of **two** upstream repos, not one:

| repo | what it contributes |
| --- | --- |
| `simeydotme/pokemon-cards-css` | the 17 SwSh recipes |
| `simeydotme/pokemon-cards-151` | the 8 extra sections (ex-regular, ex-full-art, ex-special-illustration-rare, illustration-rare, hyper-rare, poke-ball-holo, ...) |

The **151 repo's variable layer was never ported**, so those 8 sections referenced vars that
were defined nowhere. CSS silently drops any declaration using an undefined var, with no 404 —
so Special Illustration / Hyper Rare rendered all six of their foil layers as `none` and showed
only a white masked glare2, Double Rare's glitter was blank, and Poké/Master Ball lost their
inner foil.

These tiles are mirrored **once** from that repo's CDN (`poke-holo.b-cdn.net/foils/151/...`,
per its `public/css/cards.css:5-18`); nothing hotlinks it at runtime. Only the 8 tiles our
holo.css actually reads are here — `iri-2..6` and `--birthday` are unused.

The non-asset vars from that repo (`--sunpillar`, `--holo`, `--clip-borders-invert`,
`--rotate-delta`) are plain CSS and live in `resources/css/card.css`.

## Per-card etch textures

Read by `--foil` / `--mask` in `resources/css/card.css`.

## Where these came from

Upstream (`simeydotme/pokemon-cards-css`) does **not** ship these. Its `CardProxy.svelte`
builds a CDN url per card and passes it into `Card.svelte` as the `foil` / `mask` props:

```js
const server = import.meta.env.VITE_CDN;   // https://poke-holo.b-cdn.net
`${server}/foils/${set}/${type}/upscaled/${number}_foil_${etch}_${style}_2x.webp`
```

`etch` and `style` are derived from the card's rarity (`CardProxy.svelte::foilMaskImage`).
These files were mirrored **once** from that CDN and are served locally — nothing here
hotlinks it at runtime.

## Naming

Named by upstream's own `rarity -> {etch}_{style}` mapping, one representative card per
combination. All are 732x1024 (full card size, matches `mask-size: cover`).

| file | sourced from | upstream rarities using this combo |
| --- | --- | --- |
| `holo_reverse_*` | swsh12/116 | default / reverse holo |
| `holo_swholo_*` | swsh45/060 | rare holo |
| `holo_cosmos_*` | swsh45/060 | rare holo cosmos |
| `holo_sunpillar_*` | swsh7/110 | rare holo v, v-union, basic v |
| `holo_rainbow_*` | swsh12/tg01 | trainer gallery |
| `etched_sunpillar_*` | swsh4/170 | rare holo vmax, rare ultra, rare holo vstar, rare shiny v |
| `etched_swsecret_*` | swshp/145 | amazing rare, rare rainbow, rare secret, rare shiny vmax |
| `etched_radiantholo_*` | swsh12/120 | radiant rare |

Only a few are wired in `card.css` today — most rarities set their own `--foil` in
`holo.css` (vmaxbg.jpg, illusion.png, ...) and never fall through to these. The rest are
kept so the set is complete per upstream's mapping.

## Caveat

PokeHub cards are GitHub avatars with no real set/number, so there is no per-card texture
to fetch — one representative texture stands in per rarity. The etch pattern therefore
does not align with the avatar art the way it does on a real card. That is inherent to
the approach, not a bug.

## Provenance / licensing

These are derived from scans of real Pokémon TCG cards (originally sourced via
`api.pokemontcg.io`; see upstream's `public/img_scrape.sh` and `public/foils.txt`).
The underlying card artwork is © Nintendo / Creatures Inc. / GAME FREAK.

They are redistributed here on the same basis as upstream's own use: a non-commercial,
fan/demo rendering project. **This is not a cleared license.** If PokeHub is ever
published, distributed commercially, or you want to be conservative about the GPL-3.0
source release, remove this folder and drop the `--foil` / `--mask` rules in
`resources/css/card.css` that reference it — the cards fall back to `none` and render
exactly as they did before, minus the etch layer.
