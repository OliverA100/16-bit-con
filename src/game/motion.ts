/**
 * Run physics for keys and the d-pad: velocity with acceleration and
 * deceleration, a short skid when reversing at speed, and a true full stop. Units are world px
 * and seconds. The loop integrates the returned displacement into X and scrolls the page.
 */
const RUN_SPEED = 200; // world px/s (~4.4 of Sam's heights a second; the run is ~30 s held)
const ACCEL = RUN_SPEED / 0.12; // 0 → full in 0.12 s: a platformer's quick start
const DECEL = RUN_SPEED / 0.1; // full → 0 in 0.1 s
const AIR_CONTROL = 0.75; // in the air he still steers, a little less sharply
const SKID_MS = 90;
const SKID_MIN = 0.35 * RUN_SPEED; // reversing slower than this just turns

const approach = (v: number, target: number, maxDelta: number) => (v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta));

export class Motion {
  /** Sam's own horizontal velocity, world px/s, signed. */
  vx = 0;
  /** The new facing while a skid is in progress, else 0. */
  skidDir = 0;
  /** True for the one frame a skid starts, so the loop can spawn the dust puff. */
  puff = false;
  private skidUntil = -1;
  private skidRate = 0;

  get moving(): boolean {
    return this.vx !== 0;
  }

  get skidding(): boolean {
    return this.skidDir !== 0;
  }

  /** Scroll took over, or Sam turned away from a wall: drop all momentum, no skid. */
  cancel(): void {
    this.vx = 0;
    this.skidDir = 0;
    this.skidUntil = -1;
  }

  /**
   * Advance one frame and return the displacement in world px.
   * @param dir −1, 0 or 1 — the held direction
   * @param grounded skids only happen on the ground
   */
  step(dt: number, dir: number, grounded: boolean, now: number): number {
    this.puff = false;
    if (this.skidDir !== 0) {
      // A skid ends when its time is up, when he has stopped, or when the input changes.
      if (now >= this.skidUntil || this.vx === 0 || dir !== this.skidDir) {
        this.skidDir = 0;
        this.skidUntil = -1;
      } else {
        this.vx = approach(this.vx, 0, this.skidRate * dt);
        return this.vx * dt;
      }
    }
    if (dir !== 0 && this.vx * dir < 0) {
      // Reversing against momentum: skid at speed, otherwise just brake.
      if (grounded && Math.abs(this.vx) >= SKID_MIN) {
        this.skidDir = dir;
        this.skidUntil = now + SKID_MS;
        this.skidRate = Math.abs(this.vx) / (SKID_MS / 1000);
        this.puff = true;
        this.vx = approach(this.vx, 0, this.skidRate * dt);
      } else {
        this.vx = approach(this.vx, 0, DECEL * (grounded ? 1 : AIR_CONTROL) * dt);
      }
      return this.vx * dt;
    }
    const air = grounded ? 1 : AIR_CONTROL;
    this.vx = approach(this.vx, dir * RUN_SPEED, (dir !== 0 ? ACCEL : DECEL) * air * dt);
    return this.vx * dt;
  }
}
