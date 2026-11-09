/**
 * The breakout. The CRT bezel fades in over the night street, Sam
 * switches to his propeller and drifts to the right edge, the glass cracks one stage per hit,
 * and a Bayer 8×8 ordered dissolve — the only dither on the page — swaps the game frame for
 * the real one. Every value here is a pure function of t, so scrolling up un-cracks the glass
 * and lands him back on the sidewalk; only the mash and the auto-break move t, through tTarget
 * like a scroll, so the page follows them and a native scroll still wins.
 */
import type { Strip } from './sprites';
import { FOOT_SINK, SAM_CELL } from './sam';

export const BREAK = {
  /** The bezel fades in (DOM) … */
  bezel: [0.82, 0.86],
  /** … Sam lifts 30 px on the propeller and drifts to 82 % of the width … */
  flight: [0.84, 0.88],
  /** … the prompt shows and six cracks follow, one per hit … */
  cracks: [0.86, 0.91],
  /** … the dissolve replaces the game frame with the real one … */
  dissolve: [0.91, 0.94],
  /** … and he lands on the plaza. */
  landing: [0.94, 0.955],
  /** The HUD belongs to the game: gone halfway through the dissolve. */
  hudOut: 0.925,
} as const;
/** One hit = one crack = this much t: six hits from 0.86 reach 0.91. */
export const MASH_STEP = 1 / 120;
export const CRACK_STAGES = 6;
/** Idle this long with the glass cracking and the page completes the breakout by itself. */
export const AUTO_IDLE_MS = 1000;
/** The auto-break runs at Sam's run speed, world px/s. */
export const AUTO_SPEED = 160;
const FLIGHT_X = 0.82;
const FLIGHT_LIFT = 30;
/** The impact point inside each 240 × 240 crack frame; the fan opens to its left. */
const IMPACT = { x: 200, y: 120 } as const;
/** The propeller sheet is drawn 3 px lower than its cell (sam.ts); the impact sits at his centre at full lift. */
const PROPELLER_DROP = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (u: number) => {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
};
const span = (t: number, range: readonly [number, number]) => clamp01((t - range[0]) / (range[1] - range[0]));
const quantise = (v: number, n: number) => Math.round(clamp01(v) * n) / n;

/**
 * Sam's flight: null while he is on the ground; else his lift and, for the game frame, his screen
 * x — up and to the right over 0.84–0.88, held through the cracks and the dissolve, down again on
 * the plaza over 0.94–0.955 (the real frame draws him at the left margin).
 */
export function flightAt(t: number, bw: number, sx: number): { lift: number; screenX: number } | null {
  if (t < BREAK.flight[0] || t >= BREAK.landing[1]) return null;
  const up = t < BREAK.dissolve[1] ? smooth(span(t, BREAK.flight)) : 1 - smooth(span(t, BREAK.landing));
  const far = Math.round(FLIGHT_X * bw - SAM_CELL / 2);
  return { lift: Math.round(FLIGHT_LIFT * up), screenX: Math.round(sx + (far - sx) * smooth(span(t, BREAK.flight))) };
}

/** 0 = intact; 1–6 = crack stages. The next crack shows as soon as t moves past the hit before it. */
export function crackStage(t: number): number {
  if (t <= BREAK.cracks[0]) return 0;
  return Math.min(CRACK_STAGES, Math.ceil((t - BREAK.cracks[0]) / MASH_STEP - 1e-6));
}

/** How many of each 8 × 8 Bayer cell's 64 pixels show the real frame. */
export function dissolveLevel(t: number): number {
  return Math.round(span(t, BREAK.dissolve) * 64);
}

/**
 * The next target after a hit: one crack further; the hit that completes the cracks starts the
 * dissolve. The page position is whole pixels, so a run of hits from 0.86 can land a hair short
 * of 0.91: anything within half a hit of it counts.
 */
export function mashTarget(tTarget: number): number {
  const next = tTarget + MASH_STEP;
  return next >= BREAK.cracks[1] - MASH_STEP / 2 ? BREAK.dissolve[1] : next;
}

/** Bezel opacity, in eight hard steps: in before the flight, out with the dissolve. */
export function bezelAt(t: number): number {
  return quantise(smooth(span(t, BREAK.bezel)), 8) * (1 - quantise(span(t, BREAK.dissolve), 8));
}

/** The MASH prompt shows while the glass is cracking. */
export function promptOn(t: number): boolean {
  return t >= BREAK.cracks[0] && t < BREAK.cracks[1];
}

/** Where the glass is hit, in buffer px: 2 px inside the right edge, at Sam's centre at full lift. */
export function impactPoint(bw: number, F: number): { x: number; y: number } {
  return { x: bw - 2, y: F - SAM_CELL / 2 - FLIGHT_LIFT + FOOT_SINK + PROPELLER_DROP };
}

/** The cracks live in the game frame: drawn over everything in it, centred on the impact point. */
export function drawCracks(ctx: CanvasRenderingContext2D, cracks: Strip, stage: number, bw: number, F: number): void {
  if (stage <= 0) return;
  const p = impactPoint(bw, F);
  cracks.draw(ctx, stage - 1, p.x - IMPACT.x, p.y - IMPACT.y);
}

/** Bayer 8 × 8 threshold matrix. */
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/** Weight of the Bayer cell against the distance from the impact point in the dissolve threshold. */
const DITHER_WEIGHT = 0.3;

/**
 * The shattering dissolve: each pixel's threshold is bayer/64 · 0.3 + its distance
 * from the impact point / the farthest corner · 0.7, so the real frame breaks through at the crack
 * point first and the game frame shatters outward, the Bayer cell ordering each edge. Thresholds are
 * built once per buffer size into a byte map; each frame that the level changes writes a mask
 * (opaque where threshold < level), and the real frame is cut to it with destination-in and laid
 * over the game frame.
 */
export class Dissolve {
  private thresholds: Uint8Array | null = null;
  private key = '';
  private mask: HTMLCanvasElement | null = null;
  private maskData: ImageData | null = null;
  private maskLevel = -1;

  private rowsDone = 0;
  private maxDist = 1;
  private impact = { x: 0, y: 0 };
  private bw = 0;

  /** Start (or restart) the threshold map for this buffer; rows are filled by `fill`. */
  private begin(bw: number, bh: number, impact: { x: number; y: number }): boolean {
    const key = `${bw}x${bh}@${impact.x},${impact.y}`;
    if (key === this.key) return false;
    this.key = key;
    this.bw = bw;
    this.impact = impact;
    this.maxDist = Math.max(...[[0, 0], [bw, 0], [0, bh], [bw, bh]].map(([x, y]) => Math.hypot(x! - impact.x, y! - impact.y)));
    this.thresholds = new Uint8Array(bw * bh);
    this.rowsDone = 0;
    this.mask = document.createElement('canvas');
    this.mask.width = bw;
    this.mask.height = bh;
    this.maskData = this.mask.getContext('2d')!.createImageData(bw, bh);
    this.maskLevel = -1;
    return true;
  }

  /** Fill threshold rows until `deadline` (performance.now ms), or all of them. */
  private fill(deadline = Infinity): boolean {
    const thr = this.thresholds!;
    const bw = this.bw;
    const bh = thr.length / bw;
    const { x: ix, y: iy } = this.impact;
    while (this.rowsDone < bh) {
      const y = this.rowsDone++;
      const row = BAYER[y & 7]!;
      for (let x = 0; x < bw; x++) {
        const v = (row[x & 7]! / 64) * DITHER_WEIGHT + (Math.hypot(x - ix, y - iy) / this.maxDist) * (1 - DITHER_WEIGHT);
        thr[y * bw + x] = Math.min(255, Math.floor(v * 256));
      }
      if ((y & 7) === 7 && performance.now() > deadline) return false;
    }
    return true;
  }

  /** Build the threshold map ahead of the breakout in idle slices of ≤ 8 ms. */
  warm(bw: number, bh: number, impact: { x: number; y: number }): void {
    this.begin(bw, bh, impact);
    const w = window as Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void) => number };
    const step = (d?: { timeRemaining(): number }) => {
      const budget = Math.min(8, d ? d.timeRemaining() : 8);
      if (!this.fill(performance.now() + budget)) (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 16)))(step);
    };
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 16)))(step);
  }

  private prepare(bw: number, bh: number, impact: { x: number; y: number }): void {
    this.begin(bw, bh, impact);
    this.fill();
  }

  /** Keep only the real frame's pixels the level shows, then lay them over the game frame. */
  apply(game: CanvasRenderingContext2D, real: HTMLCanvasElement, rctx: CanvasRenderingContext2D, level: number, bw: number, bh: number, impact: { x: number; y: number }): void {
    if (level <= 0) return;
    if (level < 64) {
      this.prepare(bw, bh, impact);
      if (level !== this.maskLevel) {
        const cut = level * 4; // level 0–64 → threshold 0–256
        const px = new Uint32Array(this.maskData!.data.buffer);
        const thr = this.thresholds!;
        for (let i = 0; i < thr.length; i++) px[i] = thr[i]! < cut ? 0xff000000 : 0;
        this.mask!.getContext('2d')!.putImageData(this.maskData!, 0, 0);
        this.maskLevel = level;
      }
      rctx.save();
      rctx.globalCompositeOperation = 'destination-in';
      rctx.drawImage(this.mask!, 0, 0);
      rctx.restore();
    }
    game.drawImage(real, 0, 0);
  }
}
