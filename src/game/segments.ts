/**
 * The page timeline. The pin is one scroll length: first the enter segment — the camera
 * dives from the monitor at rest into its screen — then the world, the run as before. One coordinate
 * covers both: world t below 0 is the enter segment (from −D_E / D_W at the top of the page), 0–1 the
 * run. Every visual of the enter segment is a pure function of its progress p (0–1), so scrolling back
 * up plays it backwards. Free of three.js: the page and the monitor both read it.
 */
import { pinnedDistance } from './timeline';
import { clamp01 } from '../lib/math';

/**
 * The scroll lengths, px: the enter segment (one viewport), the run (14 viewports, 9 000–15 000 px)
 * and, where the monitor's 3D runs, the breakout (3.2 viewports; none without it — the run then ends
 * at the plaza and the pin releases into the Register section).
 */
export function scrollLengths(viewportH: number, breakout = true): { DE: number; DW: number; DB: number; D: number } {
  const DE = Math.round(viewportH);
  const DW = pinnedDistance(viewportH);
  const DB = breakout ? Math.round(3.2 * viewportH) : 0;
  return { DE, DW, DB, D: DE + DW + DB };
}

/**
 * The breakout's schedule, in its progress q (0–1 over D_B, after the run). Like the
 * enter segment, every visual is a pure function of q, so scrolling back up plays it all backwards.
 */
export const BREAKOUT = {
  /** The camera pulls back out of the game to the monitor at rest: the enter segment's p from 1 to 0, the plaza on the screen. */
  pullBack: [0, 0.31],
  /** Six cracks on the real glass from where Sam stands on the screen, one per hit. */
  cracks: [0.31, 0.56],
  /**
   * Sam jumps through the glass: it shatters round him — every piece at once, each its own way and speed:
   * small ones round his spot fly at the viewer, past the camera; the rest fall to the floor round the
   * monitor, where the big ones break again — and the tube behind it shows static. The glass runs its own
   * clock over this stretch.
   */
  shatter: [0.56, 0.76],
  /** …and from the same moment he leaps on toward the viewer, where the page takes him over at a whole-number scale. */
  leap: [0.56, 0.81],
  /** The Register section rises under the monitor, which glides to the top third; Sam lands on the Register window. */
  land: [0.81, 1],
} as const;
export const CRACK_STAGES = 6;
const CRACK_STEP = (BREAKOUT.cracks[1] - BREAKOUT.cracks[0]) / CRACK_STAGES;

/** The crack stage at q: 0 before the cracks, 1–6 through them (a stage shows as soon as q passes the hit before it). */
export function crackStage(q: number): number {
  if (q <= BREAKOUT.cracks[0]) return 0;
  return Math.min(CRACK_STAGES, Math.ceil((q - BREAKOUT.cracks[0]) / CRACK_STEP - 1e-6));
}


/** The enter segment's schedule, in p. */
export const ENTER = {
  /** The eyebrow, the wordmark, the tagline and PRESS START go. */
  copyOut: [0, 0.12],
  /** The parallax turn settles to nothing. */
  parallaxOut: [0, 0.3],
  /** The camera, from rest to the native pose along the dive's curve (DIVE; it lands at the end and holds). */
  camera: [0, 0.55],
  /** The turn to straight-on. */
  turn: [0, 0.36],
  /**
   * The tube keeps its whole look on the way in — curvature, the cap's bulge, scanlines, bloom,
   * vignette, hum bar, grain, phosphor colour, convergence — until its picture nearly fills the view
   * (fillInset; where that falls depends on the viewport, and the monitor finds it, src/monitor/hero.ts).
   * From `lead` before that point the curvature and the vintage look flatten together, easing in and
   * out, over `length` of p (~125 ms at PRESS START's pace), and the camera's last bit of zoom plays on
   * the flat picture. The first build cut it all in ~30 ms,
   * which read as too fast; stretched to the landing, the zoom had ended before the flattening had.
   */
  flatten: { lead: 0.02, length: 0.09 },
  /** "Nearly fills": the bezel shows in strips no wider than this share of the view on each side. */
  fillInset: 0.03,
  /** Whatever the viewport, the fill is taken by here, so the flattening is always over before the landing. */
  fillBy: 0.43,
  /** The glass's reflection and the key light's highlight on it go as the camera leaves the rest pose: close up they blow out the picture. */
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
 * The dive: its zoom in log scale over its duration, both 0–1, a fitted curve (rms 0.011). Fast from the start, then a long soft approach: 36 % of the way in a quarter of the
 * time, 97 % by the cut, the bezel's last strips sliding out after it.
 */
export const DIVE = cubicBezier(0.435, 0.27, 0.165, 1);

/** PRESS START plays the enter segment at the dive's own pace: the dive (to ENTER.camera[1]) in 770 ms, the rest in 200 ms. */
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
