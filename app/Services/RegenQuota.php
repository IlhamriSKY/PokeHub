<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;

/**
 * The daily card-generation quota: how much is spent, when it resets, and who is exempt.
 *
 * It lives here rather than inside the `card-regen` limiter because the dashboard has to PRINT the
 * same numbers the enforcement uses, and a middleware limit cannot be read back out reliably:
 * ThrottleRequests derives its cache key as `md5($limiterName.$limit->key)` - or not, depending on
 * a static hashing flag - so a second copy of that derivation is a silent drift waiting to happen.
 * One key, owned here, is used by both sides. The per-minute burst limit stays in AppServiceProvider;
 * nothing displays that one.
 */
class RegenQuota
{
    /** Rolling 24h from the first press, not midnight - the same window the limiter used. */
    private const WINDOW = 86400;

    public function __construct(private readonly User $user) {}

    public function limit(): int
    {
        return (int) config('pokehub.daily_regen_limit', 5);
    }

    /**
     * Admins are not blocked - but the counter still runs for them, so the dashboard shows their
     * real usage against the same cap rather than a permanent 0.
     */
    public function unlimited(): bool
    {
        return $this->user->hasRole('admin');
    }

    public function used(): int
    {
        return RateLimiter::attempts($this->key());
    }

    /** Seconds until the window clears. 0 when nothing has been spent yet. */
    public function resetsIn(): int
    {
        return RateLimiter::availableIn($this->key());
    }

    public function exceeded(): bool
    {
        return ! $this->unlimited() && $this->used() >= $this->limit();
    }

    public function hit(): void
    {
        RateLimiter::hit($this->key(), self::WINDOW);
    }

    /** What the dashboard renders. */
    public function toArray(): array
    {
        return [
            'limit' => $this->limit(),
            'used' => $this->used(),
            'resets_in' => $this->resetsIn(),
            'unlimited' => $this->unlimited(),
        ];
    }

    /**
     * Keyed on github_id, NOT users.id. Account deletion is a hard delete, so burning the quota and
     * then deleting + re-authorising minted a fresh users.id and a fresh five generations - the one
     * bypass that costs actual money. GitHub hands back the same numeric id on every sign-in, so it
     * survives that round trip. Falls back to the row id for the seeded admin, which has no GitHub
     * identity of its own.
     */
    private function key(): string
    {
        return 'card-regen:daily:'.($this->user->github_id ?: $this->user->id);
    }
}
