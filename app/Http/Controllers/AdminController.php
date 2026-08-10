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
 * Admin dashboard. Role-gated (role:admin). Manages users + their public slugs,
 * card assets (the DB-driven Card Lab options, ported from api/admin.php), and
 * shows the activity log.
 */
class AdminController extends Controller
{
    private const CATEGORIES = ['generation', 'element', 'variant', 'frame', 'effect', 'glare', 'rarity', 'rarity_preset', 'subtype', 'icon', 'tag', 'badge'];

    // The card lab: restyle any card, including the four on the landing page. Admin-only work,
    // so it lives here rather than on the user dashboard.
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
            // `present`, not `required`: a card with default styling has an EMPTY axes blob, and
            // `required` rejects an empty array - which made a fresh card impossible to save.
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

        // Key only: the log is an audit trail, not a copy of every payload that passed through.
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
            // Constrained like the activity page: a bare with('causer') hydrates whole User rows,
            // card blob and e-mail included, to print eight names.
            'recent_activity' => Activity::with('causer:id,name')->latest()->limit(8)->get()->map(fn ($a) => $this->activityRow($a)),
        ]);
    }

    public function users(Request $request)
    {
        /*
         * Paginated and column-scoped. This was `User::with('roles')->get()` - an unbounded
         * SELECT * that pulled every row's `card` JSON (a whole authored card: profile, moves,
         * lore) out of the DB and threw it away after an `! empty()` test, while shipping every
         * user's e-mail to the browser. At a few hundred users that is megabytes of Inertia prop
         * per page view. `has_card` is now decided in SQL, so the blob never leaves the database.
         */
        $search = trim((string) $request->query('q', ''));

        $users = User::query()
            ->select(['id', 'name', 'email', 'slug', 'is_public', 'avatar', 'created_at'])
            // `card` is a MySQL json column, so it must NOT be compared against a string literal
            // ('' is not valid JSON text and the comparison errors). IS NOT NULL is the whole test.
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
                // Shared with sign-up: this list used to be a second, staler copy that had never
                // heard of /cards, so an admin could hand out a slug that shadows a real route.
                Rule::notIn(User::RESERVED_SLUGS),
            ],
            'is_public' => ['boolean'],
            'roles' => ['array'],
            'roles.*' => ['string', Rule::in(Role::pluck('name'))],
        ]);

        /*
         * Refuse a role change that would leave the install with NO admin. Nothing stopped an
         * admin from clearing their own admin role (or the last other admin's), and the panel is
         * the only place roles can be edited - so that was a one-click, unrecoverable lockout
         * needing a DB edit to undo. deleteUser has the same guard below.
         */
        /*
         * `roles` is optional, so a PUT that simply omits the key used to reach
         * syncRoles([]) and strip every role from the target. Absent must mean "leave roles
         * alone"; only an explicitly sent array may change them.
         */
        $newRoles = $request->has('roles') ? ($data['roles'] ?? []) : $user->getRoleNames()->all();
        if ($user->hasRole('admin') && ! in_array('admin', $newRoles, true) && $this->adminCount() <= 1) {
            throw ValidationException::withMessages([
                'roles' => 'This is the last admin - removing the admin role would lock everyone out of this panel.',
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
        // Same lockout guard as updateUser: deleting the last admin leaves nobody able to sign in
        // here, and the panel is the only place roles can be granted.
        if ($user->hasRole('admin') && $this->adminCount() <= 1) {
            return back()->with('error', 'This is the last admin - deleting it would lock everyone out of this panel.');
        }
        $user->delete();
        activity('admin')->causedBy(Auth::user())->log('Admin deleted user #'.$user->id);

        return back()->with('success', 'User deleted.');
    }

    /**
     * The generated CARDS - the app's actual artifact, and until now invisible to admins.
     * Lists every user who has authored one, with its rarity, share state and the GitHub handle it
     * was generated from, so a public slug can be reviewed and taken down.
     *
     * The `card` JSON blob is NEVER selected: the two fields the list needs (rarity, github login)
     * are pulled out in SQL, so a page of 25 cards costs a few hundred bytes instead of megabytes.
     */
    public function cards(Request $request)
    {
        $search = trim((string) $request->query('q', ''));
        $only = $request->query('filter'); // 'public' | 'private' | null

        $cards = User::query()
            ->select(['id', 'name', 'email', 'slug', 'is_public', 'avatar', 'github_login', 'updated_at'])
            ->selectRaw("JSON_UNQUOTE(JSON_EXTRACT(card, '$.rarity')) as rarity")
            ->selectRaw("JSON_UNQUOTE(JSON_EXTRACT(card, '$.profile.login')) as gh_login")
            ->selectRaw("JSON_EXTRACT(card, '$.profile.followers') as followers")
            ->selectRaw("JSON_EXTRACT(card, '$.profile.stars') as stars")
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

    /**
     * Take a public card down (or restore it). Moderation for an abusive public slug - previously
     * an admin could only reach this by hand-editing the user row.
     */
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
             * Constrained to a same-origin path or an https URL. This value is handed to EVERY
             * visitor by the public, unauthenticated /api/options.php and rendered straight into
             * an <img src>, so an unvalidated free string let the card lab point at arbitrary
             * third-party origins (silent request/referer leakage of every viewer) or at
             * `javascript:`/`data:` payloads. A leading `//` is rejected too - that is
             * protocol-relative and escapes the origin just as effectively as a full URL.
             */
            'asset_url' => ['nullable', 'string', 'max:255', 'regex:#^(?:/(?!/)(?!.*\.\.)[\w\-./]*|https://[\w\-.]+(?::\d+)?/(?!.*\.\.)[\w\-./%]*)$#'],
            'sort_order' => ['nullable', 'integer'],
            'enabled' => ['boolean'],
            // meta carries the load-bearing keys (glare.dr drives the holo engine;
            // rarity_preset.dr/tier/era/full/... drive the gallery), so malformed JSON must
            // FAIL here. It used to fall through to `null` below, which silently wiped the
            // row's meta on a typo and killed that option's foil with no error shown.
            'meta' => ['nullable', function ($attr, $value, $fail) {
                if (! is_string($value) || trim($value) === '') {
                    return;
                }
                json_decode($value, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $fail('Meta must be valid JSON (e.g. {"dr":"rare holo"}).');
                }
            }],
            // SVG is deliberately NOT allowed: it is an executable document (inline <script>,
            // onload=, xlink:href) served same-origin from public/, i.e. stored XSS with session
            // access. Card assets are raster art, so nothing needs it.
            'file' => ['nullable', 'file', 'mimes:webp,png,jpg,jpeg,gif', 'max:4096'],
        ]);

        $slug = trim($data['slug']);
        $assetUrl = $data['asset_url'] ?? '';

        // Upload -> public/img/uploads/<category>/<slug>.<ext> (ported from admin.php).
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            /*
             * The extension MUST come from the file's sniffed content, never from the client's
             * filename. `mimes:` validates via guessExtension(), i.e. the real MIME - so a file
             * holding valid PNG bytes but NAMED "x.php" passes validation, and the old
             * getClientOriginalExtension() then wrote it as "<slug>.php" into public/, where
             * mod_php happily executes it. PNG metadata can carry PHP, so that was remote code
             * execution from the asset form. extension() re-derives it from the content instead.
             */
            $ext = strtolower($file->extension() ?: 'png');
            if (! in_array($ext, ['webp', 'png', 'jpg', 'jpeg', 'gif'], true)) {
                throw ValidationException::withMessages(['file' => 'Unsupported image type.']);
            }
            // strip dots too: the extension is appended by us, so a slug never needs one, and
            // allowing them let a slug smuggle a second extension into the filename.
            $safe = preg_replace('/[^a-z0-9_-]/i', '-', $slug) ?: ('asset-'.substr(md5($slug), 0, 6));
            $dir = public_path("img/uploads/{$data['category']}");
            if (! is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            $request->file('file')->move($dir, "$safe.$ext");
            $assetUrl = "/img/uploads/{$data['category']}/$safe.$ext";
        }

        // meta may arrive as a JSON string from the form; store decoded, or null when the
        // field is genuinely blank. Validation above already rejected malformed JSON, so
        // there is no decode-failure branch here -- a failed decode must never silently
        // become null (that is how a typo used to erase glare.dr).
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

        // card_assets has UNIQUE (category, slug, generation). The CREATE path is safe because
        // updateOrCreate matches on exactly that triple, but the EDIT path is a blind update:
        // renaming a row's slug onto an existing one threw a QueryException (SQLSTATE 23000)
        // and surfaced as a 500 instead of a field error. Check first and fail validation.
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
            // Constrained: a bare with('causer') hydrates the whole User - card blob, e-mail and
            // all - thirty times per page, to print one name.
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
            // Short, bounded list (one row per log channel), so it is cheaper than making the
            // client guess the channel names.
            'logs' => Activity::query()->distinct()->orderBy('log_name')->pluck('log_name'),
            'filters' => ['q' => $search, 'log' => $log],
        ]);
    }

    /** How many users still hold the admin role - the lockout guards above key off this. */
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
            // `properties` is deliberately not shipped: the table never renders it, and it holds
            // whatever each logger threw in - request payloads included.
            'created_at' => $a->created_at?->diffForHumans(),
        ];
    }
}
