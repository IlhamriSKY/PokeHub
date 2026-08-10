<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One selectable card option (generation, element, frame, effect, glare,
 * rarity, icon, tag, badge). Editable from the admin dashboard.
 */
class CardAsset extends Model
{
    protected $table = 'card_assets';

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
        'enabled' => 'boolean',
        'sort_order' => 'integer',
    ];
}
