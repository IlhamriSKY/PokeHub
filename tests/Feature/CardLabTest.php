<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class CardLabTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        $u = User::factory()->create();
        $u->assignRole('admin');

        return $u;
    }

    private function text(array $over = []): array
    {
        return $over + [
            'name' => 'Ash Ketchum',
            'species' => 'Code Trainer',
            'flavor' => 'Ships to production without fear.',
            'effect' => '',
            'attacks' => [['name' => 'Quick Commit', 'cost' => 2, 'damage' => '40', 'desc' => 'A swift push to main.']],
        ];
    }

    public function test_admin_can_rewrite_a_users_card_text_without_touching_generated_data()
    {
        $victim = User::factory()->create([
            'card' => [
                'profile' => ['login' => 'ash', 'name' => 'Old Name', 'followers' => 42, 'ai' => ['species' => 'Old', 'flavor' => 'Old']],
                'rarity' => 'common',
            ],
        ]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', ['key' => "user:{$victim->id}", 'rarity' => 'holo', 'axes' => [], 'text' => $this->text()])
            ->assertSessionHasNoErrors();

        $card = $victim->fresh()->card;
        $this->assertSame('Ash Ketchum', $card['profile']['name']);
        $this->assertSame('Code Trainer', $card['profile']['ai']['species']);
        $this->assertSame('Quick Commit', $card['profile']['ai']['attacks'][0]['name']);
        // Generated fields are not the panel's to touch.
        $this->assertSame('ash', $card['profile']['login']);
        $this->assertSame(42, $card['profile']['followers']);
    }

    public function test_admin_can_rewrite_a_showcase_card_caption_and_lore()
    {
        Profile::create([
            'login' => 'torvalds',
            'github_json' => ['login' => 'torvalds', 'name' => 'Linus Torvalds'],
            'card_json' => ['ai' => ['species' => 'Old']],
            'fetched_at' => 0,
        ]);
        $showcase = ShowcaseCard::create(['login' => 'torvalds', 'name' => 'Linus Torvalds', 'why' => 'Old caption.', 'axes' => [], 'is_active' => true]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => "showcase:{$showcase->id}",
                'rarity' => 'secret',
                'axes' => ['generation' => '1-gen'],
                'text' => $this->text(['why' => 'Created Linux and Git.']),
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame('Created Linux and Git.', $showcase->fresh()->why);
        $this->assertSame('secret', $showcase->fresh()->rarity);

        // The prose that actually renders lives on the cached profile row.
        $profile = Profile::find('torvalds');
        $this->assertSame('Code Trainer', $profile->card_json['ai']['species']);
        $this->assertSame('Ash Ketchum', $profile->github_json['name']);
    }

    /**
     * A cleared caption stays cleared. ConvertEmptyStringsToNull turns the emptied field into
     * null, which a `??` fallback would read as "not sent" and restore.
     */
    public function test_clearing_a_showcase_caption_removes_it()
    {
        Profile::create(['login' => 'torvalds', 'github_json' => ['login' => 'torvalds', 'name' => 'Linus'], 'card_json' => [], 'fetched_at' => 0]);
        $showcase = ShowcaseCard::create(['login' => 'torvalds', 'name' => 'Linus', 'why' => 'Old caption.', 'axes' => [], 'is_active' => true]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => "showcase:{$showcase->id}",
                'rarity' => 'common',
                'axes' => [],
                'text' => $this->text(['why' => '']),
            ])
            ->assertSessionHasNoErrors();

        $this->assertNull($showcase->fresh()->why);
    }

    /**
     * Every `text.*` rule is nullable, so a payload that omits them carries no such keys at all.
     * Reading them blind raised four "Undefined array key" warnings - a 500 with APP_DEBUG on, and
     * four nulls over the card's prose with it off.
     */
    public function test_a_partial_text_payload_leaves_unsent_prose_alone()
    {
        $victim = User::factory()->create([
            'card' => [
                'profile' => ['login' => 'ash', 'name' => 'Old Name', 'ai' => ['species' => 'Keep me', 'flavor' => 'Keep me too']],
                'rarity' => 'common',
            ],
        ]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', ['key' => "user:{$victim->id}", 'rarity' => 'holo', 'axes' => [], 'text' => ['name' => 'Ash']])
            ->assertSessionHasNoErrors();

        $ai = $victim->fresh()->card['profile']['ai'];
        $this->assertSame('Ash', $victim->fresh()->card['profile']['name']);
        $this->assertSame('Keep me', $ai['species']);
        $this->assertSame('Keep me too', $ai['flavor']);
    }

    /** The card frame has fixed printed boxes, so an over-long string must be refused, not clipped. */
    public function test_over_long_text_is_rejected()
    {
        $victim = User::factory()->create(['card' => ['profile' => ['login' => 'ash'], 'rarity' => 'common']]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => "user:{$victim->id}",
                'rarity' => 'common',
                'axes' => [],
                'text' => $this->text(['species' => str_repeat('x', 23)]),
            ])
            ->assertSessionHasErrors('text.species');

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => "user:{$victim->id}",
                'rarity' => 'common',
                'axes' => [],
                'text' => $this->text(['attacks' => [['name' => 'ok', 'cost' => 9, 'damage' => '10', 'desc' => 'x']]]),
            ])
            ->assertSessionHasErrors('text.attacks.0.cost');
    }

    /** A slug that shadows a real route silently hides the user's own card behind it. */
    public function test_admin_cannot_hand_out_a_slug_that_shadows_a_route()
    {
        $admin = $this->admin();
        $victim = User::factory()->create();
        $payload = ['name' => 'X', 'email' => 'x@example.test', 'is_public' => true];

        foreach (['cards', 'dashboard', 'admin', 'settings'] as $reserved) {
            $this->actingAs($admin)
                ->put("/admin/users/{$victim->id}", $payload + ['slug' => $reserved])
                ->assertSessionHasErrors('slug');
        }

        $this->actingAs($admin)
            ->put("/admin/users/{$victim->id}", $payload + ['slug' => 'ash-ketchum'])
            ->assertSessionHasNoErrors();
    }

    public function test_activity_log_filters_by_channel_and_search()
    {
        $admin = $this->admin();
        activity('admin')->causedBy($admin)->log('Restyled card user:1');
        activity('card')->causedBy($admin)->log('Regenerated card');

        $this->actingAs($admin)->get('/admin/activity?log=card')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/activity')->where('activities.total', 1));

        $this->actingAs($admin)->get('/admin/activity?q=Restyled')
            ->assertInertia(fn ($page) => $page->where('activities.total', 1));

        // A bare "%" must be a literal, not a wildcard that returns the whole table.
        $this->actingAs($admin)->get('/admin/activity?q=%')
            ->assertInertia(fn ($page) => $page->where('activities.total', 0));
    }

    /** `properties` can hold arbitrary logged payloads; the table never renders it. */
    public function test_activity_rows_do_not_ship_properties()
    {
        $admin = $this->admin();
        activity('admin')->causedBy($admin)->withProperties(['secret' => 'do-not-leak'])->log('Something');

        $this->actingAs($admin)->get('/admin/activity')
            ->assertOk()
            ->assertDontSee('do-not-leak');
    }
}
