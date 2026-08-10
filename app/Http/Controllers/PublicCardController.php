<?php

namespace App\Http\Controllers;

use App\Services\PublicCardLookup;
use App\Support\Seo;
use Inertia\Inertia;

class PublicCardController extends Controller
{
    public function show(string $slug, PublicCardLookup $lookup)
    {
        $found = $lookup->find($slug);

        abort_if(! $found, 404);

        return Inertia::render('public-card', $found + ['seo' => $this->seo($slug, $found)]);
    }

    /**
     * The share preview for one card.
     *
     * og:image is the card's OWN render, as `.png`: scrapers reject `.svg` outright and several
     * show only a GIF's first frame, so neither of the two formats the README embed uses is safe
     * here. The image is generated on first request like the others and cached from then on.
     *
     * @param  array{owner: array<string, mixed>, card: array<string, mixed>}  $found
     * @return array<string, mixed>
     */
    private function seo(string $slug, array $found): array
    {
        $owner = $found['owner'];
        $p = $found['card']['profile'] ?? [];
        // The GitHub login keeps its real casing for DISPLAY ("@IlhamriSKY"), but every URL below
        // uses the stored slug. They differ in case, and MySQL's collation makes /IlhamriSKY answer
        // the same page as /ilhamrisky - so pointing canonical or og:image at the login would
        // publish a second address for one card and split it in the index.
        $login = (string) ($p['login'] ?? $slug);
        $canonicalSlug = (string) ($owner['slug'] ?: strtolower($login));
        $name = (string) ($owner['name'] ?: $login);
        $lang = (string) ($p['top_lang'] ?? '');
        $ai = $p['ai'] ?? null;

        // The AI flavour line is already a one-sentence description of this person, written for
        // exactly this length - better than anything assembled from the stat columns.
        $desc = is_array($ai) && ! empty($ai['flavor'])
            ? (string) $ai['flavor']
            : trim(sprintf(
                '%s on GitHub: %s followers, %s public repos%s.',
                '@'.$login,
                number_format((int) ($p['followers'] ?? 0)),
                number_format((int) ($p['repos'] ?? 0)),
                $lang !== '' ? ', mostly '.$lang : '',
            ));

        $species = is_array($ai) && ! empty($ai['species']) ? ' - '.$ai['species'] : '';

        return Seo::make([
            'title' => sprintf('%s (@%s)%s | PokeHub card', $name, $login, $species),
            'description' => $desc,
            'canonical' => url('/'.$canonicalSlug),
            'image' => url('/'.$canonicalSlug.'.png'),
            'imageWidth' => Seo::CARD_W,
            'imageHeight' => Seo::CARD_H,
            'imageAlt' => sprintf('%s as a Pokemon-style trading card', $name),
            'type' => 'profile',
            // Portrait art: `summary_large_image` crops a tall card badly on Twitter, where the
            // small square of `summary` shows the whole thing.
            'twitterCard' => 'summary',
            'jsonLd' => [
                '@context' => 'https://schema.org',
                '@type' => 'ProfilePage',
                'name' => $name,
                'url' => url('/'.$canonicalSlug),
                'primaryImageOfPage' => url('/'.$canonicalSlug.'.png'),
                'mainEntity' => array_filter([
                    '@type' => 'Person',
                    'name' => $name,
                    'alternateName' => '@'.$login,
                    'image' => $owner['avatar'] ?: null,
                    'url' => 'https://github.com/'.$login,
                    'knowsAbout' => $lang !== '' ? $lang : null,
                ]),
            ],
        ]);
    }
}
