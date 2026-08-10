<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The four landing-page cards, moved out of a PHP const so an admin can restyle them.
// The GitHub data still comes from the cached `profiles` row; only the editorial fields
// and the frame/effect axes live here.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('showcase_cards', function (Blueprint $table) {
            $table->id();
            $table->string('login')->unique();
            $table->string('name');
            $table->string('why')->nullable();
            $table->string('rarity')->nullable();
            $table->json('axes')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('showcase_cards');
    }
};
