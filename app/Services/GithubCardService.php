<?php

namespace App\Services;

use App\Models\CardAsset;
use App\Models\Profile;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Builds a card from a GitHub profile: fetch the user and their repos, shape a compact payload,
 * ask an OpenAI-compatible endpoint for the Pokedex flavour and attacks, then score the profile
 * into a rarity.
 */
class GithubCardService
{
    private array $cfg;

    public function __construct()
    {
        $this->cfg = config('pokehub');
    }

    /**
     * The cached card for a login, generated once if there is none yet.
     *
     * An existing row is returned untouched. This is a public path, so a repeat search must not
     * cost another GitHub round trip and another AI completion; refreshing a card is the owner's
     * regenerate button, behind the daily quota.
     *
     * @return array{0: ?Profile, 1: ?string, 2: int} [row, errorMessage, status]
     */
    public function ensureProfile(string $login): array
    {
        $login = strtolower($login);

        $row = Profile::find($login);
        // split() rather than github_json, so a legacy payload-only row still counts as a hit.
        [$github] = $row?->split() ?? [null];
        if (is_array($github) && ! empty($github['login'])) {
            return [$row, null, 200];
        }

        [$user, $err, $code] = $this->ghGet('https://api.github.com/users/'.rawurlencode($login));
        if ($err !== null || ! is_array($user)) {
            return match (true) {
                $code === 404 => [null, 'No GitHub account called @'.$login.'.', 404],
                $code === 403 || $code === 429 => [null, 'GitHub is rate-limiting us right now. Try again in a minute.', 429],
                default => [null, 'GitHub is unreachable right now. Try again in a minute.', 502],
            };
        }

        // A repo failure is not fatal: followers, age and bio still make a card.
        [$repos] = $this->ghGet('https://api.github.com/users/'.rawurlencode($login).'/repos?per_page=100&sort=pushed');
        $profile = $this->buildProfile($user, is_array($repos) ? $repos : []);

        $lore = null;
        $ai = $this->cfg['ai'] ?? [];
        if (! empty($ai['enabled']) && ! empty($ai['key'])) {
            $profile['readme'] = $this->fetchReadme($login);
            $profile['orgs'] = $this->fetchOrgs($login);
            // Null when the model times out. The stats card still renders, and the owner can
            // regenerate the flavour once they claim the handle.
            $lore = $this->aiGenerate($profile);
            unset($profile['readme'], $profile['orgs']); // AI inputs only; keep github_json compact
        }

        return [
            Profile::updateOrCreate(
                ['login' => $login],
                [
                    'github_json' => $profile,
                    // `rarity` and `axes` are stored, not derived on render, so a generated card is
                    // a card like any other: the admin lab can restyle it, and the gallery can
                    // filter on it in SQL instead of computing a tier per row in PHP.
                    'card_json' => ['ai' => $lore, 'rarity' => $this->rarityFor($login, $profile), 'axes' => []],
                    'fetched_at' => time(),
                ]
            ),
            null,
            201,
        ];
    }

    /** Fetch a GitHub API URL. Returns [decodedBodyOrNull, errorStringOrNull, httpCode]. */
    public function ghGet(string $url): array
    {
        $headers = ['User-Agent' => 'PokeHub', 'Accept' => 'application/vnd.github+json'];
        if (! empty($this->cfg['github_token'])) {
            $headers['Authorization'] = 'Bearer '.$this->cfg['github_token'];
        }
        try {
            $res = Http::withHeaders($headers)->connectTimeout(5)->timeout(10)->get($url);
        } catch (Throwable $e) {
            return [null, $e->getMessage(), 0];
        }
        $code = $res->status();
        if ($code >= 400) {
            return [null, "GitHub HTTP $code", $code];
        }

        return [$res->json(), null, $code];
    }

    /** Shape the raw GitHub responses into the compact payload the card needs. */
    public function buildProfile(array $u, array $repos): array
    {
        $stars = 0;
        $forks = 0;
        $langs = [];
        foreach ($repos as $r) {
            $stars += (int) ($r['stargazers_count'] ?? 0);
            $forks += (int) ($r['forks_count'] ?? 0);
            $lang = $r['language'] ?? null;
            if ($lang) {
                $langs[$lang] = ($langs[$lang] ?? 0) + 1;
            }
        }
        arsort($langs);
        $topLangs = array_slice(array_keys($langs), 0, 3);
        $allLangs = array_slice(array_keys($langs), 0, 8); // wider list for the AI

        // Top original (non-fork) repos by stars, so the AI can name real projects.
        $original = array_values(array_filter($repos, fn ($r) => empty($r['fork'])));
        usort($original, fn ($a, $b) => ((int) ($b['stargazers_count'] ?? 0)) <=> ((int) ($a['stargazers_count'] ?? 0)));
        $topRepos = array_map(fn ($r) => [
            'name' => (string) ($r['name'] ?? ''),
            'desc' => mb_substr((string) ($r['description'] ?? ''), 0, 100),
            'stars' => (int) ($r['stargazers_count'] ?? 0),
            'lang' => (string) ($r['language'] ?? ''),
            'topics' => array_slice((array) ($r['topics'] ?? []), 0, 5),
        ], array_slice($original, 0, 5));

        $created = $u['created_at'] ?? null;
        $ageYears = $created ? (int) floor((time() - strtotime($created)) / 31557600) : 0;

        return [
            'login' => (string) ($u['login'] ?? ''),
            'name' => (string) (($u['name'] ?? '') !== '' ? $u['name'] : ($u['login'] ?? '')),
            'avatar' => (string) ($u['avatar_url'] ?? ''),
            'bio' => (string) ($u['bio'] ?? ''),
            'html_url' => (string) ($u['html_url'] ?? ''),
            'location' => (string) ($u['location'] ?? ''),
            'company' => (string) ($u['company'] ?? ''),
            'blog' => (string) ($u['blog'] ?? ''),
            'twitter' => (string) ($u['twitter_username'] ?? ''),
            'hireable' => (bool) ($u['hireable'] ?? false),
            'followers' => (int) ($u['followers'] ?? 0),
            'following' => (int) ($u['following'] ?? 0),
            'repos' => (int) ($u['public_repos'] ?? 0),
            'gists' => (int) ($u['public_gists'] ?? 0),
            'stars' => $stars,
            'forks' => $forks,
            'top_lang' => $topLangs[0] ?? '',
            'langs' => $topLangs,
            'all_langs' => $allLangs,
            'top_repos' => $topRepos,
            'join_year' => $created ? (int) date('Y', strtotime($created)) : null,
            'age_years' => $ageYears,
        ];
    }

    /** Best-effort profile README text, stripped of markup and truncated for the AI. */
    public function fetchReadme(string $login): string
    {
        [$res] = $this->ghGet('https://api.github.com/repos/'.rawurlencode($login).'/'.rawurlencode($login).'/readme');
        if (! is_array($res) || empty($res['content'])) {
            return '';
        }
        $text = base64_decode(str_replace("\n", '', $res['content']), true) ?: '';
        $text = preg_replace('/<[^>]+>/', ' ', $text);              // html tags
        $text = preg_replace('#https?://\S+#', '', $text);          // urls
        $text = preg_replace('/[#>*_`~\[\]()!|=-]+/', ' ', $text);  // markdown symbols
        $text = preg_replace('/\s+/', ' ', $text);

        return mb_substr(trim($text), 0, 600);
    }

    /** Best-effort list of the user's public organizations (logins). */
    public function fetchOrgs(string $login): array
    {
        [$res] = $this->ghGet('https://api.github.com/users/'.rawurlencode($login).'/orgs');
        if (! is_array($res)) {
            return [];
        }

        return array_slice(array_values(array_filter(array_map(
            fn ($o) => (string) ($o['login'] ?? ''),
            $res
        ))), 0, 6);
    }

    /** Ask the AI endpoint for Pokemon-style species/flavor/attacks. Null on any failure. */
    public function aiGenerate(array $d): ?array
    {
        $ai = $this->cfg['ai'] ?? null;
        if (! $ai || empty($ai['enabled']) || empty($ai['key'])) {
            return null;
        }

        $facts = [
            'name' => $d['name'], 'login' => $d['login'], 'bio' => $d['bio'],
            'readme_excerpt' => $d['readme'] ?? '',
            'company' => $d['company'], 'location' => $d['location'],
            'blog' => $d['blog'] ?? '', 'twitter' => $d['twitter'] ?? '', 'hireable' => $d['hireable'] ?? false,
            'top_language' => $d['top_lang'], 'languages' => $d['all_langs'] ?? $d['langs'],
            'notable_repos' => $d['top_repos'] ?? [],
            'organizations' => $d['orgs'] ?? [],
            'public_repos' => $d['repos'], 'public_gists' => $d['gists'],
            'total_stars' => $d['stars'], 'total_forks' => $d['forks'],
            'followers' => $d['followers'], 'following' => $d['following'],
            'account_age_years' => $d['age_years'], 'joined' => $d['join_year'],
        ];

        $sys = 'You are a Pokemon TCG card writer. Turn a real GitHub developer into a Pokemon-style '
            .'trading card. GROUND EVERYTHING in the given facts: weave in their top language, a notable '
            .'repository or project by name, their star/repo/follower counts, and account age. Write like a '
            .'real Pokedex entry and real TCG attacks (evocative, '
            .'a little dramatic, never generic). Reply with ONLY a JSON object (no markdown, no commentary, no '
            .'reasoning) of exactly this shape: '
            .'{"species":"a short species-class title from their tech ONLY (no person name), e.g. Kernel Coder or Rust Ranger, MAX 22 chars",'
            // Two texts, because the two faces have very different room. flavor fills the Pokemon
            // face's printed box (~2 short lines) and must stay short or it spills out of the
            // frame art.
            .'"flavor":"one COMPLETE Pokedex-style sentence about this dev, ending in a period, up to 100 chars",'
            // effect fills a whole plate on the Trainer face, which has no attacks to share it
            // with. Never shown on a Pokemon card.
            .'"effect":"Trainer-card rules text about this dev, 2 sentences of 150 to 190 characters total, '
            .'written like real TCG Trainer effect text, ALWAYS ending in a period and fully finishing the thought '
            .'(never end on a dangling word, number, or preposition like your/the/a/of/into), weaving in a real '
            .'number (their stars, repos or followers) or a project name",'
            .'"attacks":[{"name":"themed move name, MAX 16 chars","cost":<1-4 energy>,"damage":"number derived from a real stat, MAX 5 chars","desc":"a COMPLETE Pokemon TCG attack effect of 90 to 115 characters, one or two sentences that ALWAYS end with a period and FULLY finish the thought (never end on a dangling word, number, or preposition like your/the/a/of/into), weaving in a real number (their stars, repos or followers) or a project name."}]}. '
            .'Exactly 2 attacks. Every desc and the flavor MUST be a finished sentence ending in a period AND fit its character limit; write concisely so nothing is ever truncated.';

        $payload = [
            'model' => $ai['model'],
            'messages' => [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => json_encode($facts, JSON_UNESCAPED_UNICODE)],
            ],
            'temperature' => 0.85,
            // The card JSON is ~200 tokens, but a reasoning model bills its hidden thinking against
            // this same ceiling and the character-count rules above make it ruminate for thousands.
            // Headroom for an endpoint that ignores the two switches below; unused ceiling is free.
            'max_tokens' => 8000,
            'stream' => false,
            // Two dialects of "do not think", since neither endpoint understands the other's:
            // reasoning_effort is OpenAI/DeepSeek, chat_template_kwargs is Qwen/vLLM.
            'reasoning_effort' => 'none',
            'chat_template_kwargs' => ['enable_thinking' => false],
        ];

        try {
            $res = Http::withHeaders(['Authorization' => 'Bearer '.$ai['key']])
                ->connectTimeout(8)
                ->timeout((int) ($ai['timeout'] ?? 25))
                ->post(rtrim($ai['base_url'], '/').'/chat/completions', $payload);
        } catch (Throwable) {
            return null;
        }
        if ($res->status() < 200 || $res->status() >= 300) {
            return null;
        }

        $j = $res->json();
        $content = $j['choices'][0]['message']['content'] ?? '';
        if (! $content) {
            return null;
        }
        // Strip <think>...</think> reasoning (Qwen), then take the JSON object with a "flavor" key.
        $content = (string) preg_replace('/<think>.*?<\/think>/su', '', $content);
        $content = (string) preg_replace('/<think>.*/su', '', $content); // unclosed / truncated think
        $content = trim($content);
        $lore = json_decode($content, true);
        if ((! is_array($lore) || empty($lore['flavor'])) && preg_match_all('/\{(?:[^{}]|(?R))*\}/su', $content, $mm)) {
            foreach (array_reverse($mm[0]) as $cand) {
                $try = json_decode($cand, true);
                if (is_array($try) && ! empty($try['flavor'])) {
                    $lore = $try;
                    break;
                }
            }
        }
        if (! is_array($lore) || empty($lore['flavor'])) {
            return null;
        }

        // Hard clamps so text can never overflow the card, even if the model ignores limits.
        $attacks = [];
        foreach (($lore['attacks'] ?? []) as $a) {
            $attacks[] = [
                'name' => mb_substr(trim((string) ($a['name'] ?? 'Attack')), 0, 16),
                'cost' => max(1, min(4, (int) ($a['cost'] ?? 2))),
                'damage' => $this->clampDamage((string) ($a['damage'] ?? '')),
                'desc' => $this->clampText((string) ($a['desc'] ?? ''), 130),
            ];
        }

        return [
            'species' => mb_substr(trim((string) ($lore['species'] ?? '')), 0, 22),
            // Each budget sits a little above its prompt limit, so a slightly over-long response is
            // still cut on a sentence boundary rather than mid-word.
            'flavor' => $this->clampText((string) $lore['flavor'], 110),
            // Falls back to the flavour when the model omits it, so older rows still render.
            'effect' => $this->clampText((string) ($lore['effect'] ?? $lore['flavor']), 210),
            'attacks' => array_slice($attacks, 0, 2),
            'ai' => true,
        ];
    }

    /** Trim to at most $max characters, preferring a sentence boundary. */
    public function clampText(string $s, int $max): string
    {
        $s = trim((string) preg_replace('/\s+/', ' ', $s));
        if (mb_strlen($s) <= $max) {
            return $s;
        }
        $cut = mb_substr($s, 0, $max);
        if (preg_match('/^.*(?<![0-9])[.!?](?=\s|$)/su', $cut, $m) && mb_strlen($m[0]) >= $max * 0.5) {
            return trim($m[0]); // last complete sentence within budget
        }
        $comma = mb_strrpos($cut, ', ');
        if ($comma !== false && $comma >= $max * 0.5) {
            return rtrim(mb_substr($cut, 0, $comma), ' ,;:-').'.';
        }
        $sp = mb_strrpos($cut, ' ');
        if ($sp !== false && $sp > $max * 0.5) {
            $cut = mb_substr($cut, 0, $sp);
        }
        $weak = 'a|an|the|of|to|in|on|at|by|for|with|from|into|and|or|but|so|as|your|their|its|his|her|our|this|that|these|those|is|are|was|were';
        $cut = (string) preg_replace('/(?:\s+(?:'.$weak.'|\d[\d.,]*))+$/iu', '', $cut);

        return rtrim($cut, ' ,;:-').'.';
    }

    /**
     * Make an attack's damage a number a card could actually print: a multiple of 10 between 10
     * and 300, keeping any real TCG suffix ("30+", "50x"). An empty string is left alone, since
     * plenty of real attacks do no damage.
     */
    public function clampDamage(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return $s;
        }
        if (! preg_match('/^(\d[\d,]*)\s*([+x×])?/u', $s, $m)) {
            return mb_substr($s, 0, 5);
        }
        $n = (int) str_replace(',', '', $m[1]);
        $n = (int) (round(min(300, max(10, $n)) / 10) * 10);

        return $n.($m[2] ?? '');
    }

    /**
     * How notable this developer is, on a log scale. Followers lead and stars follow, since both
     * are heavy-tailed the way rarity is: an order of magnitude more followers is one step rarer,
     * not ten times rarer. Repo count and account age only nudge.
     *
     *   ~5 followers, 3 stars, 20 repos, 3y   ->  1.7   (common)
     *   100 / 200 / 40 / 6y                   ->  4.1   (uncommon)
     *   2k / 5k / 60 / 8y                     ->  6.4   (rare)
     *   torvalds                              ->  9.6   (ultra)
     */
    public function rarityScore(array $p): float
    {
        $log = fn ($n) => log10(max(0, (int) $n) + 1);

        return $log($p['followers'] ?? 0)
            + 0.6 * $log($p['stars'] ?? 0)
            + 0.3 * $log($p['repos'] ?? 0)
            + 0.2 * min((int) ($p['age_years'] ?? 0), 15) / 5;
    }

    /**
     * Score to tier. The thresholds aim for a real set's pyramid, most developers Common and a
     * handful Ultra, rather than an even split.
     */
    public function rarityTier(float $score): string
    {
        return match (true) {
            $score >= 8.0 => 'ultra',
            $score >= 5.5 => 'rare',
            $score >= 3.0 => 'uncommon',
            default => 'common',
        };
    }

    /**
     * Rarity for a login.
     *
     * The tier is earned from the profile, while which preset inside that tier is a stable hash of
     * the login, so two developers with near-identical stats still pull different foils. crc32
     * rather than rand(), because a login must render the same card every time.
     *
     * An entry in `rarity_map` wins outright; that list is the editorial override for the
     * landing-page showcase.
     */
    public function rarityFor(string $login, array $profile = []): string
    {
        $key = strtolower($login);
        if (isset($this->cfg['rarity_map'][$key])) {
            return $this->cfg['rarity_map'][$key];
        }
        if (! $profile) {
            return $this->cfg['default_rarity'];
        }

        return $this->pickInTier($this->rarityTier($this->rarityScore($profile)), $key)
            ?? $this->cfg['default_rarity'];
    }

    /**
     * Enabled presets grouped by tier, from the admin-managed table.
     *
     * Read live rather than cached: a stale list hands out presets the browser can no longer
     * resolve, and this is one indexed read on a path that already waits on GitHub and the AI.
     */
    private function presetsByTier(): array
    {
        $out = [];
        foreach (CardAsset::where('category', 'rarity_preset')->where('enabled', true)->orderBy('slug')->get(['slug', 'meta']) as $row) {
            $out[$row->meta['tier'] ?? 'common'][] = $row->slug;
        }

        return $out;
    }

    /**
     * Pick one preset from a tier, deterministically. Falls back downward when a tier is empty, so
     * disabling every Ultra preset hands out Rares rather than upgrading a Common.
     */
    private function pickInTier(string $tier, string $login): ?string
    {
        $chain = [
            'ultra' => ['ultra', 'rare', 'uncommon', 'common'],
            'rare' => ['rare', 'uncommon', 'common'],
            'uncommon' => ['uncommon', 'common'],
            'common' => ['common'],
        ][$tier] ?? ['common'];

        $byTier = $this->presetsByTier();
        $exclude = (array) ($this->cfg['rarity_auto_exclude'] ?? []);

        foreach ($chain as $t) {
            $pool = array_values(array_diff($byTier[$t] ?? [], $exclude));
            if ($pool) {
                return $pool[crc32($login) % count($pool)];
            }
        }

        return null;
    }
}
