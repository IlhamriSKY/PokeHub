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
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
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
            {/* stopPropagation so tilting the card does not close the overlay */}
            <div className="animate-pop w-full max-w-[min(92vw,420px)]" onClick={(e) => e.stopPropagation()}>
                {children}
                {caption && <p className="mt-4 text-center text-sm font-medium text-white">{caption}</p>}
                {sub && <p className="text-center text-xs text-white/70">{sub}</p>}
                {actions && <div className="mt-4 flex justify-center gap-2">{actions}</div>}
            </div>
        </div>
    );
}
