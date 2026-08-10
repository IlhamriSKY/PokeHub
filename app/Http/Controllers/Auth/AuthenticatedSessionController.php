<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Controllers\LandingController;
use App\Support\Seo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Show the login page.
     *
     * Renders the LANDING component, not `auth/login`: signing in is a panel over the landing page
     * rather than a separate screen, so /login has to serve the page it floats above. That keeps a
     * direct hit on /login (a bookmark, the `auth` middleware bouncing a guest off /dashboard, or
     * GitHub handing back a failure) looking identical to clicking Sign in from the landing itself.
     *
     * `auth/login` still exists and is still used - /admin renders it standalone, where dropping a
     * guest onto a marketing page instead of a login box would be the wrong answer.
     */
    public function create(Request $request): Response
    {
        return Inertia::render('landing', app(LandingController::class)->props([
            'showLogin' => true,
            'status' => $request->session()->get('status'),
            // Same markup as the landing page at a second address. Indexing it would compete with
            // "/" for the identical content, and a login screen is nobody's search result.
            'seo' => Seo::private('Log in to PokeHub'),
        ]));
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
