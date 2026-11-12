/**
 * The world's signage, all NEW art composed at load from the brand and Vega's own pieces, never resampled at
 * draw. 16-Bit Con is always the wordmark's own letters (wordmark-pixels.ts), Yellow 600 in a Green 900 outline,
 * as on the flyer.
 *  - The 16-Bit Con poster: the flyer in pixels (the mock's cream in an orange band and a green rule, the
 *    wordmark, the arcade machine's top, the date and the venue, a yellow FREE burst on its right edge),
 *    shown in a city ad panel on the sidewalk: a slim dark frame on a short post, lit at night.
 *  - The Javits Center's letters over its entrance: the wordmark, large, solid Green 900 like the nav's, with depth.
 *  - The Vega booth sign: Vega's tiles and daisy on a Leaf Green board, BOOTH 630 → in Daisy White, on one post.
 */
import type { CityAssets } from './assets';
import { letter, pixelText } from './lettering';
import { readToken } from './palette';
import type { Drawable } from './sprites';
import { wordmarkPixels } from './wordmark-pixels';

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** The arcade machine's top, down to its control panel (rows 0–47): cropped, never scaled. */
const ARCADE_TOP = 48;

/**
 * The 16-Bit Con poster, 80 × 104: the flyer in pixels. The mock's cream in a 1 px paper margin, a 2 px orange
 * band and a 1 px green rule; the wordmark's letters (at this size the daisy would cost them legibility, as in
 * the nav); the arcade machine's top; the date and the venue; a yellow FREE burst stuck on at the top right.
 */
export function conPoster(c: CityAssets): HTMLCanvasElement {
  const [paper, band, rule, ink, burst] = ['--color-paper', '--color-yellow-600', '--color-green-500', '--color-green-900', '--color-yellow-400'].map(
    readToken,
  ) as [string, string, string, string, string];
  const W = 80;
  const H = 104;
  const cv = canvasOf(W, H);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = band;
  ctx.fillRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = rule;
  ctx.fillRect(3, 3, W - 6, H - 6);
  ctx.fillStyle = paper;
  ctx.fillRect(4, 4, W - 8, H - 8);
  const centre = (img: Drawable, y: number) => ctx.drawImage(img, Math.round((W - img.width) / 2), y);
  const mark = wordmarkPixels(66, { daisy: false });
  centre(mark, 7);
  const top = 7 + mark.height + 3;
  ctx.drawImage(c.arcade, 0, 0, c.arcade.width, ARCADE_TOP, Math.round((W - c.arcade.width) / 2), top, c.arcade.width, ARCADE_TOP);
  const date = pixelText(c.letters, 'OCT 3–5', ink, 1);
  centre(date, top + ARCADE_TOP + 5);
  const place = pixelText(c.letters, 'JAVITS NYC', ink, 1);
  centre(place, top + ARCADE_TOP + 5 + date.height + 4);
  // the FREE burst: a pixel star stuck on over the arcade's top right
  const word = pixelText(c.letters, 'FREE', ink, 1);
  const bw = 31;
  const bh = 19;
  const bx = W - bw - 2;
  const by = top + 2;
  const cx = bw / 2;
  const cy = bh / 2;
  ctx.fillStyle = burst;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const dx = (x + 0.5 - cx) / cx;
      const dy = (y + 0.5 - cy) / cy;
      const a = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy);
      // twelve points: the radius swings between 0.78 and 1
      if (r <= 0.78 + 0.22 * Math.abs(Math.cos(6 * a))) ctx.fillRect(bx + x, by + y, 1, 1);
    }
  ctx.drawImage(word, bx + Math.round((bw - word.width) / 2), by + Math.round((bh - word.height) / 2));
  return cv;
}

/**
 * The city ad panel, a box with depth like the booth sign (seen a little from above): a lit top face (Grey 500)
 * and a shaded side (Outline Black) receding up and right, a bevelled frame (Grey 700, lit top and left, shaded
 * bottom and right), the poster behind glass with a faint glint across its corner; on the booth sign's rounded
 * post and plinth. Lit at night.
 */
const AD_POST = 16;
const AD_DEPTH = 4;
export function cityAd(poster: Drawable): HTMLCanvasElement {
  const [k, g7, g5, cw] = ['--color-outline-black', '--color-grey-700', '--color-grey-500', '--color-cloud-white'].map(readToken) as [
    string,
    string,
    string,
    string,
  ];
  const f = 4;
  const d = AD_DEPTH;
  const w = poster.width + 2 * f;
  const h = poster.height + 2 * f;
  const stand = boothSignStand(AD_POST);
  const cv = canvasOf(w + d, d + h + AD_POST);
  const ctx = cv.getContext('2d')!;
  const px = (x: number, y: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 1, 1);
  };
  // the post first, under the box
  ctx.drawImage(stand, Math.round((w - stand.width) / 2), d + h);
  // top face and side
  for (let i = 1; i <= d; i++) {
    ctx.fillStyle = g5;
    ctx.fillRect(i, d - i, w, 1);
    ctx.fillStyle = k;
    ctx.fillRect(w - 1 + i, d - i + 1, 1, h - 1);
  }
  for (let i = 0; i <= d; i++) {
    px(i, d - i, k);
    px(w - 1 + i, d + h - 1 - i, k);
  }
  ctx.fillStyle = k;
  ctx.fillRect(d, 0, w, 1);
  // the front frame with its bevel
  ctx.fillStyle = k;
  ctx.fillRect(0, d, w, h);
  ctx.fillStyle = g7;
  ctx.fillRect(1, d + 1, w - 2, h - 2);
  ctx.fillStyle = g5;
  ctx.fillRect(1, d + 1, w - 2, 1);
  ctx.fillRect(1, d + 1, 1, h - 2);
  ctx.fillStyle = k;
  ctx.fillRect(1, d + h - 2, w - 2, 1);
  ctx.fillRect(w - 2, d + 1, 1, h - 2);
  // the poster, in a dark lip
  ctx.fillStyle = k;
  ctx.fillRect(f - 1, d + f - 1, poster.width + 2, poster.height + 2);
  ctx.drawImage(poster, f, d + f);
  // the glass: a faint glint across the top left corner
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = cw;
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(f + 2 + i, d + f + 14 - i, 1, 1);
    ctx.fillRect(f + 2 + i + 3, d + f + 14 - i, 1, 1);
  }
  ctx.restore();
  return cv;
}

/**
 * The Javits Center's letters: the wordmark, large, in solid Green 900 like the page's own (the nav's), as channel
 * letters with depth — their returns in Green 500, receding up and right like the booth sign's top and side.
 */
const LETTER_DEPTH = 3;
export function javitsLetters(): HTMLCanvasElement {
  const face = wordmarkPixels(200, { ink: { fill: readToken('--color-green-900'), outline: null } });
  const side = wordmarkPixels(200, { ink: { fill: readToken('--color-green-500'), outline: null } });
  const d = LETTER_DEPTH;
  const cv = canvasOf(face.width + d, face.height + d);
  const ctx = cv.getContext('2d')!;
  for (let i = d; i >= 1; i--) ctx.drawImage(side, i, d - i);
  ctx.drawImage(face, 0, d);
  return cv;
}

/**
 * The Vega booth sign, a box with depth in the world's own view (seen a little from above, like the sidewalk):
 * a Leaf Green board in an Outline Black edge with a bevel inside it, a lit top face (Green 500) and a shaded
 * side (Green 900) receding up and right; on it Vega's tiles and daisy over BOOTH 630 → in Daisy White. The
 * post and its plinth are drawn with the sign (boothSignStand).
 *
 * `compact`, for phones, where Sam's bubble and the touch controls leave only the gap between Sam and the A
 * button: the same board at about 75 px instead of 175 — Vega's daisy and VEGA in the small yellow tiles of
 * the same letter set, over BOOTH 630 → at 1 px a cell.
 */
export const BOOTH_DEPTH = 4;
/** The daisy in front of Vega's tiles (assets.ts withDaisy: 17 px, centred on the 29 px tiles). */
const VEGA_DAISY = { x: 0, y: 6, size: 17, gap: 3 } as const;
export function boothSign(c: CityAssets, compact = false): HTMLCanvasElement {
  const [k, g7, g5, g9, dw] = ['--color-outline-black', '--color-green-700', '--color-green-500', '--color-green-900', '--color-daisy-white'].map(
    readToken,
  ) as [string, string, string, string, string];
  const vega = compact ? compactVega(c) : c.vegaSignHorizontal;
  const words = pixelText(c.letters, 'BOOTH 630 →', dw, compact ? 1 : 2);
  const pad = compact ? 5 : 7;
  const lineGap = compact ? 4 : 5;
  const w = Math.max(vega.width, words.width) + 2 * pad;
  const h = vega.height + lineGap + words.height + 2 * pad;
  const d = BOOTH_DEPTH;
  const cv = canvasOf(w + d, h + d);
  const ctx = cv.getContext('2d')!;
  const px = (x: number, y: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 1, 1);
  };
  // the top face and the right side: one row (column) per pixel of depth, each shifted by one
  for (let i = 1; i <= d; i++) {
    ctx.fillStyle = g5;
    ctx.fillRect(i, d - i, w, 1);
    ctx.fillStyle = g9;
    ctx.fillRect(w - 1 + i, d - i + 1, 1, h - 1);
  }
  // their outline: the far edges and the back corner
  for (let i = 0; i <= d; i++) {
    px(i, d - i, k);
    px(w - 1 + i, d - i, k);
    px(w - 1 + i, d + h - 1 - i, k);
  }
  ctx.fillStyle = k;
  ctx.fillRect(d, 0, w, 1);
  ctx.fillRect(w - 1 + d, 0, 1, h);
  // the front: the board in its edge, a bevel inside (lit top and left, shaded bottom and right)
  const fy = d;
  ctx.fillStyle = k;
  ctx.fillRect(0, fy, w, h);
  ctx.fillStyle = g7;
  ctx.fillRect(1, fy + 1, w - 2, h - 2);
  ctx.fillStyle = g5;
  ctx.fillRect(1, fy + 1, w - 2, 1);
  ctx.fillRect(1, fy + 1, 1, h - 2);
  ctx.fillStyle = g9;
  ctx.fillRect(1, fy + h - 2, w - 2, 1);
  ctx.fillRect(w - 2, fy + 1, 1, h - 2);
  ctx.drawImage(vega, Math.floor((w - vega.width) / 2), fy + pad);
  ctx.drawImage(words, Math.floor((w - words.width) / 2), fy + pad + vega.height + lineGap);
  return cv;
}

/** Vega's daisy beside VEGA in the letter set's small yellow tiles (the compact sign's top line). */
function compactVega(c: CityAssets): HTMLCanvasElement {
  const d = VEGA_DAISY;
  const tiles = letter(c.letters, 'VEGA', 'small');
  const cv = canvasOf(d.size + d.gap + tiles.width, Math.max(d.size, tiles.height));
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(c.vegaSignHorizontal, d.x, d.y, d.size, d.size, 0, Math.round((cv.height - d.size) / 2), d.size, d.size);
  ctx.drawImage(tiles, d.size + d.gap, Math.round((cv.height - tiles.height) / 2));
  return cv;
}

/** The sign's post: a rounded steel post (lit edge, body, shade) `height` px tall on a small plinth with a top face. */
export function boothSignStand(height: number): HTMLCanvasElement {
  const [k, g7, g5] = ['--color-outline-black', '--color-grey-700', '--color-grey-500'].map(readToken) as [string, string, string];
  const pw = 6;
  const bw = 16;
  const cv = canvasOf(bw, height);
  const ctx = cv.getContext('2d')!;
  const x0 = (bw - pw) / 2;
  ctx.fillStyle = k;
  ctx.fillRect(x0, 0, pw, height - 4);
  ctx.fillStyle = g7;
  ctx.fillRect(x0 + 1, 0, pw - 2, height - 4);
  ctx.fillStyle = g5;
  ctx.fillRect(x0 + 1, 0, 1, height - 4);
  // the plinth: a top face and a front
  ctx.fillStyle = k;
  ctx.fillRect(0, height - 5, bw, 5);
  ctx.fillStyle = g5;
  ctx.fillRect(1, height - 4, bw - 2, 1);
  ctx.fillStyle = g7;
  ctx.fillRect(1, height - 3, bw - 2, 2);
  return cv;
}

/**
 * The facade without its small "16" plaque and its daisy flag on a pole: the glass behind them restored from
 * the facade's own grid (it repeats every 32 rows down a column; the pole's two columns from the glass 8 px to
 * their left, the same place between the mullions). Made in memory; the file is untouched.
 */
export function facadeWithoutSigns(facade: HTMLImageElement): HTMLCanvasElement {
  const cv = canvasOf(facade.width, facade.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(facade, 0, 0);
  const im = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = im.data;
  const src = new Uint8ClampedArray(d);
  const copy = (x0: number, x1: number, y0: number, y1: number, dx: number, dy: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const to = (y * cv.width + x) * 4;
        const from = ((y + dy) * cv.width + x + dx) * 4;
        for (let k = 0; k < 4; k++) d[to + k] = src[from + k]!;
      }
  };
  copy(495, 534, 526, 554, 0, 32); // the 16 plaque
  copy(945, 996, 526, 554, 0, 32); // the daisy flag
  copy(956, 958, 526, facade.height, -8, 0); // its pole
  copy(584, 598, 622, 640, 0, 32); // the old flat canopy's ends, beside the new entrance (signage: facadeWithDepth)
  copy(862, 876, 622, 640, 0, 32);
  ctx.putImageData(im, 0, 0);
  return cv;
}

/**
 * Depth for the facade, at load (new art, drawn for this page): the glass at street level is a step darker, in the
 * building's shade (Blue 300 → 500, 500 → 700: one solid band, never a dither; the grid and its glints kept),
 * and a soft shadow grounds its base; the entrance is Vega's own lobby front (the careers game's entrance
 * doors, closed, halved and two merged: javits-doors) over the flat doors, centred on the entrance column,
 * under a canopy with depth.
 */
const FACADE_GLASS_STEP: Record<string, string> = { '141,202,255': '93,179,255', '93,179,255': '33,137,229' };
const FACADE_SHADE_ROWS = 100;
/** The entrance column of the facade, and the doors strip's closed frame. */
const FACADE_ENTRANCE = 730;
/** The entrance's threshold sits on the plaza's surface: 4 px above the facade's base (6 px below F), as props stand at F + 2. */
const DOORS_SINK = 4;
export function facadeWithDepth(facade: HTMLCanvasElement, doors: HTMLImageElement): HTMLCanvasElement {
  const ctx = facade.getContext('2d', { willReadFrequently: true })!;
  const W = facade.width;
  const H = facade.height;
  const im = ctx.getImageData(0, 0, W, H);
  const d = im.data;
  const key = (i: number) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
  const set = (i: number, rgb: string) => {
    const [r, g, b] = rgb.split(',').map(Number);
    d[i] = r!;
    d[i + 1] = g!;
    d[i + 2] = b!;
  };
  // the glass at street level, in the building's shade: one step darker in its lowest SHADE_ROWS (a solid band)
  for (let y = H - FACADE_SHADE_ROWS; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const k = key(i);
      if (d[i + 3]! > 0 && k in FACADE_GLASS_STEP) set(i, FACADE_GLASS_STEP[k]!);
    }
  ctx.putImageData(im, 0, 0);
  const k = readToken('--color-outline-black');
  // a soft shadow along the base
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = k;
  ctx.fillRect(0, H - 4, W, 4);
  ctx.restore();
  // the entrance: Vega's lobby front, closed, standing on the facade's base
  const fw = doors.width;
  const dx = Math.round(FACADE_ENTRANCE - fw / 2);
  const dy = H - DOORS_SINK - doors.height;
  ctx.drawImage(doors, dx, dy);
  // the canopy over it: a Cloud White slab a little wider than the lobby front, resting on its top frame, with
  // a lit top face and a side receding up and right like the signs, a dark underside and a shadow on the glass
  const [cw, dw, g5, g7] = ['--color-cloud-white', '--color-daisy-white', '--color-grey-500', '--color-grey-700'].map(readToken) as [
    string,
    string,
    string,
    string,
  ];
  const C = { x0: dx - 10, x1: dx + fw + 10, bottom: dy, h: 8, depth: 4 };
  const top = C.bottom - C.h;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = k;
  ctx.fillRect(dx + 2, C.bottom, fw - 4, 5);
  ctx.restore();
  for (let i = 1; i <= C.depth; i++) {
    ctx.fillStyle = dw;
    ctx.fillRect(C.x0 + i, top - i, C.x1 - C.x0, 1);
    ctx.fillStyle = g7;
    ctx.fillRect(C.x1 - 1 + i, top - i + 1, 1, C.h - 1);
  }
  ctx.fillStyle = g5;
  ctx.fillRect(C.x0 + C.depth, top - C.depth - 1, C.x1 - C.x0, 1);
  for (let i = 0; i <= C.depth; i++) {
    ctx.fillRect(C.x0 + i, top - i - 1, 1, 1);
    ctx.fillRect(C.x1 + i, top - i - 1, 1, 1);
  }
  ctx.fillStyle = g5;
  ctx.fillRect(C.x0, top, C.x1 - C.x0, C.h);
  ctx.fillStyle = cw;
  ctx.fillRect(C.x0 + 1, top, C.x1 - C.x0 - 2, C.h - 2);
  ctx.fillStyle = k;
  ctx.fillRect(C.x0, C.bottom - 1, C.x1 - C.x0, 1);
  return facade;
}
