/**
 * The page timeline. The pin is one scroll length: first the enter segment — the camera
 * dives from the monitor at rest into its screen — then the world, the run as before. One coordinate
 * covers both: world t below 0 is the enter segment (from −D_E / D_W at the top of the page), 0–1 the
 * run. Every visual of the enter segment is a pure function of its progress p (0–1), so scrolling back
 * up plays it backwards. Free of three.js: the page and the monitor both read it.
 */
import { pinnedDistance } from './timeline';

/** The scroll lengths, px: the enter segment (one viewport), the run (14 viewports, 9 000–15 000 px). */
export function scrollLengths(viewportH: number): { DE: number; DW: number; D: number } {
  const DE = Math.round(viewportH);
  const DW = pinnedDistance(viewportH);
  return { DE, DW, D: DE + DW };
}

/** The enter segment's schedule, in p. */
export const ENTER = {
  /** The eyebrow, the wordmark, the tagline and PRESS START go. */
  copyOut: [0, 0.12],
  /** The parallax turn and the touch sway settle to nothing. */
  parallaxOut: [0, 0.3],
  /** The camera, from rest to the native pose along the reference's dive (DIVE; it lands at the end and holds). */
  camera: [0, 0.55],
  /** The turn to straight-on is done before the cut. */
  turn: [0, 0.36],
  /**
   * The tube keeps its whole look on the way in — curvature, the cap's bulge, scanlines, bloom,
   * vignette, hum bar, grain, phosphor colour, convergence — until its picture nearly fills the view
   * (fillInset), then drops it in this long: a cut of ~30 ms at PRESS START's pace, as in the
   * reference. Where that falls depends on the viewport; the monitor finds it (src/monitor/hero.ts).
   */
  cut: 0.02,
  /** "Nearly fills": the bezel shows in strips no wider than this share of the view on each side, as at the reference's cut. */
  fillInset: 0.03,
  /** Whatever the viewport, the cut is over by here, just before the landing. */
  cutBy: 0.53,
  /** The glass's reflection and the key light's highlight on it go as the camera leaves the rest pose: close up they blow out the picture, and the reference shows none. */
  glass: [0, 0.3],
  /** The 3D hands over to the canvas world: only the top layer fades, the canvas under it is opaque. */
  handover: [0.55, 0.66],
  /** The HUD, the rail, the hint and the touch controls come in. */
  overlays: 0.75,
  /** From here the canvas world is drawn under the 3D, ready for the handover (one frame early). */
  drawWorld: 0.54,
  /** From here the 3D renders at the device's full resolution (the native pose needs every device pixel). */
  fullRes: 0.3,
} as const;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A CSS cubic-bezier(x1, y1, x2, y2) easing (x1, x2 in 0–1): y for x, by Newton's method, bisection when it stalls. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = X(s) - x;
      if (Math.abs(err) < 1e-7) return Y(s);
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 40; i++) {
      const v = X(s);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}

/**
 * The reference's dive: its zoom in log scale over its duration, both 0–1, measured frame by frame on
 * the reference video (the screen's width between the bezels, then the strips' width) and fitted
 * (rms 0.011). Fast from the start, then a long soft approach: 36 % of the way in a quarter of the
 * time, 97 % by the cut, the bezel's last strips sliding out after it.
 */
export const DIVE = cubicBezier(0.435, 0.27, 0.165, 1);

/** PRESS START plays the enter segment at the reference's pace: the dive (to ENTER.camera[1]) in 770 ms, the rest in 200 ms. */
export const PLAY = { dive: 770, rest: 200 } as const;
/** The enter progress a play from the top has reached after `ms`. */
export function playP(ms: number): number {
  const c = ENTER.camera[1];
  if (ms <= PLAY.dive) return (c * Math.max(0, ms)) / PLAY.dive;
  return Math.min(1, c + ((1 - c) * (ms - PLAY.dive)) / PLAY.rest);
}
/** How far into a play from the top it is at enter progress p (a play started mid-way picks up from there). */
export function playMs(p: number): number {
  const c = ENTER.camera[1];
  const q = clamp01(p);
  return q <= c ? (PLAY.dive * q) / c : PLAY.dive + (PLAY.rest * (q - c)) / (1 - c);
}
/** 0 → 1 across [a, b], smoothly. */
export const smooth = (v: number, [a, b]: readonly [number, number]) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** Slow start, fast middle, soft landing. */
export const smoother = (v: number, [a, b]: readonly [number, number]) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
