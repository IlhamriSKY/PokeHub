/**
 * The hairline Poke Ball that draws itself in, then loops the capture wobble with the button
 * flashing at the end. Keyframes live in card.css (`pokehub-draw` / `pokehub-wobble` /
 * `pokehub-catch`), which app.tsx imports globally, so this works on any page.
 *
 * Lives here rather than inside landing.tsx because the login screen shows the same ball: two
 * copies of the markup would drift the moment either one is tuned, and the animation is driven by
 * these exact class names.
 *
 * The WRAPPER owns positioning, not the svg: the wobble animates `transform`, which would
 * overwrite a `-translate-x-1/2` on the same element the instant the animation started. So the
 * caller's className goes on the wrapper and only the size lands on the svg.
 *
 * `--tilt` scales with the drawn size, not with taste: the degrees that read as a lively rock on
 * an 80px ball swing the edge of a 30rem one by tens of pixels.
 *
 * `still` keeps the drawing and drops the wobble, for the panel corners - one moving thing per
 * page is the budget.
 */
export default function LinePokeball({
    className,
    size,
    tilt = '9deg',
    still,
    strokeWidth = 0.8,
    decorative = true,
}: {
    className?: string;
    size: string;
    tilt?: string;
    still?: boolean;
    /** Hairline suits a 160px+ ball; a 36px logo needs real weight or it renders as a smudge. */
    strokeWidth?: number;
    /** Background art: absolutely positioned and click-through. Off for an inline logo, which has
     *  to stay in flow and must not swallow the click of a link wrapping it. */
    decorative?: boolean;
}) {
    return (
        <div
            aria-hidden="true"
            className={`pokehub-ball ${decorative ? 'pointer-events-none absolute' : ''} ${still ? 'is-still' : ''} ${className ?? ''}`}
            style={{ '--tilt': tilt } as React.CSSProperties}
        >
            <svg viewBox="0 0 64 64" className={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
                <circle className="pokehub-ball__draw" pathLength={1} cx="32" cy="32" r="29" />
                <path className="pokehub-ball__draw" pathLength={1} d="M3 32h17M44 32h17" />
                <circle className="pokehub-ball__draw" pathLength={1} cx="32" cy="32" r="12" />
                <circle className="pokehub-ball__btn" cx="32" cy="32" r="4.5" />
            </svg>
        </div>
    );
}
