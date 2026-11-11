/**
 * Builds the site icons from Sam's portrait sprite:
 *   public/favicon.svg          rounded square around the 64 px master (smooth below 64 px, pixelated above)
 *   public/favicon.ico          16, 32, 48 px (PNG entries), for browsers without SVG favicons
 *   public/apple-touch-icon.png 180 px, square, sky to every edge (iOS rounds it itself)
 *
 * Master: a 64 × 64 grid, flat Sky, Sam at 1 art px per grid px with his left edge at x 11 and
 * his top at y 16. His last row (the white outline under his body) falls below the grid on
 * purpose, so his body runs straight into the bottom edge. Corners: radius 12 on the 64 grid.
 * Sizes above 64 are nearest-neighbour from the master; sizes below are box-averaged.
 *
 * No dependencies (PNG via scripts/lib/png.mjs on node:zlib). Run with `npm run icons`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SAM_BRAND_MAP } from '../src/game/palette.ts';
import { decodePng, encodeIco, encodePng } from './lib/png.mjs';

const root = new URL('../', import.meta.url);
const SPRITE = 'public/sprites/sam/portrait-sam.png';
const SKY = '#8DCAFF';
const GRID = 64;
const RADIUS = 12; // on the 64 grid
const ART_X = 11;
const ART_Y = 16;

// ── The picture ───────────────────────────────────────────────────────────────────────

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Sam, recoloured with the page's map: a GRID × GRID array of '#RRGGBB' (or null = sky). */
function samOnGrid() {
  const sprite = decodePng(readFileSync(new URL(SPRITE, root)));
  const grid = Array.from({ length: GRID * GRID }, () => null);
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const i = (y * sprite.width + x) * 4;
      const a = sprite.data[i + 3];
      if (a === 0) continue;
      if (a !== 255) throw new Error(`semi-transparent pixel at ${x},${y}: the icon expects hard pixel art`);
      const gx = ART_X + x;
      const gy = ART_Y + y;
      if (gx >= GRID || gy >= GRID) continue; // row 48, the outline under his body, falls off the grid
      const c = hex(sprite.data[i], sprite.data[i + 1], sprite.data[i + 2]);
      grid[gy * GRID + gx] = SAM_BRAND_MAP[c] ?? c;
    }
  }
  return grid;
}

/** Fraction of the device pixel (px, py) inside a rounded square of side `size` and corner `r`. */
function cornerCoverage(px, py, size, r, ss = 16) {
  let inside = 0;
  for (let sy = 0; sy < ss; sy++) {
    for (let sx = 0; sx < ss; sx++) {
      const x = px + (sx + 0.5) / ss;
      const y = py + (sy + 0.5) / ss;
      const dx = Math.max(r - x, 0, x - (size - r));
      const dy = Math.max(r - y, 0, y - (size - r));
      if (dx * dx + dy * dy <= r * r) inside++;
    }
  }
  return inside / (ss * ss);
}

/** The square master at 1:1, sky behind Sam, fully opaque. */
function masterRgba(grid) {
  const data = Buffer.alloc(GRID * GRID * 4);
  grid.forEach((c, i) => {
    data.set([...rgb(c ?? SKY), 255], i * 4);
  });
  return { width: GRID, height: GRID, data };
}

/** Nearest-neighbour up (size ≥ GRID) or area-average down (size < GRID), still square and opaque. */
function resample(master, size) {
  const data = Buffer.alloc(size * size * 4);
  const k = GRID / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (size >= GRID) {
        const sx = Math.min(GRID - 1, Math.floor((x + 0.5) * k));
        const sy = Math.min(GRID - 1, Math.floor((y + 0.5) * k));
        master.data.copy(data, o, (sy * GRID + sx) * 4, (sy * GRID + sx) * 4 + 4);
        continue;
      }
      // Box filter over the source footprint [x·k, (x+1)·k), weighting partial source pixels.
      const acc = [0, 0, 0];
      let wsum = 0;
      const x0 = x * k;
      const x1 = (x + 1) * k;
      const y0 = y * k;
      const y1 = (y + 1) * k;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const i = (sy * GRID + sx) * 4;
          for (let ch = 0; ch < 3; ch++) acc[ch] += master.data[i + ch] * wx * wy;
          wsum += wx * wy;
        }
      }
      data.set([...acc.map((v) => Math.round(v / wsum)), 255], o);
    }
  }
  return { width: size, height: size, data };
}

/** Cut the rounded corners at the output resolution, so the curve is smooth at every size. */
function roundCorners(img) {
  const r = (RADIUS / GRID) * img.width;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      img.data[(y * img.width + x) * 4 + 3] = Math.round(255 * cornerCoverage(x, y, img.width, r));
    }
  }
  return img;
}

/**
 * The square master as an embedded PNG, clipped to the rounded square. Not one rect per pixel:
 * the browser antialiases each shape on its own, so at 16 px (4 × 4 art px per device px) every
 * colour seam leaks whatever lies underneath and the goggles go muddy. A bitmap is downscaled as
 * a whole (mipmaps: 64 → 16 is the same 4 × 4 average as the .ico). Above 64 px the SVG's own
 * viewport matches the media query and the pixels are drawn nearest-neighbour, crisp.
 */
function svgFor(master) {
  const png = encodePng(master).toString('base64');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="${GRID}" height="${GRID}">`,
    `<style>@media (min-width: ${GRID + 1}px) { image { image-rendering: pixelated; } }</style>`,
    `<clipPath id="r"><rect width="${GRID}" height="${GRID}" rx="${RADIUS}"/></clipPath>`,
    `<image clip-path="url(#r)" width="${GRID}" height="${GRID}" href="data:image/png;base64,${png}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

// ── Build ─────────────────────────────────────────────────────────────────────────────

const grid = samOnGrid();
const bottom = grid.slice((GRID - 1) * GRID);
// The side outlines reach the bottom edge as single white pixels; a white run there would be the cut-off outline row.
if (bottom.some((c, x) => c === '#FFFFFF' && bottom[x + 1] === '#FFFFFF')) throw new Error('a white line on the bottom row of the icon');

const master = masterRgba(grid);
const write = (path, buf) => {
  writeFileSync(new URL(path, root), buf);
  console.log(`${path}  ${buf.length} B`);
};

write('public/favicon.svg', svgFor(master));
write('public/favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, png: encodePng(roundCorners(resample(master, size)), { indexed: false }) }))));
write('public/apple-touch-icon.png', encodePng(resample(master, 180)));
