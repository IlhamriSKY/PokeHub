# Deploying PokeHub

Standard Laravel + Inertia deploy, with **one unusual requirement**: the embeddable card images
(`/{slug}.gif` and `/{slug}.svg`) are screenshots of the real card page, so the server needs Node
and Chromium. Nothing else on the site does.

---

## 1. Baseline

| | |
|---|---|
| PHP | 8.2+ with `pdo_mysql`, `mbstring`, `curl`, `fileinfo` |
| Composer | 2.x |
| Node | 20+ (assets, and the card capture — see §2) |
| MySQL | 8.0+ |

```bash
composer install --no-dev --optimize-autoloader
npm ci && npm run build
php artisan migrate --force
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=CardAssetSeeder --force
php artisan db:seed --class=ShowcaseCardSeeder --force
php artisan storage:link
```

The roles seeder is not optional: the OAuth callback assigns `user` to every new account, so
skipping it makes the **first GitHub sign-in 500** (`RoleDoesNotExist`) and leaves `/admin`
permanently 403. It also creates the bootstrap admin — see `ADMIN_EMAIL` below.

Set in `.env`: `APP_URL` (must be the real public URL — the capture browses it), `GITHUB_TOKEN`
(lifts the API limit from 60 to 5000/hr), `POKEHUB_AI_*`, and the `TURNSTILE_*` keys.

Four of them are security-load-bearing, and all four fail *silently* when wrong — the app looks
perfectly healthy either way:

| | |
|---|---|
| `APP_ENV=production` | Under `local`, signed-URL misses answer 403 instead of 404, confirming which private paths exist. |
| `APP_DEBUG=false` | A stack trace prints the DB password. |
| `SESSION_SECURE_COOKIE=true` | Without it the session cookie has no `Secure` flag and rides any `http://` request to the domain in plaintext. Required whenever `APP_URL` is https. |
| `TURNSTILE_ENABLED=true` | The captcha rule is a no-op when false, leaving card regeneration behind nothing but a rate limit. |

> **Do not** run `php artisan config:cache` on shared mod_php hosting without reading the note in
> `bootstrap/app.php` about `Env::disablePutenv()` — a shared PHP process leaks `.env` between apps.

---

## 2. The card images (`/{slug}.gif`, `/{slug}.svg`)

```markdown
![my card](https://your-host/torvalds.gif)   animated, foil moving
![my card](https://your-host/torvalds.svg)   still
```

Both come from one pipeline: headless Chromium loads the public card page, walks a mouse across the
face, and screenshots it. The GIF keeps 24 frames of that walk; the SVG keeps a single frame taken a
quarter-lap in (at rest the foil is barely lit) and wraps the PNG. Same renderer, so the two can
never disagree — which is why the SVG is no longer drawn in PHP.

The surround is transparent in both, so one file is correct on a light or a dark README.

### What to install

```bash
# Node deps (puppeteer downloads its own Chromium, ~150MB)
npm ci                      # NOT --omit=dev: puppeteer/gifenc/pngjs are devDependencies

# Linux servers need Chromium's shared libraries, which npm does NOT install:
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0
```

Verify before trusting it:

```bash
node -e "import('puppeteer').then(async p=>{const b=await p.default.launch({headless:'new',args:['--no-sandbox']});console.log('chromium ok');await b.close()})"
php artisan pokehub:card-image torvalds
```

`--omit=dev` is **not** a supported configuration for these two routes: without Chromium they both
502. Deploy with it only if you do not want the image routes at all. (They are devDependencies
because nothing they produce ships to the browser — the bundle never imports them.)

### Running it

Renders on demand and caches to `storage/app/private/cards/{slug}-{hash}.{gif,svg}`. The hash covers
the card's **whole** stored blob — axes, rarity, lore, and every profile field the card prints — so
an unchanged card is never re-captured, and any edit (a regenerate, or a name corrected in the card
lab) produces a new file on its own.

```bash
php artisan pokehub:card-image torvalds              # one card, both formats
php artisan pokehub:card-image torvalds --format=gif # one format
php artisan pokehub:card-image --all                 # every public + showcase card
```

Run `--all` **after every deploy that changes the card's appearance**. The cache key is the card's
data, not the code, so an edit to `pcg.css`, `holo.css` or the capture settings invalidates nothing
on its own.

Budget roughly **10–25s and ~250MB RSS per capture** (GIF; the SVG is ~3–5s), and ~1.3MB per stored
GIF, ~250KB per SVG. Captures are serialised by the OS, not by a queue — if you expect concurrent
cold requests, warm them with `--all` on deploy rather than letting README traffic trigger them.

### If it breaks

Failures are logged as `card capture failed` and the request 502s. There is deliberately no
cross-format fallback: both formats need the same browser, so a redirect would only loop.

| Symptom | Cause |
|---|---|
| `Failed to launch the browser process` | Missing shared libs — install the `apt-get` list above |
| `Running as root without --no-sandbox` | Already passed in `capture-card.mjs`; check you are on that file |
| `net::ERR_CONNECTION_REFUSED` | `APP_URL` is not reachable **from the server itself** |
| `waiting for selector .card .pcg` | The card page rendered no card — check the slug is public |
| Opaque dark surround | An ancestor of `.card` is painting a background the capture does not clear |
| Image is right but stale | The key is the card's data, not the code — a CSS or capture change needs `pokehub:card-image <slug>` |

---

## 3. What runs where

| Route | Needs | Cost | Cached |
|---|---|---|---|
| `/{slug}` | — | ms | no |
| `/{slug}.svg` | Node + Chromium | 3–5s cold, ms warm | on disk, keyed by card data |
| `/{slug}.gif` | Node + Chromium | 10–25s cold, ms warm | on disk, keyed by card data |

---

## 4. Security note

`npm audit` currently reports vulnerabilities in the Puppeteer dependency tree. They are
devDependencies and nothing ships to the browser, but Chromium **does** run server-side on request,
so review before exposing the image routes publicly. It only ever loads your own `APP_URL`, never a
user-supplied one — `CardCapture::ensure()` builds that address itself rather than taking it from
the caller, so a spoofed `Host` header cannot point the screenshot at someone else's page.
