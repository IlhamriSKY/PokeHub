/**
 * How many cards the handset's tilt may drive at once, and which ones.
 *
 * The gyro is not like a pointer: it reports to EVERY card on the page at the same time, with no
 * finger over any of them to say which one is meant. On a single-card page that is the whole
 * feature. On the /cards grid it means every card in view repaints a full holo stack - blend
 * layers, filters, masks - on every reading, and the grid sits right on the edge of what a phone
 * can do. Measured on a simulated handset with six cards in view: 6 painting is ~42fps, 4 painting
 * is a locked 60. Two cards is the whole difference.
 *
 * So the tilt is spent on the cards nearest the middle of the screen - the ones actually being
 * looked at - and the rest simply hold their last pose. Holding, not resetting: a card dropping
 * out of the budget paints nothing more, which costs nothing and shows nothing, where handing it
 * back to its resting CSS would dim it visibly as it drifted away from centre.
 *
 * Only the gyro is rationed. A pointer already picks its own card, and the idle sweep already
 * limits itself to one at a time (usePointerTilt).
 */

/**
 * Cards the tilt may drive at once.
 *
 * Four, because that is where the measurement stops improving: six in view costs ~42fps, four
 * holds 60, and dropping to two buys nothing further. Raising this trades frames for how much of
 * the grid moves together.
 */
const BUDGET = 4;

/** How long the ranking may lag the scroll. Long enough to be nearly free, short enough to be invisible. */
const RERANK_MS = 150;

const cards = new Set<HTMLElement>();
let driven = new Set<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

/**
 * Pick the cards closest to the centre of the viewport.
 *
 * One pass of getBoundingClientRect over the registered cards, which is a single layout read, and
 * only on the trailing edge of a scroll rather than per reading - the whole point is to do LESS
 * work per reading, so ranking on every one would defeat it.
 */
function rank(): void {
    timer = undefined;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;
    const near: Array<{ d: number; el: HTMLElement }> = [];

    for (const el of cards) {
        const r = el.getBoundingClientRect();
        // Off screen entirely: not a candidate. Its own observer already handles resting it.
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
        const dx = r.left + r.width / 2 - midX;
        const dy = r.top + r.height / 2 - midY;
        near.push({ d: dx * dx + dy * dy, el });
    }

    near.sort((a, b) => a.d - b.d);
    driven = new Set(near.slice(0, BUDGET).map((n) => n.el));
}

function schedule(): void {
    if (timer === undefined) timer = setTimeout(rank, RERANK_MS);
}

/**
 * Put a card in the running for the tilt. Returns the withdrawal.
 *
 * The enlarged copy in a zoom overlay is deliberately NOT registered: it is the only card anyone
 * can see, so it is never rationed against the grid it is covering.
 */
export function registerTiltCard(el: HTMLElement): () => void {
    cards.add(el);
    if (!listening) {
        listening = true;
        // Passive: this only ever reads geometry, and must never hold up a scroll.
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
    }
    schedule();

    return () => {
        cards.delete(el);
        driven.delete(el);
        if (cards.size) {
            schedule();

            return;
        }
        listening = false;
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        window.removeEventListener('orientationchange', schedule);
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };
}

/** May this card paint the current reading? O(1) - it is asked once per card per reading. */
export function tiltDrives(el: HTMLElement): boolean {
    return driven.has(el);
}
