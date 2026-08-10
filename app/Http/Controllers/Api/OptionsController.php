<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardAsset;

/**
 * The Laravel port of api/options.php.
 *   GET /api/options.php
 * Every enabled card option grouped by category, so the Card Lab is entirely
 * DB-driven. Defaults come from CardAssetSeeder via `php artisan db:seed`.
 */
class OptionsController extends Controller
{
    public function index()
    {
        // No self-seeding here any more. This endpoint is public and unauthenticated, so an empty
        // table meant any anonymous GET kicked off a write-heavy seeder - several at once under
        // concurrency. CardAssetSeeder is already wired into DatabaseSeeder, so `php artisan
        // db:seed` is the one place a fresh install gets its defaults.
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
