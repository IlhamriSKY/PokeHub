<?php

namespace App\Services;

use App\Models\CardAsset;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * PokeHub card generation: fetch a public GitHub profile + repos, shape a compact payload, ask an
 * OpenAI-compatible endpoint for the Pokedex flavor and TCG attacks, and score the profile into a
 * rarity.
 *
 * Originally a behaviour-for-behaviour port of api/github.php. The text clamps still match it, but
 * `clampDamage` and `rarityFor` deliberately do not: the first printed abbreviated star counts as
 * attack damage, and the second handed every unlisted developer a Common.
 */
class GithubCardService
{
    private array $cfg;

    public function __construct()
    {
        $this->cfg = config('pokehub');
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
            // TWO separate texts, because the two card faces give them very different room.
            // flavor -> the Pokemon face's printed flavour box (~2 short lines). MUST stay short
            // or it spills out of the box drawn on the frame art.
            .'"flavor":"one COMPLETE Pokedex-style sentence about this dev, ending in a period, up to 100 chars",'
            // effect -> the Trainer face, which has NO attacks, so this is its only prose and it
            // fills a whole plate. Longer on purpose; never shown on a Pokemon card.
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
            // The card JSON itself is ~200 tokens, but a reasoning model bills its hidden thinking
            // against this same ceiling, and this prompt's character-count rules make it ruminate
            // for thousands: with thinking left on, deepseek-v4-flash wants ~6.6k before writing a
            // word, so the old 800 returned finish_reason=length with EMPTY content on every single
            // call - which is why regenerating silently kept the previous lore forever. The headroom
            // is the safety net for an endpoint that ignores the two switches below; unused ceiling
            // costs nothing.
            'max_tokens' => 8000,
            'stream' => false,
            // Two dialects of "do not think", because neither endpoint understands the other's:
            // reasoning_effort is OpenAI/DeepSeek, chat_template_kwargs is Qwen/vLLM. With thinking
            // off the same request answers in ~200 tokens instead of ~6800.
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
            // Two budgets, because the two faces have different room. Each clamp sits a little
            // ABOVE its prompt limit so a slightly-over response is still cut on a SENTENCE
            // boundary by clampText rather than mid-word.
            // flavor: Pokemon flavour box, ~2 short lines (prompt 100).
            'flavor' => $this->clampText((string) $lore['flavor'], 110),
            // effect: Trainer plate, no attacks to share with (prompt 150-190). Falls back to
            // the flavor if the model omits it, so an old cached row still renders.
            'effect' => $this->clampText((string) ($lore['effect'] ?? $lore['flavor']), 210),
            'attacks' => array_slice($attacks, 0, 2),
            'ai' => true,
        ];
    }

    /** Trim to at most $max chars on a sentence boundary (verbatim from api/github.php). */
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
     * Make an attack's damage a number a card could actually print: a multiple of 10, 10..300,
     * keeping any real TCG suffix ("30+", "50x").
     *
     * This used to abbreviate instead of clamp - a model that answered with the user's star count
     * got "252k" printed as damage, which fits the 5-character slot but is not a damage value.
     * An empty string is left alone; plenty of real attacks do no damage.
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
     * How notable this developer is, on a log scale. Followers is the primary signal and stars
     * the secondary, because both are heavy-tailed the way card rarity is: an order of magnitude
     * more followers should be one step rarer, not ten times rarer. Repos and account age are
     * small nudges - a prolific or long-standing account edges up a tier, but cannot carry one.
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
     * Score -> tier. The thresholds are set so the distribution comes out as a real set's
     * pyramid - most developers Common, a handful Ultra - rather than an even split. A card's
     * rarity is meant to say "this one is hard to pull", which only works if it usually isn't.
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
     * Was `rarity_map[$login] ?? default`, which meant every developer not on a hand-written list
     * of five got Common - rarity was not derived from anything at all.
     *
     * Now: the TIER is earned from the profile (above), and WHICH preset inside that tier is a
     * stable hash of the login. That split is deliberate - the tier has to be merit, or rarity
     * means nothing, but two developers with near-identical stats should still pull different
     * foils. crc32, not rand(): the same login must produce the same card on every render.
     *
     * An entry in `rarity_map` still wins outright; that list is the editorial override for the
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
     * Read live. This was cached for an hour and nothing invalidated it, so for an hour after an
     * admin disabled a preset the roll still handed it out and WROTE it to the user's card - where
     * the browser, building its list from the same table, could no longer find it and silently
     * printed a Common. The saving was one indexed read of a handful of rows, on a path that also
     * makes two GitHub calls and waits up to 120s on the AI.
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
     * Pick one preset from a tier, deterministically. Degrades DOWNWARD if a tier is empty:
     * `rarity_preset` rows are admin-managed, and disabling every Ultra preset should hand out
     * Rares, never upgrade a Common or blow up mid-render.
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
