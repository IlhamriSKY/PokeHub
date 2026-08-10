<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
         * The burst half of the card-regenerate control. Five presses a day may all land in the
         * same second, and each one holds a worker for the length of the AI timeout.
         *
         * The DAILY quota is not here: the dashboard has to print how much of it is spent and when
         * it resets, and a middleware limit's counter cannot be read back out without duplicating
         * ThrottleRequests' key derivation. It lives in App\Services\RegenQuota, which the
         * controller both enforces and renders from. See the note in that class.
         *
         * A named limiter rather than plain `throttle:3,1` only for the response - the default 429
         * is a bare error page to an Inertia POST, where this lands in the `card` error bag the
         * dashboard already renders.
         */
        RateLimiter::for('card-regen', function (Request $request) {
            $user = $request->user();
            $id = $user?->github_id ?: ($user?->id ?: $request->ip());

            return Limit::perMinute(3)->by('burst:'.$id)->response(fn () => back()->withErrors([
                'card' => 'Too many regenerations at once - give it a minute.',
            ]));
        });
    }
}
