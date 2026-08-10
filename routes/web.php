<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\Api\GithubController;
use App\Http\Controllers\Api\OptionsController;
use App\Http\Controllers\CardImageController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LandingController;
use App\Http\Controllers\PublicCardController;
use App\Http\Controllers\PublicCardsController;
use App\Http\Controllers\SeoFilesController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Public on purpose: cached reads keep shared /{slug} links working for logged-out
// visitors. The generation branch inside the controller is the part that is gated.
Route::get('api/github.php', [GithubController::class, 'show'])->middleware('throttle:30,1');
// Throttled like every other public endpoint: this dumps the whole enabled asset table, and a
// 30s browser cache does nothing to an attacker who ignores it.
Route::get('api/options.php', [OptionsController::class, 'index'])->middleware('throttle:60,1');

Route::get('/', [LandingController::class, 'index'])->name('home');

// Machine-readable, and deliberately ABOVE the catch-all slug routes at the bottom of this file:
// `{slug}` matches "sitemap" and "robots" happily, so registering these later would have handed
// them to the card lookup and 404'd them.
Route::get('sitemap.xml', [SeoFilesController::class, 'sitemap'])->name('sitemap');
Route::get('robots.txt', [SeoFilesController::class, 'robots'])->name('robots');
Route::get('llms.txt', [SeoFilesController::class, 'llms'])->name('llms');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::put('dashboard/card/visibility', [DashboardController::class, 'updateVisibility'])->name('dashboard.card.visibility');
    // POST so the captcha token stays out of access logs. `card-regen` is a daily QUOTA, not just
    // a burst limit: every press is a paid AI completion. See AppServiceProvider.
    Route::post('dashboard/card/regenerate', [DashboardController::class, 'regenerate'])
        ->middleware('throttle:card-regen')
        ->name('dashboard.card.regenerate');

    Route::get('cards', [PublicCardsController::class, 'index'])->name('cards');
});

// /admin serves the login screen to guests instead of bouncing them, so it must stay
// ONE route: a `guest`-gated twin would match first and redirect real admins away.
Route::get('admin', function (Request $request) {
    if (! Auth::check()) {
        // Send them back to /admin after login rather than to the default home.
        $request->session()->put('url.intended', route('admin.index'));

        return Inertia::render('auth/login', [
            'status' => $request->session()->get('status'),
        ]);
    }
    abort_unless($request->user()->hasRole('admin'), 403);

    return app(AdminController::class)->index();
})->name('admin.index');

// No '/' route here: /admin above already owns it.
Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('users', [AdminController::class, 'users'])->name('users');
    Route::put('users/{user}', [AdminController::class, 'updateUser'])->name('users.update');
    Route::delete('users/{user}', [AdminController::class, 'deleteUser'])->name('users.delete');
    Route::get('cards', [AdminController::class, 'cards'])->name('cards');
    Route::put('cards/{user}', [AdminController::class, 'moderateCard'])->name('cards.moderate');
    Route::get('assets', [AdminController::class, 'assets'])->name('assets');
    Route::post('assets', [AdminController::class, 'saveAsset'])->name('assets.save');
    Route::post('assets/{asset}/toggle', [AdminController::class, 'toggleAsset'])->name('assets.toggle');
    Route::delete('assets/{asset}', [AdminController::class, 'deleteAsset'])->name('assets.delete');
    Route::get('activity', [AdminController::class, 'activity'])->name('activity');
    // Restyle any card, including the four on the landing page.
    Route::get('lab', [AdminController::class, 'lab'])->name('lab');
    Route::put('lab', [AdminController::class, 'saveLab'])->name('lab.save');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

// Public slug routes - MUST be last. A slug is a claimed account or an active showcase card
// (PublicCardLookup); `.svg` is the same card as one embeddable animated file for a README.
// The .svg route comes FIRST: the slug pattern excludes dots, so `torvalds.svg` would otherwise
// match nothing at all and 404.
// The card as a README image: `.gif` animated, `.svg` still. Both are screenshots of the real
// card page (CardCapture), which is why they cannot disagree with it or with each other.
// Throttled hard, and for once not because of the database: a cache miss here launches a headless
// Chromium and holds the worker for the length of the render. CardCapture also locks per card, so
// the two together bound this at one browser per card rather than one per request.
Route::get('{slug}.{format}', [CardImageController::class, 'show'])
    ->middleware('throttle:6,1')
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->where('format', 'gif|svg|png')
    ->name('public.card.image');

Route::get('{slug}', [PublicCardController::class, 'show'])
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->name('public.card');
