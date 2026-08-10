<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * GitHub sign-in. PokeHub builds a card FROM a GitHub profile, so GitHub is the identity that
 * actually matters here - `github_login` is both the OAuth link and the handle the card is
 * generated from, which is why it is stored rather than re-derived on every render.
 *
 * Mirrors the existing google_id/avatar pair. Nullable because password and Google accounts
 * predate it, and uniquely indexed so two PokeHub users can never claim one GitHub identity.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('github_id')->nullable()->unique()->after('google_id');
            $table->string('github_login')->nullable()->index()->after('github_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['github_id', 'github_login']);
        });
    }
};
