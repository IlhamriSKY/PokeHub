<?php

namespace App\Services;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * The face on the card, served from THIS origin instead of hot-linked to GitHub's CDN.
 *
 * The card used to point `<img>` straight at `avatars.githubusercontent.com`, which made every
 * card depend on a third party the visitor's network may not reach - and GitHub sends
 * `Cache-Control: max-age=300` on avatars, so a browser threw the picture away after five minutes
 * and re-fetched it on the next view. A face that vanishes on some networks and re-downloads
 * itself all day is both of those facts, not a rate limit: the REST API (60/hr anonymous, 5000
 * with GITHUB_TOKEN) is a different service and is only called on a regenerate anyway.
 *
 * So: fetch each avatar once, keep the bytes, and serve them with a day-long cache. The card then
 * has exactly one origin, and the headless capture (CardCapture) stops making an external request
 * per screenshot too.
 *
 * Only logins WE already know are fetchable, and only at the four sizes the card renders. That is
 * what keeps this from being a public image proxy: the key space is our own profile table times
 * four, so nobody can walk it to fill the disk or bounce traffic through us.
 */
class AvatarCache
{
    /**
     * The sizes the card actually asks for - 360 for the artwork window, 96/64 for the TCG Pocket
     * evolution chips (PcgFace, PokeCard). 180 is the sidebar/header portrait.
     */
    public const SIZES = [64, 96, 180, 360];

    public const DEFAULT_SIZE = 360;

    /**
     * How long a stored file is trusted before we look again. People do change their picture, and
     * nothing tells us when: the URL carries a static `?v=4`, so it is the same string before and
     * after. A regenerate calls forget() and picks a new one up immediately; this is the floor for
     * everyone else.
     */
    private const TTL = 7 * 86400;

    /** How soon to try again after a refresh that failed. See the touch() in ensure(). */
    private const RETRY = 3600;

    /** Fetchable hosts. GitHub for card faces, Google for accounts that signed in with Google. */
    private const HOSTS = ['avatars.githubusercontent.com', 'lh3.googleusercontent.com'];

    private const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    /** An avatar is ~20KB at s=360. Anything near this is not one, and is not worth storing. */
    private const MAX_BYTES = 2097152;

    /** Snap a client-supplied `?s=` onto the whitelist. Anything unknown becomes the card size. */
    public static function size(mixed $raw): int
    {
        $size = (int) $raw;

        return in_array($size, self::SIZES, true) ? $size : self::DEFAULT_SIZE;
    }

    /**
     * The public url for a face, for the PHP side of the app (the React card builds its own - see
     * avatarUrl in rarities.ts). Falls back to whatever url we were given when there is no GitHub
     * login to key on, which is the case for an account that signed in with Google.
     */
    public static function urlFor(?string $login, ?string $fallback, int $size = self::DEFAULT_SIZE): ?string
    {
        return $login && $fallback ? route('avatar', ['login' => $login, 's' => self::size($size)], false) : $fallback;
    }

    /**
     * The upstream URL for a login at one size, or null if we have never stored this person.
     *
     * Public because the controller falls back to it: if we know where the picture lives but
     * cannot keep a copy, redirecting the browser to GitHub is exactly the behaviour that existed
     * before this cache, which is better than a hole where a face should be.
     */
    public function upstream(string $login, int $size = self::DEFAULT_SIZE): ?string
    {
        $url = $this->locate($login);

        return $url === null ? null : $url.(str_contains($url, '?') ? '&' : '?').'s='.$size;
    }

    /** Absolute path of the stored file for a login/size, whether or not it exists yet. */
    public function path(string $login, int $size): string
    {
        return Storage::disk('local')->path("avatars/{$size}/".$this->key($login));
    }

    /**
     * The stored file, downloading it first if it is missing or past its TTL.
     *
     * Returns null only when there is nothing to serve at all - an unknown login, or a first fetch
     * that failed. A STALE file always beats no file: if GitHub is down, the card keeps its face.
     */
    public function ensure(string $login, int $size): ?string
    {
        $path = $this->path($login, $size);
        if ($this->fresh($path)) {
            return $path;
        }

        $url = $this->upstream($login, $size);
        if ($url === null) {
            return is_file($path) ? $path : null;
        }

        // One download per login/size, however many requests arrive on a cold face at once. A
        // waiter re-tests the file when it gets the lock, so it costs nothing but the wait.
        try {
            return Cache::lock('avatar:'.$this->key($login).":{$size}", 20)->block(10, function () use ($path, $url) {
                if ($this->fresh($path)) {
                    return $path;
                }
                if ($this->download($url, $path)) {
                    return $path;
                }

                // Failed refresh of something we already have: date it forward so the next request
                // serves the stale copy straight away instead of retrying a dead upstream every
                // time - but only far enough to retry in an hour. Touching it to `now` would buy
                // a one-minute outage a full week of serving a picture we could have replaced.
                return is_file($path) && @touch($path, time() - self::TTL + self::RETRY) ? $path : null;
            });
        } catch (LockTimeoutException) {
            return is_file($path) ? $path : null;
        }
    }

    /** Drop every stored size for a login, so the next request re-downloads. Returns the count. */
    public function forget(string $login): int
    {
        $gone = 0;
        foreach (self::SIZES as $size) {
            $path = $this->path($login, $size);
            if (is_file($path) && @unlink($path)) {
                $gone++;
            }
        }

        return $gone;
    }

    private function fresh(string $path): bool
    {
        return is_file($path) && (time() - (int) filemtime($path)) < self::TTL;
    }

    /**
     * Where this login's picture lives, according to our own tables - never according to the
     * request. `profiles` holds the showcase logins; a claimed account keeps its own copy on the
     * user row (and a fresher one inside the generated card).
     */
    private function locate(string $login): ?string
    {
        $key = $this->key($login);
        if ($key === '') {
            return null;
        }

        $profile = Profile::find($key);
        $url = is_array($profile?->github_json) ? (string) ($profile->github_json['avatar'] ?? '') : '';

        if ($url === '') {
            // LOWER() rather than a plain `=`: `profiles.login` is written lower-cased, but
            // `users.github_login` keeps GitHub's display casing ("IlhamriSKY"), and the request
            // is always lower-cased (one url per face). MySQL's default collation hides that -
            // SQLite's `=` does not - so an equality test here works in production and nowhere
            // else. The table is small and this only runs on a cache miss.
            $user = User::query()->whereRaw('LOWER(github_login) = ?', [$key])->first(['avatar', 'card']);
            $url = (string) (($user?->card['profile']['avatar'] ?? null) ?: ($user?->avatar ?? ''));
        }

        $parts = $url === '' ? [] : (parse_url($url) ?: []);

        return ($parts['scheme'] ?? '') === 'https' && in_array(strtolower($parts['host'] ?? ''), self::HOSTS, true)
            ? $url
            : null;
    }

    /** Filename component. Sanitised as well as validated: this ends up in a path. */
    private function key(string $login): string
    {
        return (string) preg_replace('/[^a-z0-9-]/', '', strtolower($login));
    }

    private function download(string $url, string $path): bool
    {
        try {
            $res = Http::withHeaders(['User-Agent' => 'PokeHub'])
                ->connectTimeout(5)
                ->timeout(10)
                // The host is checked in locate(), but a redirect moves the request somewhere the
                // check never saw. Guzzle follows up to five by default and will happily downgrade
                // to http, which is the shape of an SSRF: one open redirect on either CDN and this
                // becomes a way to make the server fetch an internal address. Pinned to https and
                // two hops - GitHub answers avatars with a straight 200, Google can bounce once.
                ->withOptions(['allow_redirects' => ['max' => 2, 'protocols' => ['https'], 'strict' => true, 'referer' => false]])
                ->get($url);
        } catch (Throwable) {
            return false;
        }

        if (! $res->successful()) {
            return false;
        }

        $body = $res->body();
        $type = strtolower(trim(explode(';', (string) $res->header('Content-Type'))[0]));

        // Header AND bytes. The mime we answer with later is sniffed from the file, so a lying
        // Content-Type must not be able to park something that is not an image in the cache.
        if (! in_array($type, self::TYPES, true) || strlen($body) > self::MAX_BYTES || @getimagesizefromstring($body) === false) {
            return false;
        }

        if (! is_dir(dirname($path)) && ! @mkdir(dirname($path), 0755, true) && ! is_dir(dirname($path))) {
            return false;
        }

        // Write then rename: a reader that arrives mid-download must never get a truncated face.
        $tmp = $path.'.'.bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $body) === false) {
            return false;
        }
        if (! @rename($tmp, $path)) {
            @unlink($tmp);

            return false;
        }

        return true;
    }
}
