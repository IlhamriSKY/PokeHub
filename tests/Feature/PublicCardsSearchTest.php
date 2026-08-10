<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCardsSearchTest extends TestCase
{
    use RefreshDatabase;

    private function card(array $attrs): User
    {
        return User::factory()->create($attrs + [
            'card' => ['profile' => ['name' => 'x'], 'rarity' => 'holo'],
        ]);
    }

    public function test_private_cards_are_never_listed()
    {
        $this->card(['name' => 'Public Pat', 'slug' => 'pat', 'is_public' => true]);
        $this->card(['name' => 'Private Pam', 'slug' => 'pam', 'is_public' => false]);

        $this->actingAs(User::factory()->create())
            ->get('/cards')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('cards')
                ->where('cards.total', 1)
                ->where('cards.data.0.slug', 'pat'));
    }

    public function test_listing_never_exposes_another_users_private_columns()
    {
        $this->card([
            'name' => 'Public Pat',
            'slug' => 'pat',
            'is_public' => true,
            'email' => 'pat@example.test',
            'github_id' => '99887766',
        ]);

        $body = $this->actingAs(User::factory()->create())->get('/cards')->getContent();

        $this->assertStringNotContainsString('pat@example.test', $body);
        $this->assertStringNotContainsString('99887766', $body);
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringContainsString('Public Pat', $body);
    }

    public function test_search_filters_by_name_and_github_handle()
    {
        $this->card(['name' => 'Ash Ketchum', 'slug' => 'ash', 'github_login' => 'ash', 'is_public' => true]);
        $this->card(['name' => 'Misty', 'slug' => 'misty', 'github_login' => 'waterlily', 'is_public' => true]);

        $user = User::factory()->create();

        $this->actingAs($user)->get('/cards?q=ketchum')
            ->assertInertia(fn ($page) => $page->where('cards.total', 1)->where('cards.data.0.slug', 'ash'));

        // Handle, not name - proves the orWhere leg is reachable.
        $this->actingAs($user)->get('/cards?q=waterlily')
            ->assertInertia(fn ($page) => $page->where('cards.total', 1)->where('cards.data.0.slug', 'misty'));
    }

    public function test_rarity_filter_narrows_the_list_and_stacks_with_the_search()
    {
        User::factory()->create([
            'name' => 'Holo Hal', 'slug' => 'hal', 'is_public' => true,
            'card' => ['profile' => ['name' => 'Hal'], 'rarity' => 'holo'],
        ]);
        User::factory()->create([
            'name' => 'Common Cam', 'slug' => 'cam', 'is_public' => true,
            'card' => ['profile' => ['name' => 'Cam'], 'rarity' => 'common'],
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)->get('/cards?rarity=holo')
            ->assertInertia(fn ($page) => $page->where('cards.total', 1)->where('cards.data.0.slug', 'hal'));

        // Both filters at once: the name matches Cam, but the rarity does not.
        $this->actingAs($user)->get('/cards?q=cam&rarity=holo')
            ->assertInertia(fn ($page) => $page->where('cards.total', 0));
    }

    public function test_like_wildcards_in_the_query_are_escaped()
    {
        $this->card(['name' => 'Brock', 'slug' => 'brock', 'is_public' => true]);

        $this->actingAs(User::factory()->create())
            ->get('/cards?q=%')
            ->assertInertia(fn ($page) => $page->where('cards.total', 0));
    }

    public function test_dashboard_hides_a_card_that_belongs_to_another_handle()
    {
        $user = User::factory()->create([
            'github_login' => 'ilhamrisky',
            'card' => ['profile' => ['login' => 'torvalds', 'name' => 'Linus Torvalds'], 'rarity' => 'holo'],
        ]);

        $this->actingAs($user)->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('dashboard')->where('profile.card', null));
    }

    public function test_dashboard_keeps_a_card_that_is_yours_regardless_of_handle_case()
    {
        $user = User::factory()->create([
            'github_login' => 'IlhamriSKY',
            'card' => ['profile' => ['login' => 'ilhamrisky', 'name' => 'Ilham'], 'rarity' => 'holo'],
        ]);

        $this->actingAs($user)->get('/dashboard')
            ->assertInertia(fn ($page) => $page->where('profile.card.profile.name', 'Ilham'));
    }

    public function test_user_can_flip_their_card_between_public_and_private()
    {
        $user = $this->card(['slug' => 'me', 'is_public' => true]);

        $this->actingAs($user)->put('/dashboard/card/visibility', ['is_public' => false]);
        $this->assertFalse($user->fresh()->is_public);

        $this->actingAs($user)->put('/dashboard/card/visibility', ['is_public' => true]);
        $this->assertTrue($user->fresh()->is_public);
    }
}
