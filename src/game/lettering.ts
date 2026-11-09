/**
 * Signage lettering: a NEW 5×7 pixel letter set in the vega-sign yellow-tile style —
 * Florets Yellow tiles with an Outline Black edge and letters, a Yellow 100 / Yellow 500 bevel —
 * plus a neon set (Outline Black tiles, a Yellow 600 edge, Yellow 100 letters) for the night.
 * Each set comes small (1 px per glyph cell, 9 × 11 tiles) and large (2 px per cell, 14 × 18).
 * Strings are composed from the sheet once at load; nothing is resampled.
 */
import type { Drawable } from './sprites';

export const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-·';
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

/** Lines centred on one backing plate: Outline Black with a Grey 700 frame (a billboard, a marquee). */
export function board(lines: HTMLCanvasElement[], opts: { pad?: number; frame?: string; fill: string; outline: string; lineGap?: number }): HTMLCanvasElement {
  const pad = opts.pad ?? 3;
  const lineGap = opts.lineGap ?? 2;
  const inner = Math.max(...lines.map((l) => l.width));
  const innerH = lines.reduce((s, l) => s + l.height, 0) + lineGap * (lines.length - 1);
  const border = opts.frame ? 3 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = inner + 2 * (pad + border);
  canvas.height = innerH + 2 * (pad + border);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.outline;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (opts.frame) {
    ctx.fillStyle = opts.frame;
    ctx.fillRect(1, 1, canvas.width - 2, canvas.height - 2);
  }
  ctx.fillStyle = opts.fill;
  ctx.fillRect(border, border, canvas.width - 2 * border, canvas.height - 2 * border);
  let y = border + pad;
  for (const l of lines) {
    ctx.drawImage(l, Math.floor((canvas.width - l.width) / 2), y);
    y += l.height + lineGap;
  }
  return canvas;
}
