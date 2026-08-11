/**
 * The phone's own tilt, as a pointer the card can follow.
 *
 * On a desktop the holo foil is driven by the mouse (usePointerTilt); on a phone there is no
 * mouse, so the card only ever moved while a finger was dragging across it and sat flat the rest
 * of the time. A hand-held device already knows which way it is being held, so this turns
 * `deviceorientation` into the same -1..1 pair the pointer produces and lets the card react to
 * being tilted - which is what a real foil card does in your hand.
 *
 * ONE listener for the whole page, not one per card: the landing grid mounts four cards and the
 * zoom overlay a fifth, and they all want the identical reading. Subscribers get a shared event;
 * each card decides for itself whether to paint it (see usePointerTilt).
 */

export type Tilt = { x: number; y: number };

type Listener = (tilt: Tilt) => void;

/** Degrees of real tilt that sweep the effect from one edge of the card to the other. */
const RANGE = 22;

/**
 * How hard the neutral is dragged back when a reading is pinned past RANGE.
 *
 * The baseline is whatever the FIRST event reports, which is often the phone flat on a desk a
 * moment before it is picked up. Without this the card would then sit jammed against its stop for
 * as long as the page is open. Only over-range readings move it, so an ordinary deliberate tilt -
 * which lives inside the range - is never quietly re-centred under the user.
 */
const REHOME = 0.1;

/**
 * Smallest movement worth telling anyone about, as a share of the full sweep.
 *
 * An accelerometer never reads the same number twice, so a handset lying perfectly still on a desk
 * still emits ~60 events a second, each a fraction of a degree from the last. Painting those means
 * repainting a stack of blend-mode foil layers sixty times a second to move the highlight by a
 * pixel nobody can see - the most expensive thing on the page, for no picture. 0.004 of the sweep
 * is about a tenth of a degree: below what a hand can hold steady, well below what an eye can spot.
 */
const DEADZONE = 0.004;

const listeners = new Set<Listener>();

let base: { beta: number; gamma: number } | null = null;
let last: Tilt | null = null;
let attached = false;
/** iOS gates the sensor; everywhere else it is simply available. Resolved in requestDeviceTilt. */
let permitted = false;
let asked = false;

type PermissionAPI = { requestPermission: () => Promise<PermissionState | 'granted' | 'denied'> };

const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** The iOS-only gate, or null on the platforms that just deliver the event. */
function gate(): PermissionAPI | null {
    const api = window.DeviceOrientationEvent as unknown as Partial<PermissionAPI>;

    return typeof api.requestPermission === 'function' ? (api as PermissionAPI) : null;
}

/**
 * Is this a device whose tilt is worth reading at all?
 *
 * Coarse pointer, because a laptop lid also reports orientation and a card that stirs because
 * someone shifted in their chair is not the feature. Reduced motion opts out entirely - this is
 * continuous movement nobody asked for by hovering.
 */
export function deviceTiltPossible(): boolean {
    return (
        typeof window !== 'undefined' &&
        'DeviceOrientationEvent' in window &&
        window.matchMedia('(pointer: coarse)').matches &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

/**
 * Ask for the sensor. MUST be called from inside a real user gesture - iOS 13+ rejects
 * `requestPermission()` anywhere else, and the prompt never appears.
 *
 * Called from the card's own `touchend`, so the ask lands on a tap the user made ON the thing
 * that is about to start moving, rather than on page load out of nowhere. It answers once per
 * page: a denial is not re-asked, and every other platform short-circuits to "granted".
 */
export function requestDeviceTilt(): void {
    const api = gate();
    if (asked || !api || !deviceTiltPossible()) return;
    asked = true;

    api.requestPermission()
        .then((state) => {
            permitted = state === 'granted';
            attach();
        })
        .catch(() => {});
}

/** Subscribe to the shared reading. Returns the unsubscribe. */
export function onDeviceTilt(fn: Listener): () => void {
    listeners.add(fn);
    attach();

    return () => {
        listeners.delete(fn);
        if (listeners.size === 0) detach();
    };
}

function attach(): void {
    if (attached || listeners.size === 0 || !deviceTiltPossible()) return;
    if (!permitted) {
        // Android and the rest hand the event over unasked, so subscribing IS the permission.
        // iOS has to wait for requestDeviceTilt() to be called from a tap on a card.
        if (gate()) return;
        permitted = true;
    }
    attached = true;
    base = null;
    last = null;
    window.addEventListener('deviceorientation', onOrientation);
    // A device put down and picked up again, or turned on its side, is holding a different neutral.
    window.addEventListener('orientationchange', recentre);
    document.addEventListener('visibilitychange', recentre);
}

function detach(): void {
    if (!attached) return;
    attached = false;
    base = null;
    last = null;
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('orientationchange', recentre);
    document.removeEventListener('visibilitychange', recentre);
}

function recentre(): void {
    base = null;
    last = null;
}

function onOrientation(e: DeviceOrientationEvent): void {
    if (e.beta === null || e.gamma === null) return;
    if (!base) {
        base = { beta: e.beta, gamma: e.gamma };

        return;
    }

    const db = e.beta - base.beta;
    const dg = e.gamma - base.gamma;
    if (Math.abs(db) > RANGE) base.beta += (db - Math.sign(db) * RANGE) * REHOME;
    if (Math.abs(dg) > RANGE) base.gamma += (dg - Math.sign(dg) * RANGE) * REHOME;

    /*
     * beta/gamma are the DEVICE's axes, which stop matching the screen's the moment the phone is
     * turned on its side, so the pair is rotated by however far the screen has been rotated from
     * its natural orientation. Portrait (angle 0) is the identity, and is what almost every visit
     * uses; this is what stops landscape tilting the card sideways when you tip it forwards.
     */
    const angle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    /*
     * Signs read as "a marble on the glass rolls downhill": drop the right edge and the highlight
     * slides right, stand the phone up and it slides toward the bottom of the card. Which is also
     * the direction the pointer would have to move to produce the same lean, so the two inputs
     * cannot disagree about what a tilt means.
     */
    const tilt = {
        x: clamp1((dg * cos + db * sin) / RANGE),
        y: clamp1((db * cos - dg * sin) / RANGE),
    };

    if (last && Math.abs(tilt.x - last.x) < DEADZONE && Math.abs(tilt.y - last.y) < DEADZONE) return;
    last = tilt;

    for (const fn of listeners) fn(tilt);
}
