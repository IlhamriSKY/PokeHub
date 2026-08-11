# Notices and attribution

PokeHub is an unofficial fan project. It has no affiliation with, endorsement by, or connection to
Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company. Pokémon and all related names are
their trademarks. Nothing here is for sale.

This file records what is covered by the project's licence and what is not. Read it before
redistributing anything from this repository.

## The code

Copyright (C) 2026 Ilham Riski Wibowo, licensed under **GPL-3.0-or-later**. See [LICENSE](LICENSE).

GPL-3.0 is not a free choice here. The holographic foil in `public/holo.css` and
`resources/css/card.css` derives from [simeydotme](https://github.com/simeydotme)'s
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) and
[pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151), both GPL-3.0. GPL-3.0 is a
copyleft licence, so a work that includes and distributes it must carry the same licence.

## Third-party code and assets

| What | Where | Source | Licence |
|---|---|---|---|
| Holographic foil engine | `public/holo.css`, `resources/css/card.css` | [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css), [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | GPL-3.0 |
| Foil masks and holo textures | `public/img/foils/`, and the texture files directly in `public/img/` (`grain`, `glitter`, `cosmos-*`, `illusion*`, `geometric`, `ancient`, `trainerbg`) | as above | GPL-3.0 |
| Type emblem icons | `public/img/types/` | [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons) | MIT |
| Cabin typeface | `public/fonts/cabin-*.woff2` | [Google Fonts](https://fonts.google.com/specimen/Cabin) | SIL OFL 1.1 |
| Laravel framework and PHP packages | `vendor/` | see `composer.lock` | mostly MIT |
| JavaScript packages | `node_modules/` | see `package-lock.json` | mostly MIT |

## Card frame artwork

`public/img/pcg/` contains card frames, stamps, tags, badges and effect layers obtained from
[pokecardgenerator.com](https://pokecardgenerator.com). These are **not** covered by this project's
licence and are **not** the project author's to license.

They derive from Pokémon Trading Card Game designs, which are the property of Nintendo, Creatures
Inc., GAME FREAK inc. and The Pokémon Company. They are included here for non-commercial fan use so
that the project renders as intended.

If you fork this repository, that artwork does not become yours, and this project grants you no
rights to it. If you intend to use PokeHub for anything commercial, remove that directory first.

## Fonts

Real Pokémon cards set their text in **Gill Sans** (Monotype) and their numbers in **NeoGram**. Both
are commercial typefaces, so **their files are deliberately not in this repository**.

The card falls back to Cabin, which is free, and renders correctly without them. See
[`public/fonts/pcg/README.md`](public/fonts/pcg/README.md) for how to restore exact typography if
you hold a licence for those typefaces. Do not commit them.

## Generated cards

A card is built from data GitHub already publishes on a public profile page: name, avatar,
followers, public repository and gist counts, stars, languages, and the public profile README. No
private data is read, and the OAuth token this app requests carries no repository scope.

The flavour text, species name and attacks are written by a language model and are fiction. They are
not statements of fact about the person on the card.

## Takedown

If you own something in this repository and would rather it were not here, open an issue at
<https://github.com/IlhamriSKY/PokeHub/issues> or contact the maintainer through
<https://github.com/IlhamriSKY>. It will be removed.

If you are the subject of a generated card and want it gone, you do not need to ask: sign in with
that GitHub account and use the visibility switch in your dashboard, which removes the page, the
gallery entry and the README images immediately.
