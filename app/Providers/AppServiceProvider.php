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
         * The burst half of the card-regenerate control: a day's presses can all land in the same
         * second, and each one holds a worker for the length of the AI timeout.
         *
         * The daily quota lives in App\Services\RegenQuota instead, because the dashboard has to
         * print how much of it is spent and a middleware limit's counter cannot be read back out
         * without duplicating ThrottleRequests' key derivation.
         *
         * Named rather than `throttle:3,1` only for the response: the default 429 is a bare error
         * page to an Inertia POST, where this lands in the error bag the dashboard renders.
         */
        RateLimiter::for('card-regen', function (Request $request) {
            $user = $request->user();
            $id = $user?->github_id ?: ($user?->id ?: $request->ip());

            return Limit::perMinute(3)->by('burst:'.$id)->response(fn () => back()->withErrors([
                'card' => 'Too many regenerations at once. Give it a minute.',
            ]));
        });

        /*
         * The home page's public search. There is no account to key a quota on, so the IP carries
         * both halves: a burst limit because one miss holds a worker for the AI timeout, and a
         * daily one because a miss is also a paid completion.
         *
         * Repeat searches for an already-cached handle are the common case and cost only a
         * primary-key read, so most visitors never meet either limit.
         */
        RateLimiter::for('card-generate', function (Request $request) {
            $by = $request->user()?->id ?: $request->ip();
            $tooFast = fn () => back()->withErrors(['login' => 'Too many lookups at once. Give it a minute.']);

            return [
                Limit::perMinute(4)->by('generate:burst:'.$by)->response($tooFast),
                Limit::perDay(20)->by('generate:daily:'.$by)->response(fn () => back()->withErrors([
                    'login' => 'That is enough card generating for one day. Try again tomorrow.',
                ])),
            ];
        });
    }
}
