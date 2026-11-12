/**
 * How every drifting cloud on the site finds its place: in the game's sky, in the Schedule's scenes and the
 * footer's field, in the page's sky after the breakout, and on the 404. Each scene keeps its own clouds, speeds
 * and clock; where a cloud is at a given moment is worked out here, one way.
 */
import { wrap } from './math';

/** To a whole device pixel, at `k` device px per unit: a cloud glides, but never lands between pixels. */
export const snap = (v: number, k: number) => Math.round(v * k) / k;

/** To and fro over `len`, never wrapping: 0 → len → 0 → … */
export const pingpong = (x: number, len: number) => {
  if (len <= 0) return 0;
  const m = wrap(x, 2 * len);
  return m <= len ? m : 2 * len - m;
};

/**
 * Round and round: the left edge of a cloud `w` wide whose right edge has drifted to `right`, on a track
 * `period` long that starts at `lo`. It leaves at one end and comes back in at the other, whole.
 */
export const around = (right: number, lo: number, w: number, period: number) => lo + wrap(right - lo, period) - w;
