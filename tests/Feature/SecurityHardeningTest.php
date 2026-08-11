<?php

namespace Tests\Feature;

use App\Models\CardAsset;
use App\Models\User;
use App\Services\CardCapture;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The invariants a security review bought. Each one is cheap to undo by accident in a refactor,
 * and none of them fails loudly in normal use - a missing throttle or a re-widened email match
 * looks exactly like a working app right up until it is exploited.
 */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function githubReturns(array $fields): void
    {
        // The callback assigns it to every new account; RolesAndPermissionsSeeder owns it in real life.
        Role::findOrCreate('user', 'web');

        $githubUser = (new SocialiteUser)->map($fields);
        Socialite::shouldReceive('driver')->with('github')
            ->andReturn(Mockery::mock(['user' => $githubUser]));
    }

    /**
     * The account pre-hijack. /settings/profile lets anyone set `email` to anything without
     * verifying it, so the OAuth callback must not treat a stored address as proof of identity.
     */
    public function test_github_login_does_not_adopt_an_account_holding_an_unverified_email()
    {
        $squatter = User::factory()->create([
            'email' => 'victim@corp.test',
            'email_verified_at' => null,
            'github_id' => null,
            'slug' => 'squatted',
        ]);

        $this->githubReturns([
            'id' => '999001', 'nickname' => 'victim', 'name' => 'Victim', 'email' => 'victim@corp.test',
        ]);

        $this->get('/auth/github/callback')->assertRedirect(route('dashboard'));

        // A NEW account, not the squatter's - and the squatter never acquires the victim's identity.
        $this->assertNotSame($squatter->id, Auth::id());
        $this->assertNull($squatter->fresh()->github_id);

        // ...and the squatter cannot BLOCK the sign-in either: users.email is unique, so refusing
        // the match is only half a fix if account creation then dies on the same address.
        $victim = User::find(Auth::id());
        $this->assertSame('victim', $victim->github_login);
        $this->assertNotSame('victim@corp.test', $victim->email);
    }

    /** The legitimate half still works: a verified address is a real identity match. */
    public function test_github_login_still_adopts_an_account_holding_a_verified_email()
    {
        $existing = User::factory()->create([
            'email' => 'real@corp.test',
            'email_verified_at' => now(),
            'github_id' => null,
        ]);

        $this->githubReturns([
            'id' => '999002', 'nickname' => 'real', 'name' => 'Real', 'email' => 'real@corp.test',
        ]);

        $this->get('/auth/github/callback');

        $this->assertSame($existing->id, Auth::id());
        $this->assertSame('999002', $existing->fresh()->github_id);
    }

    /**
     * The capture route launches a headless Chromium on a cache miss, so an unthrottled version of
     * it is an outage from one curl loop. Asserted on the route rather than by flooding it: the
     * middleware is the control, and the flood only proves it on the machine running the test.
     */
    public function test_the_expensive_public_routes_are_throttled()
    {
        $throttled = fn (string $name) => collect(Route::getRoutes()->getByName($name)->gatherMiddleware())
            ->contains(fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'));

        $this->assertTrue($throttled('public.card.image'), 'card image capture route lost its throttle');

        $options = collect(Route::getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === 'api/options');
        $this->assertTrue(
            collect($options->gatherMiddleware())->contains(fn ($m) => is_string($m) && str_starts_with($m, 'throttle:')),
            'api/options lost its throttle'
        );
    }

    /** A cached capture must never reach the lock or the Process - it is the hot path. */
    public function test_an_already_captured_card_is_served_without_re_rendering()
    {
        $card = ['rarity' => 'common', 'axes' => [], 'profile' => ['avatar' => 'a', 'followers' => 1]];

        // `node` is deliberately a command that cannot exist: if ensure() tries to capture, the
        // Process throws and this test fails, which is exactly the signal we want.
        $capture = new CardCapture('definitely-not-a-real-binary');
        $path = $capture->path('ash', $card, 'gif');

        Storage::disk('local')->put('cards/'.basename($path), 'GIF89a');

        $this->assertSame($path, $capture->ensure('ash', $card, 'gif'));
    }

    /**
     * The captcha has to run on an absent field, not just an invalid one. Laravel skips a
     * non-implicit rule object when the field is missing, which would make omitting the token a
     * complete bypass while the operator's toggle still reads as on.
     */
    public function test_a_missing_captcha_token_is_rejected_when_turnstile_is_on()
    {
        config(['services.turnstile.enabled' => true]);

        $user = User::factory()->create(['github_login' => 'dev']);

        $this->actingAs($user)
            ->post('/dashboard/card/regenerate', ['axes' => []])
            ->assertSessionHasErrors('cf-turnstile-response');
    }

    /**
     * forget('foo') must not sweep up '/foo-bar'. Slugs may contain hyphens and the hash is joined
     * with one, so a bare `{slug}-*` glob silently un-cached a stranger's README image - which then
     * cold-renders for 10-25s while GitHub's camo proxy has long since given up.
     */
    public function test_forgetting_one_slug_leaves_a_hyphenated_neighbour_alone()
    {
        Storage::fake('local');
        $capture = new CardCapture('definitely-not-a-real-binary');
        $card = ['rarity' => 'common', 'axes' => []];

        $mine = $capture->path('foo', $card, 'gif');
        $neighbour = $capture->path('foo-bar', $card, 'gif');
        Storage::disk('local')->put('cards/'.basename($mine), 'GIF89a');
        Storage::disk('local')->put('cards/'.basename($neighbour), 'GIF89a');

        $this->assertSame(1, $capture->forget('foo'));
        $this->assertFileDoesNotExist($mine);
        $this->assertFileExists($neighbour);
    }

    /**
     * The cache key is the whole card, so anything printed on it invalidates the image. A
     * hand-picked subset would miss fields whose writers never call forget(), leaving the README
     * serving a card that no longer exists.
     */
    public function test_the_capture_key_follows_every_printed_field()
    {
        $capture = new CardCapture;
        $card = ['rarity' => 'common', 'axes' => [], 'profile' => ['name' => 'Old Name', 'stars' => 5]];

        foreach ([['name', 'New Name'], ['stars', 6]] as [$field, $changed]) {
            $edited = $card;
            $edited['profile'][$field] = $changed;
            $this->assertNotSame(
                $capture->path('ash', $card, 'gif'),
                $capture->path('ash', $edited, 'gif'),
                "a changed {$field} must produce a new capture file"
            );
        }
    }

    public function test_responses_carry_the_security_headers()
    {
        $response = $this->get('/login');

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    /** The public options endpoint must not run a seeder; an empty table is just an empty list. */
    public function test_the_public_options_endpoint_does_not_seed_the_database()
    {
        $this->getJson('/api/options')->assertOk()->assertExactJson([]);

        $this->assertSame(0, CardAsset::count());
    }
}
