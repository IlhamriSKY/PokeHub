/**
 * The flat hairline grid behind the landing hero, fading out downward.
 *
 * Shared rather than copied because the login screen uses the same backdrop: the whole look is
 * three tuned numbers (56px pitch, the opacity pair, the mask ellipse), and two copies of those
 * drift apart the first time one is adjusted.
 *
 * `currentColor`, not a fixed colour: the caller's text colour drives it, so the grid inverts with
 * the theme for free. Opacity is split light/dark because a hairline that reads as a whisper on
 * white is nearly invisible on black at the same alpha.
 */
export default function GridBackdrop({
    className = '',
    mask = 'radial-gradient(70% 62% at 50% 0%, #000 0%, transparent 100%)',
}: {
    className?: string;
    mask?: string;
}) {
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 -z-10 opacity-[0.16] dark:opacity-[0.10] ${className}`}
            style={{
                backgroundImage:
                    'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                backgroundSize: '56px 56px',
                maskImage: mask,
            }}
        />
    );
}
