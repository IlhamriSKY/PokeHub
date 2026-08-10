<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Support\Seo;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

/**
 * The showcase cards are served from ALREADY-CACHED profile rows and never fetched at render
 * time: a cold fetch is a GitHub call plus a ~120s AI call, which a marketing page may not do on
 * a visitor's request. A login with no warm row is skipped rather than rendered empty.
 */
class LandingController extends Controller
{
    public const CACHE_KEY = 'landing.showcase';

    public function index()
    {
        return Inertia::render('landing', $this->props([
            'seo' => Seo::make([
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
     * The landing page's own props, shared with the login route.
     *
     * /login is this page with a sign-in panel over it rather than a separate destination, so it
     * has to render the same component with the same showcase behind the panel. Going through the
     * same cached query means opening the panel costs nothing extra.
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
                    // Null for a stub profile row: better three good cards than four with one broken.
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
