/**
 * Dust: the puff for a skid (a three-step pixel sprite in token colours, Daisy White with an Outline Black
 * edge), and the little puffs Sam kicks up behind him as he runs, in the character of vega.io/careers' Sam:
 * a few specks every so often while he moves, a handful when he turns or lands, each flung back and up,
 * slowed by the air, pulled down, shrinking away. Specks are 2–3 px squares in Daisy White and Grey 500 (so
 * they show on grass and on the pale paving). All in world space, so they stay where they were kicked up.
 * Wall-clock decoration, like the jump arc — never timeline state.
 */
import { readToken } from './palette';

const LIFE_MS = 320;
// '#' outline, 'o' fill, '.' transparent; one character = one art pixel.
const FRAMES: readonly (readonly string[])[] = [
  ['.####.', '#oooo#', '#oooo#', '.####.'],
  ['.###..###.', '#ooo##ooo#', '#ooo##ooo#', '.###..###.'],
  ['.##...##...##.', '#oo#.#oo#.#oo#', '.##...##...##.'],
];

interface Puff {
  /** World x of the puff's centre. */
  x: number;
  /** Direction Sam was sliding; the puff drifts the other way. */
  slide: number;
  born: number;
}

/** The run's specks: emitted while Sam moves faster than this (world px/s), a few every EMIT_EVERY seconds. */
const SPECK = {
  minSpeed: 40,
  every: 0.13,
  perEmit: [2, 3],
  /** On a turn or a landing. */
  burst: 7,
  max: 48,
  /** Behind his centre, and a little scatter. */
  behind: 3,
  spread: 4,
  /** Flung back (px/s) and up (px/s); gravity and air drag. */
  back: [18, 48],
  up: [14, 32],
  gravity: 70,
  drag: 3,
  life: [0.35, 0.6],
  /** 2 or 3 px at first, shrinking to 1. */
  size: [2, 3],
} as const;

interface Speck {
  x: number;
  /** Height above the ground, px. */
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  color: string;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Dust {
  private puffs: Puff[] = [];
  private specks: Speck[] = [];
  private emitClock = 0;
  private lastDir = 0;
  private readonly outline = readToken('--color-outline-black');
  private readonly fill = readToken('--color-daisy-white');
  private readonly speckColors = [readToken('--color-daisy-white'), readToken('--color-daisy-white'), readToken('--color-grey-500')];

  private emit(x: number, dir: number, n: number): void {
    for (let i = 0; i < n && this.specks.length < SPECK.max; i++) {
      this.specks.push({
        x: x - dir * SPECK.behind + rand(-SPECK.spread / 2, SPECK.spread / 2),
        y: 0,
        vx: -dir * rand(SPECK.back[0], SPECK.back[1]),
        vy: rand(SPECK.up[0], SPECK.up[1]),
        size: Math.random() < 0.5 ? SPECK.size[0] : SPECK.size[1],
        age: 0,
        life: rand(SPECK.life[0], SPECK.life[1]),
        color: this.speckColors[Math.floor(Math.random() * this.speckColors.length)]!,
      });
    }
  }

  /**
   * Sam's run, once a frame: `x` his centre (world px), `vx` his speed on the ground (0 in the air or standing).
   * Specks come every SPECK.every s while he moves, a burst when he turns; the flying ones move on.
   */
  run(x: number, vx: number, dt: number): void {
    const dir = Math.sign(vx);
    if (Math.abs(vx) > SPECK.minSpeed) {
      if (dir !== this.lastDir) {
        this.emit(x, dir, SPECK.burst);
        this.emitClock = 0;
      }
      this.lastDir = dir;
      this.emitClock += dt;
      while (this.emitClock >= SPECK.every) {
        this.emitClock -= SPECK.every;
        this.emit(x, dir, SPECK.perEmit[0] + Math.floor(Math.random() * (SPECK.perEmit[1] - SPECK.perEmit[0] + 1)));
      }
    } else {
      this.emitClock = 0;
      this.lastDir = 0;
    }
    const drag = Math.exp(-SPECK.drag * dt);
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i]!;
      s.age += dt;
      if (s.age >= s.life) {
        this.specks.splice(i, 1);
        continue;
      }
      s.vx *= drag;
      s.vy -= SPECK.gravity * dt;
      s.x += s.vx * dt;
      s.y = Math.max(0, s.y + s.vy * dt);
    }
  }

  /** Landing from a jump: specks both ways. */
  land(x: number): void {
    this.emit(x, 1, Math.ceil(SPECK.burst / 2));
    this.emit(x, -1, Math.floor(SPECK.burst / 2));
  }

  /** True while a puff is still showing. */
  alive(now: number): boolean {
    return this.puffs.some((p) => now - p.born < LIFE_MS);
  }

  spawn(x: number, slide: number, now: number): void {
    this.puffs.push({ x, slide, born: now });
    if (this.puffs.length > 6) this.puffs.shift();
  }

  draw(ctx: CanvasRenderingContext2D, camLeft: number, F: number, now: number): void {
    for (const s of this.specks) {
      const size = Math.max(1, Math.ceil(s.size * (1 - s.age / s.life)));
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x - camLeft - size / 2), Math.round(F - s.y - size), size, size);
    }
    this.puffs = this.puffs.filter((p) => now - p.born < LIFE_MS);
    for (const p of this.puffs) {
      const age = (now - p.born) / LIFE_MS;
      const frame = FRAMES[Math.min(FRAMES.length - 1, Math.floor(age * FRAMES.length))]!;
      const w = frame[0]!.length;
      const h = frame.length;
      const x = Math.round(p.x - camLeft - w / 2 - p.slide * age * 6);
      const y = F - h - Math.floor(age * 3);
      for (let j = 0; j < h; j++) {
        const row = frame[j]!;
        for (let i = 0; i < row.length; i++) {
          const c = row[i];
          if (c === '#') ctx.fillStyle = this.outline;
          else if (c === 'o') ctx.fillStyle = this.fill;
          else continue;
          ctx.fillRect(x + i, y + j, 1, 1);
        }
      }
    }
  }
}
