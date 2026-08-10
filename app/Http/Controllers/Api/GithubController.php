<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Services\GithubCardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * PokeHub GitHub proxy - the Laravel port of api/github.php.
 *   GET /api/github.php?u=<username>[&fresh=1]
 * Returns the exact JSON shape the React client already expects (raw GitHub
 * fields + `ai` lore + `rarity` + a nested `card` object). Serves cached rows
 * straight from the DB; GitHub/AI only run on first fetch or ?fresh=1.
 */
class GithubController extends Controller
{
    public function show(Request $request, GithubCardService $svc)
    {
        // Give the whole request room for a slow AI plus the GitHub calls: the AI
        // timeout itself (config) + margin. Must exceed pokehub.ai.timeout or PHP
        // would kill the script before the model replies.
        @set_time_limit((int) config('pokehub.ai.timeout', 60) + 60);

        $login = strtolower(trim((string) $request->query('u', '')));
        if (! preg_match('/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/', $login)) {
            return $this->fail(400, 'Invalid GitHub username');
        }

        $fresh = (bool) $request->query('fresh');
        $now = time();

        $row = Profile::find($login);
        [$github, $card] = $this->splitRow($row);

        // A cached profile is served straight from the DB; GitHub/AI only run on
        // an explicit update (?fresh=1). A corrupt/empty row is a cache miss.
        if ($fresh || ! is_array($github) || empty($github['login'])) {
            // Generating for an arbitrary handle is the playground, so admin only. Guarded here
            // rather than as route middleware so cached reads stay public for shared links.
            if (! Auth::user()?->hasRole('admin')) {
                return $this->fail(403, 'The playground is admin-only.');
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
                    // The already-cached flavor (if any) survives a failed regen below.
                    $prevAi = is_array($card) ? ($card['ai'] ?? null) : null;
                    $github = $svc->buildProfile($user, is_array($repos) ? $repos : []);
                    $card = ['ai' => null];
                    if ($repoErr === null) {
                        $ai = config('pokehub.ai');
                        if (! empty($ai['enabled']) && ! empty($ai['key'])) {
                            $github['readme'] = $svc->fetchReadme($login);
                            $github['orgs'] = $svc->fetchOrgs($login);
                        }
                        // A slow AI that times out returns null. Keep the previously generated
                        // flavor instead of wiping a good card, so a refetch never makes it worse.
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

        // Response = raw GitHub fields + generative card data (flat ai/rarity kept
        // for the current client, plus a distinct `card` object).
        $data = is_array($github) ? $github : [];
        $lore = is_array($card) ? ($card['ai'] ?? null) : null;
        // The profile is what earns the tier, so it has to be handed over - `rarityFor` with no
        // profile can only return the default.
        $rarity = $svc->rarityFor($login, $data);
        $data['ai'] = $lore;
        $data['rarity'] = $rarity;
        $data['card'] = ['ai' => $lore, 'rarity' => $rarity];

        return response()->json($data, 200, [
            'Cache-Control' => 'public, max-age=60',
        ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    /**
     * Split a stored Profile into [rawGithubData, generativeCardData], handling a
     * legacy payload-only row (github + ai combined) the same way api/github.php did.
     */
    private function splitRow(?Profile $row): array
    {
        $github = ($row && is_array($row->github_json)) ? $row->github_json : null;
        $card = ($row && is_array($row->card_json)) ? $row->card_json : null;
        if (! is_array($github) && $row && is_array($row->payload) && ! empty($row->payload['login'])) {
            $legacy = $row->payload;
            $card = ['ai' => $legacy['ai'] ?? null];
            unset($legacy['ai'], $legacy['rarity'], $legacy['card']);
            $github = $legacy;
        }

        return [is_array($github) ? $github : null, is_array($card) ? $card : null];
    }

    private function fail(int $code, string $msg)
    {
        return response()->json(['error' => $msg], $code);
    }
}
