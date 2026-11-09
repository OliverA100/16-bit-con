/**
 * Dust puffs for the skid: a three-step pixel sprite in token colours (Daisy White with an
 * Outline Black edge), spawned in world space so it stays where the skid happened while Sam
 * slides on. Wall-clock decoration, like the jump arc — never timeline state.
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

export class Dust {
  private puffs: Puff[] = [];
  private readonly outline = readToken('--color-outline-black');
  private readonly fill = readToken('--color-daisy-white');

  /** True while a puff is still showing. */
  alive(now: number): boolean {
    return this.puffs.some((p) => now - p.born < LIFE_MS);
  }

  spawn(x: number, slide: number, now: number): void {
    this.puffs.push({ x, slide, born: now });
    if (this.puffs.length > 6) this.puffs.shift();
  }

  draw(ctx: CanvasRenderingContext2D, camLeft: number, F: number, now: number): void {
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
