<?php

namespace App\Http\Controllers;

use App\Models\User;
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

        return Inertia::render('cards', ['cards' => $cards, 'q' => $q, 'rarity' => $rarity]);
    }
}
