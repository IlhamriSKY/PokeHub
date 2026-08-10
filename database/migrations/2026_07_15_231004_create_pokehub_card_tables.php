<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PokeHub card tables, ported from the original api/db.php self-bootstrap.
 * Guarded with hasTable so an existing (old-app) pokehub database is reused
 * as-is rather than erroring on a duplicate CREATE.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Raw GitHub data and the generative CARD data live in separate columns
        // so the card can be regenerated (card_json) without re-fetching GitHub
        // (github_json). `payload` stays nullable only to read legacy rows.
        if (! Schema::hasTable('profiles')) {
            Schema::create('profiles', function (Blueprint $table) {
                $table->string('login', 100)->primary();
                $table->json('github_json')->nullable();
                $table->json('card_json')->nullable();
                $table->json('payload')->nullable();
                $table->unsignedInteger('fetched_at');
            });
        }

        // Every selectable card option (generation, element, frame, effect, glare,
        // rarity, icon, tag, badge) is a row here so new ones are pure admin work.
        if (! Schema::hasTable('card_assets')) {
            Schema::create('card_assets', function (Blueprint $table) {
                $table->increments('id');
                $table->string('category', 32);
                $table->string('slug', 80);
                $table->string('label', 128);
                $table->string('generation', 64)->default('');
                $table->string('asset_url', 255)->default('');
                $table->json('meta')->nullable();
                $table->integer('sort_order')->default(0);
                $table->tinyInteger('enabled')->default(1);
                $table->unique(['category', 'slug', 'generation'], 'uq_asset');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('card_assets');
        Schema::dropIfExists('profiles');
    }
};
