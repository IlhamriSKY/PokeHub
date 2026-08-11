# Card fonts

This directory is intentionally empty in the repository.

Real Pokémon cards set their text in **Gill Sans**, and the HP and damage numbers in **NeoGram**.
Both are commercial typefaces, so their files cannot be redistributed here. Nothing is broken by
their absence: `resources/css/pcg.css` lists each one first and a free substitute second, and a
browser skips any font source it cannot load.

| Face | Preferred (not shipped) | Substitute (shipped) |
|---|---|---|
| `PCG` 400 | `GillSansStd.otf` | Cabin 400 |
| `PCG` 700 | `GillSansStdBold.otf` | Cabin 700 |
| `PCG Cond` | `GillSansStd-BoldCondensed.otf` | Cabin 700 |
| `PCG Nova` | `GillSansNova-Medium.ttf` | Cabin 500 |
| `PCG Num` | `NeoGramTrial-Heavyit.otf` | Cabin italic |

[Cabin](https://fonts.google.com/specimen/Cabin) is licensed under the SIL Open Font License 1.1
and was drawn after Edward Johnston's and Eric Gill's typefaces, which is why it stands in for
Gill Sans without the measured layout in `pcg.css` falling apart.

## Restoring exact parity

If you hold a licence for these typefaces, drop the files into this directory using the filenames
in the table above. No code or configuration changes are needed. The card picks them up on the next
page load, and `docs/PARITY.md` measurements assume they are present.

Do not commit them.
