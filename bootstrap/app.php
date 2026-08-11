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
 * Read .env through $_ENV/$_SERVER only, never getenv()/putenv().
 *
 * putenv() writes to the process rather than the request. Under a threaded mod_php where several
 * sites share one process, a neighbouring Laravel app leaks its whole .env in, and because Dotenv
 * loads immutably this app then refuses to overwrite those values: it boots with another site's
 * config, which surfaces as intermittent failures depending on which app last used the thread.
 *
 * Disabling putenv makes this app both immune (it stops reading the process-global values) and a
 * good neighbour (it stops writing its own). It has to run before the framework's
 * LoadEnvironmentVariables bootstrapper, so it lives here rather than in a service provider.
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
