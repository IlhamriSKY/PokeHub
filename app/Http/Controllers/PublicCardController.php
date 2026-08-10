<?php

namespace App\Http\Controllers;

use App\Services\PublicCardLookup;
use Inertia\Inertia;

class PublicCardController extends Controller
{
    public function show(string $slug, PublicCardLookup $lookup)
    {
        $found = $lookup->find($slug);

        abort_if(! $found, 404);

        return Inertia::render('public-card', $found);
    }
}
