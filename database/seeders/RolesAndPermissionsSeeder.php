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
 * Roles and permissions. Two roles:
 *
 *  - admin: full dashboard access (users, roles, slugs, card assets, activity)
 *  - user:  authors their own public card, nothing else
 *
 * Also seeds an admin account, so the dashboard is reachable out of the box.
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
         * The bootstrap admin, with no fixed password. This seeder runs on every deploy, so a
         * hardcoded one would mint a privileged account with a guessable credential and reset it
         * again each time an operator rotated it.
         *
         * With no ADMIN_PASSWORD set the hash is random and unknown. Nothing signs in with it:
         * GitHub OAuth is the only way in, so the account is claimed by signing in with GitHub on
         * an account whose primary address is ADMIN_EMAIL, which `email_verified_at` below lets
         * the callback match. An existing admin's password is never overwritten.
         */
        $adminEmail = env('ADMIN_EMAIL', 'admin@pokehub.dev');
        $existing = User::where('email', $adminEmail)->first();

        $adminUser = User::updateOrCreate(
            ['email' => $adminEmail],
            array_filter([
                'name' => $existing?->name ?: 'PokeHub Admin',
                // Only set a password when creating, or when one was explicitly supplied.
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
