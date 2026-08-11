<?php

namespace App\Support;

/**
 * The per-page metadata that app.blade.php prints into <head>.
 *
 * Built server-side and shipped as an Inertia prop rather than set with Inertia's <Head>, which
 * writes its tags after hydration. Every scraper this metadata exists for fetches the raw HTML and
 * never runs the bundle, so client-side tags are invisible to all of them.
 *
 * Every URL is absolute, since most scrapers ignore a relative og:image or canonical.
 */
class Seo
{
    /** Card renders are portrait. */
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
            // Any profile, and no promise of a sign-in: the search box is open to everyone, and an
            // account only claims your own handle.
            'title' => $name.' - turn any GitHub profile into a Pokemon card',
            'description' => 'Type any GitHub username and get a collectible Pokemon-style card built from that public profile. '
                .'Followers become HP, stars become attack damage and the top language picks the element. No sign-in needed.',
            'canonical' => url()->current(),
            'image' => url('/og.png'),
            // The real pixel size of public/og.png, a 2x capture of the hero. Slack and LinkedIn
            // lay the preview out from these numbers rather than from the file, so re-capturing
            // the hero means updating both.
            'imageWidth' => 2560,
            'imageHeight' => 1344,
            'imageAlt' => $name,
            'imageType' => 'image/png',
            'type' => 'website',
            'twitterCard' => 'summary_large_image',
            'robots' => 'index, follow, max-image-preview:large',
        ], $overrides);
    }

    /** Pages behind auth: reachable, but never indexed. */
    public static function private(string $title): array
    {
        return self::make(['title' => $title, 'robots' => 'noindex, nofollow']);
    }
}
