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
 * Attach to the outer `.card` element. Tracks the pointer and writes the CSS
 * custom properties (position, tilt, glare) that the holo stylesheet reads.
 *
 * `idle` makes the card tilt on its own when nobody is pointing at it. Cards
 * take turns rather than moving together: each one owns a slot in a cycle, and
 * because every slot is measured from the same clock they sequence themselves
 * without needing to talk to each other.
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

        let raf: number | null = null;
        let pending: Record<string, number> | null = null;
        const set = (k: string, v: string) => card.style.setProperty(k, v);

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

        const onMove = (e: PointerEvent | TouchEvent) => {
            const rect = rotator.getBoundingClientRect();
            const t = (e as TouchEvent).touches?.[0];
            const clientX = t ? t.clientX : (e as PointerEvent).clientX;
            const clientY = t ? t.clientY : (e as PointerEvent).clientY;
            const px = clamp(round((100 / rect.width) * (clientX - rect.left)));
            const py = clamp(round((100 / rect.height) * (clientY - rect.top)));
            pending = frameFor(px, py);
            if (raf === null) raf = requestAnimationFrame(apply);
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

        rotator.addEventListener('pointermove', onMove);
        rotator.addEventListener('pointerleave', onLeave);
        rotator.addEventListener('touchmove', onMove, { passive: true });
        rotator.addEventListener('touchend', onLeave);

        let idleRaf: number | null = null;
        let hovered = false;

        if (idleCount > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const slot = SWEEP_MS + GAP_MS;
            const cycle = slot * idleCount;
            const start = idleIndex * slot;

            const onEnter = () => {
                hovered = true;
            };
            const onExit = () => {
                hovered = false;
            };
            rotator.addEventListener('pointerenter', onEnter);
            rotator.addEventListener('pointerleave', onExit);

            let animating = false;

            const tick = () => {
                idleRaf = requestAnimationFrame(tick);
                // A real pointer always wins; its own handlers own the card while it is there.
                if (hovered) {
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

            return () => {
                rotator.removeEventListener('pointermove', onMove);
                rotator.removeEventListener('pointerleave', onLeave);
                rotator.removeEventListener('touchmove', onMove);
                rotator.removeEventListener('touchend', onLeave);
                rotator.removeEventListener('pointerenter', onEnter);
                rotator.removeEventListener('pointerleave', onExit);
                if (raf !== null) cancelAnimationFrame(raf);
                if (idleRaf !== null) cancelAnimationFrame(idleRaf);
            };
        }

        return () => {
            rotator.removeEventListener('pointermove', onMove);
            rotator.removeEventListener('pointerleave', onLeave);
            rotator.removeEventListener('touchmove', onMove);
            rotator.removeEventListener('touchend', onLeave);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, [idleIndex, idleCount]);

    return ref;
}
