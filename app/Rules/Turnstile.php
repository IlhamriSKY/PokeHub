<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Request;
use Throwable;

/**
 * Cloudflare Turnstile server-side verification. A no-op unless services.turnstile.enabled is
 * true, so local development works without keys.
 */
class Turnstile implements ValidationRule
{
    /**
     * Implicit, so the rule still runs when the field is absent, empty or null. Laravel skips a
     * non-implicit rule object in all three cases, which would let a request omit the token and
     * pass validation with the captcha switched on.
     */
    public bool $implicit = true;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! config('services.turnstile.enabled')) {
            return;
        }

        if (! $value) {
            $fail('Please complete the captcha.');

            return;
        }

        /*
         * Timeboxed and caught, like every other outbound call in this app. This one runs inside
         * validation on a public route, which makes both halves matter more than usual: with no
         * timeout a hung Cloudflare holds the worker for PHP's default socket timeout, and an
         * uncaught ConnectionException leaves a validation rule throwing a 500 at a visitor who
         * typed a username.
         */
        try {
            $res = Http::asForm()
                ->connectTimeout(5)
                ->timeout(10)
                ->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
                    'secret' => config('services.turnstile.secret_key'),
                    'response' => $value,
                    'remoteip' => Request::ip(),
                ]);
        } catch (Throwable) {
            // Closed, not open. This captcha is the only thing in front of a paid AI completion, so
            // an unreachable verifier must not become the way to skip it.
            $fail('Could not reach the captcha service. Please try again.');

            return;
        }

        if (! ($res->json('success') === true)) {
            $fail('Captcha verification failed. Please try again.');
        }
    }
}
