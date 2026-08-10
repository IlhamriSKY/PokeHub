{{--
    Laravel picks this up by filename alone, so there is no handler wiring in bootstrap/app.php.

    Deliberately self-contained rather than an Inertia page or a @vite'd stylesheet: an error page
    that depends on the asset pipeline is broken exactly when you most need it to render. The only
    outside request is the same webfont the app already preconnects to, and the page is legible
    without it.

    Hairlines, no glow and no gradient - the same rule the landing page follows.
--}}
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>404 &middot; {{ config('app.name', 'PokeHub') }}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet">
        <style>
            :root {
                --background: hsl(0, 0%, 3.9%);
                --foreground: hsl(0, 0%, 98%);
                --muted: hsl(0, 0%, 63.9%);
                --border: hsl(0, 0%, 14.9%);
            }

            * { box-sizing: border-box; }

            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                padding: 1.5rem;
                /* The ball is wider than a phone; let it run off the edges rather than scroll. */
                overflow: hidden;
                background: var(--background);
                color: var(--foreground);
                font-family: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif;
                -webkit-font-smoothing: antialiased;
            }

            /* The ball sits BEHIND the text rather than above it, which is what keeps the block
               compact - the same call the landing hero makes. */
            .wrap { position: relative; text-align: center; }

            /* Centred on the numerals, not on the whole block: at 50% the ball's mid-band ran
               straight through the headline. Sitting high puts the band in the gap under "404"
               and leaves the copy on clean ground. */
            .ball {
                position: absolute;
                top: 38%;
                left: 50%;
                width: min(30rem, 108vw);
                aspect-ratio: 1;
                translate: -50% -50%;
                color: var(--border);
                pointer-events: none;
            }

            .draw {
                stroke-dasharray: 1;
                stroke-dashoffset: 1;
                animation: draw 1.6s cubic-bezier(0.65, 0, 0.35, 1) forwards;
            }

            .draw:nth-child(2) { animation-delay: 0.5s; }
            .draw:nth-child(3) { animation-delay: 0.7s; }

            /* The catch wobble: two rocks and a settle, on a loop, like a ball that never clicks. */
            .ball svg { animation: wobble 4s ease-in-out 1.9s infinite; transform-origin: 50% 92%; }

            .btn-dot { opacity: 0; animation: blink 4s ease-in-out 1.9s infinite; }

            @keyframes draw { to { stroke-dashoffset: 0; } }

            @keyframes wobble {
                0%, 60%, 100% { rotate: 0deg; }
                8%  { rotate: 7deg; }
                20% { rotate: -6deg; }
                32% { rotate: 4deg; }
                44% { rotate: -2deg; }
            }

            @keyframes blink {
                0%, 44%, 100% { opacity: 0; }
                50%, 58% { opacity: 1; }
                54% { opacity: 0.15; }
            }

            .code {
                position: relative;
                margin: 0;
                font-size: clamp(4.5rem, 18vw, 7rem);
                font-weight: 600;
                letter-spacing: -0.04em;
                line-height: 1;
                /* Explicit: the generic `p` rule below is same-specificity and would win on order. */
                color: var(--foreground);
            }

            h1 {
                position: relative;
                margin: 1rem 0 0;
                font-size: 1.0625rem;
                font-weight: 500;
                letter-spacing: 0.01em;
            }

            p {
                position: relative;
                margin: 0.5rem auto 0;
                max-width: 22rem;
                font-size: 0.8125rem;
                line-height: 1.6;
                color: var(--muted);
            }

            a {
                position: relative;
                display: inline-block;
                margin-top: 1.75rem;
                padding: 0.55rem 1.4rem;
                border-radius: 0.5rem;
                background: var(--foreground);
                color: var(--background);
                font-size: 0.8125rem;
                font-weight: 500;
                text-decoration: none;
                transition: opacity 0.2s;
            }

            a:hover { opacity: 0.85; }
            a:focus-visible { outline: 2px solid var(--muted); outline-offset: 3px; }

            @media (prefers-reduced-motion: reduce) {
                .draw, .ball svg, .btn-dot { animation: none; }
                .draw { stroke-dashoffset: 0; }
                .btn-dot { opacity: 1; }
            }
        </style>
    </head>
    <body>
        <div class="wrap">
            <div class="ball" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="0.7" stroke-linecap="round">
                    <circle class="draw" pathLength="1" cx="32" cy="32" r="29"/>
                    <path class="draw" pathLength="1" d="M3 32h17M44 32h17"/>
                    <circle class="draw" pathLength="1" cx="32" cy="32" r="12"/>
                    <circle class="btn-dot" cx="32" cy="32" r="4.5"/>
                </svg>
            </div>

            <p class="code">404</p>
            <h1>Wild MISSINGNO. appeared!</h1>
            <p>This page is not in the Pok&eacute;dex. It may have been traded away, or set to private.</p>
            <a href="{{ url('/') }}">Back to PokeHub</a>
        </div>
    </body>
</html>
