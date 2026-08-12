import { claimCardFocus } from '@/lib/cardFocus';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

// Takes the rendered card as children so callers keep their own frame props.
export function CardZoom({
    children,
    caption,
    sub,
    actions,
    onClose,
}: {
    children: ReactNode;
    caption?: string;
    sub?: string;
    /** Optional controls under the caption - the gallery puts its Apply button here. */
    actions?: ReactNode;
    onClose: () => void;
}) {
    /*
     * What being open costs the page, held for exactly as long as the overlay is mounted.
     *
     * Deliberately NOT in the listener effect below: that one has to depend on `onClose`, and a
     * caller passing an inline callback (the gallery does) makes it re-run on every single
     * render - which would drop and retake this claim, and unlock and relock the page scroll,
     * for nothing. Neither is a function of who gets told when the overlay closes.
     */
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Everything behind this sheet is hidden by it, so stop the foil engine painting any of
        // it: the grid underneath was repainting a full holo stack per gyro reading for nothing,
        // which is what made the enlarged card stutter on a phone. See cardFocus.
        const release = claimCardFocus();

        return () => {
            document.body.style.overflow = prev;
            release();
        };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            // `card-zoom` carries the handset treatment in card.css: the frosted sheet here is a
            // desktop luxury, and on a phone it goes solid. See that rule for why.
            className="card-zoom fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={caption ? `${caption} card` : 'Card'}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
                <X className="h-5 w-5" />
            </button>
            {/* stopPropagation so tilting the card does not close the overlay. The data attribute
                is how the card inside recognises itself as the enlarged one (see cardFocus). */}
            <div data-card-zoom="" className="animate-pop w-full max-w-[min(92vw,420px)]" onClick={(e) => e.stopPropagation()}>
                {children}
                {caption && <p className="mt-4 text-center text-sm font-medium text-white">{caption}</p>}
                {sub && <p className="text-center text-xs text-white/70">{sub}</p>}
                {actions && <div className="mt-4 flex justify-center gap-2">{actions}</div>}
            </div>
        </div>
    );
}
