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
            // The landing page's four, through the same cached query. Only on the unfiltered first
            // view: once someone is searching, a fixed row of cards that ignore their query is not
            // a feature, it is four results that will not go away.
            'showcase' => $q === '' && $rarity === '' ? app(LandingController::class)->props()['showcase'] : [],
            'seo' => Seo::private('Card gallery | PokeHub'),
        ]);
    }
}
