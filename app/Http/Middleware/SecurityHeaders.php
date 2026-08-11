<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Response headers that close a class of browser-side attack.
 *
 * Set in the app rather than in .htaccess, which only applies when Apache serves the site and
 * mod_headers is loaded. A header that silently stops being sent is worse than none.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Browsers ignore HSTS over plain HTTP, so sending it unconditionally is safe. No
        // includeSubDomains: that is a year-long commitment for every subdomain, and pinning one
        // that is not on HTTPS yet takes it offline with no quick way back.
        $response->headers->set('Strict-Transport-Security', 'max-age=31536000');

        // Uploaded card art under public/img/uploads is served straight by the web server, and
        // nosniff keeps a mistyped image from being reinterpreted as HTML.
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');

        // A public card page carries the slug in its path and links out to GitHub, so send the
        // origin across an origin boundary, never the path.
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // No CSP yet: holo.css drives the foil through inline style attributes and Vite injects
        // its own inline bootstrap, so a useful policy needs nonces threaded through the Blade
        // root view first. Better none than one loose enough to mean nothing.
        return $response;
    }
}
