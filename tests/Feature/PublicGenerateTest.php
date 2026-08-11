<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The public search box: anyone may generate a card for any handle, signed in or not.
 *
 * Http::preventStrayRequests() carries most of these. "Already cached, so do not regenerate" and
 * "private, so do not generate at all" are both claims about a GitHub call that must not happen,
 * and the only way to assert that is to make an outbound call fail the test.
 */
class PublicGenerateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function cached(string $login = 'torvalds'): Profile
    {
        return Profile::create([
            'login' => $login,
            'github_json' => ['login' => $login, 'name' => 'Linus Torvalds', 'top_lang' => 'C', 'followers' => 200000],
            'card_json' => ['ai' => null],
            'fetched_at' => 0,
        ]);
    }

    public function test_a_guest_can_look_up_a_cached_handle_without_regenerating_it()
    {
        $this->cached();

        $this->post('/generate', ['login' => 'torvalds'])
            ->assertRedirect('/torvalds')
            ->assertSessionHasNoErrors();
    }

    public function test_a_cached_handle_renders_its_card_for_a_guest()
    {
        $this->cached();

        $this->get('/torvalds')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card')
                ->where('owner.name', 'Linus Torvalds')
                ->where('claimed', false));
    }

    /**
     * Four rows in the live database predate the github_json/card_json split and still keep
     * everything in `payload`. They are cached cards, so they must render - and, more expensively,
     * must not read as a cache MISS and be regenerated.
     */
    public function test_a_legacy_payload_only_row_is_served_and_never_regenerated()
    {
        Profile::create([
            'login' => 'sindresorhus',
            'payload' => ['login' => 'sindresorhus', 'name' => 'Sindre Sorhus', 'ai' => ['flavor' => 'Ships packages.'], 'rarity' => 'ultra'],
            'fetched_at' => 0,
        ]);

        $this->get('/sindresorhus')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card')
                ->where('owner.name', 'Sindre Sorhus')
                ->where('card.profile.ai.flavor', 'Ships packages.'));

        // A stray GitHub call here would fail the test: the row already is the cache.
        $this->post('/generate', ['login' => 'sindresorhus'])->assertRedirect('/sindresorhus');
    }

    public function test_the_handle_is_case_insensitive()
    {
        $this->cached();

        $this->post('/generate', ['login' => 'TorValds'])->assertRedirect('/torvalds');
    }

    public function test_a_pasted_profile_url_or_at_sign_is_not_a_username()
    {
        $this->post('/generate', ['login' => 'https://github.com/torvalds'])->assertSessionHasErrors('login');
        $this->post('/generate', ['login' => '@torvalds'])->assertSessionHasErrors('login');
        $this->post('/generate', ['login' => ''])->assertSessionHasErrors('login');
    }

    /**
     * The captcha is the whole gate on this route - there is no sign-in behind it - so "is it
     * actually on" needs asserting rather than assuming. TURNSTILE_ENABLED is false for the rest
     * of the suite (phpunit.xml), which is exactly why every other test here would pass with the
     * rule deleted.
     */
    public function test_the_captcha_is_required_even_for_a_handle_that_is_already_cached()
    {
        $this->cached();
        config(['services.turnstile.enabled' => true]);

        // No token at all: rejected without ever reaching Cloudflare, so preventStrayRequests holds.
        $this->post('/generate', ['login' => 'torvalds'])->assertSessionHasErrors('cf-turnstile-response');

        // A sequence, not two Http::fake() calls: stubs stack and the first match wins, so the
        // second fake would never be reached and the success case would silently test the failure.
        Http::fakeSequence('challenges.cloudflare.com/*')
            ->push(['success' => false])
            ->push(['success' => true]);

        $this->post('/generate', ['login' => 'torvalds', 'cf-turnstile-response' => 'forged'])
            ->assertSessionHasErrors('cf-turnstile-response');

        $this->post('/generate', ['login' => 'torvalds', 'cf-turnstile-response' => 'real'])
            ->assertRedirect('/torvalds');
    }

    public function test_a_reserved_path_is_refused_before_anything_is_fetched()
    {
        // /dashboard is a real route, so a card generated for it could never be opened.
        $this->post('/generate', ['login' => 'dashboard'])->assertSessionHasErrors('login');

        $this->assertNull(Profile::find('dashboard'));
    }

    public function test_a_private_owner_is_neither_shown_nor_generated()
    {
        $this->cached();
        User::factory()->create(['slug' => 'torvalds', 'github_login' => 'torvalds', 'is_public' => false]);

        // Hidden even though the cached row a stranger's search left behind is still there.
        $this->get('/torvalds')->assertNotFound();

        // And not re-derivable on demand: a stray GitHub call here would fail the test.
        $this->post('/generate', ['login' => 'torvalds'])->assertSessionHasErrors('login');
    }

    public function test_a_private_owner_hides_the_card_even_when_their_slug_was_renamed()
    {
        $this->cached();
        User::factory()->create(['slug' => 'linus', 'github_login' => 'torvalds', 'is_public' => false]);

        $this->get('/torvalds')->assertNotFound();
    }

    public function test_a_claimed_public_card_wins_over_the_cached_row()
    {
        $this->cached();
        User::factory()->create([
            'slug' => 'torvalds',
            'github_login' => 'torvalds',
            'is_public' => true,
            'card' => ['profile' => ['login' => 'torvalds', 'name' => 'Linus (claimed)'], 'rarity' => 'common'],
        ]);

        $this->get('/torvalds')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('public-card')->where('claimed', true));
    }

    /** Sign in as `$login` without touching github.com. */
    private function signInWithGithub(string $login, string $githubId = '42'): void
    {
        Role::findOrCreate('user', 'web');

        $account = new SocialiteUser;
        $account->id = $githubId;
        $account->nickname = $login;
        $account->name = 'Linus Torvalds';
        $account->email = $login.'@example.test';
        $account->avatar = 'https://avatars.example/'.$login;

        $provider = Mockery::mock(Provider::class);
        $provider->shouldReceive('user')->andReturn($account);
        Socialite::shouldReceive('driver')->with('github')->andReturn($provider);
    }

    public function test_signing_in_claims_the_card_someone_else_generated()
    {
        $this->cached();
        $this->signInWithGithub('torvalds');

        $this->get('/auth/github/callback')->assertRedirect('/dashboard');

        // Adopted, so the dashboard does not auto-generate and spend the free welcome card on a
        // card the site has already published under this name.
        $card = User::where('github_login', 'torvalds')->first()->card;
        $this->assertSame('torvalds', $card['profile']['login']);
    }

    /**
     * The claim boundary: looking a handle up does not put you anywhere near owning it.
     *
     * Sign-in seeds the card from the login GITHUB authenticated, never from anything the visitor
     * searched, so a stranger who generated @torvalds and then signs in gets their own empty
     * dashboard and leaves that card exactly as unclaimed as they found it.
     */
    public function test_signing_in_only_ever_claims_your_own_handle()
    {
        $this->cached('torvalds');
        $this->signInWithGithub('impostor', '99');

        $this->get('/auth/github/callback')->assertRedirect('/dashboard');

        $this->assertNull(User::where('github_login', 'impostor')->first()->card);

        $this->get('/torvalds')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('claimed', false));
    }

    public function test_signing_in_never_overwrites_a_card_the_owner_already_has()
    {
        $this->cached();
        User::factory()->create([
            'github_id' => '42',
            'github_login' => 'torvalds',
            'slug' => 'torvalds',
            'card' => ['profile' => ['login' => 'torvalds'], 'rarity' => 'secret', 'axes' => ['generation' => 'tcg-gen']],
        ]);
        $this->signInWithGithub('torvalds');

        $this->get('/auth/github/callback');

        // A restyled, regenerated card must survive every later sign-in.
        $card = User::where('github_login', 'torvalds')->first()->card;
        $this->assertSame('secret', $card['rarity']);
        $this->assertSame('tcg-gen', $card['axes']['generation']);
    }
}
