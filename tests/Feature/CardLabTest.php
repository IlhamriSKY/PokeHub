<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\ShowcaseCard;
use App\Models\User;
use App\Services\GithubCardService;
use Database\Seeders\CardAssetSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
     * The same edit against a row that still keeps everything in `payload`.
     *
     * save() built the new profile from `(array) $profileRow->github_json`, which on a legacy row is
     * `(array) null` - so writing a name replaced the whole profile with `{"name": "..."}` and the
     * card it renames was gone, login and stats and all. The read half was blind the same way, so
     * the lab could not even show the card it was about to destroy.
     */
    public function test_renaming_a_showcase_card_does_not_wipe_a_legacy_profile()
    {
        Profile::create([
            'login' => 'sindresorhus',
            'github_json' => null,
            'payload' => ['login' => 'sindresorhus', 'name' => 'Sindre Sorhus', 'followers' => 61000, 'ai' => ['species' => 'Old']],
            'fetched_at' => 0,
        ]);
        $showcase = ShowcaseCard::create(['login' => 'sindresorhus', 'name' => 'Sindre Sorhus', 'axes' => [], 'is_active' => true]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => "showcase:{$showcase->id}",
                'rarity' => 'secret',
                'axes' => [],
                'text' => $this->text(),
            ])
            ->assertSessionHasNoErrors();

        $profile = Profile::find('sindresorhus');
        $this->assertSame('Ash Ketchum', $profile->github_json['name']);
        // The generated half survives the rename, which is the whole point.
        $this->assertSame('sindresorhus', $profile->github_json['login']);
        $this->assertSame(61000, $profile->github_json['followers']);
        $this->assertSame('Code Trainer', $profile->card_json['ai']['species']);
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

    /**
     * A generated card belongs to nobody, so its handle is `profile:<login>` rather than an id. The
     * key rule only spelled out the two numbered kinds, so every save against the cards the site
     * produces most of was rejected before save() - which has handled them all along - ever ran.
     */
    public function test_admin_can_restyle_a_generated_card_that_has_no_user()
    {
        Profile::create([
            'login' => 'octocat',
            'github_json' => ['login' => 'octocat', 'name' => 'The Octocat', 'followers' => 9000],
            'card_json' => ['ai' => ['species' => 'Old']],
            'fetched_at' => 0,
        ]);

        $this->actingAs($this->admin())
            ->put('/admin/lab', [
                'key' => 'profile:octocat',
                'rarity' => 'secret',
                'axes' => ['generation' => '1-gen'],
                'text' => $this->text(),
            ])
            ->assertSessionHasNoErrors();

        $profile = Profile::find('octocat');
        $this->assertSame('secret', $profile->card_json['rarity']);
        $this->assertSame('1-gen', $profile->card_json['axes']['generation']);
        $this->assertSame('Code Trainer', $profile->card_json['ai']['species']);
        $this->assertSame('Ash Ketchum', $profile->github_json['name']);
        // Generated fields stay put, same as the user branch.
        $this->assertSame(9000, $profile->github_json['followers']);
    }

    /**
     * Refreshing a card must not undo a restyle.
     *
     * `?fresh=1` rebuilt card_json from scratch, so it kept the lore and dropped the two fields
     * that ARE the card: the rarity, leaving every reader to recompute one from the live stats,
     * and the axes, dropping the frame back to the 1-gen default and the foil back to auto. Eight
     * rows in the live database had already been stripped that way. A refresh is about the STATS.
     */
    public function test_refreshing_a_card_keeps_its_rarity_and_styling()
    {
        Profile::create([
            'login' => 'octocat',
            'github_json' => ['login' => 'octocat', 'name' => 'The Octocat', 'followers' => 10],
            'card_json' => ['ai' => null, 'rarity' => 'secret', 'axes' => ['generation' => 'tcg-gen', 'glare' => 'hyper']],
            'fetched_at' => 0,
        ]);

        // The suite inherits a real AI key from .env, and this is about the fields a refresh keeps,
        // not the lore it fetches.
        config(['pokehub.ai.enabled' => false]);
        Http::fake([
            'api.github.com/users/octocat' => Http::response(['login' => 'octocat', 'name' => 'The Octocat', 'followers' => 9000]),
            'api.github.com/users/octocat/repos*' => Http::response([]),
        ]);

        $this->actingAs($this->admin())->getJson('/api/github?u=octocat&fresh=1')->assertOk();

        $card = Profile::find('octocat')->card_json;
        $this->assertSame('secret', $card['rarity'], 'a refresh recomputed the rarity');
        $this->assertSame('tcg-gen', $card['axes']['generation'], 'a refresh reset the frame');
        $this->assertSame('hyper', $card['axes']['glare'], 'a refresh reset the foil to auto');
        // The stats are what a refresh IS for, so those do move.
        $this->assertSame(9000, Profile::find('octocat')->github_json['followers']);
    }

    /**
     * A card born from the public search box states its foil rather than deferring to the rarity.
     *
     * 'auto' is not a foil - it means "whatever the preset implies", which is why every generated
     * card read Auto in the lab. The slug picked here must be the one that renders the same holo
     * the rarity already would, so making it explicit changes nothing on screen.
     */
    public function test_a_generated_card_carries_an_explicit_foil()
    {
        $this->seed(CardAssetSeeder::class);
        $svc = app(GithubCardService::class);

        // glareFor still answers "the one foil this rarity prints", which is what a card that
        // wants its rarity's own holo asks for.
        foreach (['secret' => 'secret', 'pokeball' => 'pokeball', 'common' => 'none'] as $preset => $expected) {
            $this->assertSame($expected, $svc->glareFor($preset));
        }

        // An unknown preset must degrade to a real slug, never to a broken axis.
        $this->assertSame('none', $svc->glareFor('no-such-preset'));

        // What a generated card actually wears comes off the ladder instead, so it is a real foil
        // rather than 'none' even at the bottom, and it is stable for a given login.
        $glare = $svc->axesFor('someone', 'common')['glare'];
        $this->assertNotSame('none', $glare);
        $this->assertSame($glare, $svc->axesFor('SOMEONE', 'common')['glare']);
    }

    /**
     * Same rarity, different foil - but never out of category.
     *
     * One preset used to mean one foil, and rarity is the axis that piles up: two cards in five
     * share a tier, so two cards in five wore the same holo. Each tier now reads a window of the
     * foil ladder rather than a single rung.
     */
    public function test_two_cards_of_one_rarity_can_wear_different_foils()
    {
        $this->seed(CardAssetSeeder::class);
        $svc = app(GithubCardService::class);

        $seen = [];
        foreach (range(1, 40) as $i) {
            $seen[$svc->foilFor("dev{$i}", 'common')] = true;
        }
        $this->assertGreaterThan(1, count($seen), 'every Common card came out in the same foil');

        // ...and the window is still a window. A Common must not reach the top of the ladder.
        $common = array_keys($seen);
        foreach (['hyper', 'secret', 'specialillust'] as $outOfReach) {
            $this->assertNotContains($outOfReach, $common, "a Common card reached {$outOfReach}");
        }

        // Nothing draws the absence of a foil, which is the point of the ladder excluding it.
        $this->assertNotContains('none', $common);
    }

    /**
     * `--refoil` reaches the cards already written.
     *
     * The ladder only decides what a NEW card wears, so without this the rows already stored keep
     * the one-foil-per-rarity assignment that made every card of a tier identical. Same guard as
     * `--retier`: a card someone styled by hand keeps the foil they chose.
     */
    public function test_refoiling_redraws_untouched_cards_and_leaves_styled_ones_alone()
    {
        $this->seed(CardAssetSeeder::class);

        foreach (['a', 'b', 'c', 'd', 'e', 'f'] as $login) {
            Profile::create([
                'login' => $login,
                'github_json' => ['login' => $login, 'name' => $login, 'followers' => 5],
                'card_json' => ['ai' => null, 'rarity' => 'common', 'axes' => ['generation' => '1-gen', 'glare' => 'none']],
                'fetched_at' => 0,
            ]);
        }
        Profile::create([
            'login' => 'styled',
            'github_json' => ['login' => 'styled', 'name' => 'Styled', 'followers' => 5],
            'card_json' => ['ai' => null, 'rarity' => 'common', 'axes' => ['generation' => '1-gen', 'glare' => 'none', 'tag' => 'mega']],
            'fetched_at' => 0,
        ]);

        $this->artisan('pokehub:card-axes --refoil')->assertSuccessful();

        $drawn = [];
        foreach (['a', 'b', 'c', 'd', 'e', 'f'] as $login) {
            $glare = Profile::find($login)->card_json['axes']['glare'];
            $this->assertNotSame('none', $glare, "{$login} was left without a foil");
            $drawn[$glare] = true;
        }
        $this->assertGreaterThan(1, count($drawn), 'every card of one rarity drew the same foil');

        // The hand-styled one was matte, and a matte card is always eligible: `none` is the absence
        // of a foil, so there is no choice there to protect. Its styling still survives.
        $styled = Profile::find('styled')->card_json;
        $this->assertNotSame('none', $styled['axes']['glare'], 'a matte card was left matte');
        $this->assertSame('mega', $styled['axes']['tag'], 'the refoil overwrote styling it should not touch');
    }

    /** A foil somebody chose survives a refoil; only --force overrides that. */
    public function test_refoiling_keeps_a_foil_that_was_chosen()
    {
        $this->seed(CardAssetSeeder::class);

        Profile::create([
            'login' => 'picky',
            'github_json' => ['login' => 'picky', 'name' => 'Picky', 'followers' => 5],
            // Styled by hand, and wearing a real foil rather than none.
            'card_json' => ['ai' => null, 'rarity' => 'common', 'axes' => ['generation' => '1-gen', 'glare' => 'cosmos', 'tag' => 'mega']],
            'fetched_at' => 0,
        ]);

        $this->artisan('pokehub:card-axes --refoil')->assertSuccessful();
        $this->assertSame('cosmos', Profile::find('picky')->card_json['axes']['glare']);

        $this->artisan('pokehub:card-axes --refoil --force')->assertSuccessful();
        $forced = Profile::find('picky')->card_json;
        $this->assertNotSame('cosmos', $forced['axes']['glare'], '--force did not override the choice');
        $this->assertSame('mega', $forced['axes']['tag'], '--force reached past the foil');
    }

    /** A claimed card is the one its owner looks at, so the ladder has to reach it too. */
    public function test_refoiling_reaches_a_claimed_account()
    {
        $this->seed(CardAssetSeeder::class);

        $user = User::factory()->create([
            'slug' => 'ash',
            'github_login' => 'ash',
            'card' => [
                'profile' => ['login' => 'ash', 'name' => 'Ash'],
                'rarity' => 'common',
                'axes' => ['generation' => '1-gen', 'glare' => 'none'],
            ],
        ]);

        $this->artisan('pokehub:card-axes --refoil')->assertSuccessful();

        $this->assertNotSame('none', $user->fresh()->card['axes']['glare']);
    }
}
