<div align="center">

# PokeHub

**Turn any public GitHub profile into a holographic Pokémon-style trading card.**

[![tests](https://github.com/IlhamriSKY/PokeHub/actions/workflows/tests.yml/badge.svg)](https://github.com/IlhamriSKY/PokeHub/actions/workflows/tests.yml)
[![linter](https://github.com/IlhamriSKY/PokeHub/actions/workflows/lint.yml/badge.svg)](https://github.com/IlhamriSKY/PokeHub/actions/workflows/lint.yml)
[![licence: GPL-3.0](https://img.shields.io/badge/licence-GPL--3.0-blue.svg)](LICENSE)

[Live site](https://pokehub.ilhamriski.com) · [Contributing](CONTRIBUTING.md) · [Deploying](DEPLOY.md)

<a href="https://pokehub.ilhamriski.com/ilhamrisky"><img alt="PokeHub card, animated" src="https://pokehub.ilhamriski.com/ilhamrisky.gif" width="260"></a>

</div>

Nothing on the card is chosen by hand. Followers become HP, stars become attack damage, public
repositories set the retreat cost, and the language you write most picks the element. A language
model writes the species name, the flavour text and both attacks.

No account is needed to generate a card. Signing in with GitHub claims the handle you authenticate
as, which is what lets you regenerate it, restyle it, or take it down.

## Put your card in your README

```markdown
[![PokeHub card](https://pokehub.ilhamriski.com/YOUR-USERNAME.svg)](https://pokehub.ilhamriski.com/YOUR-USERNAME)
```

Three formats, one card:

| URL           | What it is                                                  |
| ------------- | ----------------------------------------------------------- |
| `/<name>.svg` | still image, the safe default for a README                  |
| `/<name>.gif` | animated, with the foil moving under a travelling highlight |
| `/<name>.png` | still raster, used for link previews                        |

Each one is a screenshot of the real card page taken with headless Chromium, on a transparent
surround so it suits a light or a dark README. The first request for a card takes a few seconds and
every one after that is instant.

## Running it locally

Requires PHP 8.2+, Composer, Node 20+ and MySQL 8.

```bash
git clone https://github.com/IlhamriSKY/PokeHub.git
cd PokeHub

composer install
npm install
cp .env.example .env
php artisan key:generate

# set DB_* in .env, then:
php artisan migrate --seed
npm run dev
php artisan serve
```

That is enough to run the site. Every integration is optional and off by default:

| Set in `.env`                  | Without it                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `GITHUB_TOKEN`                 | GitHub allows 60 API requests an hour instead of 5000       |
| `GITHUB_CLIENT_ID` / `_SECRET` | no sign-in, so cards can be generated but not claimed       |
| `POKEHUB_AI_*`                 | cards render with real stats but no flavour text or attacks |
| `TURNSTILE_*`                  | no captcha in front of card generation                      |

The seeder creates an admin row for whatever `ADMIN_EMAIL` is set to. There is no password to log
in with: you claim that account by signing in with GitHub on an account whose primary email matches.

Card images additionally need a headless Chromium on the machine. See [DEPLOY.md](DEPLOY.md).

## The code

Laravel 12, Inertia, React 19, Tailwind v4 and shadcn/ui.

| Where                           | What                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `app/Services/`                 | GitHub fetch, AI text, card capture, quotas              |
| `resources/js/lib/cardModel.ts` | which options are legal on which card                    |
| `resources/css/pcg.css`         | the card faces, measured against the reference generator |
| `public/holo.css`               | the holographic foil                                     |
| `scripts/capture-card.mjs`      | headless Chromium capture behind the image routes        |

Card options are database rows, editable from the admin card lab at `/admin/lab`, rather than
hardcoded lists.

More: [DEPLOY.md](DEPLOY.md) for production, [docs/PARITY.md](docs/PARITY.md) for how the card
layout was measured.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), which covers
the setup, the checks to run before opening a pull request, and what makes a change easy to review.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a
security problem, see [SECURITY.md](SECURITY.md) rather than opening a public issue.

## Licence and attribution

The code is GPL-3.0-or-later. See [LICENSE](LICENSE).

The card frames, the holographic foil and the typefaces are **not** the project author's work and
are not all covered by that licence. [NOTICE.md](NOTICE.md) records what comes from where, what you
may redistribute, and how to request a takedown.

PokeHub is an unofficial fan project with no affiliation with Nintendo, Creatures Inc., GAME FREAK
inc. or The Pokémon Company, and none with GitHub. Nothing here is for sale.
