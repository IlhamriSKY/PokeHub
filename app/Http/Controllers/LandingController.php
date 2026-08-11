<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Support\Seo;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

/**
 * The home page and its showcase.
 *
 * Showcase cards come from already-cached profile rows and are never fetched at render time: a
 * cold fetch is a GitHub call plus an AI call, which the home page should not make a visitor wait
 * for. A login with no cached row is skipped rather than rendered empty.
 */
class LandingController extends Controller
{
    public const CACHE_KEY = 'landing.showcase';

    public function index()
    {
        return Inertia::render('landing', $this->props([
            'seo' => Seo::make([
                'title' => config('app.name').' - any GitHub profile as a Pokemon card',
                'description' => 'Look up any GitHub username and get a Pokemon-style trading card built from their public profile. '
                    .'Followers become HP, stars become attack damage, the top language picks the element. No account needed.',
                'imageAlt' => 'PokeHub - a GitHub profile rendered as a Pokemon-style trading card',
                'canonical' => url('/'),
                'jsonLd' => [
                    '@context' => 'https://schema.org',
                    '@type' => 'WebSite',
                    'name' => config('app.name'),
                    'url' => url('/'),
                    'description' => Seo::make()['description'],
                ],
            ]),
        ]));
    }

    /**
     * The landing page's props, shared with the login route.
     *
     * /login renders this same page with a sign-in panel over it, so it needs the same showcase
     * behind the panel. Sharing the cached query means opening the panel costs nothing extra.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public function props(array $extra = []): array
    {
        $showcase = Cache::remember(self::CACHE_KEY, now()->addHour(), function () {
            $cards = ShowcaseCard::where('is_active', true)->orderBy('sort_order')->get();

            $rows = Profile::whereIn('login', $cards->pluck('login'))
                ->get()
                ->keyBy(fn (Profile $p) => strtolower($p->login));

            return $cards
                ->map(function (ShowcaseCard $card) use ($rows) {
                    // Null when the profile row is a stub, so the card is dropped below.
                    $payload = $card->cardPayload($rows->get(strtolower($card->login)));

                    return $payload ? [
                        'login' => strtolower($card->login),
                        'name' => $card->name,
                        'why' => $card->why,
                    ] + $payload : null;
                })
                ->filter()
                ->values()
                ->all();
        });

        return ['showcase' => $showcase] + $extra;
    }
}
