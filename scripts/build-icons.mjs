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
 * No dependencies: PNG is read and written with node:zlib. Run with `npm run icons`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { SAM_BRAND_MAP } from '../src/game/palette.ts';

const root = new URL('../', import.meta.url);
const SPRITE = 'public/sprites/sam/portrait-sam.png';
const SKY = '#8DCAFF';
const GRID = 64;
const RADIUS = 12; // on the 64 grid
const ART_X = 11;
const ART_Y = 16;

// ── PNG in / out ──────────────────────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let off = 8;
  let ihdr;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = ihdr.subarray(8, 13);
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, type ${colorType}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, data: out };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size;
    e[1] = size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

// ── The picture ───────────────────────────────────────────────────────────────────────

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Sam, recoloured with the page's map: a GRID × GRID array of '#RRGGBB' (or null = sky). */
function samOnGrid() {
  const sprite = decodePng(readFileSync(new URL(SPRITE, root)));
  const grid = Array.from({ length: GRID * GRID }, () => null);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const i = (y * sprite.w + x) * 4;
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
  return { w: GRID, h: GRID, data };
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
  return { w: size, h: size, data };
}

/** Cut the rounded corners at the output resolution, so the curve is smooth at every size. */
function roundCorners(img) {
  const r = (RADIUS / GRID) * img.w;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      img.data[(y * img.w + x) * 4 + 3] = Math.round(255 * cornerCoverage(x, y, img.w, r));
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
write('public/favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, png: encodePng(roundCorners(resample(master, size))) }))));
write('public/apple-touch-icon.png', encodePng(resample(master, 180)));
