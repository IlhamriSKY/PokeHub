<?php

namespace App\Http\Controllers;

use App\Models\CardAsset;
use App\Models\Profile;
use App\Models\User;
use App\Services\CardSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;

/**
 * Admin dashboard, gated on the `admin` role. Manages users and their public slugs, the card
 * assets behind the card lab's options, and the activity log.
 */
class AdminController extends Controller
{
    private const CATEGORIES = ['generation', 'element', 'variant', 'frame', 'effect', 'glare', 'rarity', 'rarity_preset', 'subtype', 'icon', 'tag', 'badge'];

    /** The card lab: restyle any card, including the ones on the landing page. */
    public function lab(Request $request, CardSettingsService $settings)
    {
        return Inertia::render('admin/lab', [
            'targets' => $settings->targets(),
            'editing' => $settings->find((string) $request->query('edit', '')),
        ]);
    }

    public function saveLab(Request $request, CardSettingsService $settings)
    {
        // Every text field is length-capped: these render into fixed printed boxes on the card
        // frame, and an unbounded string overflows the art rather than wrapping.
        $data = $request->validate([
            'key' => ['required', 'string', 'regex:/^(user|showcase):\d+$/'],
            'rarity' => ['required', 'string', 'max:40'],
            // `present` rather than `required`, since a card with default styling has an empty
            // axes blob and `required` rejects an empty array.
            'axes' => ['present', 'array'],
            'text' => ['nullable', 'array'],
            'text.name' => ['required_with:text', 'string', 'max:60'],
            'text.species' => ['nullable', 'string', 'max:22'],
            'text.flavor' => ['nullable', 'string', 'max:200'],
            'text.effect' => ['nullable', 'string', 'max:300'],
            'text.why' => ['nullable', 'string', 'max:120'],
            'text.attacks' => ['nullable', 'array', 'max:2'],
            'text.attacks.*.name' => ['nullable', 'string', 'max:16'],
            'text.attacks.*.cost' => ['nullable', 'integer', 'min:1', 'max:4'],
            'text.attacks.*.damage' => ['nullable', 'string', 'max:5'],
            'text.attacks.*.desc' => ['nullable', 'string', 'max:300'],
        ]);

        abort_unless($settings->save($data['key'], $data['axes'], $data['rarity'], $data['text'] ?? null), 404);

        // The key only: this is an audit trail, not a copy of every payload that passed through.
        activity('admin')->causedBy(Auth::user())->withProperties(['key' => $data['key']])->log("Restyled card {$data['key']}");

        return back()->with('success', 'Card settings saved.');
    }

    public function index()
    {
        return Inertia::render('admin/index', [
            'stats' => [
                'users' => User::count(),
                'public_cards' => User::whereNotNull('slug')->where('is_public', true)->count(),
                'card_assets' => CardAsset::count(),
                'cached_profiles' => Profile::count(),
                'activities' => Activity::count(),
            ],
            // Column-scoped like the activity page: a bare with('causer') would hydrate whole User
            // rows, card blob and email included, to print eight names.
            'recent_activity' => Activity::with('causer:id,name')->latest()->limit(8)->get()->map(fn ($a) => $this->activityRow($a)),
        ]);
    }

    public function users(Request $request)
    {
        // Paginated and column-scoped, so the `card` JSON never leaves the database: `has_card` is
        // decided in SQL rather than by hydrating a whole authored card per row.
        $search = trim((string) $request->query('q', ''));

        $users = User::query()
            ->select(['id', 'name', 'email', 'slug', 'is_public', 'avatar', 'created_at'])
            // `card` is a MySQL json column and cannot be compared against a string literal, since
            // '' is not valid JSON text. IS NOT NULL is the whole test.
            ->selectRaw('(card IS NOT NULL) as has_card')
            ->with('roles:id,name')
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('slug', 'like', "%{$search}%")))
            ->orderByDesc('id')
            ->paginate(10)
            ->withQueryString()
            ->through(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'slug' => $u->slug,
                'is_public' => (bool) $u->is_public,
                'avatar' => $u->avatar,
                'roles' => $u->getRoleNames(),
                'has_card' => (bool) $u->has_card,
                'created_at' => $u->created_at?->toDateString(),
            ]);

        return Inertia::render('admin/users', [
            'users' => $users,
            'roles' => Role::pluck('name'),
            'filters' => ['q' => $search],
        ]);
    }

    public function updateUser(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'slug' => [
                'nullable', 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/',
                Rule::unique('users', 'slug')->ignore($user->id),
                // Shared with sign-up, so an admin cannot hand out a slug that shadows a route.
                Rule::notIn(User::RESERVED_SLUGS),
            ],
            'is_public' => ['boolean'],
            'roles' => ['array'],
            'roles.*' => ['string', Rule::in(Role::pluck('name'))],
        ]);

        /*
         * `roles` is optional, so an absent key means "leave roles alone"; only an explicitly sent
         * array may change them. Without this a PUT that omits the key strips every role.
         *
         * The guard then refuses any change that would leave the install with no admin at all.
         * This panel is the only place roles can be edited, so that lockout needs a database edit
         * to undo. deleteUser carries the same guard.
         */
        $newRoles = $request->has('roles') ? ($data['roles'] ?? []) : $user->getRoleNames()->all();
        if ($user->hasRole('admin') && ! in_array('admin', $newRoles, true) && $this->adminCount() <= 1) {
            throw ValidationException::withMessages([
                'roles' => 'This is the last admin. Removing the admin role would lock everyone out of this panel.',
            ]);
        }

        $user->update([
            'name' => $data['name'],
            'email' => $data['email'],
            'slug' => $data['slug'] ? strtolower($data['slug']) : null,
            'is_public' => $data['is_public'] ?? true,
        ]);
        $user->syncRoles($newRoles);

        activity('admin')->causedBy(Auth::user())->performedOn($user)
            ->log('Admin updated user #'.$user->id);

        return back()->with('success', 'User updated.');
    }

    public function deleteUser(User $user)
    {
        if ($user->id === Auth::id()) {
            return back()->with('error', 'You cannot delete your own account.');
        }
        // Same lockout guard as updateUser.
        if ($user->hasRole('admin') && $this->adminCount() <= 1) {
            return back()->with('error', 'This is the last admin. Deleting it would lock everyone out of this panel.');
        }
        $user->delete();
        activity('admin')->causedBy(Auth::user())->log('Admin deleted user #'.$user->id);

        return back()->with('success', 'User deleted.');
    }

    /**
     * Every user who has a card, with its rarity, share state and originating GitHub handle, so a
     * public slug can be reviewed and taken down.
     *
     * The `card` blob is never selected. The handful of fields the list needs are extracted in
     * SQL, which keeps a page to a few hundred bytes rather than megabytes.
     */
    public function cards(Request $request)
    {
        $search = trim((string) $request->query('q', ''));
        $only = $request->query('filter'); // 'public' | 'private' | null

        $cards = User::query()
            ->select(['id', 'name', 'email', 'slug', 'is_public', 'avatar', 'github_login', 'updated_at'])
            // JSON selectors rather than raw SQL, so the grammar emits whatever the driver needs.
            // Written out by hand this is MySQL-only, and the JSON functions differ per driver.
            ->addSelect([
                'card->rarity as rarity',
                'card->profile->login as gh_login',
                'card->profile->followers as followers',
                'card->profile->stars as stars',
            ])
            ->whereNotNull('card')
            ->when($only === 'public', fn ($q) => $q->where('is_public', true)->whereNotNull('slug'))
            ->when($only === 'private', fn ($q) => $q->where(fn ($w) => $w->where('is_public', false)->orWhereNull('slug')))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$search}%")
                ->orWhere('slug', 'like', "%{$search}%")
                ->orWhere('github_login', 'like', "%{$search}%")))
            ->orderByDesc('updated_at')
            ->paginate(10)
            ->withQueryString()
            ->through(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'slug' => $u->slug,
                'is_public' => (bool) $u->is_public,
                'avatar' => $u->avatar,
                'github' => $u->gh_login ?: $u->github_login,
                'rarity' => $u->rarity,
                'followers' => $u->followers !== null ? (int) $u->followers : null,
                'stars' => $u->stars !== null ? (int) $u->stars : null,
                'updated_at' => $u->updated_at?->diffForHumans(),
            ]);

        return Inertia::render('admin/cards', [
            'cards' => $cards,
            'filters' => ['q' => $search, 'filter' => $only],
            'totals' => [
                'all' => User::whereNotNull('card')->count(),
                'public' => User::whereNotNull('card')->where('is_public', true)->whereNotNull('slug')->count(),
            ],
        ]);
    }

    /** Take a public card down, or restore it. Moderation for an abusive public slug. */
    public function moderateCard(Request $request, User $user)
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['unpublish', 'publish', 'clear_slug'])],
        ]);

        match ($data['action']) {
            'unpublish' => $user->update(['is_public' => false]),
            'publish' => $user->update(['is_public' => true]),
            'clear_slug' => $user->update(['slug' => null, 'is_public' => false]),
        };

        activity('admin')->causedBy(Auth::user())->performedOn($user)
            ->log("Admin {$data['action']} on card of user #{$user->id}");

        return back()->with('success', 'Card updated.');
    }

    public function assets()
    {
        $byCat = [];
        foreach (CardAsset::orderBy('category')->orderBy('sort_order')->orderBy('label')->get() as $a) {
            $byCat[$a->category][] = [
                'id' => $a->id,
                'category' => $a->category,
                'slug' => $a->slug,
                'label' => $a->label,
                'generation' => $a->generation,
                'asset_url' => $a->asset_url,
                'meta' => $a->meta,
                'sort_order' => $a->sort_order,
                'enabled' => (bool) $a->enabled,
            ];
        }

        return Inertia::render('admin/assets', [
            'categories' => self::CATEGORIES,
            'assets' => $byCat,
        ]);
    }

    public function saveAsset(Request $request)
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer'],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'slug' => ['required', 'string', 'max:80'],
            'label' => ['nullable', 'string', 'max:128'],
            'generation' => ['nullable', 'string', 'max:64'],
            /*
             * A same-origin path or an https URL, nothing else. Every visitor is handed this value
             * by the public options endpoint and it renders straight into an <img src>, so a free
             * string would let the card lab point at third-party origins (leaking every viewer's
             * request) or at `javascript:`/`data:` payloads. A leading `//` is rejected too, since
             * protocol-relative URLs escape the origin just as effectively.
             */
            'asset_url' => ['nullable', 'string', 'max:255', 'regex:#^(?:/(?!/)(?!.*\.\.)[\w\-./]*|https://[\w\-.]+(?::\d+)?/(?!.*\.\.)[\w\-./%]*)$#'],
            'sort_order' => ['nullable', 'integer'],
            'enabled' => ['boolean'],
            // meta carries load-bearing keys: glare.dr drives the holo engine and the
            // rarity_preset keys drive the gallery. Malformed JSON has to fail here, because
            // falling through to null would wipe the row's meta on a typo with no error shown.
            'meta' => ['nullable', function ($attr, $value, $fail) {
                if (! is_string($value) || trim($value) === '') {
                    return;
                }
                json_decode($value, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $fail('Meta must be valid JSON (e.g. {"dr":"rare holo"}).');
                }
            }],
            // SVG is not allowed: it is an executable document (inline <script>, onload=,
            // xlink:href) served same-origin from public/, which is stored XSS with session
            // access. Card assets are raster art, so nothing needs it.
            'file' => ['nullable', 'file', 'mimes:webp,png,jpg,jpeg,gif', 'max:4096'],
        ]);

        $slug = trim($data['slug']);
        $assetUrl = $data['asset_url'] ?? '';

        // Uploads land in public/img/uploads/<category>/<slug>.<ext>.
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            /*
             * The extension comes from the file's sniffed content, never from the client's
             * filename. `mimes:` validates the real MIME, so a file holding valid PNG bytes but
             * named "x.php" passes and would be written into public/ as executable PHP. PNG
             * metadata can carry a payload, which makes that remote code execution.
             */
            $ext = strtolower($file->extension() ?: 'png');
            if (! in_array($ext, ['webp', 'png', 'jpg', 'jpeg', 'gif'], true)) {
                throw ValidationException::withMessages(['file' => 'Unsupported image type.']);
            }
            // Dots are stripped along with everything else: the extension is appended below, so a
            // slug never needs one and allowing it would smuggle a second extension in.
            $safe = preg_replace('/[^a-z0-9_-]/i', '-', $slug) ?: ('asset-'.substr(md5($slug), 0, 6));
            $dir = public_path("img/uploads/{$data['category']}");
            if (! is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            $request->file('file')->move($dir, "$safe.$ext");
            $assetUrl = "/img/uploads/{$data['category']}/$safe.$ext";
        }

        // meta arrives as a JSON string from the form. Stored decoded, or null when the field is
        // blank. Validation above already rejected malformed JSON, so there is no failure branch.
        $meta = $data['meta'] ?? null;
        if (is_string($meta)) {
            $meta = trim($meta) === '' ? null : json_decode($meta, true);
        }

        $values = [
            'category' => $data['category'],
            'slug' => $slug,
            'label' => $data['label'] ?: $slug,
            'generation' => $data['generation'] ?? '',
            'asset_url' => $assetUrl,
            'meta' => $meta,
            'sort_order' => $data['sort_order'] ?? 0,
            'enabled' => $data['enabled'] ?? true,
        ];

        // card_assets has UNIQUE (category, slug, generation). updateOrCreate matches on exactly
        // that triple, so the create path is safe, but an edit that renames a slug onto an
        // existing row would hit the constraint and surface as a 500. Check first instead.
        if (! empty($data['id'])) {
            $clash = CardAsset::where('category', $values['category'])
                ->where('slug', $values['slug'])
                ->where('generation', $values['generation'])
                ->whereKeyNot($data['id'])
                ->exists();
            if ($clash) {
                throw ValidationException::withMessages([
                    'slug' => "An asset already exists for {$values['category']}/{$values['slug']}".
                        ($values['generation'] !== '' ? " on {$values['generation']}" : '').'.',
                ]);
            }
            CardAsset::whereKey($data['id'])->update($values);
        } else {
            CardAsset::updateOrCreate(
                ['category' => $values['category'], 'slug' => $values['slug'], 'generation' => $values['generation']],
                $values
            );
        }

        activity('admin')->causedBy(Auth::user())->log("Admin saved card asset {$values['category']}/{$values['slug']}");

        return back()->with('success', 'Asset saved.');
    }

    public function toggleAsset(CardAsset $asset)
    {
        $asset->update(['enabled' => ! $asset->enabled]);
        activity('admin')->causedBy(Auth::user())->performedOn($asset)
            ->log(($asset->enabled ? 'Enabled' : 'Disabled')." card asset {$asset->category}/{$asset->slug}");

        return back()->with('success', 'Asset toggled.');
    }

    public function deleteAsset(CardAsset $asset)
    {
        $asset->delete();
        activity('admin')->causedBy(Auth::user())->log('Admin deleted card asset #'.$asset->id);

        return back()->with('success', 'Asset deleted.');
    }

    public function activity(Request $request)
    {
        $search = trim((string) $request->query('q', ''));
        $log = trim((string) $request->query('log', ''));

        $activities = Activity::query()
            ->select(['id', 'log_name', 'description', 'subject_type', 'subject_id', 'causer_type', 'causer_id', 'created_at'])
            // Column-scoped: a bare with('causer') hydrates the whole User row, card blob and
            // email included, once per row, to print one name.
            ->with('causer:id,name')
            ->when($log !== '', fn ($q) => $q->where('log_name', $log))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search).'%';
                $q->where(fn ($w) => $w->where('description', 'like', $like)
                    ->orWhereHasMorph('causer', [User::class], fn ($c) => $c->where('name', 'like', $like)));
            })
            ->latest()
            ->paginate(10)
            ->withQueryString()
            ->through(fn (Activity $a) => $this->activityRow($a));

        return Inertia::render('admin/activity', [
            'activities' => $activities,
            // One row per log channel, so the client does not have to guess the channel names.
            'logs' => Activity::query()->distinct()->orderBy('log_name')->pluck('log_name'),
            'filters' => ['q' => $search, 'log' => $log],
        ]);
    }

    /** How many users hold the admin role. The lockout guards above key off this. */
    private function adminCount(): int
    {
        return User::role('admin')->count();
    }

    private function activityRow(Activity $a): array
    {
        return [
            'id' => $a->id,
            'log_name' => $a->log_name,
            'description' => $a->description,
            'subject' => $a->subject_type ? class_basename($a->subject_type).' #'.$a->subject_id : null,
            'causer' => $a->causer?->name,
            // `properties` is not shipped: the table never renders it, and it holds whatever each
            // logger put there, request payloads included.
            'created_at' => $a->created_at?->diffForHumans(),
        ];
    }
}
