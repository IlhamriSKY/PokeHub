# Security policy

## Reporting a vulnerability

Please report privately rather than opening a public issue.

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/IlhamriSKY/PokeHub/security/advisories/new). If that
is unavailable to you, contact the maintainer through <https://github.com/IlhamriSKY>.

This is a hobby project maintained by one person, so please allow a few days for a first reply.
There is no bounty. Credit in the advisory is offered unless you would rather stay anonymous.

Useful things to include: what an attacker can do, the steps to reproduce it, and whether it needs
an account or an admin role.

## Supported versions

Only the current `main` branch. There are no tagged releases and no backports.

## Scope

The parts most worth looking at, because they are where the interesting surface is:

- **`/generate` and `/{slug}`** are public and unauthenticated. A cache miss on either costs GitHub
  API calls and a paid AI completion, so anything that defeats the rate limits or the captcha has a
  real cost attached.
- **The card image routes** (`/{slug}.svg`, `.gif`, `.png`) launch headless Chromium. The URL it
  browses is derived from `APP_URL` rather than from the request, so a spoofed `Host` header should
  not be able to redirect the screenshot. If you find a way to make it fetch anything else, that is
  worth reporting.
- **Admin asset upload** writes into `public/`. The extension is taken from the file's sniffed
  content rather than its name, and SVG is refused. A way to write an executable file there would
  be serious.
- **The GitHub OAuth callback** creates accounts. It only matches an existing row when this app
  verified that address itself, which is what stops an unverified self-set email from capturing
  somebody else's first sign-in.
- **Card visibility.** A private card must stop answering everywhere: the page, the gallery, the
  sitemap and all three image formats.

## Out of scope

- Missing security headers that have no exploit path behind them.
- The absence of a Content-Security-Policy. This is known and documented in
  `app/Http/Middleware/SecurityHeaders.php`: the holographic foil is driven by inline styles, so a
  useful policy needs nonces threaded through the root view first.
- Vulnerability scanner output with no working proof of concept, including `npm audit` reports for
  the Puppeteer dependency tree. See the note in [DEPLOY.md](DEPLOY.md).
- Anything requiring an admin account, unless it lets a non-admin become one.
- The content of an AI-written card. It is fiction, not a claim about a real person. If a generated
  card is offensive, please open a normal issue.
