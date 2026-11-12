/**
 * Builds public/og.png (1200 × 630), the social image: the morning field under a flat sky, with
 * the date line, the 16-Bit Con wordmark with its daisy, and the address, centred in the sky.
 *
 * The pixel art is composed here on a 600 × 315 art grid and doubled nearest-neighbour. The
 * recolour and the hills' seam patch are the page's own code (remap, patchTileSeam from
 * src/game/palette.ts), run against a minimal stand-in canvas. Headless Chrome then sets the type
 * in Geist Mono and draws the wordmark from src/data/wordmark.ts over that picture.
 * Text antialiasing is snapped to 32 steps between sky and ink so the PNG stays indexed and small.
 *
 * Run with `npm run og`. Needs Google Chrome (or set CHROME to a Chromium binary).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { screenshot } from './lib/chrome.mjs';
import { blank, decodePng, encodePng } from './lib/png.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const text = (path) => read(path).toString('utf8');

// ── A canvas just big enough for palette.ts (drawImage 1:1, image data, fillRect) ───────

function parseColor(s) {
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const rgb = /^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s);
  if (rgb) return rgb.slice(1, 4).map(Number);
  throw new Error(`unsupported fillStyle ${s}`);
}

/** Source-over, whole pixels, no scaling. */
function blit(src, dst, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height || sy + y < 0 || sy + y >= src.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width || sx + x < 0 || sx + x >= src.width) continue;
      const i = ((sy + y) * src.width + sx + x) * 4;
      const o = (ty * dst.width + tx) * 4;
      const a = src.data[i + 3] / 255;
      if (a === 0) continue;
      const da = dst.data[o + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) dst.data[o + c] = Math.round((src.data[i + c] * a + dst.data[o + c] * da * (1 - a)) / oa);
      dst.data[o + 3] = Math.round(oa * 255);
    }
  }
}

class Context2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.imageSmoothingEnabled = false;
  }
  drawImage(src, ...a) {
    if (a.length === 2) return blit(src, this.canvas, 0, 0, src.width, src.height, Math.round(a[0]), Math.round(a[1]));
    if (a.length === 8 && a[2] === a[6] && a[3] === a[7]) return blit(src, this.canvas, a[0], a[1], a[2], a[3], a[4], a[5]);
    throw new Error('stand-in canvas: only 1:1 drawImage');
  }
  getImageData(x, y, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++)
      data.set(this.canvas.data.subarray(((y + r) * this.canvas.width + x) * 4, ((y + r) * this.canvas.width + x + w) * 4), r * w * 4);
    return { width: w, height: h, data };
  }
  putImageData(img, x, y) {
    for (let r = 0; r < img.height; r++)
      this.canvas.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * this.canvas.width + x) * 4);
  }
  fillRect(x, y, w, h) {
    const [r, g, b] = parseColor(this.fillStyle);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.canvas.data.set([r, g, b, 255], (j * this.canvas.width + i) * 4);
  }
}

class Canvas {
  #w = 0;
  #h = 0;
  data = Buffer.alloc(0);
  get width() {
    return this.#w;
  }
  set width(v) {
    this.#w = v;
    this.data = Buffer.alloc(this.#w * this.#h * 4);
  }
  get height() {
    return this.#h;
  }
  set height(v) {
    this.#h = v;
    this.data = Buffer.alloc(this.#w * this.#h * 4);
  }
  getContext() {
    return new Context2D(this);
  }
}

globalThis.document = { createElement: () => new Canvas() };
const { remap, patchTileSeam, SAM_BRAND_MAP } = await import('../src/game/palette.ts');

// ── Tokens and constants, read from the source so they cannot drift ───────────────────

const tokens = text('src/styles/tokens.css');
function token(name) {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`token ${name} not found`);
  const v = m[1].trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(ref[1]) : v.toUpperCase();
}
const SKY = token('--sky');
const INK = token('--wordmark'); // the nav wordmark's colour
const FOOT_SINK = Number(/export const FOOT_SINK = (\d+);/.exec(text('src/game/sam.ts'))?.[1]);
if (!Number.isFinite(FOOT_SINK)) throw new Error('FOOT_SINK not found in src/game/sam.ts');

const W = 600; // art grid
const H = 315;
const SCALE = 2;
const GROUND_Y = 200; // the strip's top; all 115 rows reach the bottom edge
const GROUND_COL = 300; // columns 300–899 of the 960 strip: the big rock on the right
const GRASS_ROW = 44; // the strip's grass surface
const SURFACE = GROUND_Y + GRASS_ROW;
const HILLS_COL = 300;
const MESA_ABOVE = 70; // the mesa's top, in rows above the grass surface
const SAM_X = 372; // left edge of his 60 px cell
const SAM_CELL = 60;
const CLOUDS = [
  ['public/sprites/world/cloud-h_63x15.png', 24, 22], // top left
  ['public/sprites/world/cloud-g_94x25.png', 512, 92], // right
  ['public/sprites/world/cloud-a_171x49.png', -80, 96], // left, off the edge
];

// ── The art ───────────────────────────────────────────────────────────────────────────

const png = (path) => decodePng(read(path));
const art = new Canvas();
art.width = W;
art.height = H;
const ctx = art.getContext();
ctx.fillStyle = SKY;
ctx.fillRect(0, 0, W, H);

for (const [file, x, y] of CLOUDS) ctx.drawImage(png(file), x, y);

const hills = patchTileSeam(png('public/sprites/world/bg-green-hills_509x200.png'));
let mesaTop = hills.height;
for (let i = 3; i < hills.data.length; i += 4) if (hills.data[i] > 0) mesaTop = Math.min(mesaTop, Math.floor(i / 4 / hills.width));
const hillsY = SURFACE - MESA_ABOVE - mesaTop;
for (let x = -HILLS_COL; x < W; x += hills.width) ctx.drawImage(hills, x, hillsY);

const ground = png('public/sprites/world/ground-grass-rocks-strip_960x115.png');
ctx.drawImage(ground, GROUND_COL, 0, W, ground.height, 0, GROUND_Y, W, ground.height);

const idle = remap(png('public/sprites/sam/idle.png'), SAM_BRAND_MAP);
ctx.drawImage(idle, 0, 0, SAM_CELL, SAM_CELL, SAM_X, SURFACE - SAM_CELL + FOOT_SINK, SAM_CELL, SAM_CELL);

const big = blank(W * SCALE, H * SCALE);
for (let y = 0; y < big.height; y++) {
  for (let x = 0; x < big.width; x++)
    art.data.copy(big.data, (y * big.width + x) * 4, (((y / SCALE) | 0) * W + ((x / SCALE) | 0)) * 4, (((y / SCALE) | 0) * W + ((x / SCALE) | 0)) * 4 + 4);
}

// ── The type, set by Chrome over the art ──────────────────────────────────────────────

const { WORDMARK_LETTERS, WORDMARK_DAISY, WORDMARK_DAISY_AT, WORDMARK_VIEW: view } = await import('../src/data/wordmark.ts');
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" fill="currentColor"><path fill-rule="evenodd" d="${WORDMARK_LETTERS}"/><path fill-rule="evenodd" transform="translate(${WORDMARK_DAISY_AT.x} ${WORDMARK_DAISY_AT.y})" d="${WORDMARK_DAISY}"/></svg>`;
const WM_W = 760;
const WM_TOP = 100;
const URL_TOP = Math.round(WM_TOP + (WM_W * view.h) / view.w + 26);
/** Chrome sets Geist Mono 2 px higher in its line box than the mock's layout did; this puts the ink where the mock has it. */
const MONO_NUDGE = 2;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Geist Mono'; src: url(data:font/woff2;base64,${b64(read('public/fonts/GeistMono-Variable.woff2'))}) format('woff2'); font-weight: 100 900; font-display: block; }
html, body { margin: 0; width: ${W * SCALE}px; height: ${H * SCALE}px; overflow: hidden; }
body { position: relative; color: ${INK}; background: url(data:image/png;base64,${b64(encodePng(big))}) 0 0 / ${W * SCALE}px ${H * SCALE}px no-repeat; }
p { position: absolute; left: 0; width: 100%; margin: 0; text-align: center; font: 500 26px/normal 'Geist Mono'; }
.date { top: ${48 + MONO_NUDGE}px; }
.url { top: ${URL_TOP + MONO_NUDGE}px; }
.wm { position: absolute; left: ${(W * SCALE - WM_W) / 2}px; top: ${WM_TOP}px; width: ${WM_W}px; }
.wm svg { display: block; width: 100%; height: auto; }
</style></head><body>
<p class="date">October 3–5, 2026 · Javits Center, New York</p>
<div class="wm">${wordmark}</div>
<p class="url">vega.io/16-bit-con</p>
</body></html>`;

const shot = screenshot(html, W * SCALE, H * SCALE);

// ── Check and snap: text only on sky, its antialiasing on 32 steps from sky to ink ─────

const sky = parseColor(SKY);
const ink = parseColor(INK);
const axis = [0, 1, 2].reduce((a, c) => (Math.abs(ink[c] - sky[c]) > Math.abs(ink[a] - sky[a]) ? c : a), 0);
let textPx = 0;
let textBottom = 0;
for (let i = 0; i < shot.data.length; i += 4) {
  if (shot.data.readUInt32BE(i) === big.data.readUInt32BE(i)) continue;
  const p = i / 4;
  const [x, y] = [p % shot.width, Math.floor(p / shot.width)];
  if (big.data.readUInt32BE(i) !== ((sky[0] << 24) | (sky[1] << 16) | (sky[2] << 8) | 255) >>> 0) {
    throw new Error(`text over the art at ${x},${y}: it must stay in the sky`);
  }
  const t = Math.round(((shot.data[i + axis] - sky[axis]) / (ink[axis] - sky[axis])) * 32) / 32;
  if (t < 0 || t > 1) throw new Error(`pixel ${x},${y} is not between sky and ink`);
  for (let c = 0; c < 3; c++) shot.data[i + c] = Math.round(sky[c] + (ink[c] - sky[c]) * t);
  shot.data[i + 3] = 255;
  textPx++;
  textBottom = Math.max(textBottom, y);
}
if (textPx < 10000) throw new Error(`only ${textPx} text pixels: did the font or the wordmark fail to draw?`);

const out = encodePng(shot);
writeFileSync(new URL('public/og.png', root), out);
console.log(
  `public/og.png  ${shot.width}×${shot.height}  ${out.length} B  (text ${textPx} px, lowest at y ${textBottom}; hills from y ${hillsY * SCALE + mesaTop * SCALE})`,
);
