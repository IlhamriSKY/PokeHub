# Contributing to PokeHub

Thanks for taking the time. This is a small project, so anything from a typo fix to a new card
generation is welcome.

By contributing you agree that your work is licensed under GPL-3.0-or-later, the same licence as
the project. Please do not add assets you do not have the right to redistribute; see
[NOTICE.md](NOTICE.md).

## Getting set up

```bash
git clone https://github.com/IlhamriSKY/PokeHub.git
cd PokeHub
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
```

Set `DB_*` in `.env` and you are running. Everything else is optional: without an AI endpoint the
cards render with real stats but no flavour text, which is fine for most work. The card typefaces
are commercial and not in the repository, so text renders in Cabin instead. That is expected, and
[`public/fonts/pcg/README.md`](public/fonts/pcg/README.md) explains it.

Then `npm run dev` and `php artisan serve`.

## Before you open a pull request

Run all three, plus the card-model check further down. CI runs the same ones and will fail the pull
request otherwise.

```bash
php artisan test            # Pest / PHPUnit
./vendor/bin/pint --test    # PHP formatting
npm run check               # Prettier, ESLint and TypeScript
```

`npm run check` is read-only. To have the fixable parts corrected for you instead, run
`./vendor/bin/pint`, `npm run format` and `npm run lint`.

If you touched anything under `resources/js` or `resources/css`, also run `npm run build`. The
production site is served from the compiled bundle in `public/build`, so a change that is not built
does not exist yet.

There is one extra check for the card model, which has no test runner of its own:

```bash
npx esbuild resources/js/lib/cardModel.check.ts --bundle --platform=node \
  --alias:@=./resources/js --outfile=check.mjs --format=esm && node check.mjs
```

The same two lines CI runs. `check.mjs` is gitignored, so it can be left where it lands.

## What makes a change easy to review

- **One thing per pull request.** A rename and a bug fix in the same diff take three times as long
  to review as two pull requests.
- **Say what breaks if you are wrong.** A test is the clearest way, and most changes here can have
  one. `tests/Feature` has plenty of examples to copy.
- **Match the surrounding code.** No new dependency for something a few lines can do, and no new
  abstraction until there is a second caller.
- **Comments should say why, not what.** The code already says what it does. Skip commentary about
  how the code used to look; that belongs in the commit message.

## Working on the card itself

The card layout in `resources/css/pcg.css` is measured against the reference generator rather than
eyeballed, and [docs/PARITY.md](docs/PARITY.md) records how each number was obtained. If you move
something, measure it the same way and update that document.

Card options such as frames, rarities, tags and effects are database rows seeded by
`database/seeders/CardAssetSeeder.php`, not hardcoded lists. Add a row there rather than a constant,
and remember that a new rarity preset needs a matching `data-rarity` rule in `public/holo.css` or it
renders with no foil at all.

## Reporting a bug

Open an issue using the bug template. The most useful thing you can include is the GitHub handle
that reproduces it, since almost every bug here is a property of one profile's data.

For anything with a security impact, do not open a public issue. See [SECURITY.md](SECURITY.md).
