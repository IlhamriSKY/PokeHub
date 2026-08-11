<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * GitHub sign-in. `github_login` is both the OAuth link and the handle a card is generated from,
 * so it is stored rather than re-derived on every render.
 *
 * Nullable, because accounts created before GitHub sign-in have neither, and uniquely indexed so
 * two users can never claim one GitHub identity.
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
