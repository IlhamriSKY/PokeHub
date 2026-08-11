<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use App\Services\AvatarCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * `/avatar/{login}` exists so the card's face does not depend on GitHub's CDN being reachable
 * from the visitor's network, and is not re-downloaded every five minutes because that is all the
 * caching GitHub allows on it.
 *
 * The invariant that matters most here is the one that is invisible when it works: this must never
 * become a general image proxy. Only logins already in our own tables are fetchable, only at the
 * sizes the card renders, and only actual images are ever stored - so the whole key space is our
 * profile table times four and nobody can walk it.
 */
class AvatarCacheTest extends TestCase
{
    use RefreshDatabase;

    /** A real 1x1 PNG: the service checks the BYTES, not just the Content-Type. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function githubAvatar(string $login = 'torvalds', string $url = 'https://avatars.githubusercontent.com/u/1024025?v=4'): Profile
    {
        return Profile::create([
            'login' => $login,
            'github_json' => ['login' => $login, 'avatar' => $url],
            'fetched_at' => time(),
        ]);
    }

    private function fakeImage(): void
    {
        Http::fake([
            'avatars.githubusercontent.com/*' => Http::response(base64_decode(self::PNG), 200, ['Content-Type' => 'image/png']),
        ]);
    }

    public function test_it_downloads_the_avatar_once_and_serves_it_from_disk(): void
    {
        $this->githubAvatar();
        $this->fakeImage();

        $first = $this->get('/avatar/torvalds?s=360');
        $first->assertOk();
        $first->assertHeader('Content-Type', 'image/png');
        // A day, against the 300 seconds GitHub allows on the same bytes.
        $this->assertStringContainsString('max-age=86400', (string) $first->headers->get('Cache-Control'));

        $this->get('/avatar/torvalds?s=360')->assertOk();

        // The second view is a file read. That is the whole point of the endpoint.
        Http::assertSentCount(1);
        $this->assertFileExists(app(AvatarCache::class)->path('torvalds', 360));
    }

    /** The size lands on the upstream request, so a 64px chip does not download the 360px face. */
    public function test_it_asks_github_for_the_size_the_card_renders(): void
    {
        $this->githubAvatar();
        $this->fakeImage();

        $this->get('/avatar/torvalds?s=64')->assertOk();

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 's=64'));
    }

    /**
     * The bound on the whole feature: an unknown handle is not fetchable at all, so this cannot be
     * used as a free image cache for the internet, and cannot be walked to fill the disk.
     */
    public function test_it_refuses_a_login_it_has_never_stored(): void
    {
        $this->fakeImage();

        $this->get('/avatar/somebody-else?s=360')->assertNotFound();

        Http::assertNothingSent();
    }

    /** The other half of that bound: four files per login, whatever `?s=` a visitor invents. */
    public function test_an_unknown_size_snaps_to_the_card_size(): void
    {
        $this->githubAvatar();
        $this->fakeImage();

        $this->get('/avatar/torvalds?s=4096')->assertOk();

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 's='.AvatarCache::DEFAULT_SIZE));
        $this->assertFileExists(app(AvatarCache::class)->path('torvalds', AvatarCache::DEFAULT_SIZE));
        $this->assertFileDoesNotExist(app(AvatarCache::class)->path('torvalds', 4096));
    }

    /** A stored url pointing anywhere but the two avatar CDNs is not followed. SSRF, otherwise. */
    public function test_it_refuses_a_stored_url_on_a_foreign_host(): void
    {
        $this->githubAvatar('torvalds', 'https://internal.test/secret.png');
        Http::fake();

        $this->get('/avatar/torvalds?s=360')->assertNotFound();

        Http::assertNothingSent();
    }

    /**
     * The mime we answer with is sniffed from the stored file, so a lying Content-Type must not be
     * able to park something that is not an image in the cache and have us serve it back.
     */
    public function test_it_stores_nothing_when_the_bytes_are_not_an_image(): void
    {
        $this->githubAvatar();
        Http::fake([
            'avatars.githubusercontent.com/*' => Http::response('<script>alert(1)</script>', 200, ['Content-Type' => 'image/png']),
        ]);

        // Nothing to serve, but we do know where the picture lives - so the browser is sent there,
        // which is exactly what the card did before this cache existed.
        $this->get('/avatar/torvalds?s=360')->assertRedirect('https://avatars.githubusercontent.com/u/1024025?v=4&s=360');
        $this->assertFileDoesNotExist(app(AvatarCache::class)->path('torvalds', 360));
    }

    /** A claimed account keeps its own copy on the user row rather than in `profiles`. */
    public function test_it_finds_a_claimed_account_by_its_github_login(): void
    {
        User::factory()->create([
            'github_login' => 'IlhamriSKY',
            'avatar' => 'https://avatars.githubusercontent.com/u/18723904?v=4',
        ]);
        $this->fakeImage();

        $this->get('/avatar/ilhamrisky?s=180')->assertOk();

        Http::assertSentCount(1);
    }

    /**
     * A dead upstream must not take the face down with it: the stored copy keeps serving. Nothing
     * else can tell us the picture changed (GitHub's url is the same string before and after a new
     * upload), so a failed refresh has to fall back rather than delete.
     */
    public function test_a_stale_file_survives_a_failed_refresh(): void
    {
        $this->githubAvatar();

        // One stub with a switch rather than a second Http::fake(): stubs are matched in
        // registration order, so re-faking the same pattern would never be reached.
        $down = false;
        Http::fake(fn () => $down
            ? Http::response('nope', 503)
            : Http::response(base64_decode(self::PNG), 200, ['Content-Type' => 'image/png']));

        $this->get('/avatar/torvalds?s=360')->assertOk();

        // Age the file past the service's TTL, then take GitHub away.
        touch(app(AvatarCache::class)->path('torvalds', 360), time() - 30 * 86400);
        $down = true;

        $this->get('/avatar/torvalds?s=360')->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    /** Regenerating a card is the one moment we know the picture may have changed. */
    public function test_forget_drops_every_stored_size(): void
    {
        $this->githubAvatar();
        $this->fakeImage();
        $this->get('/avatar/torvalds?s=64')->assertOk();
        $this->get('/avatar/torvalds?s=360')->assertOk();

        $this->assertSame(2, app(AvatarCache::class)->forget('torvalds'));
        $this->assertFileDoesNotExist(app(AvatarCache::class)->path('torvalds', 360));
    }

    /**
     * The endpoint answers with a file and nothing else. Session middleware on it meant a row
     * written to the database session table for each of the four faces a landing page asks for,
     * and two `Set-Cookie` headers that stop any shared cache from honouring the `s-maxage` the
     * response advertises. Easy to put back by accident by moving the route.
     */
    public function test_it_serves_the_image_without_starting_a_session(): void
    {
        $this->githubAvatar();
        $this->fakeImage();

        $response = $this->get('/avatar/torvalds?s=360');

        $response->assertOk();
        $this->assertSame([], $response->headers->getCookies());
        $this->assertNull($response->headers->get('Vary'));
        $this->assertStringContainsString('s-maxage=86400', (string) $response->headers->get('Cache-Control'));
    }
}
