<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Public-profile and social sign-in fields on users.
 *
 *  - slug: the public URL, /{slug}, which an admin can rename
 *  - card: the stored card (profile JSON plus rarity and axes)
 *  - is_public: whether the slug page is live
 *  - google_id / avatar: Socialite sign-in. `google_id` is unused since sign-in became
 *    GitHub-only; the column is kept so this migration stays reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('slug', 40)->nullable()->unique()->after('email');
            $table->json('card')->nullable()->after('slug');
            $table->boolean('is_public')->default(true)->after('card');
            $table->string('google_id')->nullable()->index()->after('is_public');
            $table->string('avatar')->nullable()->after('google_id');
            // Google users have no password; make it nullable.
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['slug', 'card', 'is_public', 'google_id', 'avatar']);
        });
    }
};
