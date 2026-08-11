<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Services\GithubCardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * The card lab's GitHub proxy.
 *
 *     GET /api/github?u=<username>[&fresh=1]
 *
 * Returns raw GitHub fields plus `ai` lore, `rarity` and a nested `card` object. Cached rows are
 * served straight from the database; GitHub and the AI only run on a first fetch or `?fresh=1`.
 */
class GithubController extends Controller
{
    public function show(Request $request, GithubCardService $svc)
    {
        // Room for a slow AI plus the GitHub calls. Must exceed pokehub.ai.timeout, or PHP kills
        // the script before the model replies.
        @set_time_limit((int) config('pokehub.ai.timeout', 60) + 60);

        $login = strtolower(trim((string) $request->query('u', '')));
        if (! preg_match('/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/', $login)) {
            return $this->fail(400, 'Invalid GitHub username');
        }

        $fresh = (bool) $request->query('fresh');
        $now = time();

        $row = Profile::find($login);
        [$github, $card] = $row?->split() ?? [null, null];

        // An empty or corrupt row counts as a miss.
        if ($fresh || ! is_array($github) || empty($github['login'])) {
            // Generating for an arbitrary handle is the card lab, so admin only. Guarded here
            // rather than as route middleware, so cached reads stay public for shared links.
            if (! Auth::user()?->hasRole('admin')) {
                return $this->fail(403, 'The card lab is admin-only.');
            }

            [$user, $err, $code] = $svc->ghGet('https://api.github.com/users/'.rawurlencode($login));

            if ($err !== null || ! is_array($user)) {
                if (is_array($github) && ! empty($github['login'])) {
                    // serve stale cache on GitHub failure
                } elseif ($code === 404) {
                    return $this->fail(404, 'GitHub user not found');
                } elseif ($code === 403 || $code === 429) {
                    return $this->fail(429, 'GitHub rate limit reached. Set a GITHUB_TOKEN in .env to raise it from 60 to 5000 requests/hour.');
                } else {
                    return $this->fail(502, 'GitHub API error');
                }
            } else {
                [$repos, $repoErr] = $svc->ghGet('https://api.github.com/users/'.rawurlencode($login).'/repos?per_page=100&sort=pushed');

                if ($repoErr !== null && is_array($github) && ! empty($github['login'])) {
                    // keep stale $github/$card on partial failure
                } else {
                    // Any already-cached lore survives a failed regeneration below.
                    $prevAi = is_array($card) ? ($card['ai'] ?? null) : null;
                    $github = $svc->buildProfile($user, is_array($repos) ? $repos : []);
                    $card = ['ai' => null];
                    if ($repoErr === null) {
                        $ai = config('pokehub.ai');
                        if (! empty($ai['enabled']) && ! empty($ai['key'])) {
                            $github['readme'] = $svc->fetchReadme($login);
                            $github['orgs'] = $svc->fetchOrgs($login);
                        }
                        // A timed-out AI returns null. Keeping the previous lore means a refetch
                        // can never make a card worse than it was.
                        $card['ai'] = $svc->aiGenerate($github) ?? $prevAi;
                        unset($github['readme'], $github['orgs']); // AI inputs only; keep github_json compact

                        Profile::updateOrCreate(
                            ['login' => $login],
                            ['github_json' => $github, 'card_json' => $card, 'fetched_at' => $now]
                        );
                    }
                }
            }
        }

        // Raw GitHub fields plus the generated card data, with flat `ai`/`rarity` kept alongside
        // the nested `card` object for the current client.
        $data = is_array($github) ? $github : [];
        $lore = is_array($card) ? ($card['ai'] ?? null) : null;
        // The profile has to be passed in, since rarityFor without one can only return the default.
        $rarity = $svc->rarityFor($login, $data);
        $data['ai'] = $lore;
        $data['rarity'] = $rarity;
        $data['card'] = ['ai' => $lore, 'rarity' => $rarity];

        return response()->json($data, 200, [
            'Cache-Control' => 'public, max-age=60',
        ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    private function fail(int $code, string $msg)
    {
        return response()->json(['error' => $msg], $code);
    }
}
