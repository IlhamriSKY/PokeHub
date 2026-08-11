<?php

namespace Tests\Feature;

use App\Models\CardAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Regenerate has one job: hand back a card that is actually different.
 *
 * The two things worth pinning are that a re-rolled axis sticks, and that a client cannot roll
 * anything it likes. A silent failure matters as much as a wrong one, so the case where the AI
 * answers nothing has to report itself rather than look like a success.
 */
class CardRegenerateTest extends TestCase
{
    use RefreshDatabase;

    private function fakeGithub(): void
    {
        config(['pokehub.ai.enabled' => false]);
        Http::fake([
            'api.github.com/users/*/repos*' => Http::response([
                ['name' => 'thing', 'language' => 'PHP', 'stargazers_count' => 5, 'forks_count' => 1],
            ]),
            'api.github.com/users/*' => Http::response([
                'login' => 'dev', 'name' => 'Dev', 'followers' => 3, 'public_repos' => 1, 'created_at' => '2020-01-01T00:00:00Z',
            ]),
        ]);
    }

    public function test_the_rolled_axes_beat_the_stored_ones_and_the_rest_survives()
    {
        $this->fakeGithub();
        foreach ([['element', 'psychic'], ['badge', 'chansey'], ['effect', 'tera']] as [$category, $slug]) {
            CardAsset::create(['category' => $category, 'slug' => $slug, 'label' => $slug, 'enabled' => true]);
        }

        $user = User::factory()->create([
            'github_login' => 'dev',
            'card' => ['axes' => ['element' => 'water', 'badge' => 'none', 'glare' => 'cosmos']],
        ]);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => ['element' => 'psychic', 'badge' => 'chansey', 'effect' => 'tera']])
            ->assertRedirect();

        $axes = $user->fresh()->card['axes'];
        $this->assertSame(['psychic', 'chansey', 'tera'], [$axes['element'], $axes['badge'], $axes['effect']]);
        // An axis the roll did not touch is still whatever was saved.
        $this->assertSame('cosmos', $axes['glare']);
    }

    public function test_no_roll_keeps_the_stored_axes()
    {
        $this->fakeGithub();

        $user = User::factory()->create(['github_login' => 'dev', 'card' => ['axes' => ['element' => 'water']]]);

        $this->actingAs($user)->post('/dashboard/card/regenerate')->assertRedirect();

        $this->assertSame('water', $user->fresh()->card['axes']['element']);
    }

    public function test_a_client_cannot_claim_the_first_edition_stamp()
    {
        $this->fakeGithub(); // The faked account is well short of the ten years the stamp needs.

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)->post('/dashboard/card/regenerate', ['axes' => ['firstEdition' => true]])->assertRedirect();

        $this->assertFalse($user->fresh()->card['axes']['firstEdition']);
    }

    public function test_a_silent_ai_is_reported_instead_of_flashing_success()
    {
        $this->fakeGithub();
        config(['pokehub.ai' => ['enabled' => true, 'key' => 'k', 'base_url' => 'https://ai.test/v1', 'model' => 'm', 'timeout' => 5]]);
        Http::fake(['ai.test/*' => Http::response(['choices' => [['finish_reason' => 'length', 'message' => ['content' => '']]]])]);

        $user = User::factory()->create(['github_login' => 'dev', 'card' => ['profile' => ['ai' => ['flavor' => 'old lore']]]]);

        $this->actingAs($user)->post('/dashboard/card/regenerate')->assertSessionHasErrors('card');

        // The previous lore is kept rather than wiped.
        $this->assertSame('old lore', $user->fresh()->card['profile']['ai']['flavor']);
    }

    public function test_a_slug_with_no_asset_behind_it_is_rejected()
    {
        $this->fakeGithub();

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => ['element' => 'nonsense', 'badge' => 'made-up']])
            ->assertSessionHasErrors(['axes.element', 'axes.badge']);
    }

    /**
     * 'auto' is a sentinel, not an asset: rollAxes leaves element at it whenever the roll lands on
     * a template with no type section (1-gen Trainer, ~1 signup in 8). Rejecting it 422'd with a
     * key the dashboard never renders, so the auto-generate stopped on a skeleton forever.
     */
    public function test_the_auto_element_sentinel_is_accepted()
    {
        $this->fakeGithub();

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => ['element' => 'auto']])
            ->assertSessionHasNoErrors();
    }

    public function test_a_disabled_asset_is_rejected_too()
    {
        $this->fakeGithub();
        CardAsset::create(['category' => 'tag', 'slug' => 'retired', 'label' => 'Retired', 'enabled' => false]);

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => ['tag' => 'retired']])
            ->assertSessionHasErrors('axes.tag');
    }

    /**
     * The money guard. Every regenerate is a paid AI completion, so the daily quota is the one
     * limit whose failure costs real currency rather than uptime.
     *
     * Travels a minute between presses to step past the per-minute burst limit that sits beside
     * the quota - if those two ever share a cache key again, the daily counter resets with the
     * burst window and this test goes green forever while the bill climbs.
     *
     * `limit + 1` presses succeed, not `limit`: the first generation on an account is free and
     * leaves the daily counter untouched (RegenQuota::spend). The block still lands on the press
     * after the pot is empty, which is the part that costs money.
     */
    public function test_a_user_cannot_regenerate_more_than_the_daily_limit()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 3]);

        $user = User::factory()->create(['github_login' => 'dev']);

        for ($i = 1; $i <= 4; $i++) {
            $this->actingAs($user)
                ->post('/dashboard/card/regenerate', [])
                ->assertSessionHasNoErrors();
            $this->travel(61)->seconds();
        }

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', [])
            ->assertSessionHasErrors('card');

        $this->assertStringContainsString(
            'Daily limit reached',
            session('errors')->first('card')
        );
    }

    /**
     * Deleting the account is a HARD delete, so signing back in via GitHub mints a new users.id.
     * Keyed on that id, the quota reset - the one bypass that costs real money. github_id is the
     * same on every sign-in, so the quota has to follow it across the round trip.
     */
    public function test_deleting_and_recreating_the_account_does_not_refill_the_quota()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 1]);

        $user = User::factory()->create(['github_login' => 'dev', 'github_id' => '4242']);
        // Twice: the first is the free welcome, the second empties the one-generation pot. Both
        // are keyed on github_id, so BOTH have to survive the round trip - a welcome that refills
        // is the same bypass one card at a time.
        $this->actingAs($user)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->travel(61)->seconds();
        $this->actingAs($user)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();

        // What DELETE /settings/profile then a fresh GitHub callback leaves behind.
        $user->delete();
        $reborn = User::factory()->create(['github_login' => 'dev', 'github_id' => '4242']);
        $this->assertNotSame($user->id, $reborn->id);

        $this->actingAs($reborn)->post('/dashboard/card/regenerate', [])->assertSessionHasErrors('card');
    }

    /**
     * Admins are exempt from the block but NOT from the counter - the dashboard shows them the same
     * cap and the same countdown, so an exempt account still reports what it has spent.
     */
    public function test_an_admin_is_counted_but_not_blocked()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 1]);
        Role::findOrCreate('admin', 'web');

        $admin = User::factory()->create(['github_login' => 'dev']);
        $admin->assignRole('admin');

        // Three presses: the welcome, then two that count. Past the cap of 1 and still not blocked.
        $this->actingAs($admin)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->actingAs($admin)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->actingAs($admin)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();

        $this->actingAs($admin)->get('/dashboard')->assertInertia(fn ($page) => $page
            ->where('quota.limit', 1)
            ->where('quota.used', 2)
            ->where('quota.unlimited', true));
    }

    /** The meter is only honest if it reads the counter the controller actually enforces. */
    public function test_the_dashboard_reports_the_quota()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 5]);

        $user = User::factory()->create(['github_login' => 'dev']);
        // The free welcome first - it must NOT move the meter - then one that does.
        $this->actingAs($user)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->actingAs($user)->get('/dashboard')->assertInertia(fn ($page) => $page
            ->where('quota.used', 0)
            ->where('quota.welcome', false));

        $this->actingAs($user)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn ($page) => $page
            ->where('quota.limit', 5)
            ->where('quota.used', 1)
            ->where('quota.unlimited', false)
            // Rolling 24h from that first press, which is what the countdown ticks down.
            ->where('quota.resets_in', fn ($s) => $s > 86_000 && $s <= 86_400));
    }

    /**
     * The first generation on an account is on the house, so a new user does not spend a fifth of
     * their day's quota just to see their own card once.
     *
     * Keyed on github_id like the daily counter, and for the same reason - see the delete/re-auth
     * test above. Asserting `welcome` here as well as `used` is deliberate: `used` staying at 0
     * would also be true if the press had failed outright.
     */
    public function test_the_first_generation_is_free()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 5]);

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn ($page) => $page
            ->where('quota.used', 0)
            ->where('quota.welcome', true));

        $this->actingAs($user)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn ($page) => $page
            ->where('quota.used', 0)
            ->where('quota.welcome', false));
    }

    /** A press that never reaches the AI - a bad axis, a captcha typo - must not cost a generation. */
    public function test_a_rejected_press_does_not_burn_a_generation()
    {
        $this->fakeGithub();

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => ['element' => 'nonsense']])
            ->assertSessionHasErrors('axes.element');

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn ($page) => $page->where('quota.used', 0));
    }

    /** The quota is per account, so one user burning theirs must not lock anyone else out. */
    public function test_the_daily_limit_is_per_user()
    {
        $this->fakeGithub();
        config(['pokehub.daily_regen_limit' => 1]);

        $spender = User::factory()->create(['github_login' => 'dev']);
        $bystander = User::factory()->create(['github_login' => 'dev']);

        // Welcome, then the single counted generation, then the block.
        $this->actingAs($spender)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->actingAs($spender)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
        $this->actingAs($spender)->post('/dashboard/card/regenerate', [])->assertSessionHasErrors('card');

        // The bystander still has their own untouched welcome.
        $this->actingAs($bystander)->post('/dashboard/card/regenerate', [])->assertSessionHasNoErrors();
    }
}
