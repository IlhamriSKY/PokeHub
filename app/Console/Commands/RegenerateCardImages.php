<?php

namespace App\Console\Commands;

use App\Models\ShowcaseCard;
use App\Models\User;
use App\Services\CardCapture;
use App\Services\PublicCardLookup;
use Illuminate\Console\Command;
use Throwable;

/**
 * Re-capture a card's README images (both formats).
 *
 * The web route only renders when a card has no cached file, and the cache key is the card's own
 * data - so a card that has not changed is never re-rendered, and a change to the CAPTURE itself
 * (frame count, timing, background) would otherwise never reach cards that are already cached.
 * This is the way to force it, and the way to warm a fresh deploy before anyone's README asks.
 */
class RegenerateCardImages extends Command
{
    protected $signature = 'pokehub:card-image
                            {slug? : Public slug to re-capture}
                            {--all : Every public user card and active showcase card}
                            {--format= : Only this format (gif|svg); default both}';

    protected $description = 'Re-capture card GIFs and SVGs from the live card pages';

    public function handle(PublicCardLookup $lookup, CardCapture $capture): int
    {
        $slugs = $this->option('all')
            ? $this->allSlugs()
            : array_filter([$this->argument('slug')]);

        if (! $slugs) {
            $this->error('Give a slug or --all.');

            return self::INVALID;
        }

        $only = $this->option('format');
        if ($only && ! in_array($only, CardCapture::FORMATS, true)) {
            $this->error('--format must be one of: '.implode(', ', CardCapture::FORMATS));

            return self::INVALID;
        }
        $formats = $only ? [$only] : CardCapture::FORMATS;

        $failed = 0;
        foreach ($slugs as $slug) {
            $found = $lookup->find($slug);
            if (! $found) {
                $this->warn("  skip {$slug} - not a public card");

                continue;
            }

            // Clear once per slug, not per format: forget() drops every cached extension.
            $capture->forget($slug);

            foreach ($formats as $format) {
                $started = microtime(true);
                try {
                    $path = $capture->ensure($slug, $found['card'], $format);
                    $this->info(sprintf('  %-18s %-4s %5.1fs  %s KB', $slug, $format, microtime(true) - $started, number_format(filesize($path) / 1024)));
                } catch (Throwable $e) {
                    $failed++;
                    $this->error("  {$slug} {$format}: {$e->getMessage()}");
                }
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /** @return string[] */
    private function allSlugs(): array
    {
        return array_merge(
            User::whereNotNull('slug')->where('is_public', true)->whereNotNull('card')->pluck('slug')->all(),
            ShowcaseCard::where('is_active', true)->pluck('login')->map(fn ($l) => strtolower($l))->all(),
        );
    }
}
