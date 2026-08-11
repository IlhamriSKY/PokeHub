<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardAsset;

/**
 * Every enabled card option, grouped by category, so the card lab is entirely database-driven.
 * Defaults come from CardAssetSeeder via `php artisan db:seed`.
 */
class OptionsController extends Controller
{
    public function index()
    {
        // An empty table answers with an empty object rather than seeding itself: this endpoint is
        // public and unauthenticated, so self-seeding would let any anonymous GET start a
        // write-heavy seeder, several at once under concurrency.
        $out = [];
        $rows = CardAsset::where('enabled', 1)
            ->orderBy('category')->orderBy('sort_order')->orderBy('label')
            ->get(['id', 'category', 'slug', 'label', 'generation', 'asset_url', 'meta']);

        foreach ($rows as $row) {
            $out[$row->category][] = [
                'id' => (int) $row->id,
                'slug' => $row->slug,
                'label' => $row->label,
                'generation' => $row->generation,
                'asset_url' => $row->asset_url,
                'meta' => $row->meta, // already cast to array
            ];
        }

        return response()->json($out, 200, [
            'Cache-Control' => 'public, max-age=30',
        ], JSON_UNESCAPED_UNICODE);
    }
}
