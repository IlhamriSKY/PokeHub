<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * /admin is the admin entry point: it serves the login screen to guests (rather than bouncing
 * them to /login), the dashboard to admins, and 403 to everyone else. The rest of the /admin/*
 * pages stay plain auth+role gated.
 */
class AdminEntryTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        $u = User::factory()->create();
        $u->assignRole('admin');

        return $u;
    }

    public function test_guests_get_the_login_screen_on_admin_not_a_redirect()
    {
        $this->get('/admin')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('auth/login'));
    }

    public function test_guests_landing_on_admin_are_sent_back_to_admin_after_login()
    {
        $this->get('/admin')->assertOk();

        $this->assertSame(route('admin.index'), session('url.intended'));
    }

    public function test_admins_get_the_dashboard()
    {
        $this->actingAs($this->admin());

        $this->get('/admin')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/index'));
    }

    public function test_signed_in_non_admins_are_forbidden()
    {
        $this->actingAs(User::factory()->create());

        $this->get('/admin')->assertForbidden();
    }

    public function test_other_admin_pages_still_redirect_guests_to_login()
    {
        $this->get('/admin/assets')->assertRedirect('/login');
        $this->get('/admin/users')->assertRedirect('/login');
    }

    /**
     * Each row carries the card itself, because it draws a thumbnail: the public image route 404s
     * on exactly the private cards this page exists to moderate. The stat columns are read off
     * that same blob rather than extracted again in SQL, so this pins both halves at once.
     */
    public function test_the_card_list_ships_a_card_to_draw_and_stats_that_match_it()
    {
        User::factory()->create([
            'slug' => 'ash',
            'github_login' => 'ash',
            'is_public' => false,
            'card' => [
                'rarity' => 'secret',
                'axes' => ['generation' => 'tcg-gen'],
                'profile' => [
                    'login' => 'ash',
                    'name' => 'Ash',
                    'followers' => 12,
                    'stars' => 34,
                    'top_repos' => [['name' => 'never drawn']],
                ],
            ],
        ]);

        $this->actingAs($this->admin())
            ->get('/admin/cards')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/cards')
                ->where('cards.data.0.rarity', 'secret')
                ->where('cards.data.0.github', 'ash')
                ->where('cards.data.0.followers', 12)
                ->where('cards.data.0.stars', 34)
                // Enough for the face to render, even though the card is private.
                ->where('cards.data.0.card.profile.login', 'ash')
                ->where('cards.data.0.card.rarity', 'secret')
                // Still trimmed of what the face never prints.
                ->missing('cards.data.0.card.profile.top_repos'));
    }

    public function test_admin_index_route_name_still_resolves_to_admin()
    {
        $this->assertSame(url('/admin'), route('admin.index'));
    }
}
