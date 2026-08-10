# PokeHub

Turn any public GitHub profile into a holographic Pokémon-style trading card
across 31 rarities, with AI-written flavor text and attacks. Registered users can
publish their own hand-authored card at `pokehub.dev/<slug>`.

Built on **Laravel 12 + Inertia + React 19 + Tailwind v4 + shadcn/ui**.

## Features

- **Playground** (`/`): type any GitHub username and generate a card, with full
  control over generation (1st Gen / TCG Pocket / Scarlet & Violet), element,
  dual type, holo finish, frame, variant, rarity mark, tag, badge, name icon and
  visual effect. Every option is DB-driven and admin-editable.
- **Gallery**: all 31 rarities rendered for the loaded profile, grouped by era.
- **Public profiles** (`/<slug>`): a logged-in user claims a slug and authors
  their own card in the dashboard; it is served at `pokehub.dev/<slug>`. Any
  unclaimed path falls through to the GitHub playground, so `pokehub.dev/torvalds`
  still resolves a GitHub card.
- **Auth**: email/password **and** Google sign-in (Laravel Socialite), with
  Cloudflare Turnstile on the auth forms.
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

A seeded admin account is created: **admin@pokehub.dev / password** (change it).

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
