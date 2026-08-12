import { cardFocused, ZOOM_SELECTOR } from '@/lib/cardFocus';
import { deviceTiltPossible, onDeviceTilt, requestDeviceTilt, type Tilt } from '@/lib/deviceTilt';
import { registerTiltCard, tiltDrives } from '@/lib/tiltBudget';
import { useEffect, useRef } from 'react';

const round = (v: number, p = 3) => parseFloat(v.toFixed(p));
const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const adjust = (v: number, a: number, b: number, c: number, d: number) => round(c + ((d - c) * (v - a)) / (b - a));

/** One card's turn in the idle rotation: how long it sweeps, and the pause after it. */
const SWEEP_MS = 4200;
const GAP_MS = 900;

/** How far the imaginary pointer strays from the centre, in percent of the card. */
const SWEEP_X = 30;
const SWEEP_Y = 18;

/**
 * How long a touch keeps the gyro out, and how long a reading counts as "the handset is driving".
 *
 * A finger dragging across the card also swings the phone about, so without this the two inputs
 * fight over the same custom properties and the foil stutters. Long enough to cover the moment
 * after lifting off, when the hand is still settling.
 */
const TOUCH_HOLD_MS = 800;

/**
 * Attach to the outer `.card` element. Tracks the pointer and writes the CSS
 * custom properties (position, tilt, glare) that the holo stylesheet reads.
 *
 * `idle` makes the card tilt on its own when nobody is pointing at it. Cards
 * take turns rather than moving together: each one owns a slot in a cycle, and
 * because every slot is measured from the same clock they sequence themselves
 * without needing to talk to each other.
 *
 * On a phone the same properties are driven by the device's own tilt instead (see
 * {@link onDeviceTilt}): the card leans the way you lean the handset. Three inputs, in order of
 * precedence - a real pointer, then the gyro, then the idle sweep. Each one only takes over when
 * the one above it is absent, so no frame is ever written twice.
 */
export function usePointerTilt<T extends HTMLElement>(idle?: { index: number; count: number }) {
    const ref = useRef<T>(null);
    const idleIndex = idle?.index ?? 0;
    const idleCount = idle?.count ?? 0;

    useEffect(() => {
        const card = ref.current;
        if (!card) return;
        const rotator = card.querySelector<HTMLElement>('.card__rotator');
        if (!rotator) return;

        /*
         * Is this the enlarged copy? Asked of the DOM once, at mount, rather than taken from a
         * prop: a card rendered inside a zoom overlay IS the enlarged one by construction, so no
         * page has to remember to say which of its cards that is - and the previous version of
         * this, which did ask, was wrong on every page at once because nobody ever passed it.
         */
        const inZoom = !!card.closest(ZOOM_SELECTOR);

        /** Another card is enlarged over this one, so nothing painted here can be seen. */
        const eclipsed = () => !inZoom && cardFocused();

        let raf: number | null = null;
        let pending: Record<string, number> | null = null;
        let touchedAt = 0;
        /** When the sensor last reported, whether or not that reading was painted. */
        let tiltedAt = 0;
        const set = (k: string, v: string) => card.style.setProperty(k, v);

        /**
         * Is the handset currently driving this card? Measured on the readings themselves rather
         * than on "did we subscribe": iOS can refuse the motion permission after we have, and a
         * card left frozen waiting for a sensor that never reports is worse than no gyro at all.
         */
        const tilting = () => Date.now() - tiltedAt < TOUCH_HOLD_MS * 2;

        /** The same shape a real pointer at (px, py) would produce. */
        const frameFor = (px: number, py: number) => {
            const dx = px - 50;
            const dy = py - 50;

            return {
                px,
                py,
                bgx: adjust(px, 0, 100, 37, 63),
                bgy: adjust(py, 0, 100, 33, 67),
                rx: round(-(dx / 3.5)),
                ry: round(dy / 3.5),
                pfc: clamp(Math.sqrt(dx * dx + dy * dy) / 50, 0, 1),
                pft: round(py / 100),
                pfl: round(px / 100),
            };
        };

        /** Both live inputs land here: everything downstream only knows about a point on the card. */
        const queue = (px: number, py: number) => {
            pending = frameFor(px, py);
            if (raf === null) raf = requestAnimationFrame(apply);
        };

        const onMove = (e: PointerEvent | TouchEvent) => {
            const rect = rotator.getBoundingClientRect();
            const t = (e as TouchEvent).touches?.[0];
            if (t) touchedAt = Date.now();
            const clientX = t ? t.clientX : (e as PointerEvent).clientX;
            const clientY = t ? t.clientY : (e as PointerEvent).clientY;
            queue(clamp(round((100 / rect.width) * (clientX - rect.left))), clamp(round((100 / rect.height) * (clientY - rect.top))));
        };

        const apply = () => {
            raf = null;
            const p = pending;
            if (!p) return;
            card.classList.add('interacting');
            set('--pointer-x', p.px + '%');
            set('--pointer-y', p.py + '%');
            set('--background-x', p.bgx + '%');
            set('--background-y', p.bgy + '%');
            set('--rotate-x', p.rx + 'deg');
            set('--rotate-y', p.ry + 'deg');
            set('--pointer-from-center', String(p.pfc));
            set('--pointer-from-top', String(p.pft));
            set('--pointer-from-left', String(p.pfl));
            set('--card-opacity', '1');
        };

        const onLeave = () => {
            if (raf !== null) {
                cancelAnimationFrame(raf);
                raf = null;
            }
            pending = null;
            card.classList.remove('interacting');
            // Restore the resting state by clearing the inline overrides, so the CSS
            // defaults on `.card` (index.css) are the single source of truth. Otherwise
            // a hovered card would rest darker than its never-hovered neighbours.
            for (const p of [
                '--pointer-x',
                '--pointer-y',
                '--background-x',
                '--background-y',
                '--rotate-x',
                '--rotate-y',
                '--pointer-from-center',
                '--pointer-from-top',
                '--pointer-from-left',
                '--card-opacity',
            ])
                card.style.removeProperty(p);
        };

        /*
         * A MOUSE leaving the card means the card is nobody's any more, so it goes back to rest.
         *
         * A TOUCH pointer "leaving" means nothing of the kind: the browser destroys the pointer
         * the instant a finger lifts and fires this on every single tap, while the finger is
         * still right there over the card. onTouchEnd below is what owns a lifted finger, and it
         * knows to leave the foil alone when the gyro is about to carry on driving - which this
         * was quietly undoing on the same gesture, since it wipes all ten properties with no
         * such check. Measured: one tap on an enlarged card dropped the foil to its resting 0.3
         * for 790ms, the full TOUCH_HOLD_MS lockout, before the gyro was let back in to repaint
         * it. That is the flicker, and it fires again on every tap.
         */
        const onPointerLeave = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return;
            onLeave();
        };

        const onTouchEnd = () => {
            touchedAt = Date.now();
            // The one gesture on the card itself, which is where iOS wants the motion prompt to
            // come from. No-ops after the first answer, and on every other platform.
            requestDeviceTilt();
            // Only hand the card back to its resting CSS if nothing else is about to drive it.
            // With a live sensor that reset would blank the foil for TOUCH_HOLD_MS and then snap
            // straight back into the tilt pose - two jumps where the tilt alone makes zero.
            if (!tilting()) onLeave();
        };

        rotator.addEventListener('pointermove', onMove);
        rotator.addEventListener('pointerleave', onPointerLeave);
        rotator.addEventListener('touchmove', onMove, { passive: true });
        rotator.addEventListener('touchend', onTouchEnd);

        /*
         * The gyro drives EVERY card on the page at once, so an off-screen one has to cost nothing:
         * a phone painting five holo cards a frame while four of them are scrolled away is how this
         * turns into jank. `onScreen` gates the writes; the subscription itself is one shared
         * listener regardless (deviceTilt.ts).
         */
        let onScreen = true;
        let offTimer: ReturnType<typeof setTimeout> | undefined;
        let observer: IntersectionObserver | undefined;
        let unsubscribe: (() => void) | undefined;
        let unregister: (() => void) | undefined;

        if (deviceTiltPossible()) {
            /*
             * A card in a grid is in the running for the tilt; the enlarged copy in a zoom overlay
             * is not, because it is the only card anyone can see and must never lose its turn to
             * the grid it is covering. See tiltBudget for what is being rationed and why.
             */
            if (!inZoom) unregister = registerTiltCard(card);

            const onTilt = ({ x, y }: Tilt) => {
                tiltedAt = Date.now();
                if (!onScreen || Date.now() - touchedAt < TOUCH_HOLD_MS) return;
                // The zoom overlay mounts a SECOND copy of the card over a grid that is still
                // on screen behind it, and the gyro drives every card at once - it needs no
                // pointer over any of them. Measured on /cards before this: seven full holo
                // stacks painted per reading, six of them underneath the sheet.
                if (eclipsed()) return;
                // Not one of the cards nearest the middle of the screen, so it holds its last
                // pose rather than painting. Six cards in view was ~42fps; four is a locked 60.
                if (!inZoom && !tiltDrives(card)) return;
                queue(clamp(round(50 + x * 50)), clamp(round(50 + y * 50)));
            };

            observer = new IntersectionObserver(
                (entries) => {
                    // The LAST record, not the first. One callback can carry several coalesced
                    // records for the same element, and entries[0] is the OLDEST of them - which
                    // is exactly backwards during the in-and-out flip a reflow under a live
                    // sensor produces, and would leave a visible card believing it was gone.
                    onScreen = entries[entries.length - 1].isIntersecting;
                    if (offTimer) {
                        clearTimeout(offTimer);
                        offTimer = undefined;
                    }
                    if (onScreen) return;

                    /*
                     * Hand the card back to its resting CSS on the way out, or it freezes mid-lean
                     * at whatever angle it held when it left the screen - but only once it has
                     * STAYED out.
                     *
                     * This reset used to fire on the transition itself, which is what made the
                     * foil flicker on a phone. onLeave() clears all ten custom properties, and
                     * anything that reflows the page under a live sensor - opening the zoom
                     * overlay locks body scroll, which is why /cards was the worst of it - can
                     * flip intersection back and forth. Each flip wiped the properties and the
                     * next reading, a frame later, painted them again.
                     */
                    offTimer = setTimeout(() => {
                        offTimer = undefined;
                        if (!onScreen) onLeave();
                    }, 250);
                },
                { rootMargin: '10%' },
            );
            observer.observe(card);
            unsubscribe = onDeviceTilt(onTilt);
        }

        let idleRaf: number | null = null;
        let hovered = false;
        let onEnter: (() => void) | undefined;
        let onExit: (() => void) | undefined;

        if (idleCount > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const slot = SWEEP_MS + GAP_MS;
            const cycle = slot * idleCount;
            const start = idleIndex * slot;

            onEnter = () => {
                hovered = true;
            };
            onExit = () => {
                hovered = false;
            };
            rotator.addEventListener('pointerenter', onEnter);
            rotator.addEventListener('pointerleave', onExit);

            let animating = false;

            const tick = () => {
                idleRaf = requestAnimationFrame(tick);

                // Under a zoom overlay: hand the card back to rest once, then stop. Without this
                // the four showcase cards go on sweeping behind the sheet, and because they are
                // the overlay's backdrop that also forces its blur to re-rasterise every frame.
                // Treated as "not my turn" rather than as an interruption, so the reset that a
                // hidden card can afford still happens.
                if (eclipsed()) {
                    if (animating) {
                        animating = false;
                        onLeave();
                    }

                    return;
                }

                // A real pointer always wins, and so does the handset's own tilt: both are someone
                // actually moving the card, and their handlers own it while they are there. No
                // onLeave here - whoever is driving has already written this frame.
                if (hovered || tilting()) {
                    animating = false;

                    return;
                }

                // Position within this card's own slot. Every card reads the same clock, so the
                // slots line up end to end and only one card is ever moving.
                //
                // The extra `+ cycle` keeps the remainder positive. `performance.now()` starts near
                // zero, so for the first few seconds it is smaller than the later cards' offsets,
                // and a bare `%` would hand those cards a negative position that never reads as
                // past the end of their slot: they would all sweep at once until the clock caught
                // up with them.
                const elapsed = performance.now() - start;
                const t = (((elapsed % cycle) + cycle) % cycle) / SWEEP_MS;
                if (t > 1) {
                    // Someone else's turn. Hand the card back to its resting CSS once.
                    if (animating) {
                        animating = false;
                        onLeave();
                    }

                    return;
                }

                animating = true;
                // sin(pi*t) is 0 at both ends, so the card leaves and returns to rest without a
                // jump, and sin(2*pi*t) carries it right, back through centre, left, and home.
                const ease = Math.sin(Math.PI * t);
                const p = frameFor(50 + SWEEP_X * Math.sin(2 * Math.PI * t), 50 - SWEEP_Y * ease);
                card.classList.add('interacting');
                set('--pointer-x', p.px + '%');
                set('--pointer-y', p.py + '%');
                set('--background-x', p.bgx + '%');
                set('--background-y', p.bgy + '%');
                set('--rotate-x', p.rx + 'deg');
                set('--rotate-y', p.ry + 'deg');
                set('--pointer-from-center', String(p.pfc));
                set('--pointer-from-top', String(p.pft));
                set('--pointer-from-left', String(p.pfl));
                // Eased in with the sweep, so the foil fades up rather than snapping on.
                set('--card-opacity', String(round(ease, 2)));
            };

            idleRaf = requestAnimationFrame(tick);
        }

        // One cleanup for all three inputs. The idle branch used to carry its own copy of the
        // teardown, which is how a listener gets left behind the next time one of them grows one.
        return () => {
            rotator.removeEventListener('pointermove', onMove);
            rotator.removeEventListener('pointerleave', onPointerLeave);
            rotator.removeEventListener('touchmove', onMove);
            rotator.removeEventListener('touchend', onTouchEnd);
            if (onEnter) rotator.removeEventListener('pointerenter', onEnter);
            if (onExit) rotator.removeEventListener('pointerleave', onExit);
            observer?.disconnect();
            if (offTimer) clearTimeout(offTimer);
            unregister?.();
            unsubscribe?.();
            if (raf !== null) cancelAnimationFrame(raf);
            if (idleRaf !== null) cancelAnimationFrame(idleRaf);
        };
    }, [idleIndex, idleCount]);

    return ref;
}
