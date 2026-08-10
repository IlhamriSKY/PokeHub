/**
 * Screenshot the REAL card and write it as an animated GIF or a still SVG, so both are the
 * browser's own render rather than a redrawing of it. That is the only way to get holo.css onto a
 * static image: the foil is layered blend modes following `--pointer-x/y`, so the shots are taken
 * while driving a mouse across the card.
 *
 *   node scripts/capture-card.mjs <url> <out.gif|out.svg|out.png> [frames] [width] [delayMs]
 *
 * The format comes from the output extension. `svg` takes ONE shot and wraps the PNG - it exists so
 * the still and the animation cannot disagree; a hand-drawn SVG was tried and drifted from the card
 * twice (font metrics, then the weakness chart).
 *
 * Encoding happens HERE, not in PHP. Imagick was the obvious home for it, but this project's
 * ImageMagick cannot load its own PNG coder ("UnableToLoadModule IM_MOD_RL_PNG_.dll"), and the
 * shots are already in this process - pngjs decodes and gifenc writes, both pure JS, so the
 * pipeline has no native-library dependency at all.
 */
import { writeFileSync } from 'node:fs';
// Both are CommonJS, so they come in as default exports - named imports throw at parse time.
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import puppeteer from 'puppeteer';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;

const [url, out, framesArg, widthArg, delayArg] = process.argv.slice(2);
const WIDTH = Number(widthArg) || 320;
const DELAY = Number(delayArg) || 90;
const IS_SVG = /\.svg$/i.test(out ?? '');
// PNG is the SVG's own still, unwrapped: same single shot, same downscale, just written straight
// out instead of base64'd into an <svg>. It exists for link previews - Open Graph scrapers reject
// SVG outright and only some of them animate a GIF, so a share card needs a plain raster.
const IS_PNG = /\.png$/i.test(out ?? '');
const STILL = IS_SVG || IS_PNG;
const FRAMES = STILL ? 1 : Number(framesArg) || 24;

if (!url || !out) {
    console.error('usage: capture-card.mjs <url> <out.gif|out.svg|out.png> [frames] [width] [delayMs]');
    process.exit(2);
}

/** Shots live in memory - nothing touches disk until the finished file is written. */
const shots = [];

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2'],
});

try {
    const page = await browser.newPage();
    // deviceScaleFactor 2 so the text is crisp; the output is downscaled to WIDTH afterwards.
    await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('.card .pcg', { timeout: 20000 });
    /*
     * `.card .pcg` exists on the FIRST render, before /api/options.php has answered - and that
     * fetch can resolve after `goto`'s networkidle2, with the frame, foil, badge and rarity mark
     * only arriving on the re-render it triggers. Waiting for the network to go quiet AGAIN covers
     * both the options request and the WebPs it pulls in; a fixed sleep instead either truncated
     * that (a plain option-less card, then cached to disk under a key that never changes) or
     * padded every capture. Then decode: images can be loaded but not yet painted.
     */
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
    await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))));
    await new Promise((r) => setTimeout(r, 200));

    // Strip the page down to the card. The clip is wider than the card (see `pad`), so without
    // this the surrounding page - the stats column, the buttons - bled into the edges of every
    // shot. Hidden rather than removed: the card's own ancestors have to stay visible, and the
    // pointer-tilt listeners are bound to nodes that must not move.
    await page.evaluate(() => {
        const card = document.querySelector('.card');
        const ancestors = [];
        for (let n = card; n; n = n.parentElement) ancestors.push(n);
        const keep = new Set(ancestors);

        document.querySelectorAll('body *').forEach((el) => {
            if (!keep.has(el) && !card.contains(el)) el.style.visibility = 'hidden';
        });

        // Transparent, not a baked mat, so one file is correct on a light or a dark README.
        //
        // Every ANCESTOR has to be cleared too, not just html/body. `visibility: hidden` cannot be
        // used on them (that would hide the card with them), so an ancestor carrying `bg-background`
        // kept painting the page's dark colour straight through `omitBackground` - the still came
        // out with an opaque near-black surround. The card itself is skipped: its own layers are
        // where the frame art lives.
        for (const el of ancestors) {
            if (el !== card) el.style.background = 'transparent';
        }
    });

    const card = await page.$('.card');
    const box = await card.boundingBox();
    // A FIXED clip for every shot: the pointer tilt rotates the card in 3D, so its own bounding box
    // grows and shrinks as it moves, and per-element screenshots would jitter frame to frame.
    //
    // The padding is 9% of the card's width, not a flat 10px. The box is measured at REST, but the
    // tilt swings the corners well outside it - at 10px the top edge was being sliced off on the
    // frames where the card leans back. Scaling with the card keeps that true at any render size.
    const pad = Math.ceil(box.width * 0.09);
    const clip = {
        x: Math.max(0, Math.round(box.x - pad)),
        y: Math.max(0, Math.round(box.y - pad)),
        width: Math.round(box.width + pad * 2),
        height: Math.round(box.height + pad * 2),
    };

    // One lap of a Lissajous path across the face. A straight left-to-right sweep looks like a
    // scanner; this reads like a card being turned over in someone's hand, and it loops seamlessly
    // because both axes complete whole cycles.
    //
    // Amplitude 0.30, not 0.42: smoothness is per-frame DELTA, not frame count alone. Slowing the
    // loop down (90ms) would make a wide path look MORE stepped, because each jump then sits on
    // screen longer - so the path tightens as the timing relaxes.
    //
    // The still takes its one shot a quarter-lap in, which is where the path crosses the card's
    // centre: tilt lands on ~0deg, so a README embed has no perspective skew, but the pointer is
    // ON the card, which is what lights the foil (`--card-opacity` 1; measured mean |delta| ~31/255
    // against the untouched card). It is also exactly GIF frame 6, so the two cannot disagree.
    for (let i = 0; i < FRAMES; i++) {
        const t = (STILL ? 0.25 : i / FRAMES) * Math.PI * 2;
        const px = box.x + box.width * (0.5 + 0.3 * Math.cos(t));
        const py = box.y + box.height * (0.5 + 0.3 * Math.sin(t * 2));

        await page.mouse.move(px, py);
        // Two rAFs: one for the pointer vars to land, one for the foil to repaint against them.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

        shots.push(await page.screenshot({ clip, type: 'png', omitBackground: true }));
    }

    // --- encode -------------------------------------------------------------------------------
    // The capture is 2x for crisp text, so downscale on the way in; box-averaging the 2x2 block is
    // also what keeps the foil's dithering from turning into noise at output size.
    const src = PNG.sync.read(Buffer.from(shots[0]));
    const scale = Math.max(1, Math.round(src.width / WIDTH));
    const w = Math.floor(src.width / scale);
    const h = Math.floor(src.height / scale);

    const bytes = IS_PNG ? png(shots[0], scale, w, h) : IS_SVG ? svg(shots[0], scale, w, h) : gif(shots, scale, w, h);
    writeFileSync(out, bytes);
    console.log(JSON.stringify({ format: IS_PNG ? 'png' : IS_SVG ? 'svg' : 'gif', frames: FRAMES, width: w, height: h, bytes: bytes.length }));
} finally {
    await browser.close();
}

/** The still as a bare PNG at output size - what svg() wraps, minus the wrapper. */
function png(shot, scale, w, h) {
    const src = PNG.sync.read(Buffer.from(shot));
    const flat = new PNG({ width: w, height: h });
    flat.data = Buffer.from(downscale(src, scale, w, h, true));

    return PNG.sync.write(flat);
}

/** The still, as a PNG re-encoded at output size and wrapped in an SVG the README can embed. */
function svg(shot, scale, w, h) {
    const png = PNG.sync.read(Buffer.from(shot));
    const flat = new PNG({ width: w, height: h });
    // Full 8-bit alpha here, unlike the GIF: PNG has no 1-bit limit, so the drop shadow survives
    // as a real soft edge instead of a threshold cut.
    flat.data = Buffer.from(downscale(png, scale, w, h, true));
    const data = PNG.sync.write(flat).toString('base64');

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
            `<image href="data:image/png;base64,${data}" width="${w}" height="${h}"/>` +
            `</svg>`,
    );
}

/** The animation: one shared palette, transparent surround, looping forever. */
function gif(shotList, scale, w, h) {
    const enc = GIFEncoder();
    // ONE palette for the whole animation, built from the middle frame. A per-frame palette makes
    // the surround shimmer between frames, which on a mostly-static card is far more obvious than
    // any loss from sharing.
    // rgba4444, not rgb565: the palette has to carry an alpha entry for the transparent surround.
    const mid = downscale(PNG.sync.read(Buffer.from(shotList[Math.floor(shotList.length / 2)])), scale, w, h);
    const palette = quantize(mid, 256, { format: 'rgba4444' });

    for (const shot of shotList) {
        const rgba = downscale(PNG.sync.read(Buffer.from(shot)), scale, w, h);
        enc.writeFrame(applyPalette(rgba, palette, 'rgba4444'), w, h, { palette, delay: DELAY, transparent: true });
    }
    enc.finish();

    return Buffer.from(enc.bytes());
}

/**
 * Box-average `scale`x`scale` blocks of an RGBA PNG into a w*h RGBA buffer.
 * `softAlpha` keeps the averaged alpha; otherwise it is snapped to 0 or 255 for GIF's 1-bit index.
 */
function downscale(png, scale, w, h, softAlpha = false) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, a = 0, n = 0;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const i = ((y * scale + dy) * png.width + (x * scale + dx)) * 4;
                    r += png.data[i];
                    g += png.data[i + 1];
                    b += png.data[i + 2];
                    a += png.data[i + 3];
                    n++;
                }
            }
            const o = (y * w + x) * 4;
            out[o] = r / n;
            out[o + 1] = g / n;
            out[o + 2] = b / n;
            // GIF alpha is 1 bit, so the averaged edge has to snap one way. Half-way (128) puts
            // the cut inside the drop shadow's own falloff, which is why it still reads as a
            // shadow rather than as a hard rectangle.
            out[o + 3] = softAlpha ? a / n : a / n < 128 ? 0 : 255;
        }
    }

    return out;
}
