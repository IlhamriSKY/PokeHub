<?php

namespace App\Support;

/**
 * A stored card, trimmed to what the browser actually draws.
 *
 * `top_repos` and `all_langs` are only ever inputs to the AI prompt. Nothing on the card face
 * prints them, but they are roughly a third of the blob, so a grid of cards pays for them once per
 * row. Dropping them here keeps a gallery page cheap without changing what is rendered.
 *
 * For list views only. CardCapture keys its cached images on the whole card blob, so trimming the
 * card that PublicCardLookup returns would change every key at once and re-render every stored
 * README image for no visible gain.
 */
class CardPayload
{
    /** @var string[] */
    private const AI_INPUTS = ['top_repos', 'all_langs'];

    /**
     * @param  array<string, mixed>|null  $card
     * @return array<string, mixed>|null
     */
    public static function slim(?array $card): ?array
    {
        if (! is_array($card) || ! isset($card['profile']) || ! is_array($card['profile'])) {
            return $card;
        }

        foreach (self::AI_INPUTS as $key) {
            unset($card['profile'][$key]);
        }

        return $card;
    }
}
