<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Rules\Turnstile as TurnstileRule;
use App\Services\GithubCardService;
use Illuminate\Http\Request;

/**
 * The home page's search box: turn any GitHub handle into a card.
 *
 * Open to logged-out visitors, since looking a developer up is the product. Signing in is what
 * claiming and regenerating cost.
 *
 * Turnstile and the `card-generate` limiter stand in for the login: a miss here is two GitHub
 * calls and a paid AI completion, which makes it the one public path that costs real money.
 */
class GenerateCardController extends Controller
{
    public function store(Request $request, GithubCardService $svc)
    {
        // The AI alone is allowed 120s by config, which is longer than PHP's default
        // max_execution_time. Same headroom the dashboard's regenerate gives itself.
        @set_time_limit((int) config('pokehub.ai.timeout', 60) + 60);

        $data = $request->validate([
            // Implicit rule, so it also rejects a missing token, and no-ops when Turnstile is off.
            'cf-turnstile-response' => [new TurnstileRule],
            // GitHub's own handle rule: alphanumerics and single inner hyphens, 39 max. Checking it
            // here means a typo costs a 422 rather than a GitHub round trip.
            'login' => ['required', 'string', 'regex:/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/'],
        ], [
            'login.regex' => 'That is not a GitHub username.',
        ]);

        $login = strtolower($data['login']);

        // A generated card lives at /{login}, and these paths are real routes that would win the
        // match, leaving the card unreachable. Same list sign-up refuses to hand out as a slug.
        if (in_array($login, User::RESERVED_SLUGS, true)) {
            return back()->withErrors(['login' => 'That name is reserved here.']);
        }

        // A private account is not searchable at all. Generating would refresh a hidden person's
        // cached row on demand and spend a completion on a card that can never be displayed.
        $hidden = User::query()
            ->where('is_public', false)
            ->where(fn ($q) => $q->where('slug', $login)->orWhere('github_login', $login))
            ->exists();

        if ($hidden) {
            return back()->withErrors(['login' => 'That trainer keeps their card private.']);
        }

        [$row, $error] = $svc->ensureProfile($login);

        if (! $row) {
            return back()->withErrors(['login' => $error]);
        }

        return redirect('/'.$login);
    }
}
