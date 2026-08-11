/**
 * Screenshot the real card page and write it as an animated GIF or a still image, so every format
 * is the browser's own render rather than a redrawing of it. That is the only way to get holo.css
 * onto a static image: the foil is layered blend modes following `--pointer-x/y`, so the shots are
 * taken while driving a pointer across the card.
 *
 *   node scripts/capture-card.mjs <url> <out.gif|out.svg|out.png> [frames] [width] [delayMs]
 *
 * The format comes from the output extension. `svg` takes one shot and wraps the PNG, so the still
 * and the animation cannot disagree.
 *
 * Encoding happens here rather than in PHP: the shots are already in this process, and pngjs and
 * gifenc are pure JS, so the pipeline needs no native image library.
 */
import { writeFileSync } from 'node:fs';
// Both are CommonJS, so they arrive as default exports; named imports throw at parse time.
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import puppeteer from 'puppeteer';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;

const [url, out, framesArg, widthArg, delayArg] = process.argv.slice(2);
const WIDTH = Number(widthArg) || 320;

const DELAY = Number(delayArg) || 90;
const IS_SVG = /\.svg$/i.test(out ?? '');
// PNG is the SVG's own still, unwrapped: the same single shot and downscale, written straight out
// instead of base64'd into an <svg>. It exists for link previews, where Open Graph scrapers reject
// SVG and only some of them animate a GIF.
const IS_PNG = /\.png$/i.test(out ?? '');
const STILL = IS_SVG || IS_PNG;
const FRAMES = STILL ? 1 : Number(framesArg) || 24;

/**
 * The width the card is FORCED to on the page before any shot is taken, in CSS px.
 *
 * Pinned here rather than inherited from the page so the output is a property of this script and
 * not of whatever the card page's layout happens to be this week. At deviceScaleFactor 2 the raw
 * capture is 1520px across, which box-averages cleanly to a 760px still - a real card is 63mm
 * wide, so that is the 300dpi print size.
 *
 * The GIF renders small instead. It is 24 paints of a full holo card, and driving that at print
 * size took the capture from 15 seconds to 74 for frames nobody views at more than thumbnail size.
 */
const RENDER_W = STILL ? 760 : 480;

/**
 * The colour a pixel is painted before it is thrown away. Nothing on a Pokemon card is pure
 * magenta, so it cannot collide with real artwork and be knocked transparent by accident.
 */
const KEY = [255, 0, 255];

if (!url || !out) {
    console.error('usage: capture-card.mjs <url> <out.gif|out.svg|out.png> [frames] [width] [delayMs]');
    process.exit(2);
}

/** Shots live in memory; nothing touches disk until the finished file is written. */
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
     * `.card .pcg` exists on the first render, before /api/options has answered, and that fetch
     * can resolve after `goto`'s networkidle2: the frame, foil, badge and rarity mark only arrive
     * on the re-render it triggers. Waiting for the network to go quiet again covers both the
     * options request and the images it pulls in, where a fixed sleep would either truncate that
     * or pad every capture. The decode pass then waits for images that are loaded but not painted.
     */
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
    await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))));
    await new Promise((r) => setTimeout(r, 200));

    // Strip the page down to the card. The clip is wider than the card (see `pad`), so without
    // this the surrounding page bleeds into the edges of every shot. Hidden rather than removed,
    // because the card's ancestors have to stay visible and the pointer-tilt listeners are bound
    // to nodes that must not move.
    await page.evaluate((RENDER_W, STILL) => {
        const card = document.querySelector('.card');
        const ancestors = [];
        for (let n = card; n; n = n.parentElement) ancestors.push(n);
        const keep = new Set(ancestors);

        document.querySelectorAll('body *').forEach((el) => {
            if (!keep.has(el) && !card.contains(el)) el.style.visibility = 'hidden';
        });

        // Transparent rather than a baked mat, so one file is correct on a light or a dark README.
        //
        // Every ancestor has to be cleared, not just html and body: `visibility: hidden` would
        // hide the card along with them, so an ancestor carrying a background paints straight
        // through `omitBackground`. The card itself is skipped, since its own layers carry the
        // frame art.
        for (const el of ancestors) {
            if (el !== card) el.style.background = 'transparent';
        }

        /*
         * Render at a FIXED width rather than whatever the page happens to lay the card out at.
         * The output used to inherit that width, so a change to the card page's design silently
         * changed every stored image: a layout edit took the card from 300px to 225px and the
         * downloads went with it, at which point the still was a 266px-wide bitmap being handed
         * out as a card.
         *
         * `.card` is width:100%, so the parent is what decides. RENDER_W is CSS px and the shot is
         * taken at deviceScaleFactor 2, so the raw capture is twice this before it is averaged
         * down to the requested output width.
         */
        const holder = card.parentElement;
        holder.style.width = RENDER_W + 'px';
        holder.style.maxWidth = 'none';

        // The still has no tilt (see the quarter-lap note below), so it is clipped tight to the
        // card and there is no room for a shadow to fall into. Cutting one off mid-blur leaves a
        // grey smear down two edges; the download is meant to be the card and nothing else.
        if (STILL) {
            const s = document.createElement('style');
            s.textContent = '.card__rotator{box-shadow:none !important}';
            document.head.appendChild(s);
        }
    }, RENDER_W, STILL);

    const card = await page.$('.card');
    const box = await card.boundingBox();
    // One fixed clip for every shot: the pointer tilt rotates the card in 3D, so its own bounding
    // box grows and shrinks as it moves and per-element screenshots would jitter frame to frame.
    //
    // The padding is a share of the card's width rather than a flat pixel count. The box is
    // measured at rest, but the tilt swings the corners outside it, and scaling with the card
    // keeps the margin sufficient at any render size.
    // Only the GIF needs room: its pointer walk swings the card's corners outside the box it was
    // measured at. The still is shot with the pointer dead centre, where the rotation is zero, so
    // it is clipped to the card exactly - no transparent margin around the download.
    const pad = STILL ? 0 : Math.ceil(box.width * 0.09);
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
    // Smoothness is a matter of per-frame delta rather than frame count alone, so the amplitude is
    // kept modest: the slower the loop, the longer each step sits on screen, and a wide path would
    // read as more stepped, not less. Amplitude and CardCapture's DELAY_MS move together.
    //
    // The still takes its one shot a quarter-lap in, where the path crosses the card's centre.
    // Tilt lands near zero, so a README embed has no perspective skew, while the pointer is still
    // on the card, which is what lights the foil. That point is also one of the GIF's own frames,
    // so the two cannot disagree.
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

/** The still as a bare PNG at output size: what svg() wraps, without the wrapper. */
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
/**
 * Alpha, resolved the only way a GIF can: one palette entry is transparent, the rest are opaque.
 *
 * Done HERE rather than left to the quantiser. The palette used to be built in `rgba4444`, which
 * spends four of its bits per pixel describing an alpha channel the format cannot store - so the
 * card was drawn in 4-bit colour (16 levels per channel) and the foil's gradient collapsed into a
 * hard diagonal band, while the leftover part-alpha entries let the page behind show through the
 * card itself. Flattening first frees the whole palette for `rgb565`, which is 5-6-5.
 */
function keyAlpha(rgba) {
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) {
            rgba[i] = KEY[0];
            rgba[i + 1] = KEY[1];
            rgba[i + 2] = KEY[2];
            rgba[i + 3] = 255;
        } else {
            rgba[i + 3] = 255;
        }
    }

    return rgba;
}

function gif(shotList, scale, w, h) {
    const enc = GIFEncoder();
    // One palette for the whole animation, built from the middle frame. A per-frame palette makes
    // the surround shimmer between frames, which on a mostly static card is far more obvious than
    // any loss from sharing one.
    //
    // 255 colours, not 256: the last index is reserved for the key.
    const mid = keyAlpha(downscale(PNG.sync.read(Buffer.from(shotList[Math.floor(shotList.length / 2)])), scale, w, h));
    const palette = quantize(mid, 255, { format: 'rgb565' });
    // The key is appended for WRITING only, never for MATCHING: applyPalette picks the nearest
    // colour, so a key in the match set means every pink in the artwork - this card's photo
    // backdrop, the foil's warm glare - can round to it and be punched transparent. Matching sees
    // 255 real colours; the frame is written with 256, the last of which is the hole.
    const written = [...palette, KEY];
    const transparentIndex = written.length - 1;

    for (const shot of shotList) {
        const raw = downscale(PNG.sync.read(Buffer.from(shot)), scale, w, h);
        // Which pixels were see-through, remembered before keyAlpha paints over the answer.
        const clear = [];
        for (let i = 3, p = 0; i < raw.length; i += 4, p++) {
            if (raw[i] < 128) clear.push(p);
        }

        const idx = applyPalette(keyAlpha(raw), palette, 'rgb565');
        for (const p of clear) idx[p] = transparentIndex;

        enc.writeFrame(idx, w, h, { palette: written, delay: DELAY, transparent: true, transparentIndex });
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
