<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Cached GitHub profile + generative card data. login is the natural key.
 */
class Profile extends Model
{
    protected $table = 'profiles';

    protected $primaryKey = 'login';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'github_json' => 'array',
        'card_json' => 'array',
        'payload' => 'array',
        'fetched_at' => 'integer',
    ];
}
