<?php

namespace App\Http\Controllers;

use App\Services\CardCapture;
use App\Services\PublicCardLookup;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * `GET /{slug}.gif` and `GET /{slug}.svg` - the card as an embeddable image for a README.
 *
 * One controller for both: they differ only in the extension they ask CardCapture for, and the
 * MIME they answer with.
 */
class CardImageController extends Controller
{
    private const MIME = ['gif' => 'image/gif', 'svg' => 'image/svg+xml', 'png' => 'image/png'];

    public function show(string $slug, string $format, PublicCardLookup $lookup, CardCapture $capture)
    {
        abort_unless(in_array($format, CardCapture::FORMATS, true), 404);

        $found = $lookup->find($slug);
        abort_if(! $found, 404);

        try {
            // No URL argument on purpose: CardCapture derives the page it browses from APP_URL,
            // so a spoofed Host cannot redirect the screenshot at someone else's site.
            $path = $capture->ensure($slug, $found['card'], $format);
        } catch (Throwable $e) {
            // Both formats need Chromium, so there is no lighter fallback to serve - a 502 with a
            // logged reason is honest, where a redirect between them would just loop.
            Log::warning('card capture failed', ['slug' => $slug, 'format' => $format, 'error' => $e->getMessage()]);

            abort(502, 'Card image could not be rendered.');
        }

        return response()->file($path, [
            'Content-Type' => self::MIME[$format],
            'Cache-Control' => 'public, max-age=1800, s-maxage=1800',
        ]);
    }
}
