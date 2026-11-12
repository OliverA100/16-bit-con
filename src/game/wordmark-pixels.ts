/**
 * The 16-Bit Con wordmark as pixel art for the world's signs and posters: the same paths as the page's
 * wordmark (src/data/wordmark.ts), filled at a whole-pixel width and thresholded to hard pixels (no
 * smoothing), then outlined: Yellow 600 letters in a 1 px Green 900 outline, as printed on the flyer. Made
 * once at load per size; never resampled at draw.
 */
import { WORDMARK_DAISY, WORDMARK_DAISY_AT, WORDMARK_LETTERS, WORDMARK_VIEW, WORDMARK_VIEW_LETTERS } from '../data/wordmark';
import { readToken } from './palette';

interface WordmarkInk {
  fill: string;
  /** null: no outline (the page's own look, solid Green 900). */
  outline: string | null;
}

/**
 * The wordmark `width` px wide (the outline adds a pixel each side), with or without its daisy. A pixel is
 * the mark's where at least half of it is covered.
 */
export function wordmarkPixels(width: number, opts: { daisy?: boolean; ink?: WordmarkInk } = {}): HTMLCanvasElement {
  const daisy = opts.daisy ?? true;
  const ink = opts.ink ?? { fill: readToken('--color-yellow-600'), outline: readToken('--color-green-900') };
  const view = daisy ? WORDMARK_VIEW : WORDMARK_VIEW_LETTERS;
  const s = width / view.w;
  const w = Math.round(view.w * s);
  const h = Math.round(view.h * s);
  // the mark's coverage, smoothed, then thresholded to whole pixels
  const cov = document.createElement('canvas');
  cov.width = w;
  cov.height = h;
  const cctx = cov.getContext('2d', { willReadFrequently: true })!;
  cctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  cctx.fillStyle = '#000';
  cctx.fill(new Path2D(WORDMARK_LETTERS), 'evenodd');
  if (daisy) {
    cctx.translate(WORDMARK_DAISY_AT.x, WORDMARK_DAISY_AT.y);
    cctx.fill(new Path2D(WORDMARK_DAISY), 'evenodd');
  }
  const a = cctx.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3]! >= 128;
  // a pixel of margin each side for the outline
  const out = document.createElement('canvas');
  out.width = w + 2;
  out.height = h + 2;
  const octx = out.getContext('2d')!;
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++) {
      let colour: string | null = null;
      if (on(x, y)) colour = ink.fill;
      else if (ink.outline)
        for (let dy = -1; dy <= 1 && !colour; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (on(x + dx, y + dy)) {
              colour = ink.outline;
              break;
            }
      if (!colour) continue;
      octx.fillStyle = colour;
      octx.fillRect(x + 1, y + 1, 1, 1);
    }
  return out;
}
