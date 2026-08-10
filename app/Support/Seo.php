<?php

namespace App\Support;

/**
 * The per-page metadata that app.blade.php prints into <head>.
 *
 * It has to be built SERVER-side and shipped as an Inertia prop, not set with Inertia's <Head> in
 * React. That component writes the tags after hydration, and the things this metadata exists for -
 * Google, Facebook, WhatsApp, Slack, Discord, Twitter - fetch the raw HTML and never run the
 * bundle. Tags added client-side are invisible to every one of them.
 *
 * Every value is absolute: relative og:image and canonical URLs are ignored by most scrapers.
 */
class Seo
{
    /** Card renders are portrait, which is the real shape of the thing being shared. */
    public const CARD_W = 354;

    public const CARD_H = 472;

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function make(array $overrides = []): array
    {
        $name = (string) config('app.name', 'PokeHub');

        return array_merge([
            'title' => $name.' - turn your GitHub profile into a Pokemon card',
            'description' => 'PokeHub turns a GitHub profile into a collectible Pokemon-style card. '
                .'Your followers become HP, your stars become attack damage and your top language picks the element. '
                .'Sign in with GitHub and embed the card in your README.',
            'canonical' => url()->current(),
            'image' => url('/og.png'),
            'imageWidth' => 1200,
            'imageHeight' => 630,
            'imageAlt' => $name,
            'imageType' => 'image/png',
            'type' => 'website',
            'twitterCard' => 'summary_large_image',
            // Everything not listed as public is explicitly kept out of the index rather than left
            // to chance - a dashboard or a settings page in search results is nobody's win.
            'robots' => 'index, follow, max-image-preview:large',
        ], $overrides);
    }

    /** Pages behind auth: reachable, but never indexed. */
    public static function private(string $title): array
    {
        return self::make(['title' => $title, 'robots' => 'noindex, nofollow']);
    }
}
