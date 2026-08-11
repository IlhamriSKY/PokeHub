<?php

namespace App\Http\Controllers;

use App\Services\PublicCardLookup;
use App\Support\Seo;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

class PublicCardController extends Controller
{
    public function show(string $slug, PublicCardLookup $lookup)
    {
        $found = $lookup->find($slug);

        abort_if(! $found, 404);

        $this->recordView($slug, $found);

        return Inertia::render('public-card', $found + ['seo' => $this->seo($slug, $found)]);
    }

    /**
     * Log that a signed-in trainer looked at someone's card.
     *
     * Signed-in only, and deduplicated to one row per viewer per card per hour. A public page gets
     * refreshed, prefetched and shared, and an unbounded row per hit would turn the activity log
     * into a request log nobody can read - and would be a visitor-surveillance table for people
     * who never identified themselves. A viewer we can name, at hour resolution, answers "who is
     * looking at whose card" without either problem.
     */
    private function recordView(string $slug, array $found): void
    {
        $user = request()->user();
        if (! $user) {
            return;
        }

        $login = (string) ($found['card']['profile']['login'] ?? $slug);

        // Their own card is not an interesting row; everyone looks at their own.
        if (strcasecmp($login, (string) $user->github_login) === 0) {
            return;
        }

        $once = Cache::add("viewed:{$user->id}:".strtolower($login), true, now()->addHour());
        if (! $once) {
            return;
        }

        activity('lookup')
            ->causedBy($user)
            ->withProperties(['action' => 'view', 'login' => $login])
            ->log($user->name.' viewed @'.$login);
    }

    /**
     * The share preview for one card.
     *
     * og:image is the card's own render as `.png`, since scrapers reject `.svg` and several show
     * only a GIF's first frame. It is generated on first request and cached from then on.
     *
     * @param  array{owner: array<string, mixed>, card: array<string, mixed>}  $found
     * @return array<string, mixed>
     */
    private function seo(string $slug, array $found): array
    {
        $owner = $found['owner'];
        $p = $found['card']['profile'] ?? [];
        // The login keeps its real casing for display, but every URL below uses the stored slug.
        // MySQL's collation answers both casings with the same page, so pointing canonical or
        // og:image at the login would publish a second address for one card.
        $login = (string) ($p['login'] ?? $slug);
        $canonicalSlug = (string) ($owner['slug'] ?: strtolower($login));
        $name = (string) ($owner['name'] ?: $login);
        $lang = (string) ($p['top_lang'] ?? '');
        $ai = $p['ai'] ?? null;

        // The AI flavour line is already a one-sentence description written for this length, so it
        // beats anything assembled from the stat columns.
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
            // The art is portrait, and `summary_large_image` crops a tall card badly. The small
            // square of `summary` shows the whole thing.
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
