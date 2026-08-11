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

    /*
     * Presets the automatic picker may not hand out. Empty, so every preset in the table is
     * reachable and a pull is worth looking at.
     *
     * Six used to sit here because each broke on an arbitrary profile. All six were fixed rather
     * than left excluded:
     *  - pokeball / masterball drew their pattern against the 151 frame's window wherever the card
     *    was, so it crossed the artwork on the other frames. The window is now per generation, off
     *    the same measurements the photo box uses (pcg.css, end of file).
     *  - trainer carries a Supporter subtype, which labelled a Pokemon face as a Trainer while it
     *    still printed HP and attacks. A preset's trainer subtype is now ignored unless the card is
     *    actually drawn as one (PokeCard).
     *  - pika* are keyed to a real print's set and number, but those only select a foil recipe in
     *    holo.css. Nothing about that print reaches the card, so they are simply three more foils.
     *
     * Kept as a hook: a preset that turns out to misbehave can be pulled from the roll here without
     * losing it from the lab.
     */
    'rarity_auto_exclude' => [],

    // Explicit per-login override, which beats the derived tier. The landing showcase does NOT
    // live here any more - each showcase card carries its own rarity in the `showcase_cards`
    // table, so pinning those logins twice would just be two places to disagree.
    'rarity_map' => [
        'ilhamrisky' => 'hyper',
        'pewdiepie-archdaemon' => 'secret',
        'theprimeagen' => 'vmax',
    ],
];
