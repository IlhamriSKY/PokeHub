<?php

namespace Tests\Feature;

use App\Http\Controllers\LandingController;
use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Who can see a card at /{slug}, and who can restyle one.
 *
 * Generating for an arbitrary handle and restyling a card are separate privileges: the first is
 * public through the home page, the second is admin-only through the card lab.
 */
class CardAccessTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        $u = User::factory()->create();
        $u->assignRole('admin');

        return $u;
    }

    public function test_an_unclaimed_slug_is_a_404_for_everyone()
    {
        $this->get('/torvalds')->assertNotFound();
        $this->actingAs(User::factory()->create())->get('/torvalds')->assertNotFound();
        $this->actingAs($this->admin())->get('/torvalds')->assertNotFound();
    }

    // A showcase login is public too: the "@handle" link under each landing card points here.
    public function test_a_showcase_login_resolves_to_its_public_card()
    {
        Profile::create([
            'login' => 'torvalds',
            'github_json' => ['login' => 'torvalds', 'name' => 'Linus Torvalds', 'top_lang' => 'C'],
            'card_json' => ['ai' => null],
            'fetched_at' => 0,
        ]);
        ShowcaseCard::create(['login' => 'torvalds', 'name' => 'Linus Torvalds', 'rarity' => 'secret', 'axes' => [], 'is_active' => true]);

        $this->get('/torvalds')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card')->where('owner.name', 'Linus Torvalds'));
    }

    /**
     * Deactivating a showcase card demotes it rather than hiding the developer.
     *
     * Anyone can generate the same cached row from the home page, so refusing to render one that
     * already exists would only make the next visitor pay for a GitHub call and an AI completion
     * to see the identical card. What deactivating takes away is the curation: the editorial
     * rarity and the hand-set frame.
     */
    public function test_an_inactive_showcase_login_falls_back_to_the_plain_cached_card()
    {
        Profile::create([
            'login' => 'torvalds',
            'github_json' => ['login' => 'torvalds', 'name' => 'Linus Torvalds'],
            'card_json' => ['ai' => null],
            'fetched_at' => 0,
        ]);
        ShowcaseCard::create(['login' => 'torvalds', 'name' => 'Linus', 'rarity' => 'secret', 'axes' => [], 'is_active' => false]);

        $this->get('/torvalds')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card')
                // The curated name and rarity are gone: this is the generated card.
                ->where('owner.name', 'Linus Torvalds')
                ->whereNot('card.rarity', 'secret'));
    }

    public function test_generation_endpoint_rejects_non_admins()
    {
        // No cached row for this login, so the request takes the generation branch.
        $this->actingAs(User::factory()->create())
            ->getJson('/api/github?u=torvalds')
            ->assertForbidden();
    }

    public function test_claimed_public_card_stays_public()
    {
        User::factory()->create([
            'slug' => 'ash',
            'is_public' => true,
            'card' => ['profile' => ['login' => 'ash', 'name' => 'Ash']],
        ]);

        $this->get('/ash')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card'));
    }

    /**
     * The home page shows four real trainers beside its link to the gallery, and a hidden owner
     * must never be one of them.
     *
     * That prop puts a stranger's face and handle on the busiest page in the app, so "is_public is
     * respected" is worth pinning rather than reading off the query. The cache is cleared first
     * because the pool is cached for an hour and the rest of the suite may have filled it.
     */
    public function test_the_landing_trainers_never_include_a_private_owner()
    {
        Cache::forget(LandingController::TRAINERS_KEY);

        foreach (['shown', 'hidden'] as $login) {
            Profile::create([
                'login' => $login,
                'github_json' => ['login' => $login, 'name' => $login, 'avatar' => 'https://avatars.example/'.$login],
                'card_json' => ['ai' => null],
                'fetched_at' => 0,
            ]);
        }
        User::factory()->create(['slug' => 'hidden', 'github_login' => 'Hidden', 'is_public' => false]);

        $this->get('/')->assertOk()->assertInertia(function ($page) {
            $logins = array_column($page->toArray()['props']['trainers'], 'login');

            $this->assertContains('shown', $logins);
            $this->assertNotContains('hidden', $logins, 'a private owner was put on the home page');
        });
    }

    public function test_only_admins_can_restyle_a_card()
    {
        $victim = User::factory()->create(['card' => ['profile' => ['login' => 'x'], 'rarity' => 'common']]);
        $payload = ['key' => "user:{$victim->id}", 'rarity' => 'secret', 'axes' => ['generation' => '1-gen']];

        $this->actingAs(User::factory()->create())
            ->put('/admin/lab', $payload)
            ->assertForbidden();

        $this->actingAs($this->admin())
            ->put('/admin/lab', $payload)
            ->assertSessionHasNoErrors();

        $this->assertSame('secret', $victim->fresh()->card['rarity']);
        // The generated half must survive a restyle.
        $this->assertSame('x', $victim->fresh()->card['profile']['login']);
    }
}
