<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasRoles, LogsActivity, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    /**
     * Paths a slug may never take. The public card lives at /{slug} on the catch-all, so a user
     * holding one of these would be permanently shadowed by the real route - silently, since the
     * route simply wins. Shared by sign-up and the admin editor: two copies is how they drift.
     */
    public const RESERVED_SLUGS = [
        'admin', 'api', 'auth', 'build', 'cards', 'dashboard', 'login',
        'logout', 'register', 'settings', 'storage', 'up',
    ];

    protected $fillable = [
        'name',
        'email',
        'password',
        'slug',
        'card',
        'is_public',
        'google_id',
        'github_id',
        'github_login',
        'avatar',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'card' => 'array',
            'is_public' => 'boolean',
        ];
    }

    /** Activity log: record profile/card/slug changes, not noisy timestamps. */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email', 'slug', 'is_public'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('user');
    }
}
