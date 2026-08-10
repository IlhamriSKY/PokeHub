<?php

namespace Tests\Feature;

use App\Models\CardAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * card_assets has UNIQUE (category, slug, generation). Renaming a row onto an existing one used
 * to hit that index and 500; it must come back as a field-level validation error instead.
 */
class AdminAssetSaveTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        $u = User::factory()->create();
        $u->assignRole('admin');

        return $u;
    }

    private function asset(string $slug, string $generation = ''): CardAsset
    {
        return CardAsset::create([
            'category' => 'element', 'slug' => $slug, 'label' => ucfirst($slug),
            'generation' => $generation, 'asset_url' => '', 'meta' => null,
            'sort_order' => 0, 'enabled' => true,
        ]);
    }

    public function test_renaming_an_asset_onto_an_existing_one_is_a_validation_error_not_a_500()
    {
        $this->actingAs($this->admin());
        $grass = $this->asset('grass');
        $this->asset('fire');

        $this->from('/admin/assets')->post('/admin/assets', [
            'id' => $grass->id, 'category' => 'element', 'slug' => 'fire', 'label' => 'Fire',
        ])->assertSessionHasErrors('slug');

        // the row must be untouched
        $this->assertSame('grass', $grass->fresh()->slug);
    }

    public function test_saving_a_row_onto_itself_still_works()
    {
        $this->actingAs($this->admin());
        $grass = $this->asset('grass');

        $this->post('/admin/assets', [
            'id' => $grass->id, 'category' => 'element', 'slug' => 'grass', 'label' => 'Grass Renamed',
        ])->assertSessionHasNoErrors();

        $this->assertSame('Grass Renamed', $grass->fresh()->label);
    }

    public function test_same_slug_on_a_different_generation_is_allowed()
    {
        $this->actingAs($this->admin());
        $a = $this->asset('trainer', '1-gen');
        $this->asset('trainer', 'tcg-gen');

        // editing the 1-gen row while a tcg-gen row shares the slug must NOT clash
        $this->post('/admin/assets', [
            'id' => $a->id, 'category' => 'element', 'slug' => 'trainer',
            'generation' => '1-gen', 'label' => 'Trainer',
        ])->assertSessionHasNoErrors();
    }
}
