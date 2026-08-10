import { useEffect, useState } from 'react';

/** One selectable card option row from the DB (api/options.php). */
export type CardOption = {
    id: number;
    slug: string;
    label: string;
    generation: string;
    asset_url: string;
    meta: Record<string, unknown> | null;
};

/** All options grouped by category - entirely DB-driven, editable in api/admin.php. */
export type CardOptions = Record<string, CardOption[]>;

const EMPTY: CardOptions = {};

// One fetch shared by every caller; the options are identical on every page.
let cached: Promise<CardOptions> | null = null;

const loadOptions = (): Promise<CardOptions> =>
    (cached ??= fetch('/api/options.php')
        // Throw, don't resolve with EMPTY: a 500 resolved SUCCESSFULLY, so the catch below never
        // ran and the empty set stayed memoised for the life of the SPA - one blip during a deploy
        // and every card on every page rendered frameless until a full browser reload.
        .then((r) => {
            if (!r.ok) throw new Error(`options ${r.status}`);

            return r.json();
        })
        .then((d) => (d && typeof d === 'object' ? (d as CardOptions) : EMPTY))
        .catch(() => {
            // Never memoise a failure, or one dropped request poisons every later page.
            cached = null;

            return EMPTY;
        }));

/**
 * Loads every card option (generation, element, frame, effect, glare, rarity,
 * icon, tag, badge) from the DB so the Card Lab reflects whatever the admin page
 * has configured - add an option there and it appears here with no code change.
 */
export function useCardOptions(): { options: CardOptions; loading: boolean } {
    const [options, setOptions] = useState<CardOptions>(EMPTY);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        loadOptions()
            .then((d) => {
                if (alive) setOptions(d);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, []);

    return { options, loading };
}

/** Look up an option's asset URL by category + slug (for rendering). */
export function assetOf(options: CardOptions, category: string, slug?: string): string | undefined {
    if (!slug) return undefined;
    return options[category]?.find((o) => o.slug === slug)?.asset_url || undefined;
}
