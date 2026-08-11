<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;

/**
 * The daily card-generation quota: how much is spent, when it resets, and who is exempt.
 *
 * It lives here rather than inside the `card-regen` limiter because the dashboard has to print the
 * same numbers the enforcement uses, and ThrottleRequests' cache key cannot be re-derived without
 * a second copy that would drift. One key, owned here, serves both sides. The per-minute burst
 * limit stays in AppServiceProvider, since nothing displays it.
 */
class RegenQuota
{
    /** Rolling 24h from the first press, not from midnight. */
    private const WINDOW = 86400;

    /**
     * The welcome generation is once per GitHub identity rather than once per day, so its marker
     * has to outlive every daily window. A year is long enough, and keeping it in the cache store
     * the counter already uses avoids a column that account deletion would wipe. See key().
     */
    private const WELCOME_WINDOW = 31536000;

    public function __construct(private readonly User $user) {}

    public function limit(): int
    {
        return (int) config('pokehub.daily_regen_limit', 5);
    }

    /**
     * Admins are not blocked, but the counter still runs for them so the dashboard shows real
     * usage against the same cap rather than a permanent zero.
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

    /**
     * True while the free first generation is still unspent.
     *
     * Not `$user->card === null`, because a hard account delete produces exactly that state and
     * would hand out a fresh free generation on every delete-and-reauthorise cycle. The marker is
     * keyed on the GitHub identity instead, which survives the round trip.
     */
    public function hasWelcome(): bool
    {
        return RateLimiter::attempts($this->welcomeKey()) === 0;
    }

    public function exceeded(): bool
    {
        // An unspent welcome is never blocked, since it does not come out of the daily pot.
        if ($this->unlimited() || $this->hasWelcome()) {
            return false;
        }

        return $this->used() >= $this->limit();
    }

    /**
     * Spend one generation. The first on a GitHub identity is free and leaves the daily counter
     * untouched, so a new account does not spend part of its quota just to see its card.
     */
    public function spend(): void
    {
        if ($this->hasWelcome()) {
            RateLimiter::hit($this->welcomeKey(), self::WELCOME_WINDOW);

            return;
        }

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
            'welcome' => $this->hasWelcome(),
        ];
    }

    /**
     * Keyed on github_id rather than users.id. Account deletion is a hard delete, so keying on the
     * row id would let a spent quota be reset by deleting and re-authorising. GitHub returns the
     * same numeric id on every sign-in. Falls back to the row id for the seeded admin, which has
     * no GitHub identity.
     */
    private function key(): string
    {
        return 'card-regen:daily:'.($this->user->github_id ?: $this->user->id);
    }

    /** Same identity as key(), and for the same reason. */
    private function welcomeKey(): string
    {
        return 'card-regen:welcome:'.($this->user->github_id ?: $this->user->id);
    }
}
