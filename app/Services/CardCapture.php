<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

/**
 * The card as an embeddable image, screenshotted from the real card page.
 *
 *     ![my card](https://pokehub.ilhamriski.com/torvalds.gif)   animated, foil moving
 *     ![my card](https://pokehub.ilhamriski.com/torvalds.svg)   still
 *
 * Every format comes from one pipeline, so they cannot disagree with each other or with the page.
 * The foil is the reason: holo.css layers blend modes driven by `--pointer-x/y`, which nothing but
 * a browser can reproduce. Headless Chromium loads the public card page, walks a pointer across
 * the face, and captures the frames.
 *
 * A capture costs roughly 10-25s and a Chromium process, so results are cached to disk under a key
 * that includes the card's data: an unchanged card is never re-rendered, and an edit produces a
 * new file. See DEPLOY.md for what a server needs.
 */
class CardCapture
{
    /**
     * A 2.16s loop. Fewer frames read as judder, and a shorter delay runs too fast to follow; both
     * are tied to the tilt amplitude in capture-card.mjs.
     */
    private const FRAMES = 24;

    private const DELAY_MS = 90;

    /**
     * Output width for the ANIMATED format. 24 frames of a card is the one thing here with a file
     * size worth minding in a README, so the GIF stays small while the stills do not.
     */
    private const WIDTH = 480;

    /**
     * Output width for the stills, which are what people download and what a README renders on a
     * high-DPI screen. 760px is a real card's 63mm at 300dpi. The stills used to share the GIF's
     * 320px and came out as a soft little bitmap.
     */
    public const STILL_WIDTH = 760;

    /**
     * The matching height, measured on the real output rather than derived: the card's own aspect
     * is 2.5:3.5, but the frame art carries a little bleed of its own. Seo reads this for
     * og:image:height, which has to agree with the bytes or previews come back banded.
     */
    public const STILL_HEIGHT = 1058;

    /**
     * `png` is the same still image `svg` wraps, written raw, and exists for link previews: Open
     * Graph scrapers reject SVG and several show only a GIF's first frame.
     *
     * @var string[]
     */
    public const FORMATS = ['gif', 'svg', 'png'];

    /** Hex digits of the hash in a filename. forget() matches on exactly this many. */
    private const STAMP_LEN = 12;

    public function __construct(private readonly string $node = 'node') {}

    /**
     * Absolute path for a card's capture, keyed on the whole card blob.
     *
     * Hashing everything rather than a hand-picked subset means the key cannot fall behind the
     * card: any edit that changes what is printed changes the filename, without every writer
     * having to remember to call forget().
     */
    public function path(string $slug, array $card, string $format): string
    {
        $stamp = substr(md5(json_encode($card)), 0, self::STAMP_LEN);

        return Storage::disk('local')->path("cards/{$slug}-{$stamp}.{$format}");
    }

    /**
     * The cached capture, taking it first if this card has not been rendered in this format.
     *
     * The miss branch is behind a per-card lock. The Node script only writes at the end of a long
     * run, so without the lock every request arriving during that window also misses and launches
     * its own Chromium: one curl loop on an unauthenticated route is enough to exhaust the box.
     * Waiters re-test the file once they hold the lock, so they cost nothing.
     *
     * The URL is built here from APP_URL rather than passed in. A caller-supplied `url()` takes
     * its host from the request, which would let `Host: evil.test` screenshot an attacker's page
     * and cache it under someone else's slug. DEPLOY.md requires APP_URL to be reachable from the
     * server itself.
     */
    public function ensure(string $slug, array $card, string $format): string
    {
        $path = $this->path($slug, $card, $format);
        $url = rtrim((string) config('app.url'), '/').'/'.$slug;

        if (is_file($path)) {
            return $path;
        }

        // The lock TTL exceeds the capture timeout, so it cannot expire under its holder and let a
        // second Chromium in. Waiters give up well before that rather than holding a worker for a
        // full render; CardImageController turns the timeout into a 502.
        //
        // This bounds Chromium per card, not per server: N uncached cards still allow N browsers.
        // Warming with `pokehub:card-image --all` on deploy keeps N at zero in practice. If README
        // traffic ever outruns that, move the capture to a queue and answer 202.
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
     * The hash is matched digit by digit rather than with a bare `*`, because slugs may contain
     * the same hyphen that joins the hash: `{$slug}-*.*` would also sweep up `/foo-bar`'s files
     * whenever `/foo` was forgotten.
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
     * Squeeze the still into a 255-colour PNG, in place.
     *
     * This file is the og:image, and WhatsApp drops any preview image over roughly 300KB - the
     * truecolour capture is ~1MB, so a shared card showed a title and no picture. The card is
     * mostly flat frame colour around one photograph, which is the case palette compression is
     * built for: 760x1058 and the alpha survive untouched, the bytes fall to ~236KB, and the
     * measured error is 2% RMSE with no banding on the face.
     *
     * Best effort, and the only thing in the project that wants ImageMagick: a machine without it
     * keeps the larger file rather than losing the image. DEPLOY.md says so, since the symptom of
     * a missing binary is not an error anywhere - it is a share preview that quietly stops
     * appearing on one chat app.
     */
    private function palettise(string $path): void
    {
        /*
         * ImageMagick 7 renamed `convert` to `magick` and 8 drops the old name, so `magick` is
         * tried first. It also has to be: on Windows `convert.exe` is a built-in NTFS tool that
         * sits in the PATH of every machine, so a bare `convert` there is not this program at all.
         * Nothing is logged when neither is found, because the caller cannot act on it either.
         */
        $finder = new ExecutableFinder;
        $bin = $finder->find('magick') ?? $finder->find('convert');
        if ($bin === null) {
            return;
        }

        $proc = new Process([$bin, $path, '-colors', '255', '-depth', '8', 'PNG8:'.$path]);
        $proc->setTimeout(30);
        $proc->run();
    }

    /**
     * The Node script picks its format from the output extension.
     *
     * @throws RuntimeException when Chromium is missing or the page never renders a card
     */
    private function capture(string $url, string $outPath): void
    {
        // The animated format is the only one that has to stay small; the stills are downloads.
        $width = str_ends_with($outPath, '.gif') ? self::WIDTH : self::STILL_WIDTH;

        $proc = new Process(
            [$this->node, base_path('scripts/capture-card.mjs'), $url, $outPath, (string) self::FRAMES, (string) $width, (string) self::DELAY_MS],
            base_path()
        );
        // A cold Chromium start plus 24 paints is not fast; well under this, but not fast.
        $proc->setTimeout(180);
        $proc->run();

        if (! $proc->isSuccessful() || ! is_file($outPath)) {
            throw new RuntimeException('capture failed: '.trim($proc->getErrorOutput() ?: $proc->getOutput()));
        }

        if (str_ends_with($outPath, '.png')) {
            $this->palettise($outPath);
        }
    }
}
