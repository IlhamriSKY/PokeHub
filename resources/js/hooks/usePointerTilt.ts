import { useEffect, useRef } from 'react';

const round = (v: number, p = 3) => parseFloat(v.toFixed(p));
const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const adjust = (v: number, a: number, b: number, c: number, d: number) => round(c + ((d - c) * (v - a)) / (b - a));

/**
 * Attach to the outer `.card` element. Tracks the pointer and writes the CSS
 * custom properties (position, tilt, glare) that the holo stylesheet reads.
 */
export function usePointerTilt<T extends HTMLElement>() {
    const ref = useRef<T>(null);

    useEffect(() => {
        const card = ref.current;
        if (!card) return;
        const rotator = card.querySelector<HTMLElement>('.card__rotator');
        if (!rotator) return;

        let raf: number | null = null;
        let pending: Record<string, number> | null = null;
        const set = (k: string, v: string) => card.style.setProperty(k, v);

        const onMove = (e: PointerEvent | TouchEvent) => {
            const rect = rotator.getBoundingClientRect();
            const t = (e as TouchEvent).touches?.[0];
            const clientX = t ? t.clientX : (e as PointerEvent).clientX;
            const clientY = t ? t.clientY : (e as PointerEvent).clientY;
            const px = clamp(round((100 / rect.width) * (clientX - rect.left)));
            const py = clamp(round((100 / rect.height) * (clientY - rect.top)));
            const dx = px - 50;
            const dy = py - 50;
            pending = {
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
        return () => {
            rotator.removeEventListener('pointermove', onMove);
            rotator.removeEventListener('pointerleave', onLeave);
            rotator.removeEventListener('touchmove', onMove);
            rotator.removeEventListener('touchend', onLeave);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, []);

    return ref;
}
