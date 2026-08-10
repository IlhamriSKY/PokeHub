<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GithubController extends Controller
{
    public function redirect()
    {
        if (! config('services.github.client_id')) {
            return redirect()->route('login')->with('status', 'GitHub login is not configured yet.');
        }

        // No repo scope: the card only needs public data.
        return Socialite::driver('github')->scopes(['read:user', 'user:email'])->redirect();
    }

    public function callback()
    {
        try {
            $githubUser = Socialite::driver('github')->user();
        } catch (Throwable $e) {
            return redirect()->route('login')->with('status', 'GitHub sign-in failed. Please try again.');
        }

        $githubId = (string) $githubUser->getId();
        $login = $githubUser->getNickname();
        $email = $githubUser->getEmail();

        $user = User::where('github_id', $githubId)->first();

        /*
         * GitHub only hands back a VERIFIED primary address, so the incoming half is trustworthy -
         * but the stored half was not: /settings/profile lets any signed-in user set `email` to
         * anything, unverified. So an attacker could park a victim's GitHub address on their own
         * row and wait; the victim's first sign-in would miss on github_id, fall through to here,
         * and log them into the attacker's account (pre-seeded slug and card included).
         *
         * Only match a row whose address this app actually verified. Rows created below get
         * email_verified_at from GitHub; a self-edited address is null until re-verified, so it
         * can no longer capture anyone.
         */
        if (! $user && $email) {
            $user = User::where('email', $email)->whereNotNull('email_verified_at')->first();
        }

        $isNew = false;
        if (! $user) {
            $isNew = true;
            $user = new User;
            /*
             * Reaching here with a non-null $email that is already taken means it is parked on an
             * UNVERIFIED row - the match above skipped it. users.email is unique, so simply
             * assigning it threw SQLSTATE 23000 and the victim's sign-in 500'd: the squatter still
             * won, just by blocking registration instead of capturing it. Fall back to GitHub's own
             * noreply form, which is keyed on the numeric account id.
             */
            $taken = $email && User::where('email', $email)->exists();
            $user->email = $this->uniqueEmail(
                ! $email || $taken ? "{$githubId}+".($login ?: 'trainer').'@users.noreply.github.com' : $email
            );
            $user->slug = $this->uniqueSlug($login ?: 'trainer');
        }

        $user->name = $user->name ?: ($githubUser->getName() ?: $login ?: 'PokeHub Trainer');
        $user->github_id = $githubId;
        $user->github_login = $login;
        $user->avatar = $githubUser->getAvatar() ?: $user->avatar;
        // Only the address GitHub just vouched for. Stamping on any non-empty $email marked the
        // STORED one verified, which for a returning user is whatever they last typed into
        // /settings/profile - so a self-set address they do not own came back verified and became
        // a valid capture target for the match above. Same guard, other end.
        if (! $user->email_verified_at && $email && $user->email === $email) {
            $user->email_verified_at = now();
        }
        $user->save();

        if ($isNew && ! $user->hasRole('user')) {
            $user->assignRole('user');
        }

        Auth::login($user, true);

        return redirect()->intended(route('dashboard'));
    }

    /**
     * Disambiguate with plus-addressing. The noreply seed already carries the unique GitHub id, so
     * this only fires if someone parked that exact string on their row - cheap insurance against
     * the one remaining way to block a stranger's first sign-in.
     */
    private function uniqueEmail(string $seed): string
    {
        $email = $seed;
        $n = 1;
        while (User::where('email', $email)->exists()) {
            $email = str_replace('@', '-'.(++$n).'@', $seed);
        }

        return $email;
    }

    private function uniqueSlug(string $seed): string
    {
        $base = Str::slug($seed) ?: 'trainer';
        $slug = $base;
        $n = 1;
        while (in_array($slug, User::RESERVED_SLUGS, true) || User::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$n);
        }

        return $slug;
    }
}
