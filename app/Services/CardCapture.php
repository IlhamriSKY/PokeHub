<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * The card as an embeddable image, captured from the REAL DOM card.
 *
 *     ![my card](https://pokehub.dev/torvalds.gif)   animated, foil moving
 *     ![my card](https://pokehub.dev/torvalds.svg)   still
 *
 * Both come from the same screenshot pipeline, which is the whole point. The SVG used to be drawn
 * from primitives in PHP - a second implementation of the card - and it drifted from the real one
 * twice: once on font metrics, once on the weakness chart, so `/x.svg` and `/x.gif` printed
 * different bottom rows for the same profile. Capturing both removes the class of bug entirely,
 * along with ~400 lines that duplicated the card's geometry, fonts and type rules.
 *
 * holo.css cannot be reproduced any other way regardless: the foil is layered blend modes driven
 * by `--pointer-x/y`, and an `<img>` has no pointer. So headless Chromium loads the actual public
 * card page, walks a mouse across the face, and screenshots it.
 *
 * A capture costs ~10-25s and a Chromium process, so results are cached to disk under a key that
 * includes the card's data: an unchanged card is never re-rendered, and a regenerate produces a
 * new file rather than serving a stale one. See DEPLOY.md for what a server needs.
 */
class CardCapture
{
    /**
     * 24 frames x 90ms = a 2.16s loop, looping forever. 16 x 80ms was visibly stepped (a
     * 22.5-degree jump per frame reads as judder), and 24 x 55ms fixed that but ran too fast to
     * read. Slowing the timing means the capture path also has to tighten - see the amplitude
     * note in capture-card.mjs - or a longer dwell on each step brings the stepping back.
     */
    private const FRAMES = 24;

    private const DELAY_MS = 90;

    /** Output width. The capture runs at 2x this and box-averages down, which is the AA pass. */
    private const WIDTH = 320;

    /** @var string[] */
    public const FORMATS = ['gif', 'svg'];

    /** Hex digits of the hash in a filename. forget() matches on exactly this many. */
    private const STAMP_LEN = 12;

    public function __construct(private readonly string $node = 'node') {}

    /**
     * Absolute path for a card's capture, keyed on the card itself.
     *
     * The key used to be a hand-picked subset (axes, rarity, lore, followers, avatar) and it went
     * stale the moment anything else printed on the card moved: the name an admin corrects in the
     * lab, the star count that drives attack damage, the repo count behind the retreat cost. None
     * of those writers calls forget(), so the README image simply kept serving the old card
     * forever. Hashing the whole blob cannot fall behind the card by construction, and costs
     * nothing extra - the only things in there that are NOT printed (top_repos, all_langs) change
     * only on a regenerate, which re-renders anyway.
     */
    public function path(string $slug, array $card, string $format): string
    {
        $stamp = substr(md5(json_encode($card)), 0, self::STAMP_LEN);

        return Storage::disk('local')->path("cards/{$slug}-{$stamp}.{$format}");
    }

    /**
     * The cached capture, taking it first if this card has not been rendered in this format.
     *
     * The whole miss branch is behind a per-card lock. The cache test is `is_file`, and the Node
     * script only writes at the very END of a ~10-25s run, so every request that arrives during
     * that window used to miss too: fifty concurrent hits on one uncached slug launched fifty
     * Chromiums (~300MB each) and pinned fifty PHP workers for up to 180s. That is an outage from
     * one curl loop, on an unauthenticated route. Now one request renders and the rest wait for
     * its file - and re-test `is_file` when they get the lock, so they cost nothing.
     *
     * The URL is built HERE, from APP_URL, and is deliberately not a parameter. The callers used
     * to pass `url('/'.$slug)`, which in an HTTP request takes its host from the Host header - so
     * `GET /victim.gif` with `Host: evil.test` screenshotted the attacker's page and cached it
     * under the victim's slug (the key covers the slug and the card, not the host). One slug in,
     * one page out: the address that is browsed can no longer disagree with the file it is
     * written to. DEPLOY.md already requires APP_URL to be reachable from the server itself.
     */
    public function ensure(string $slug, array $card, string $format): string
    {
        $path = $this->path($slug, $card, $format);
        $url = rtrim((string) config('app.url'), '/').'/'.$slug;

        if (is_file($path)) {
            return $path;
        }

        // Lock TTL (200s) > the capture timeout (180s), so it cannot expire under the holder and
        // let a second Chromium in. Waiters give up at 60s (a capture is 10-25s) rather than
        // holding a worker for the full render window; CardImageController turns that into a 502.
        //
        // ponytail: bounds Chromium (one per card) but not WORKERS - a waiter still occupies one
        // for up to 60s, and the lock is per-card, so N uncached cards still allow N browsers.
        // Warming with `pokehub:card-image --all` on deploy is what keeps N at zero in practice
        // (DEPLOY.md). Move capture to a queue and answer 202 if README traffic ever outruns that.
        return Cache::lock("card-capture:{$slug}.{$format}", 200)->block(60, function () use ($path, $url) {
            if (! is_file($path)) {
                if (! is_dir(dirname($path))) {
                    mkdir(dirname($path), 0755, true);
                }
                $this->capture($url, $path);
            }

            return $path;
        });
    }

    /**
     * Drop every cached capture for a slug, so the next request re-renders. Returns the count.
     *
     * The hash is matched digit by digit rather than with a bare `*`: slugs may contain hyphens
     * and the hash is joined with one, so `{$slug}-*.*` also swept up `/foo-bar`'s files whenever
     * `/foo` was forgotten - silently un-caching a stranger's README image (and over-reporting
     * the count). `foo-bar-<hash>` cannot match `foo-<12 hex>` because of the second hyphen.
     */
    public function forget(string $slug): int
    {
        $hex = str_repeat('[0-9a-f]', self::STAMP_LEN);
        $files = glob(Storage::disk('local')->path("cards/{$slug}-{$hex}.*")) ?: [];
        foreach ($files as $f) {
            @unlink($f);
        }

        return count($files);
    }

    /**
     * The Node script picks its format from the output extension.
     *
     * @throws RuntimeException when Chromium is missing or the page never renders a card
     */
    private function capture(string $url, string $outPath): void
    {
        $proc = new Process(
            [$this->node, base_path('scripts/capture-card.mjs'), $url, $outPath, (string) self::FRAMES, (string) self::WIDTH, (string) self::DELAY_MS],
            base_path()
        );
        // A cold Chromium start plus 24 paints is not fast; well under this, but not fast.
        $proc->setTimeout(180);
        $proc->run();

        if (! $proc->isSuccessful() || ! is_file($outPath)) {
            throw new RuntimeException('capture failed: '.trim($proc->getErrorOutput() ?: $proc->getOutput()));
        }
    }
}
