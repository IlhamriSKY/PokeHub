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
     * Renders the landing component rather than `auth/login`, because signing in is a panel over
     * the landing page rather than a separate screen. A direct hit on /login then looks identical
     * to clicking Sign in from the landing itself.
     *
     * `auth/login` is still used on its own by /admin, where a guest should meet a login box
     * rather than a marketing page.
     */
    public function create(Request $request): Response
    {
        return Inertia::render('landing', app(LandingController::class)->props([
            'showLogin' => true,
            'status' => $request->session()->get('status'),
            // Same markup as "/" at a second address, so indexing it would compete with the home
            // page for identical content.
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
