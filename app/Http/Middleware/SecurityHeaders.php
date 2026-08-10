<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The four response headers that cost nothing and close a whole class of browser-side attack.
 *
 * In the app rather than in .htaccess on purpose: public/.htaccess only fires when Apache serves
 * the site AND mod_headers is loaded, and neither is guaranteed on a host that has not been
 * touched yet. A header that silently stops being sent is worse than none.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Browsers ignore HSTS delivered over plain HTTP, so sending it unconditionally is safe.
        // No includeSubDomains: that is a year-long commitment for every subdomain, and pinning
        // one that is not on HTTPS yet takes it offline with no quick way back.
        $response->headers->set('Strict-Transport-Security', 'max-age=31536000');

        // The uploaded card art lives under public/img/uploads and is served straight by the web
        // server; nosniff is what keeps a mis-typed image from being re-interpreted as HTML.
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');

        // A public card page carries the slug in its path, and the card links out to GitHub -
        // so send the origin across, never the path.
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // ponytail: no CSP. holo.css drives the foil through inline style attributes and Vite
        // injects its own inline bootstrap, so a useful policy needs nonces threaded through the
        // Blade root view first; add it there rather than shipping a policy loose enough to mean
        // nothing.
        return $response;
    }
}
