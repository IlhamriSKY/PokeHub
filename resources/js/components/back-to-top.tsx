import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * How far down the page has to be before the button is worth offering, in pixels.
 *
 * Roughly one screen. Anything less and the button appears on the first flick of a wheel, while
 * "top" is still a short scroll away and the offer reads as clutter.
 */
const THRESHOLD = 600;

/**
 * A floating "back to top", shown once the page has scrolled about a screen.
 *
 * Driven by an IntersectionObserver watching a zero-height mark at the top of the page, not by a
 * scroll listener: the browser reports the crossing once in each direction and does nothing at all
 * on the frames between, so there is no handler to throttle. usePointerTilt takes the same route
 * for the same reason. The mark needs no positioning of its own - `rootMargin` grows the observed
 * box upward by THRESHOLD instead, which is what turns "scrolled at all" into "scrolled a screen".
 *
 * z-40, one layer under CardZoom's sheet, so an open card covers this rather than leaving a stray
 * button floating over a dialog.
 */
export function BackToTop() {
    const mark = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = mark.current;
        if (!el) return;

        const io = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting), {
            rootMargin: `${THRESHOLD}px 0px 0px 0px`,
        });
        io.observe(el);

        return () => io.disconnect();
    }, []);

    return (
        <>
            {/* `-mb-px` cancels the pixel this costs, so adding the button moves nothing. */}
            <div ref={mark} aria-hidden="true" className="pointer-events-none -mb-px h-px w-full" />
            <button
                type="button"
                onClick={() =>
                    window.scrollTo({
                        top: 0,
                        // Smooth is a nicety for most people and motion sickness for some. Same
                        // query the idle card sweep checks before it animates anything.
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                    })
                }
                // Faded out rather than unmounted, so it has something to transition between - but
                // an invisible button is still tabbable and still announced, so `inert` takes it
                // out of the focus order and the accessibility tree for as long as it is hidden.
                inert={!shown}
                aria-label="Back to top"
                title="Back to top"
                className={`bg-card/90 text-muted-foreground hover:text-foreground fixed right-4 bottom-4 z-40 grid h-11 w-11 place-items-center rounded-full border shadow-lg backdrop-blur-sm transition-all duration-200 sm:right-6 sm:bottom-6 ${
                    shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                }`}
            >
                <ArrowUp className="h-5 w-5" />
            </button>
        </>
    );
}
