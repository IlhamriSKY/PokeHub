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
| Foil masks and holo textures | **not in this repository**: `public/img/foils/`, `public/img/151/` and the loose textures (`grain`, `glitter`, `cosmos-*`, `illusion*`, `geometric`, `ancient`, `trainerbg`, `vmaxbg`) | as above | GPL-3.0 |
| Type emblem icons | `public/img/types/` | [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons) | MIT |
| Cabin typeface | `public/fonts/cabin-*.woff2` | [Google Fonts](https://fonts.google.com/specimen/Cabin) | SIL OFL 1.1 |
| Laravel framework and PHP packages | `vendor/` | see `composer.lock` | mostly MIT |
| JavaScript packages | `node_modules/` | see `package-lock.json` | mostly MIT |

## Card artwork is not in this repository

**No card frames, foil masks or holo textures are distributed here.** `public/img/` ships the MIT
type emblems and nothing else; see [`public/img/README.md`](public/img/README.md).

The frames, stamps, tags, badges and effect layers come from
[pokecardgenerator.com](https://pokecardgenerator.com) and derive from Pokémon Trading Card Game
designs, which are the property of Nintendo, Creatures Inc., GAME FREAK inc. and The Pokémon
Company. They are **not** the project author's to license, so putting them under this repository's
GPL-3.0 would be claiming a right that does not exist. This project therefore does not distribute
them and grants you no rights to them.

The simeydotme foil masks and textures are GPL-3.0 and could have stayed. They are held back with
the rest only so that restoring the card's appearance is one step rather than one step and a list
of exceptions. Their licence is unchanged and their attribution is in the table above.

Cloning this repository gives you a working application whose cards render without their artwork.
Nothing fails; the frames are simply missing. What you build on top is yours, under GPL-3.0, and
carries no claim over anyone's card designs.

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
