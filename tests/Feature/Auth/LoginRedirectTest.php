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

    public function test_login_page_offers_github_only()
    {
        $this->get('/login')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('auth/login'));

        $this->post('/login')->assertMethodNotAllowed();
        $this->get('/register')->assertNotFound();
        $this->get('/forgot-password')->assertNotFound();
    }
}
