<?php

/**
 * PokeHub card-generation config. Ported from the original api/config.php.
 * Secrets come from .env; the rarity map is edited here (or, once the admin
 * dashboard lands, per-profile in the database).
 */
return [

    // GitHub REST API. A token lifts the 60 req/hour anonymous rate limit.
    // Profiles are cached indefinitely and only re-fetched on demand (the
    // "Fetch fresh" button -> ?fresh=1), which keeps the rate limit safe.
    'github_token' => env('GITHUB_TOKEN', ''),

    // AI (any OpenAI-compatible chat endpoint) for the card flavor and attacks.
    // Server-side only: the key and base_url are never sent to the browser.
    'ai' => [
        'enabled' => env('POKEHUB_AI_ENABLED', true),
        'base_url' => env('POKEHUB_AI_BASE', ''),
        'model' => env('POKEHUB_AI_MODEL', 'gpt-4o-mini'),
        'key' => env('POKEHUB_AI_KEY', ''),
        // Generous by default: a slow self-hosted model can take well over a minute
        // to return the card JSON. The skeleton on the card covers the wait; a too-low
        // value here is the usual cause of "AI request failed". Tune via env.
        'timeout' => (int) env('POKEHUB_AI_TIMEOUT', 120),
    ],

    // How many times ONE account may regenerate its card per rolling 24h. This is a cost control,
    // not a security one: every regenerate is an AI completion, and that is the only part of this
    // app that costs real money. Enforced by the `card-regen` limiter in AppServiceProvider.
    // Tunable because the right number is whatever the bill says, not whatever is in this file.
    'daily_regen_limit' => (int) env('POKEHUB_DAILY_REGEN_LIMIT', 5),

    // Rarity is DERIVED from the profile (GithubCardService::rarityFor). `default_rarity` is only
    // the floor for when there is no profile to score.
    'default_rarity' => env('POKEHUB_DEFAULT_RARITY', 'common'),

    // Presets the automatic picker must never hand out, though they stay valid choices in the lab.
    // Not taste - each breaks on an arbitrary profile:
    //  - trainer: supertype "trainer", so the card renders a Trainer face with NO attacks.
    //  - pokeball / masterball: --viewport-edge-clip is hardcoded to the 151 frame's geometry, so
    //    the pattern clips against the wrong artwork window on 1-gen and tcg frames.
    //  - pika*: bespoke cards keyed to one real Pikachu print's set + number.
    'rarity_auto_exclude' => ['trainer', 'pokeball', 'masterball', 'pika020', 'pika145', 'pika160'],

    // Explicit per-login override, which beats the derived tier. The landing showcase does NOT
    // live here any more - each showcase card carries its own rarity in the `showcase_cards`
    // table, so pinning those logins twice would just be two places to disagree.
    'rarity_map' => [
        'ilhamrisky' => 'hyper',
        'pewdiepie-archdaemon' => 'secret',
        'theprimeagen' => 'vmax',
    ],
];
