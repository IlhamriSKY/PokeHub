<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The activity log is only worth keeping if a row says who was affected and what changed. An id on
 * its own ("User #5") answers neither, and stops answering entirely once that row is deleted.
 */
class AdminActivityTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Role::findOrCreate('admin', 'web');
        Role::findOrCreate('user', 'web');
        $u = User::factory()->create(['name' => 'The Admin']);
        $u->assignRole('admin');

        return $u;
    }

    public function test_a_subject_reads_as_a_person_not_an_id()
    {
        $victim = User::factory()->create(['name' => 'Ash Ketchum', 'github_login' => 'ash', 'slug' => 'ash']);

        $this->actingAs($this->admin())
            ->put("/admin/users/{$victim->id}", [
                'name' => 'Ash Ketchum',
                'email' => $victim->email,
                'slug' => 'ash',
                'is_public' => true,
            ])
            ->assertSessionHasNoErrors();

        $this->get('/admin/activity?log=admin')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/activity')
                ->where('activities.data.0.subject', 'Ash Ketchum (@ash)')
                ->where('activities.data.0.causer', 'The Admin'));
    }

    public function test_an_edit_records_which_field_changed_and_to_what()
    {
        $victim = User::factory()->create(['name' => 'Old Name', 'slug' => 'ash', 'is_public' => true]);

        $this->actingAs($this->admin())
            ->put("/admin/users/{$victim->id}", [
                'name' => 'New Name',
                'email' => $victim->email,
                'slug' => 'ash',
                'is_public' => true,
            ])
            ->assertSessionHasNoErrors();

        $this->get('/admin/activity?log=user')
            ->assertOk()
            ->assertInertia(function ($page) {
                // The channel also holds this account's "created" entry, so target the edit.
                $edit = collect($page->toArray()['props']['activities']['data'])
                    ->firstWhere('description', 'updated');

                $this->assertNotNull($edit, 'the edit was never logged');

                $changes = collect($edit['changes'])->keyBy('field');
                $this->assertArrayHasKey('name', $changes->all(), 'the renamed field was not recorded');
                $this->assertSame('Old Name', $changes['name']['from']);
                $this->assertSame('New Name', $changes['name']['to']);
            });
    }

    /**
     * A lookup records which handle was searched, and the admin page has to surface it. The handle
     * lives in the properties rather than the description, so this covers the whole path: logged by
     * the generator, selected by the query, and mapped into `context` for the row.
     */
    public function test_a_lookup_records_the_handle_that_was_searched()
    {
        Profile::create([
            'login' => 'torvalds',
            'github_json' => ['login' => 'torvalds', 'name' => 'Linus Torvalds'],
            'card_json' => ['ai' => null],
            'fetched_at' => 0,
        ]);

        // Already cached, so this is a lookup rather than a generation and costs no GitHub call.
        Http::preventStrayRequests();
        $this->post('/generate', ['login' => 'torvalds'])->assertRedirect('/torvalds');

        $this->actingAs($this->admin())
            ->get('/admin/activity?log=lookup')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('activities.data.0.context.login', 'torvalds')
                ->where('activities.data.0.causer', null));
    }

    /** A deleted account leaves no subject to resolve, so its name has to be in the description. */
    public function test_a_deletion_still_names_the_account_afterwards()
    {
        $victim = User::factory()->create(['name' => 'Gone Soon', 'slug' => 'gone']);

        $this->actingAs($this->admin())->delete("/admin/users/{$victim->id}");

        $this->get('/admin/activity?log=admin')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('activities.data.0.description', "Deleted Gone Soon's account (#{$victim->id})")
                ->where('activities.data.0.context.slug', 'gone'));
    }
}
