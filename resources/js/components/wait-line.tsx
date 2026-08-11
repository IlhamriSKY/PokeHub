import { useEffect, useState } from 'react';

// The self-hosted model can take two minutes; a bare spinner that long reads as broken.
const WAIT_LINES = [
    'Waking the AI…',
    'Evolving… do not press B.',
    'It used Splash. Nothing.',
    'Asking Professor Oak.',
    'Stuck behind a Slowpoke.',
    'Reading your Pokedex.',
    'Charging a two-turn move.',
    'Nurse Joy says: one sec.',
    'Rare Candy used. Level 5.',
    'Grinding Route 1.',
    'Team Rocket took a GPU.',
    'The AI fainted. Reviving.',
    'Surfing the queue.',
    'The ball wobbled once…',
];

/**
 * The typewriter line shown while a card is being generated.
 *
 * Shared by the dashboard's Regenerate button and the home page's search box, which wait on the
 * same AI call. One list, so the two waits cannot drift apart.
 */
export default function WaitLine() {
    const [i, setI] = useState(0);
    const [typed, setTyped] = useState(0);
    const line = WAIT_LINES[i % WAIT_LINES.length];

    useEffect(() => {
        // Randomised here, not during render, so SSR hydration still matches.
        setI(Math.floor(Math.random() * WAIT_LINES.length));
    }, []);

    useEffect(() => {
        if (typed < line.length) {
            const t = setTimeout(() => setTyped(typed + 1), 45);

            return () => clearTimeout(t);
        }
        // Line finished: hold it long enough to read, then start the next one.
        const t = setTimeout(() => {
            setI((n) => n + 1);
            setTyped(0);
        }, 1800);

        return () => clearTimeout(t);
    }, [typed, line]);

    // The full line sits underneath, invisible, to reserve the box. Without it the button
    // resizes on every character and the whole panel twitches for two minutes.
    return (
        <span className="relative inline-block whitespace-nowrap">
            <span className="invisible">{line}</span>
            <span className="absolute inset-0 text-left">{line.slice(0, typed)}</span>
        </span>
    );
}
