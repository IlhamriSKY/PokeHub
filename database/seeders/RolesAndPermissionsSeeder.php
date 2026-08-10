<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * PokeHub roles & permissions. Two roles:
 *  - admin: full dashboard access (users, roles, slugs, card assets, activity)
 *  - user:  authors their own public card, nothing else
 * Seeds an admin account so the dashboard is reachable out of the box.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'manage users',
            'manage roles',
            'manage slugs',
            'manage card assets',
            'manage profiles',
            'view activity log',
            'edit own card',
        ];
        foreach ($permissions as $p) {
            Permission::findOrCreate($p, 'web');
        }

        $admin = Role::findOrCreate('admin', 'web');
        $admin->syncPermissions($permissions);

        $user = Role::findOrCreate('user', 'web');
        $user->syncPermissions(['edit own card']);

        // Every existing user without a role becomes a normal user.
        User::doesntHave('roles')->each(fn (User $u) => $u->assignRole('user'));

        /*
         * Bootstrap admin. Deliberately NOT a fixed password any more.
         *
         * This block used to hardcode Hash::make('password') on admin@pokehub.dev, and
         * DatabaseSeeder calls this seeder unconditionally - while the README's deploy step is
         * `php artisan migrate --seed --force`. So every deployment minted a fully-privileged
         * account with a guessable password, and because it is updateOrCreate, an operator who
         * rotated that password got it reset back on the next seed.
         *
         * Now: with no ADMIN_PASSWORD set we generate a random one that nobody knows. There is no
         * password login at all any more (registration, password reset and POST /login were all
         * removed - GitHub OAuth is the only way in), so the hash is a placeholder, not a
         * credential: the account is CLAIMED by signing in with GitHub on an account whose primary
         * address is ADMIN_EMAIL. `email_verified_at` below is what lets the OAuth callback match
         * it. An EXISTING admin's password is never overwritten either way.
         */
        $adminEmail = env('ADMIN_EMAIL', 'admin@pokehub.dev');
        $existing = User::where('email', $adminEmail)->first();

        $adminUser = User::updateOrCreate(
            ['email' => $adminEmail],
            array_filter([
                'name' => $existing?->name ?: 'PokeHub Admin',
                // only set a password when creating, or when one was explicitly supplied
                'password' => $existing && ! env('ADMIN_PASSWORD')
                    ? null
                    : Hash::make(env('ADMIN_PASSWORD') ?: Str::random(40)),
                'email_verified_at' => $existing?->email_verified_at ?: now(),
                'slug' => $existing?->slug ?: 'pokehub-admin',
            ], fn ($v) => $v !== null)
        );
        $adminUser->syncRoles(['admin']);

        if (! $existing) {
            $this->command?->warn(
                "Bootstrap admin {$adminEmail} created. This app has no password login - claim it by ".
                'signing in with GitHub on an account whose primary email is that address.'
            );
        }
    }
}
