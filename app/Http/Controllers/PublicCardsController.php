<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\CardPayload;
use App\Support\GeneratedCards;
use App\Support\Seo;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Arr;
use Inertia\Inertia;

class PublicCardsController extends Controller
{
    /**
     * Divisible by every column count the grid settles on (it auto-fills between 2 and 8), so the
     * last row is full at any width. Held back from going higher by paint cost rather than
     * payload: every card carries the holo foil's stacked blend layers.
     *
     * Both halves of the list are already in memory by the time this applies, so CardPayload trims
     * each card on the way out rather than relying on the page size to bound the response.
     */
    private const PER_PAGE = 24;

    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $rarity = trim((string) $request->query('rarity', ''));

        $claimed = User::query()
            ->select(['id', 'name', 'slug', 'github_login', 'card'])
            ->where('is_public', true)
            ->whereNotNull('slug')
            ->whereNotNull('card')
            ->when($q !== '', function ($query) use ($q) {
                // Escape LIKE wildcards, or a search for "100%" matches everything.
                $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $q).'%';
                $query->where(fn ($w) => $w->where('name', 'like', $like)
                    ->orWhere('slug', 'like', $like)
                    ->orWhere('github_login', 'like', $like));
            })
            ->when($rarity !== '', fn ($query) => $query->where('card->rarity', $rarity))
            ->orderByDesc('updated_at')
            ->get()
            ->map(fn (User $u) => [
                'name' => $u->name,
                'slug' => $u->slug,
                'github_login' => $u->github_login,
                'card' => CardPayload::slim($u->card),
                'at' => (int) ($u->updated_at?->getTimestamp() ?? 0),
            ]);

        /*
         * Plus every card generated from the home page by someone who never signed in. Those are
         * real, public, linkable cards at /{login} - the gallery simply never looked at the table
         * they live in, so the only thing anyone could find here was the handful of claimed
         * accounts and the four homepage cards.
         *
         * Newest first, across both sources together rather than one list after the other: a card
         * generated a minute ago should be at the top whether or not anyone has claimed it. The
         * two carry different clocks - a user row's `updated_at`, a profile's `fetched_at` - so
         * each is normalised to `at` and the merged list is sorted on that.
         */
        $rows = $claimed
            ->concat(GeneratedCards::all($q, $rarity)->map(fn (array $g) => [
                'name' => $g['name'],
                'slug' => $g['slug'],
                'github_login' => $g['github_login'],
                'card' => CardPayload::slim($g['card']),
                'at' => (int) $g['fetched_at'],
            ]))
            ->sortByDesc('at')
            ->values()
            ->map(fn (array $r) => Arr::except($r, 'at'));

        $page = LengthAwarePaginator::resolveCurrentPage();
        $cards = new LengthAwarePaginator(
            $rows->forPage($page, self::PER_PAGE)->values(),
            $rows->count(),
            self::PER_PAGE,
            $page,
            ['path' => LengthAwarePaginator::resolveCurrentPath()]
        );
        $cards->withQueryString();

        return Inertia::render('cards', [
            'cards' => $cards,
            'q' => $q,
            'rarity' => $rarity,
            // Folded into the same grid as everyone else, so they answer to the search box and the
            // rarity filter like any other card rather than sitting above them as a fixed strip.
            'showcase' => $this->showcase($q, $rarity, $cards->currentPage(), $cards->lastPage()),
            'seo' => Seo::private('Card gallery | PokeHub'),
        ]);
    }

    /**
     * The landing showcase, filtered by the same terms as the card query, and sent only with the
     * LAST page. The gallery runs newest first and these four predate everything, so they belong
     * at the very end - which on a paginated list means one page, not simply "last in the array".
     *
     * Matched in PHP rather than SQL, because these live in `showcase_cards` and their renderable
     * payload is assembled from a cached `profiles` row: no single query returns them and the
     * users together. It is a handful of rows, so filtering them here costs nothing.
     *
     * @return array<int, array<string, mixed>>
     */
    private function showcase(string $q, string $rarity, int $page, int $lastPage): array
    {
        if ($page !== $lastPage) {
            return [];
        }

        $needle = mb_strtolower($q);

        return collect(app(LandingController::class)->props()['showcase'])
            ->filter(function (array $c) use ($needle, $rarity) {
                if ($rarity !== '' && ($c['rarity'] ?? '') !== $rarity) {
                    return false;
                }

                return $needle === ''
                    || str_contains(mb_strtolower((string) $c['name']), $needle)
                    || str_contains(mb_strtolower((string) $c['login']), $needle);
            })
            ->values()
            ->all();
    }
}
