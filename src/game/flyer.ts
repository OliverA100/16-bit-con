/**
 * The opening's flyer: it falls into the world like a sheet of paper, the way a feather falls.
 *
 * A sheet falls mostly lying flat: its face catches the air, which holds it up. So it comes in upright to
 * the camera (edge-on to the air, falling quicker), soon lies down flat — seen from the side and a little
 * above, a thin wide strip — and the drag slows it right down. Flat, it rocks side to side like a pendulum
 * (x = drift + A·sin ωt), tipped into each swing, its edge up at the ends: there it stalls and almost hangs,
 * then slides down into the next swing (its quickest drop), levels out and parachutes across the middle.
 * Once, two-thirds of the way down, it catches the air and tumbles up to show its face, then lies flat
 * again. The swings shrink towards the ground and the last one ends there with no speed left, so it lands
 * soft and flat, sinks a pixel, and stays.
 *
 * The descent rate is the swing's (a slide after each end, nothing at the ends) times the drag of how flat
 * the sheet is; its integral is normalised so the fall ends on the ground exactly. Everything is a pure
 * function of the time since it was dropped, so a recording steps it exactly. Frames are rasterised once per
 * (tilt, turn, lie) step and cached (flyer-art.ts); the fall moves a whole art pixel at a time but chooses its
 * frame and place every display frame, so it floats rather than ticks.
 */
import { flyerFrame, flyerGround, FLYER_CELL, GROUND_H, GROUND_W, type FlyerInk, type Rgb } from './flyer-art';
import { hexToRgb, readToken } from './palette';
import { clamp01, lerp } from '../lib/math';

/** Top of the screen to the ground. */
const FALL_MS = 3900;
/** The flat flyer settles after it touches down. */
const SETTLE_MS = 160;
/** The swing's period, set so the sixth end of a swing comes exactly at the ground: T = P/4 + 5·P/2. */
const PERIOD_S = FALL_MS / 1000 / 2.75;
const OMEGA = (2 * Math.PI) / PERIOD_S;
/** Swing half-width, world px: wide glides up top, small ones near the ground. */
const AMP: [number, number] = [56, 12];
/** Tilt into the swing, degrees at the ends of a swing. */
const TILT: [number, number] = [34, 8];
/** A slight turn about its vertical axis at every end (radians: cos 0.45 ≈ 90 % wide). */
const WOBBLE = 0.45;
/** Lying flat: the sheet's height on screen, of its 18 px, seen from a little above. */
const FLAT = 0.22;
/** Flat on the ground (GROUND_H of 18). */
const LIE_TO = GROUND_H / 18;
/**
 * How the sheet lies through the fall, (s, lie): upright as it comes in, flat from ~1.2 s, one tumble up to
 * show its face around 2.6 s, flat again, flatter still at the ground. Eased between keys.
 */
const LIE_KEYS: [number, number][] = [
  [0, 1],
  [0.4, 1],
  [1.2, FLAT],
  [2.3, FLAT],
  [2.65, 0.9],
  [3.05, FLAT],
  [FALL_MS / 1000 - 0.25, FLAT],
  [FALL_MS / 1000, LIE_TO],
];
/**
 * Drag: the descent's multiplier, upright (quicker) to flat (held up by the air). Kept close, with the
 * swing's own rate, so the speed stays within ~60–140 px/s: no part rushes, none hangs too long.
 */
const DRAG: [number, number] = [1.15, 0.9];

const smooth = (k: number) => k * k * (3 - 2 * k);

function lieAt(t: number): number {
  for (let i = 1; i < LIE_KEYS.length; i++) {
    const [t1, l1] = LIE_KEYS[i]!;
    if (t <= t1) {
      const [t0, l0] = LIE_KEYS[i - 1]!;
      return lerp(l0, l1, smooth(clamp01((t - t0) / (t1 - t0))));
    }
  }
  return LIE_TO;
}

/**
 * The swing's own descent through a half swing, u from one end (0) to the next (1): from the stall it slides
 * down (quickest about a third of the way), then levels out across the middle and slows to a stall again.
 */
const swingRate = (u: number) => 0.7 + Math.sin(Math.PI * u) * (1 - u) ** 0.6;

/** Descent progress table: s(t) / s(T) at 2 ms steps, the integral of the descent rate. */
const STEP_MS = 2;
const descent = (() => {
  const n = Math.ceil(FALL_MS / STEP_MS);
  const s = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const t = ((i - 0.5) * STEP_MS) / 1000;
    const fromEnd = OMEGA * t - Math.PI / 2; // the swing's angle past its last end
    const u = (((fromEnd % Math.PI) + Math.PI) % Math.PI) / Math.PI;
    const flat = clamp01((1 - lieAt(t)) / (1 - FLAT));
    const land = smooth(clamp01((FALL_MS / 1000 - t) / 0.2)); // no speed left at the ground
    s[i] = s[i - 1]! + swingRate(u) * lerp(DRAG[0], DRAG[1], flat) * land * (STEP_MS / 1000);
  }
  const total = s[n]!;
  for (let i = 0; i <= n; i++) s[i]! /= total;
  return s;
})();
const descended = (ms: number) => {
  const f = clamp01(ms / FALL_MS) * (descent.length - 1);
  const i = Math.floor(f);
  return i >= descent.length - 1 ? 1 : lerp(descent[i]!, descent[i + 1]!, f - i);
};

interface FlyerPose {
  /** World x of the paper's centre. */
  x: number;
  /** Height of the paper's bottom above the ground line, art px. */
  h: number;
  tilt: number;
  /** cos of its turn about its vertical axis: 1 the front, ~0 edge-on. */
  width: number;
  /** Its height on screen: 1 upright to the camera, FLAT lying flat, LIE_TO on the ground. */
  lie: number;
  landed: boolean;
}

/** Where the flyer is `ms` after it was dropped, falling from `top` px above the ground towards `landX`. */
function flyerPose(ms: number, top: number, fromX: number, landX: number): FlyerPose {
  const T = FALL_MS / 1000;
  const t = Math.min(ms, FALL_MS) / 1000;
  const k = t / T;
  const swing = Math.sin(OMEGA * t);
  const amp = lerp(AMP[0], AMP[1], k);
  // the drift: from above Sam to the right; at the ground the swing is at its left end (sin = −1)
  const drift = lerp(fromX, landX + AMP[1], smooth(k));
  const x = drift + amp * swing;
  const h = top * (1 - descended(ms));
  const landing = smooth(clamp01((t - (T - 0.25)) / 0.25)); // the last tilt and turn level out on the ground
  const tilt = -lerp(TILT[0], TILT[1], k) * swing * (1 - landing);
  const width = lerp(Math.cos(WOBBLE * Math.abs(swing) ** 6), 1, landing);
  return { x, h, tilt, width, lie: lieAt(t), landed: ms >= FALL_MS };
}

/** The frames, cut on demand: tilt in 2° steps, turn and lie in 1/20ths. */
export class FlyerSprites {
  private readonly ink: FlyerInk;
  private readonly cache = new Map<string, HTMLCanvasElement>();
  readonly ground: HTMLCanvasElement;

  constructor() {
    const rgb = (token: string): Rgb => hexToRgb(readToken(token));
    const paper = rgb('--color-paper');
    this.ink = {
      paper,
      band: rgb('--color-yellow-600'),
      rule: rgb('--color-green-500'),
      ink: rgb('--color-green-900'),
      mark: rgb('--color-yellow-600'),
      daisy: rgb('--color-yellow-400'),
      edge: paper,
    };
    this.ground = toCanvas(flyerGround(this.ink), GROUND_W, GROUND_H);
  }

  frame(tilt: number, width: number, lie: number): HTMLCanvasElement {
    const tq = Math.round(tilt / 2) * 2;
    const wq = Math.round(width * 20) / 20;
    const lq = Math.round(lie * 20) / 20;
    const key = `${tq}|${wq}|${lq}`;
    let c = this.cache.get(key);
    if (!c) {
      c = toCanvas(flyerFrame(tq, wq, this.ink, lq), FLYER_CELL, FLYER_CELL);
      this.cache.set(key, c);
    }
    return c;
  }
}

function toCanvas(px: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
  return c;
}

/** Sounds the fall asks for, as they happen. */
interface FallCues {
  /** Each end of a swing, where the paper catches air; `size` 1 at the top down to ~0.2 at the ground. */
  swing?: (size: number) => void;
  land?: () => void;
}

/**
 * One drop of the flyer: dropped at `t0` (ms, the loop's clock), from `top` above the ground, drifting from
 * `fromX` to land centred on `landX` (world px). The loop draws it with the near layer (world.ts).
 */
export class FallingFlyer {
  /** The paper's centre once it has landed. */
  readonly landX: number;
  /** Gone into Sam's hands. */
  taken = false;
  /** Lifted off the ground as Sam picks it up, art px. */
  raise = 0;
  private lastEnd = -1;
  private landedCue = false;

  constructor(
    private readonly sprites: FlyerSprites,
    private t0: number,
    private readonly top: number,
    private readonly fromX: number,
    landX: number,
    private readonly cues: FallCues = {},
    /** Already on the ground (reduced motion): no fall. */
    private readonly still = false,
  ) {
    this.landX = landX;
  }

  /** The clock stood still for `ms` (a dialog over the game): the fall picks up where it was. */
  shift(ms: number): void {
    this.t0 += ms;
  }

  pose(now: number): FlyerPose {
    return flyerPose(this.still ? FALL_MS + SETTLE_MS : now - this.t0, this.top, this.fromX, this.landX);
  }

  landed(now: number): boolean {
    return this.still || now - this.t0 >= FALL_MS + SETTLE_MS;
  }

  /** Fire the sound cues due by `now`. */
  tick(now: number): void {
    if (this.still) return;
    const ms = now - this.t0;
    if (ms < FALL_MS) {
      // the n-th end of a swing is at ωt = π/2 + nπ
      const end = Math.floor((OMEGA * (ms / 1000) - Math.PI / 2) / Math.PI);
      if (end > this.lastEnd && end >= 0) {
        this.lastEnd = end;
        this.cues.swing?.(lerp(1, 0.2, clamp01(ms / FALL_MS)));
      }
    } else if (!this.landedCue) {
      this.landedCue = true;
      this.cues.land?.();
    }
  }

  /** Draw at the ground line F (the soles' depth: `sink` px into the surface), the camera's left at camLeft. */
  draw(ctx: CanvasRenderingContext2D, camLeft: number, F: number, sink: number, now: number): void {
    if (this.taken) return;
    const ms = this.still ? Infinity : now - this.t0;
    const ground = F + sink;
    if (ms >= FALL_MS) {
      // flat on the ground; the settle sinks it its last pixel
      const g = this.sprites.ground;
      const settle = ms >= FALL_MS + SETTLE_MS ? 0 : 1;
      ctx.drawImage(g, Math.round(this.landX - camLeft - g.width / 2), ground - g.height - settle - this.raise);
      return;
    }
    const p = this.pose(now);
    const img = this.sprites.frame(p.tilt, p.width, p.lie);
    // the paper's bottom at h above the ground: the cell is centred on the paper
    const paperH = 18 * p.lie;
    const cy = ground - p.h - paperH / 2 - 1;
    ctx.drawImage(img, Math.round(p.x - camLeft - FLYER_CELL / 2), Math.round(cy - FLYER_CELL / 2));
  }
}
