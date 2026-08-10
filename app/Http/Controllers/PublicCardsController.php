<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Seo;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PublicCardsController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $rarity = trim((string) $request->query('rarity', ''));

        $cards = User::query()
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
            ->orderBy('name')
            ->paginate(10)
            ->withQueryString()
            ->through(fn (User $u) => [
                'name' => $u->name,
                'slug' => $u->slug,
                'github_login' => $u->github_login,
                'card' => $u->card,
            ]);

        return Inertia::render('cards', [
            'cards' => $cards,
            'q' => $q,
            'rarity' => $rarity,
            // The landing page's four, folded into the same grid as everyone else rather than
            // pinned above it as a feature strip. They are cards in the gallery, so they answer to
            // the search box and the rarity filter like every other card - a fixed row that ignored
            // the query would just be four results that refuse to go away.
            'showcase' => $this->showcase($q, $rarity),
            'seo' => Seo::private('Card gallery | PokeHub'),
        ]);
    }

    /**
     * The landing showcase, filtered by the same terms as the card query.
     *
     * Matched in PHP rather than SQL because these live in `showcase_cards` and their renderable
     * payload is assembled from a cached `profiles` row - there is no single query that returns
     * them and the users together. Four rows, so the cost of filtering them here is nothing.
     *
     * They are appended to the FIRST page only. The user list is paginated, and repeating four
     * fixed cards at the top of every page would push real results off the screen.
     *
     * @return array<int, array<string, mixed>>
     */
    private function showcase(string $q, string $rarity): array
    {
        if (request()->integer('page', 1) > 1) {
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
