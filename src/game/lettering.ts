/**
 * Signage lettering: a NEW 5×7 pixel letter set in the vega-sign yellow-tile style —
 * Florets Yellow tiles with an Outline Black edge and letters, a Yellow 100 / Yellow 500 bevel —
 * plus a neon set (Outline Black tiles, a Yellow 600 edge, Yellow 100 letters) for the night.
 * Each set comes small (1 px per glyph cell, 9 × 11 tiles) and large (2 px per cell, 14 × 18).
 * Strings are composed from the sheet once at load; nothing is resampled.
 */
import type { Drawable } from './sprites';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-·';
export type Size = 'small' | 'large';
const ROWS = {
  small: { day: 0, neon: 29, w: 9, h: 11, space: 4 },
  large: { day: 11, neon: 40, w: 14, h: 18, space: 7 },
} as const;
const GAP = 1;

/** One line of lettering as its own canvas. Unknown characters are skipped; a space is a gap. */
export function letter(sheet: Drawable, text: string, size: Size = 'large', neon = false): HTMLCanvasElement {
  const r = ROWS[size];
  const chars = [...text.toUpperCase().replace('–', '-')];
  let w = 0;
  for (const ch of chars) w += (ch === ' ' ? r.space : CHARS.includes(ch) ? r.w : 0) + GAP;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w - GAP);
  canvas.height = r.h;
  const ctx = canvas.getContext('2d')!;
  let x = 0;
  for (const ch of chars) {
    if (ch === ' ') {
      x += r.space + GAP;
      continue;
    }
    const i = CHARS.indexOf(ch);
    if (i < 0) continue;
    ctx.drawImage(sheet, i * r.w, neon ? r.neon : r.day, r.w, r.h, x, 0, r.w, r.h);
    x += r.w + GAP;
  }
  return canvas;
}

/** Glyphs the sheet does not have, drawn here (5 × 7): the arrow for wayfinding. */
const EXTRA: Record<string, string[]> = {
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
};

/**
 * Plain pixel type: the sheet's 5 × 7 letter shapes (plus EXTRA) in one colour, `scale` px a cell, one cell
 * between letters and three for a space. For small print on posters and signs.
 */
export function pixelText(sheet: Drawable, text: string, colour: string, scale = 1): HTMLCanvasElement {
  const g = glyphsOf(sheet);
  const chars = [...text.toUpperCase().replace('–', '-')];
  const cols = chars.reduce((n, ch, i) => n + (ch === ' ' ? 3 : 5) + (i ? 1 : 0), 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, cols * scale);
  canvas.height = 7 * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colour;
  let x = 0;
  chars.forEach((ch, i) => {
    if (i) x++;
    if (ch === ' ') {
      x += 3;
      return;
    }
    const extra = EXTRA[ch];
    const cells = extra ? Uint8Array.from(extra.join(''), (c) => (c === '#' ? 1 : 0)) : g.get(ch);
    if (cells) for (let y = 0; y < 7; y++) for (let cx = 0; cx < 5; cx++) if (cells[y * 5 + cx]) ctx.fillRect((x + cx) * scale, y * scale, scale, scale);
    x += 5;
  });
  return canvas;
}

/** The 5×7 glyphs as on/off cells, read once from the small day row of the letter sheet. */
let glyphs: Map<string, Uint8Array> | null = null;
function glyphsOf(sheet: Drawable): Map<string, Uint8Array> {
  if (glyphs) return glyphs;
  const c = document.createElement('canvas');
  c.width = CHARS.length * ROWS.small.w;
  c.height = ROWS.small.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  glyphs = new Map();
  [...CHARS].forEach((ch, i) => {
    const cells = new Uint8Array(35);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        const j = ((y + 2) * c.width + i * ROWS.small.w + x + 2) * 4;
        cells[y * 5 + x] = d[j + 3]! > 0 && d[j]! < 64 ? 1 : 0; // Outline Black letter pixels
      }
    }
    glyphs!.set(ch, cells);
  });
  return glyphs;
}
