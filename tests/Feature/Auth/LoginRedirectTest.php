<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginRedirectTest extends TestCase
{
    use RefreshDatabase;

    public function test_signed_in_user_visiting_login_lands_on_the_dashboard()
    {
        $this->actingAs(User::factory()->create())
            ->get('/login')
            ->assertRedirect('/dashboard');
    }

    public function test_guest_visiting_the_dashboard_is_sent_to_login()
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    /**
     * /login renders the LANDING component with the sign-in panel flagged open, not a page of its
     * own: signing in is an overlay over the landing page so the two read as one screen. The
     * component name is the assertion that matters - if this ever goes back to 'auth/login' the
     * panel has silently become a separate page again.
     */
    public function test_login_page_offers_github_only()
    {
        $this->get('/login')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('landing')
                ->where('showLogin', true)
                ->has('showcase'));

        $this->post('/login')->assertMethodNotAllowed();
        $this->get('/register')->assertNotFound();
        $this->get('/forgot-password')->assertNotFound();
    }

    /** /admin keeps the standalone login box - a guest there wants to sign in, not read a pitch. */
    public function test_admin_shows_the_standalone_login_for_guests()
    {
        $this->get('/admin')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('auth/login'));
    }
}
