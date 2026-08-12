/**
 * Whether a card has been enlarged into a zoom overlay, and which one it is.
 *
 * The foil is the most expensive thing on the page: a stack of blend-mode layers whose background
 * positions and brightness/contrast filters are recomputed every time the pointer or the gyro
 * reports. A zoom overlay covers the grid with a translucent, blurred sheet - so every card still
 * under that sheet that keeps repainting costs a phone a full holo stack per reading for a picture
 * nobody can see, and drags the overlay's own backdrop blur into re-rasterising the whole viewport
 * along with it. On /cards that is a screenful of the twenty-four card grid repainting underneath
 * one enlarged card, at gyro rate.
 *
 * So while an overlay is open, only the card inside it paints.
 *
 * The claim is made by CardZoom itself rather than by a prop on the card, because the overlay is
 * the only thing that knows one is open and every page that enlarges a card goes through it. The
 * first attempt at this asked each page to mark its enlarged copy with PokeCard's `active` prop;
 * none of the five call sites did, so the guard tested for a class that was never set anywhere and
 * never once fired.
 */

/** Marks the element CardZoom wraps the enlarged card in. A card inside one IS that card. */
export const ZOOM_SELECTOR = '[data-card-zoom]';

/**
 * Set on <html> while an overlay is up, so card.css can stop PAINTING the covered cards as well.
 *
 * Not painting them is a second, separate win from not driving them. The overlay carries a
 * backdrop blur, and a blur has to re-read its backdrop every frame the thing in front of it
 * moves - so the enlarged card alone was dragging a screenful of holo cards through the
 * compositor on every one of its own frames, however still they were held. Measured on a
 * simulated handset: 20fps with the grid behind it, 30fps without.
 *
 * It costs nothing to look at. Under `bg-black/80` plus the blur the grid is already crushed to
 * black - screenshots with and against differ only in a couple of barely-there smudges at the
 * bottom edge - so this hides something that was, in practice, not being shown.
 */
const ZOOM_CLASS = 'card-zoomed';

/** Counted, not a flag: the lab opens a zoom on top of its gallery, which is itself an overlay. */
let open = 0;

/** Called by CardZoom for as long as it is mounted. Returns the release. */
export function claimCardFocus(): () => void {
    open++;
    document.documentElement.classList.add(ZOOM_CLASS);
    let released = false;

    return () => {
        // Idempotent, so a double cleanup can never leave the count stuck above zero - which
        // would silently freeze, and blank, every card on the page for the rest of the visit.
        if (released) return;
        released = true;
        open--;
        if (open === 0) document.documentElement.classList.remove(ZOOM_CLASS);
    };
}

/** Is some card enlarged over the page right now? */
export function cardFocused(): boolean {
    return open > 0;
}
