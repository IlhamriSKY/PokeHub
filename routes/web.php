<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\Api\GithubController;
use App\Http\Controllers\Api\OptionsController;
use App\Http\Controllers\AvatarController;
use App\Http\Controllers\CardImageController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GenerateCardController;
use App\Http\Controllers\LandingController;
use App\Http\Controllers\PublicCardController;
use App\Http\Controllers\PublicCardsController;
use App\Http\Controllers\SeoFilesController;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use Inertia\Inertia;

// Public: cached reads keep shared /{slug} links working for logged-out visitors. The generation
// branch inside the controller is the gated part.
Route::get('api/github', [GithubController::class, 'show'])->middleware('throttle:30,1');
// Throttled like every other public endpoint, since this dumps the whole enabled asset table and
// a browser cache does nothing to a client that ignores it.
Route::get('api/options', [OptionsController::class, 'index'])->middleware('throttle:60,1');

// The card's face, cached on our own disk (AvatarCache). Two segments, so it cannot collide with
// the `{slug}` catch-all at the bottom of this file, and public because every card page needs it.
//
// Stripped back to a static-file handler. Everything below is in the `web` group because this file
// is, and every one of them costs something on a route that only ever answers with an image:
// StartSession is a read AND a write against the database session table on each of the four faces
// a landing page asks for, and it plus ValidateCsrfToken attach two `Set-Cookie` headers, which
// stop any shared cache from honouring the `s-maxage` this route sends. HandleInertiaRequests adds
// a `Vary: X-Inertia` that splits that cache again. Nothing here reads the session - not even the
// 404, which is a self-contained blade page.
// SecurityHeaders and SubstituteBindings stay: `nosniff` matters more here than anywhere.
Route::get('avatar/{login}', [AvatarController::class, 'show'])
    ->where('login', '[A-Za-z0-9][A-Za-z0-9-]{0,38}')
    ->withoutMiddleware([
        EncryptCookies::class,
        AddQueuedCookiesToResponse::class,
        StartSession::class,
        ShareErrorsFromSession::class,
        ValidateCsrfToken::class,
        HandleInertiaRequests::class,
        AddLinkHeadersForPreloadedAssets::class,
    ])
    ->name('avatar');

Route::get('/', [LandingController::class, 'index'])->name('home');

// The home page's search box, open to logged-out visitors. POST so the captcha token stays out of
// access logs; `card-generate` is the quota standing in for a sign-in.
Route::post('generate', [GenerateCardController::class, 'store'])
    ->middleware('throttle:card-generate')
    ->name('card.generate');

// Above the catch-all slug routes at the bottom of this file: `{slug}` matches "sitemap" and
// "robots" happily, so registering these later would hand them to the card lookup.
Route::get('sitemap.xml', [SeoFilesController::class, 'sitemap'])->name('sitemap');
Route::get('robots.txt', [SeoFilesController::class, 'robots'])->name('robots');
Route::get('llms.txt', [SeoFilesController::class, 'llms'])->name('llms');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::put('dashboard/card/visibility', [DashboardController::class, 'updateVisibility'])->name('dashboard.card.visibility');
    // POST so the captcha token stays out of access logs. `card-regen` is a daily quota rather
    // than only a burst limit, because every press is a paid AI completion.
    Route::post('dashboard/card/regenerate', [DashboardController::class, 'regenerate'])
        ->middleware('throttle:card-regen')
        ->name('dashboard.card.regenerate');

    Route::get('cards', [PublicCardsController::class, 'index'])->name('cards');
});

// /admin serves the login screen to guests rather than bouncing them, so it has to stay one
// route: a `guest`-gated twin would match first and redirect real admins away.
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

/*
 * Public slug routes, which must stay last. A slug resolves through PublicCardLookup to a claimed
 * account, an active showcase card or a cached profile.
 *
 * The image route comes first, because the slug pattern excludes dots and `torvalds.svg` would
 * otherwise match nothing and 404.
 *
 * Throttled hard, and not because of the database: a cache miss launches headless Chromium and
 * holds the worker for the length of the render. CardCapture also locks per card, so together they
 * bound this at one browser per card rather than one per request.
 */
Route::get('{slug}.{format}', [CardImageController::class, 'show'])
    ->middleware('throttle:6,1')
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->where('format', 'gif|svg|png')
    ->name('public.card.image');

Route::get('{slug}', [PublicCardController::class, 'show'])
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->name('public.card');
