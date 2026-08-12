# Card artwork

Most of this directory is intentionally empty in the repository.

The card frames, the foil masks and the holo textures are **not** distributed here and are not
covered by this project's licence. What is present is only what the project has the right to
publish.

| Path | In the repo? | Why |
|---|---|---|
| `types/` | **yes** | Type emblems from [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons), MIT. |
| `uploads/` | `.htaccess` only | Admin-uploaded card art is user content. The `.htaccess` is the lock that stops this tree executing, so it *is* source. |
| `pcg/` | no | Frames, stamps, tags, badges and effect layers from [pokecardgenerator.com](https://pokecardgenerator.com), derived from Pokémon Trading Card Game designs. Not the project author's to license. |
| `151/` | no | As above. |
| `foils/` | `README.md` only | Foil and etch masks from [simeydotme](https://github.com/simeydotme). GPL-3.0 and redistributable, but held back with the rest so that restoring the card's appearance is one step rather than one step and a list of exceptions. The README stays, because it documents the foil system rather than being part of it. |
| loose textures | no | `grain`, `glitter`, `cosmos-*`, `illusion*`, `geometric`, `ancient`, `trainerbg`, `vmaxbg`. Same source and same reasoning as `foils/`. |

See [NOTICE.md](../../NOTICE.md) for the full attribution.

## Running without them

**The application works.** Nothing 500s, every test passes, and no build step touches these files.
What you lose is the card's appearance: frames, foils and textures render as broken images, so a
card is readable but not right. Everything the project derives is unaffected, which is most of what
there is to work on: the stats, the element, the rarity, the AI text, and the layout.

This is the same arrangement [`public/fonts/pcg/`](../fonts/pcg/README.md) has for the commercial
typefaces, for the same reason.

## Supplying your own

Drop images at the paths [`resources/css/pcg.css`](../../resources/css/pcg.css) and
[`public/holo.css`](../holo.css) reference and they start resolving. No code or configuration
changes are needed. [`docs/PARITY.md`](../../docs/PARITY.md) records what each layer is and how its
geometry was measured, which is what you would need to draw substitutes that line up.

`.gitignore` already covers every path they land on, so nothing you add here can be committed back
by accident.

Do not commit them.
