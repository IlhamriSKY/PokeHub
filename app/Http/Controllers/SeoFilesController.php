<?php

namespace App\Http\Controllers;

use App\Models\ShowcaseCard;
use App\Models\User;
use App\Support\Seo;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Response;

/**
 * The three machine-readable files: sitemap.xml, robots.txt and llms.txt.
 *
 * Served by routes rather than dropped in public/ because two of the three list every public card,
 * and that set changes whenever somebody signs in or flips their card public. A static file would
 * be stale within a day and there is nothing to regenerate it.
 */
class SeoFilesController extends Controller
{
    /** Long enough that a crawler never drives the query, short enough that a new card is found. */
    private const TTL = 1800;

    /** @return array<int, array{loc: string, lastmod: string|null}> */
    private function publicCards(): array
    {
        return Cache::remember('seo.public-cards', self::TTL, function () {
            $users = User::query()
                ->where('is_public', true)
                ->whereNotNull('slug')
                ->whereNotNull('card')
                ->orderBy('slug')
                ->get(['slug', 'updated_at'])
                ->map(fn (User $u) => ['loc' => url('/'.$u->slug), 'lastmod' => $u->updated_at?->toAtomString()]);

            // The showcase logins are public pages too, and they are the ones with something to
            // show on an empty site - leaving them out would make the sitemap read as almost bare.
            $showcase = ShowcaseCard::where('is_active', true)
                ->orderBy('sort_order')
                ->get(['login', 'updated_at'])
                ->map(fn (ShowcaseCard $c) => ['loc' => url('/'.strtolower($c->login)), 'lastmod' => $c->updated_at?->toAtomString()]);

            return $users->concat($showcase)->unique('loc')->values()->all();
        });
    }

    public function sitemap()
    {
        $urls = array_merge(
            [['loc' => url('/'), 'lastmod' => null, 'priority' => '1.0', 'changefreq' => 'daily']],
            array_map(fn (array $c) => $c + ['priority' => '0.8', 'changefreq' => 'weekly'], $this->publicCards()),
        );

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";
        foreach ($urls as $u) {
            $xml .= '  <url>'."\n";
            $xml .= '    <loc>'.e($u['loc']).'</loc>'."\n";
            if (! empty($u['lastmod'])) {
                $xml .= '    <lastmod>'.e($u['lastmod']).'</lastmod>'."\n";
            }
            $xml .= '    <changefreq>'.$u['changefreq'].'</changefreq>'."\n";
            $xml .= '    <priority>'.$u['priority'].'</priority>'."\n";
            $xml .= '  </url>'."\n";
        }
        $xml .= '</urlset>'."\n";

        return Response::make($xml, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }

    public function robots()
    {
        /*
         * .gif and .svg are disallowed because each cold hit launches Chromium, and a crawler
         * walking every card in both formats pays for renders nobody reads. They are README
         * embeds, not search results.
         *
         * .png is NOT disallowed, and that is deliberate: it is the og:image every card page
         * points at, and Twitter's card crawler (among others) honours robots.txt before fetching
         * a preview image. Blocking it here would silently turn every shared link back into a
         * bare title - the exact thing this whole file exists to avoid.
         */
        $body = implode("\n", [
            'User-agent: *',
            'Allow: /',
            'Disallow: /dashboard',
            'Disallow: /admin',
            'Disallow: /settings',
            'Disallow: /login',
            'Disallow: /cards',
            'Disallow: /auth/',
            'Disallow: /api/',
            'Disallow: /*.gif$',
            'Disallow: /*.svg$',
            '',
            'Sitemap: '.url('/sitemap.xml'),
            '',
        ]);

        return Response::make($body, 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    /**
     * llms.txt - the emerging convention for telling a language model what a site is, in prose it
     * can actually use, instead of leaving it to infer from a React bundle it cannot execute.
     */
    public function llms()
    {
        $cards = $this->publicCards();
        $sample = array_slice($cards, 0, 25);

        $lines = [
            '# PokeHub',
            '',
            '> '.Seo::make()['description'],
            '',
            '## What it is',
            '',
            'PokeHub reads a public GitHub profile and renders it as a Pokemon-style trading card.',
            'Nothing on the card is chosen by the user - every value is derived from the profile:',
            '',
            '- Element / type comes from the language they write most',
            '- HP comes from follower count',
            '- Attack damage comes from stars',
            '- Retreat cost comes from public repository count',
            '- Rarity is scored from all of the above together',
            '- The species name, flavour text and both attacks are written by an LLM',
            '',
            'Signing in is GitHub OAuth for identity only. Repository access is never requested,',
            'and only public profile data is read.',
            '',
            '## URLs',
            '',
            '- '.url('/').' - landing page, with four example cards',
            '- '.url('/{username}').' - one person\'s public card page',
            '- '.url('/{username}.png').' - that card as a still image (link previews)',
            '- '.url('/{username}.svg').' - that card as a still image (README embed)',
            '- '.url('/{username}.gif').' - that card animated, with the foil moving',
            '- '.url('/sitemap.xml').' - every public card',
            '',
            'Card images render on demand with headless Chromium and are cached, so a first request',
            'for an uncached card can take several seconds.',
            '',
            '## Attribution',
            '',
            'PokeHub is an unofficial fan project. It has no affiliation with, endorsement by, or',
            'connection to Nintendo, Game Freak, Creatures Inc. or The Pokemon Company. Pokemon and',
            'all related names are their trademarks. Nothing here is for sale.',
            'Card frames and stamps come from pokecardgenerator.com; the holo foil is built on',
            'poke-holo.simey.me (simeydotme).',
            '',
            '## Public cards ('.count($cards).' total'.(count($cards) > count($sample) ? ', first '.count($sample).' listed' : '').')',
            '',
        ];

        foreach ($sample as $c) {
            $lines[] = '- '.$c['loc'];
        }
        $lines[] = '';

        return Response::make(implode("\n", $lines), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }
}
