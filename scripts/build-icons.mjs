/**
 * Builds the site icons from the wordmark's "16":
 *   public/favicon.svg          the vector icon: ink "16" on Florets Yellow, corners rounded at 19 of 100
 *   public/favicon.ico          16, 32, 48 px rendered from that SVG, for browsers without SVG favicons
 *   public/apple-touch-icon.png 180 px, the same picture square, yellow to every edge (iOS rounds it itself)
 *
 * The glyphs are the first three subpaths of the wordmark's letters in src/data/wordmark.ts
 * (the 1, the 6 and the 6's hole), copied as they are. They are scaled so the "16" spans 72 % of the
 * icon, centred, then nudged 1.5 units right so the slant reads as centred. Colours are the tokens.
 *
 * Run with `npm run icons` after the wordmark changes. Needs Google Chrome (or set CHROME).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { crop, screenshot } from './lib/chrome.mjs';
import { encodeIco, encodePng } from './lib/png.mjs';

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');

const tokens = text('src/styles/tokens.css');
function token(name) {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`token ${name} not found`);
  const v = m[1].trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(ref[1]) : v.toUpperCase();
}
const YELLOW = token('--color-florets-yellow');
const INK = token('--wordmark'); // the nav wordmark's colour

const SIZE = 100;
const RADIUS = 19;
const WIDTH_SHARE = 0.72;
const NUDGE_X = 1.5;

// ── The "16" from the wordmark ────────────────────────────────────────────────────────

const { WORDMARK_LETTERS } = await import('../src/data/wordmark.ts');
const subpaths = WORDMARK_LETTERS.match(/M[^M]*/g);
if (!subpaths || subpaths.length < 3) throw new Error('wordmark path has fewer than three subpaths');
const sixteen = subpaths.slice(0, 3).join('').trim();
if (/[^MLCZ\d\s.,-]/.test(sixteen)) throw new Error('unexpected path command: the bounds below read absolute M/L/C/Z only');

// Bounds over every coordinate pair, control points included.
const nums = sixteen.match(/-?\d*\.?\d+/g).map(Number);
const xs = nums.filter((_, i) => i % 2 === 0);
const ys = nums.filter((_, i) => i % 2 === 1);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const scale = (SIZE * WIDTH_SHARE) / (x1 - x0);
const tx = (SIZE - (x1 - x0) * scale) / 2 - x0 * scale + NUDGE_X;
const ty = (SIZE - (y1 - y0) * scale) / 2 - y0 * scale;
const r4 = (n) => +n.toFixed(4);

const icon = (radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">` +
  `<rect width="${SIZE}" height="${SIZE}"${radius ? ` rx="${radius}"` : ''} fill="${YELLOW}"/>` +
  `<path fill-rule="evenodd" fill="${INK}" transform="translate(${r4(tx)} ${r4(ty)}) scale(${r4(scale)})" d="${sixteen}"/>` +
  `</svg>\n`;

// ── Raster sizes, drawn by Chrome from the SVG itself ─────────────────────────────────

const rounded = icon(RADIUS);
const square = icon(0);
const uri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const SIZES = [16, 32, 48];
const SHEET_W = 180 + SIZES.reduce((a, s) => a + s + 10, 10);
const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{position:absolute;top:0;display:block}</style></head><body>
<img src="${uri(square)}" style="left:0;width:180px;height:180px">
${SIZES.map((s, i) => `<img src="${uri(rounded)}" style="left:${190 + SIZES.slice(0, i).reduce((a, t) => a + t + 10, 0)}px;width:${s}px;height:${s}px">`).join('\n')}
</body></html>`;
const sheet = screenshot(html, SHEET_W, 180, { transparent: true });
const apple = crop(sheet, 0, 0, 180, 180);
const icoEntries = SIZES.map((s, i) => ({
  size: s,
  png: encodePng(crop(sheet, 190 + SIZES.slice(0, i).reduce((a, t) => a + t + 10, 0), 0, s, s), { indexed: false }),
}));

for (let i = 3; i < apple.data.length; i += 4) if (apple.data[i] !== 255) throw new Error('apple-touch-icon must be opaque to every edge');
const corner = icoEntries[2]; // the 48: its corner pixel must be clear
if (crop(sheet, 190 + 16 + 10 + 32 + 10, 0, 48, 48).data[3] !== 0) throw new Error(`the ${corner.size} px icon has no transparent corner`);

const write = (path, buf) => {
  writeFileSync(new URL(path, root), buf);
  console.log(`${path}  ${buf.length} B`);
};
write('public/favicon.svg', rounded);
write('public/favicon.ico', encodeIco(icoEntries));
write('public/apple-touch-icon.png', encodePng(apple));
console.log(`"16": scale ${r4(scale)}, translate ${r4(tx)} ${r4(ty)}`);
