<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Support\Env;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;

/**
 * Read .env through $_ENV/$_SERVER only -- never getenv()/putenv().
 *
 * putenv() writes to the PROCESS, not the request. Apache here is mod_php with 64 worker
 * THREADS in a single process shared by every Laragon site, and Laravel's Env repository
 * registers a PutenvAdapter by default. So a request to a neighbouring Laravel app leaks its
 * whole .env into this process, and because Dotenv loads IMMUTABLY it then refuses to
 * overwrite those values for us -- PokeHub would boot with someone else's config.
 *
 * That was not theoretical: hitting SIASKA-NEW (SESSION_DRIVER=redis, REDIS_CLIENT=predis)
 * and then pokehub.dev made PokeHub 500 four times out of five with
 * `Class "Predis\Client" not found` from PredisConnector -- PokeHub is database-session and
 * has no predis -- while rendering SIASKA's APP_NAME. Requests to PokeHub alone failed ~30%
 * of the time for the same reason, depending on which app last used that worker thread.
 *
 * Disabling putenv makes this app both immune (it stops READING the process-global values)
 * and a good neighbour (it stops WRITING its own). It must run before the framework's
 * LoadEnvironmentVariables bootstrapper, i.e. here, above Application::configure().
 *
 * Note this only protects PokeHub; other Laragon apps still poison each other until they do
 * the same, or until PHP is served per-app (FastCGI/FPM) instead of one shared mod_php process.
 */
Env::disablePutenv();

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            SecurityHeaders::class,
        ]);

        // spatie/laravel-permission middleware aliases for role/permission gating.
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
