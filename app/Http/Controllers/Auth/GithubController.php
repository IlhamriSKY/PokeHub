<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Models\User;
use App\Services\GithubCardService;
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
        } catch (Throwable) {
            return redirect()->route('login')->with('status', 'GitHub sign-in failed. Please try again.');
        }

        $githubId = (string) $githubUser->getId();
        $login = $githubUser->getNickname();
        $email = $githubUser->getEmail();

        $user = User::where('github_id', $githubId)->first();

        /*
         * Only match a row whose address this app verified itself. GitHub hands back a verified
         * primary address, but /settings/profile lets any signed-in user claim an arbitrary one,
         * so matching on the stored address alone would let an attacker park a victim's GitHub
         * email on their own row and capture that victim's first sign-in.
         *
         * Rows created below take email_verified_at from GitHub; a self-edited address stays null
         * until re-verified.
         */
        if (! $user && $email) {
            $user = User::where('email', $email)->whereNotNull('email_verified_at')->first();
        }

        $isNew = false;
        if (! $user) {
            $isNew = true;
            $user = new User;
            /*
             * An address that is taken at this point is parked on an unverified row, since the
             * match above skipped it. users.email is unique, so assigning it anyway would fail the
             * insert and block this sign-in entirely. Fall back to GitHub's noreply form, which is
             * keyed on the numeric account id.
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
        // Only stamp the address GitHub just vouched for. Stamping on any non-empty $email would
        // mark a self-set address verified and turn it into a capture target for the match above.
        if (! $user->email_verified_at && $email && $user->email === $email) {
            $user->email_verified_at = now();
        }

        /*
         * The claim. Anyone can generate this handle's card from the home page, so by the time its
         * owner signs in the card usually exists already; adopting it beats an empty dashboard and
         * a free generation spent on a card the site has published under their name.
         *
         * Only when they have none, so a returning user's restyled card is never overwritten by
         * the unstyled row a stranger's search left behind.
         */
        if (! $user->card && $login) {
            [$github, $card] = Profile::find(strtolower($login))?->split() ?? [null, null];
            if (is_array($github) && ! empty($github['login'])) {
                $user->card = [
                    'profile' => $github + ['ai' => $card['ai'] ?? null],
                    'rarity' => app(GithubCardService::class)->rarityFor($login, $github),
                    'axes' => [],
                ];
            }
        }

        $user->save();

        if ($isNew && ! $user->hasRole('user')) {
            $user->assignRole('user');
        }

        Auth::login($user, true);

        return redirect()->intended(route('dashboard'));
    }

    /**
     * Disambiguate a colliding address by suffixing the local part. The noreply seed already
     * carries the unique GitHub id, so this only fires if someone parked that exact string.
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
