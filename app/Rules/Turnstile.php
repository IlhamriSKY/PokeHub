<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Request;

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

        $res = Http::asForm()->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
            'secret' => config('services.turnstile.secret_key'),
            'response' => $value,
            'remoteip' => Request::ip(),
        ]);

        if (! ($res->json('success') === true)) {
            $fail('Captcha verification failed. Please try again.');
        }
    }
}
