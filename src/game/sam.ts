/**
 * Sam: his sheets (brand-corrected at load) and his state on the timeline.
 * The run cycle is an odometer of distance travelled, so his feet stick to the ground at any
 * speed; he idles only at a full stop. The jump is the one wall-clock motion and never touches
 * the timeline; its height follows how long the button is held.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage, makeStrip, type Strip } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';

export interface SamSheets {
  run: Strip;
  jump: Strip;
  idle: Strip;
}

export async function loadSamSheets(): Promise<SamSheets> {
  const [run, jump, idle] = await Promise.all([loadImage(sprites.samRun.file), loadImage(sprites.samJump.file), loadImage(sprites.samIdle.file)]);
  return {
    run: makeStrip(remap(run, SAM_BRAND_MAP)),
    jump: makeStrip(remap(jump, SAM_BRAND_MAP)),
    idle: makeStrip(remap(idle, SAM_BRAND_MAP)),
  };
}

/**
 * The two sheets Sam needs only once he is out on the page (src/game/journey.ts): climbing the beanstalk
 * and smoking on the footer's ground, through the same brand map so all five sheets are one Sam.
 */
export interface PageSheets {
  climb: Strip;
  smoke: Strip;
}

export async function loadPageSheets(): Promise<PageSheets> {
  const [climb, smoke] = await Promise.all([loadImage(sprites.samClimb.file), loadImage(sprites.samSmoking.file)]);
  return { climb: makeStrip(remap(climb, SAM_BRAND_MAP)), smoke: makeStrip(remap(smoke, SAM_BRAND_MAP)) };
}

export const SAM_CELL = 60;
/** The climb sheet's soles sit on its row 52, not on the cell's last row like the standing sheets. */
export const CLIMB_FEET = 52;
/** Opaque body inside the 60 px cell (measured on run.png). */
export const SAM_HITBOX = { left: 14, right: 46, top: 15 };
/**
 * The careers sheets put the soles on the cell's last row. Every 60 px character is drawn 5 px
 * lower than its cell, so the soles sit 4 px into the 8 px surface band (grass fill or pavement):
 * paving behind the feet and the kerb in front, and he reads as standing on the sidewalk rather
 * than on its far edge. The same sink in both grounds, so the feet never change height.
 */
export const FOOT_SINK = 5;

/** The idle loop's pace in the game, frames a second. */
export const IDLE_FPS = 8;

/** World px of travel per run frame: one 4-frame cycle every 48 px, ~13 fps at full speed. */
export const STRIDE = 12;
/** A fast scrub never strobes the cycle faster than this. */
export const RUN_FPS_MAX = 16;

/** Variable jump: hold for height. Tap ≈ 15 px hop, full hold (450 ms) = 40 px, snappy fall. */
const JUMP_V0 = 178; // px/s
const JUMP_G_RISE = 395; // px/s² while held and rising → apex 40 px at 0.45 s
const JUMP_G_FALL = 800; // px/s² once released or past the apex
const JUMP_CUT = 70; // releasing early caps the upward speed
const JUMP_HOLD_MAX_MS = 450;
/** A tap still rises this long before the cut applies, so the smallest hop clears ~16 px. */
const JUMP_MIN_MS = 80;

export type SamMode = 'idle' | 'run' | 'skid' | 'jump';

export class Sam {
  facing: 1 | -1 = 1;
  mode: SamMode = 'idle';
  frame = 0;
  /** Whole pixels above the ground line while jumping. */
  lift = 0;
  private y = 0;
  private vy = 0;
  private inAir = false;
  private holding = false;
  private released = false;
  private jumpAt = -1;
  private odometer = 0;
  private idleClock = 0;

  constructor(private readonly sheets: SamSheets) {}

  get airborne(): boolean {
    return this.inAir;
  }

  jumpPress(now: number): void {
    if (this.inAir) return;
    this.inAir = true;
    this.holding = true;
    this.released = false;
    this.jumpAt = now;
    this.vy = JUMP_V0;
    this.y = 0;
  }

  jumpRelease(): void {
    if (!this.holding) return;
    this.holding = false;
    this.released = true;
  }

  /**
   * @param speed world px/s, signed — Sam's own velocity under keys, the ease's under scroll
   * @param held the held direction, if any: a platformer turns on the key, not on momentum
   * @param skidding true while reversing at speed on the ground
   */
  update(dt: number, speed: number, now: number, held: number, skidding: boolean): void {
    if (held !== 0) this.facing = held > 0 ? 1 : -1;
    else if (Math.abs(speed) > 4) this.facing = speed > 0 ? 1 : -1;

    if (!this.inAir) this.lift = 0; // back on the ground
    if (this.inAir) {
      const flight = now - this.jumpAt;
      if (this.released && flight >= JUMP_MIN_MS && this.vy > JUMP_CUT) this.vy = JUMP_CUT;
      const rising = this.vy > 0 && flight < JUMP_HOLD_MAX_MS && (this.holding || flight < JUMP_MIN_MS);
      const g = rising ? JUMP_G_RISE : JUMP_G_FALL;
      this.vy -= g * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.inAir = false;
        this.holding = false;
      }
      this.lift = Math.round(this.y);
    }

    this.odometer += Math.min((Math.abs(speed) * dt) / STRIDE, RUN_FPS_MAX * dt);

    if (this.inAir) {
      this.mode = 'jump';
      this.frame = 0;
    } else if (skidding) {
      this.mode = 'skid';
      this.frame = 0;
    } else if (speed !== 0) {
      this.mode = 'run';
      this.frame = Math.floor(this.odometer) % this.sheets.run.frames;
    } else {
      this.mode = 'idle';
      this.idleClock += dt * IDLE_FPS;
      this.frame = Math.floor(this.idleClock) % this.sheets.idle.frames;
    }
  }

  /** Draw with the cell's left edge at sx and feet on the ground line F. */
  draw(ctx: CanvasRenderingContext2D, sx: number, F: number): void {
    const sheet = this.mode === 'jump' ? this.sheets.jump : this.mode === 'idle' ? this.sheets.idle : this.sheets.run;
    sheet.draw(ctx, this.frame, sx, F - SAM_CELL - this.lift + FOOT_SINK, this.facing < 0);
  }
}
