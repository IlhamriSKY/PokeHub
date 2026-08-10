<?php

namespace Tests\Feature;

use App\Models\CardAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminAssetCrudTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        $u = User::factory()->create();
        $u->assignRole('admin');

        return $u;
    }

    private function payload(array $over = []): array
    {
        return $over + [
            'category' => 'frame',
            'slug' => 'rainbow',
            'label' => 'Rainbow',
            'generation' => 'tcg-gen',
            'asset_url' => '/img/pcg/tcg-gen/frame-rainbow.webp',
            'sort_order' => 3,
            'enabled' => true,
            'meta' => '{"dr":"rare rainbow"}',
        ];
    }

    public function test_create_read_update_delete()
    {
        $admin = $this->admin();

        // CREATE
        $this->actingAs($admin)->post('/admin/assets', $this->payload())->assertSessionHasNoErrors();
        $asset = CardAsset::where('slug', 'rainbow')->firstOrFail();
        $this->assertSame('Rainbow', $asset->label);
        $this->assertSame(['dr' => 'rare rainbow'], $asset->meta);

        // READ
        $this->actingAs($admin)->get('/admin/assets')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/assets')->where('assets.frame.0.slug', 'rainbow'));

        // UPDATE
        $this->actingAs($admin)
            ->post('/admin/assets', $this->payload(['id' => $asset->id, 'label' => 'Rainbow Foil', 'sort_order' => 9]))
            ->assertSessionHasNoErrors();
        $this->assertSame('Rainbow Foil', $asset->fresh()->label);
        $this->assertSame(9, $asset->fresh()->sort_order);

        // TOGGLE
        $this->actingAs($admin)->post("/admin/assets/{$asset->id}/toggle");
        $this->assertFalse($asset->fresh()->enabled);
        $this->actingAs($admin)->post("/admin/assets/{$asset->id}/toggle");
        $this->assertTrue($asset->fresh()->enabled);

        // DELETE
        $this->actingAs($admin)->delete("/admin/assets/{$asset->id}");
        $this->assertNull(CardAsset::find($asset->id));
    }

    public function test_every_asset_route_is_admin_only()
    {
        $asset = CardAsset::create(['category' => 'frame', 'slug' => 'x', 'label' => 'x', 'generation' => '', 'asset_url' => '', 'sort_order' => 0, 'enabled' => true]);
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin/assets')->assertForbidden();
        $this->actingAs($user)->post('/admin/assets', $this->payload())->assertForbidden();
        $this->actingAs($user)->post("/admin/assets/{$asset->id}/toggle")->assertForbidden();
        $this->actingAs($user)->delete("/admin/assets/{$asset->id}")->assertForbidden();

        $this->assertNotNull(CardAsset::find($asset->id));
    }

    /** Malformed meta must fail loudly - it used to fall through to null and silently wipe the row. */
    public function test_malformed_meta_json_is_rejected()
    {
        $this->actingAs($this->admin())
            ->post('/admin/assets', $this->payload(['meta' => '{not json']))
            ->assertSessionHasErrors('meta');

        $this->assertNull(CardAsset::where('slug', 'rainbow')->first());
    }

    /**
     * asset_url is handed to every visitor by the public options endpoint and rendered as
     * <img src>, so the scheme is constrained: no protocol-relative, no javascript:/data:, no
     * traversal. NOTE: a plain https:// host IS accepted by design, so an asset can live on a
     * CDN - see test_https_asset_urls_are_currently_allowed below.
     */
    public function test_asset_url_rejects_dangerous_schemes_and_traversal()
    {
        $admin = $this->admin();

        foreach (['//evil.test/x.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAA', '/img/../../etc/passwd'] as $bad) {
            $this->actingAs($admin)
                ->post('/admin/assets', $this->payload(['asset_url' => $bad]))
                ->assertSessionHasErrors('asset_url');
        }

        $this->assertNull(CardAsset::where('slug', 'rainbow')->first());
    }

    /**
     * Pinned deliberately: this is the one place the rule is looser than its own comment, which
     * warns about third-party origins leaking every viewer's IP and referer. If that should be
     * same-origin only, drop the `https://` branch from the regex and flip this test.
     */
    public function test_https_asset_urls_are_currently_allowed()
    {
        $this->actingAs($this->admin())
            ->post('/admin/assets', $this->payload(['asset_url' => 'https://cdn.example.test/x.png']))
            ->assertSessionHasNoErrors();

        $this->assertSame('https://cdn.example.test/x.png', CardAsset::where('slug', 'rainbow')->firstOrFail()->asset_url);
    }

    /** SVG is an executable document served same-origin: stored XSS with session access. */
    public function test_svg_upload_is_refused()
    {
        $this->actingAs($this->admin())
            ->post('/admin/assets', $this->payload([
                'file' => UploadedFile::fake()->createWithContent('x.svg', '<svg onload="alert(1)"></svg>'),
            ]))
            ->assertSessionHasErrors('file');
    }

    /** Renaming a row onto an existing (category, slug, generation) used to 500 on the unique key. */
    public function test_a_slug_clash_is_a_field_error_not_a_500()
    {
        $admin = $this->admin();
        $this->actingAs($admin)->post('/admin/assets', $this->payload());
        $this->actingAs($admin)->post('/admin/assets', $this->payload(['slug' => 'grey', 'label' => 'Grey']));

        $grey = CardAsset::where('slug', 'grey')->firstOrFail();

        $this->actingAs($admin)
            ->post('/admin/assets', $this->payload(['id' => $grey->id, 'slug' => 'rainbow']))
            ->assertSessionHasErrors('slug');

        $this->assertSame('grey', $grey->fresh()->slug);
    }
}
