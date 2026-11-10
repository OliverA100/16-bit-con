/**
 * The master timeline: one number t is the single source of truth: the run
 * is t 0–1, and below 0 lies the enter segment (from tMin), where the camera dives into the monitor.
 *
 * Two regimes, and scroll always wins:
 *  - scroll  Native scroll (wheel, scrollbar, swipe, anchor) sets tTarget, and only the VISUAL t
 *            eases toward it with a ~300 ms time constant — enough to smooth wheel ticks, never
 *            enough to feel like a scroll library. Nothing here ever moves the page.
 *  - drive   Keys / d-pad (later mash and auto) own t for the frame: Sam's run physics set X
 *            directly and the loop scrolls the page to match. Those are the only scrollTo calls.
 */
export type Source = 'idle' | 'scroll' | 'keys' | 'dpad' | 'mash' | 'auto';

/** Time constant of the visual ease toward the scroll position, seconds. */
export const SCROLL_TAU = 0.3;
/** The ease never crawls slower than this (world px/s), so it reaches the target and Sam fully stops. */
const MIN_CLOSE_SPEED = 60;
/** Within an art pixel the ease snaps; the camera rounds to whole pixels anyway. */
const SETTLE_PX = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Timeline {
  /** Visual position, what the renderer draws. */
  t = 0;
  /** Where the active input wants to be (equal to t while driven). */
  tTarget = 0;
  /** World px/s, signed: the driver's velocity while driven, else the ease's. Drives Sam's cycle. */
  speed = 0;
  source: Source = 'idle';
  private driven = false;

  constructor(
    /** World length in art px. */
    public readonly W: number,
    /** Highest t the current build exposes (Level 1 gate: 0.34). */
    public tMax: number,
    /** Lowest t: the top of the enter segment, −D_E / D_W (0 when there is none). */
    public tMin = 0,
  ) {}

  /** Sam's world x. */
  get X(): number {
    return this.t * this.W;
  }

  /** A scroll we did not cause: the page is already there, the visual follows. */
  setScrollTarget(t: number): void {
    this.tTarget = clamp(t, this.tMin, this.tMax);
    this.source = 'scroll';
  }

  /** Keys / d-pad: X comes from Sam's run physics; the loop scrolls the page to match. */
  drive(X: number, vx: number, source: Exclude<Source, 'idle' | 'scroll'>): void {
    this.t = this.tTarget = clamp(X / this.W, this.tMin, this.tMax);
    this.speed = vx;
    this.driven = true;
    this.source = source;
  }

  /**
   * Keys resumed while the visual is still easing after a scroll: they move the target (and the
   * page) from where the user left it, and the visual catches up through the ease — no snap back.
   */
  driveTarget(X: number, source: Exclude<Source, 'idle' | 'scroll'>): void {
    this.tTarget = clamp(X / this.W, this.tMin, this.tMax);
    this.source = source;
  }

  /** Snap without smearing (boot, refresh, anchor jumps). */
  jumpTo(t: number): void {
    this.t = this.tTarget = clamp(t, this.tMin, this.tMax);
    this.speed = 0;
    this.driven = false;
    this.source = 'idle';
  }

  step(dt: number): void {
    if (this.driven) {
      this.driven = false;
      return;
    }
    const delta = this.tTarget - this.t;
    if (Math.abs(delta) * this.W <= SETTLE_PX) {
      this.t = this.tTarget;
      this.speed = 0;
      this.source = 'idle';
      return;
    }
    const a = 1 - Math.exp(-dt / SCROLL_TAU);
    let move = delta * a;
    const minMove = (MIN_CLOSE_SPEED * dt) / this.W;
    if (Math.abs(move) < minMove) move = Math.sign(delta) * Math.min(Math.abs(delta), minMove);
    this.t += move;
    this.speed = (move * this.W) / Math.max(dt, 1e-4);
  }

  get settled(): boolean {
    return this.t === this.tTarget && this.speed === 0;
  }
}

/** Pinned scroll distance for the whole run (px). */
export function pinnedDistance(viewportH: number): number {
  return clamp(Math.round(14 * viewportH), 9000, 15000);
}
