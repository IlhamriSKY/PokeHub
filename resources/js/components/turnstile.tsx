import type { SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

type TurnstileWidget = {
    render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; 'error-callback': () => void; 'expired-callback': () => void },
    ) => void;
    reset: (el?: HTMLElement) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileWidget;
    }
}

// Renders nothing unless TURNSTILE_ENABLED is on, so local dev needs no keys.
export function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
    const { turnstile } = usePage<SharedData>().props;
    const ref = useRef<HTMLDivElement>(null);
    const rendered = useRef(false);
    const cb = useRef(onVerify);
    cb.current = onVerify;

    useEffect(() => {
        // Captured here so the null check still holds inside the callback below.
        const sitekey = turnstile?.enabled ? turnstile.site_key : null;
        if (!sitekey) return;

        const render = () => {
            if (!ref.current || !window.turnstile || rendered.current) return;
            rendered.current = true;
            window.turnstile.render(ref.current, {
                sitekey,
                callback: (t: string) => cb.current(t),
                'error-callback': () => cb.current(''),
                'expired-callback': () => cb.current(''),
            });
        };

        if (window.turnstile) {
            render();
            return;
        }

        const scriptId = 'cf-turnstile-script';
        if (!document.getElementById(scriptId)) {
            const s = document.createElement('script');
            s.id = scriptId;
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            s.async = true;
            s.defer = true;
            s.onload = render;
            document.head.appendChild(s);
        } else {
            const timer = setInterval(() => {
                if (window.turnstile) {
                    clearInterval(timer);
                    render();
                }
            }, 100);
            return () => clearInterval(timer);
        }
    }, [turnstile]);

    if (!turnstile?.enabled || !turnstile.site_key) return null;
    return <div ref={ref} className="flex justify-center" />;
}
