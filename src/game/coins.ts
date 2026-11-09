/**
 * Vega coins: the collectible. Positions are world x and height above the ground line.
 * Low coins are collected by running through them (and by a sweep, so fast scrubs never
 * skip one); high coins need the jump. Collected ids persist in sessionStorage — the only
 * state outside the timeline.
 */
import type { Strip } from './sprites';
import { SAM_HITBOX, SAM_CELL } from './sam';

export interface CoinDef {
  id: string;
  x: number;
  /** Height of the coin's centre above F. */
  y: number;
  high: boolean;
}

export const LEVEL1_COINS: CoinDef[] = [
  { id: 'l1-a', x: 760, y: 24, high: false },
  { id: 'l1-b', x: 1000, y: 76, high: true },
  { id: 'l1-c', x: 1240, y: 76, high: true },
  { id: 'l1-d', x: 1480, y: 24, high: false },
  { id: 'l2-a', x: 2300, y: 24, high: false },
  { id: 'l2-b', x: 2560, y: 76, high: true },
  { id: 'l2-c', x: 2900, y: 24, high: false },
  { id: 'l2-d', x: 3300, y: 76, high: true },
];

export const TOTAL_COINS = 12;
const STORAGE_KEY = '16bc-coins';
const HALF = 12;

export class Coins {
  readonly collected = new Set<string>();
  onChange: ((count: number) => void) | null = null;

  constructor(private readonly defs: CoinDef[]) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') this.collected.add(id);
    } catch {
      /* storage unavailable: coins just do not persist */
    }
  }

  get count(): number {
    return this.collected.size;
  }

  /**
   * @param samX world x of Sam's cell left edge
   * @param prevSamX the same, last frame (for the sweep)
   * @param lift Sam's jump lift in px
   */
  update(samX: number, prevSamX: number, lift: number): void {
    const left = samX + SAM_HITBOX.left;
    const right = samX + SAM_HITBOX.right;
    const top = lift + (SAM_CELL - SAM_HITBOX.top); // height of Sam's head above F
    const bottom = lift;
    for (const c of this.defs) {
      if (this.collected.has(c.id)) continue;
      const overlapX = c.x + HALF > left && c.x - HALF < right;
      const overlapY = c.y + HALF > bottom && c.y - HALF < top;
      const swept = !c.high && ((prevSamX < c.x && c.x <= samX) || (samX <= c.x && c.x < prevSamX));
      if ((overlapX && overlapY) || swept) this.collect(c.id);
    }
  }

  private collect(id: string): void {
    this.collected.add(id);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collected]));
    } catch {
      /* ignore */
    }
    this.onChange?.(this.count);
  }

  draw(ctx: CanvasRenderingContext2D, strip: Strip, camLeft: number, F: number, bw: number, now: number): void {
    const frame = Math.floor(now / 160) % strip.frames;
    for (const c of this.defs) {
      if (this.collected.has(c.id)) continue;
      const sx = c.x - HALF - camLeft;
      if (sx < -24 || sx > bw) continue;
      strip.draw(ctx, frame, sx, F - c.y - HALF);
    }
  }
}
