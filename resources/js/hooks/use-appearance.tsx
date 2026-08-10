import { useEffect, useState } from 'react';

/**
 * Two themes only: light and dark. There is deliberately no "system" option — the OS preference is
 * not consulted at all, and dark is the default for a first-time visitor (the cards read best on a
 * dark ground). An explicit choice is remembered in localStorage.
 */
export type Appearance = 'light' | 'dark';

const DEFAULT: Appearance = 'dark';

/** Anything not recognised (including a stored legacy 'system') falls back to the default. */
const normalise = (value: string | null): Appearance => (value === 'light' || value === 'dark' ? value : DEFAULT);

const applyTheme = (appearance: Appearance) => {
    document.documentElement.classList.toggle('dark', appearance === 'dark');
};

export function initializeTheme() {
    applyTheme(normalise(localStorage.getItem('appearance')));
}

export function useAppearance() {
    const [appearance, setAppearance] = useState<Appearance>(DEFAULT);

    const updateAppearance = (mode: Appearance) => {
        setAppearance(mode);
        localStorage.setItem('appearance', mode);
        applyTheme(mode);
    };

    useEffect(() => {
        updateAppearance(normalise(localStorage.getItem('appearance')));
    }, []);

    return { appearance, updateAppearance };
}
