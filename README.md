# PokeHub

Turn any public GitHub profile into a holographic Pokémon-style trading card
across 31 rarities, with AI-written flavor text and attacks. Registered users can
publish their own hand-authored card at `pokehub.ilhamriski.com/<slug>`.

Built on **Laravel 12 + Inertia + React 19 + Tailwind v4 + shadcn/ui**.

## Put your card in your README

[![PokeHub card](https://pokehub.ilhamriski.com/ilhamrisky.svg)](https://pokehub.ilhamriski.com/ilhamrisky)

```markdown
[![PokeHub card](https://pokehub.ilhamriski.com/ilhamrisky.svg)](https://pokehub.ilhamriski.com/ilhamrisky)
```

Swap `ilhamrisky` for your own slug. Three formats, same card:

| URL | What it is |
|---|---|
| `/<slug>.svg` | still image — the safe default for a README |
| `/<slug>.gif` | animated, with the foil moving under a travelling highlight |
| `/<slug>.png` | still raster, used for link previews (Open Graph) |

The surround is transparent in all three, so one file looks right on a light or a
dark README. Every image is a real screenshot of the card page taken with headless
Chromium, so the holo foil is the browser's own render rather than a redrawing of
it — which is why the still and the animation can never disagree.

They are cached on disk, keyed by the card's data. An unchanged card is never
re-rendered; any edit produces a new file on its own. A first request for a cold
card takes a few seconds.

## Features

- **Playground** (`/`): type any GitHub username and generate a card, with full
  control over generation (1st Gen / TCG Pocket / Scarlet & Violet), element,
  dual type, holo finish, frame, variant, rarity mark, tag, badge, name icon and
  visual effect. Every option is DB-driven and admin-editable.
- **Gallery**: all 31 rarities rendered for the loaded profile, grouped by era.
- **Public profiles** (`/<slug>`): a signed-in user publishes their card from the
  dashboard and it is served at `pokehub.ilhamriski.com/<slug>`, with `.svg`,
  `.gif` and `.png` alongside it. A slug that belongs to nobody 404s — only a
  published card and the landing page's showcase logins resolve.
- **Auth**: GitHub sign-in only (Laravel Socialite) — a PokeHub card *is* a
  GitHub profile, so an account without one has nothing to show. There is no
  password login and no sign-up form; the OAuth callback creates the user.
  Cloudflare Turnstile guards card regeneration, where each press is a paid AI
  call, rather than the sign-in that GitHub already polices.
- **Roles & permissions** (spatie/laravel-permission): `admin` and `user`.
- **Activity log** (spatie/laravel-activitylog): auth, card and admin actions.
- **Admin dashboard** (`/admin`, role-gated): manage users + their slugs/roles,
  the card assets (Card Lab options + uploads), and the activity log.
- **Laravel Debugbar** in local/debug mode.

## Stack

```
pokehub/
├─ app/
│  ├─ Http/Controllers/        # Api\{Github,Options}, Dashboard, PublicCard, Admin, Auth\Google
│  ├─ Services/GithubCardService.php   # GitHub fetch + OpenAI-compatible AI lore + text clamps
│  ├─ Models/{User,Profile,CardAsset}.php
│  └─ Rules/Turnstile.php
├─ resources/
│  ├─ js/pages/               # card (playground), dashboard, public-card, admin/*, auth/*
│  ├─ js/components/          # PokeCard, PcgFace, CardAxes, turnstile, ui/* (shadcn)
│  ├─ js/lib/                 # rarities, cardModel (resolveOverrides), options, api
│  └─ css/                    # pcg.css + card.css (card styling)
├─ public/                    # front controller + holo.css, fonts/, img/ (card assets)
├─ database/migrations|seeders/
├─ routes/web.php             # /api/*.php, /, dashboard, /admin/*, catch-all /{slug}
└─ config/pokehub.php         # AI + GitHub + rarity map
```

The holo foil engine (`public/holo.css`) and the card faces (`pcg.css`) are used
verbatim from the original design, so generated cards render pixel-identically.

## Develop

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
# set DB_* and (optionally) POKEHUB_AI_*, GITHUB_TOKEN, GOOGLE_*, TURNSTILE_* in .env
php artisan migrate --seed
npm run dev        # Vite HMR
php artisan serve  # or serve via Laragon at http://pokehub.dev
```

The seeder creates a bootstrap admin row for whatever `ADMIN_EMAIL` is set to.
There is no password to log in with — you claim it by signing in with GitHub on an
account whose primary email is that address.

## Build & deploy

```bash
npm run build
php artisan migrate --seed --force
php artisan optimize
```

Point the web server's document root at `pokehub/public`. The included Laragon
vhost (`etc/apache2/sites-enabled/auto.pokehub.dev.conf`) already does this, so
`http(s)://pokehub.dev` serves the app; a fallback root `.htaccess` forwards into
`public/` if the docroot is ever the project root.

## Configuration & secrets

No real secret is committed. `.env` holds the DB, AI endpoint/key, GitHub token,
Google OAuth and Turnstile keys. Rarity per GitHub login is set in
`config/pokehub.php` (`rarity_map`); a claimed public profile overrides it.

## Credits & license

Holographic technique by [simeydotme](https://github.com/simeydotme) (GPL-3.0);
type emblem SVGs from
[duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons).
Not affiliated with GitHub, Nintendo, or The Pokémon Company.
