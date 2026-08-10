import { SVGAttributes } from 'react';

// fill="none" sits on the children: callers pass `fill-current`, and a class beats a
// presentation attribute on the same element, which would flood the circles.
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg viewBox="0 0 64 64" stroke="currentColor" strokeWidth={4} aria-hidden="true" {...props}>
            <circle cx="32" cy="32" r="29" fill="none" />
            <path d="M3 32h17M44 32h17" fill="none" />
            <circle cx="32" cy="32" r="12" fill="none" />
            <circle cx="32" cy="32" r="4.5" fill="none" />
        </svg>
    );
}
