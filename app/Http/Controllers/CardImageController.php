<?php

namespace App\Http\Controllers;

use App\Services\CardCapture;
use App\Services\PublicCardLookup;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * `GET /{slug}.{gif,svg,png}`: the card as an embeddable image for a README or a link preview.
 *
 * One controller for all three, since they differ only in the extension they ask CardCapture for
 * and the MIME they answer with.
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
            // No URL argument: CardCapture derives the page it browses from APP_URL, so a spoofed
            // Host cannot point the screenshot at someone else's site.
            $path = $capture->ensure($slug, $found['card'], $format);
        } catch (Throwable $e) {
            // Every format needs Chromium, so there is no lighter fallback to serve.
            Log::warning('card capture failed', ['slug' => $slug, 'format' => $format, 'error' => $e->getMessage()]);

            abort(502, 'Card image could not be rendered.');
        }

        return response()->file($path, [
            'Content-Type' => self::MIME[$format],
            'Cache-Control' => 'public, max-age=1800, s-maxage=1800',
        ]);
    }
}
