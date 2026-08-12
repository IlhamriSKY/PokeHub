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

/*
 * The session and Inertia middleware, dropped from the routes that answer with a cached asset
 * rather than a page. Everything in this file is in the `web` group because the file is, and every
 * one of these costs something on a route that never reads a session.
 *
 * StartSession is a read AND a write against the database session table - on each of the four faces
 * a landing page asks for - and it plus ValidateCsrfToken attach two `Set-Cookie` headers.
 * That is two separate problems for a cached route: a shared cache will not honour the `s-maxage`
 * these routes send while a `Set-Cookie` is on the response, and one that is configured to store it
 * anyway would be keeping somebody's session cookie next to a public body. `Cache-Control: public`
 * is only honest once the cookie is gone. HandleInertiaRequests adds a `Vary: X-Inertia` that
 * splits the cache again.
 *
 * SecurityHeaders and SubstituteBindings stay: `nosniff` matters more here than anywhere.
 *
 * NOT applied to `api/github`, which is the one of these that does read the session - it checks for
 * the admin role before it will generate. That route answers `private` instead.
 */
$stateless = [
    EncryptCookies::class,
    AddQueuedCookiesToResponse::class,
    StartSession::class,
    ShareErrorsFromSession::class,
    ValidateCsrfToken::class,
    HandleInertiaRequests::class,
    AddLinkHeadersForPreloadedAssets::class,
];

// Public: cached reads keep shared /{slug} links working for logged-out visitors. The generation
// branch inside the controller is the gated part, and is why this one keeps its session.
Route::get('api/github', [GithubController::class, 'show'])->middleware('throttle:30,1');
// Throttled like every other public endpoint, since this dumps the whole enabled asset table and
// a browser cache does nothing to a client that ignores it.
Route::get('api/options', [OptionsController::class, 'index'])
    ->middleware('throttle:60,1')
    ->withoutMiddleware($stateless);

// The card's face, cached on our own disk (AvatarCache). Two segments, so it cannot collide with
// the `{slug}` catch-all at the bottom of this file, and public because every card page needs it.
// Nothing here reads the session - not even the 404, which is a self-contained blade page.
Route::get('avatar/{login}', [AvatarController::class, 'show'])
    ->where('login', '[A-Za-z0-9][A-Za-z0-9-]{0,38}')
    ->withoutMiddleware($stateless)
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
 * Optional local-only developer routes.
 *
 * `routes/dev.php` is gitignored, so it exists on an individual machine and never in a clone or a
 * deploy - which makes this require inert everywhere else. Whatever a developer puts there is
 * responsible for its own access control; the environment is deliberately not consulted here,
 * because this project runs with APP_ENV=production locally as well.
 */
if (is_file($dev = __DIR__.'/dev.php')) {
    require $dev;
}

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
    // Same treatment as the avatar route, and for the same reason: this answers with a file, reads
    // no session, and sends `s-maxage` that a `Set-Cookie` would have made every shared cache
    // ignore. It is the route where that matters most - these URLs are embedded in READMEs, so a
    // CDN hit is the difference between serving a cached file and waking Chromium.
    ->withoutMiddleware($stateless)
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->where('format', 'gif|svg|png')
    ->name('public.card.image');

Route::get('{slug}', [PublicCardController::class, 'show'])
    ->where('slug', '[A-Za-z0-9][A-Za-z0-9-]*')
    ->name('public.card');
