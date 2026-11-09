/**
 * Night: palette maps for buildings, street and props, applied in small
 * steps. Each source colour moves toward its night token over `steps` equal steps; layers step
 * far first, near last, so no frame changes more than one layer by one step. Sam and the coins
 * are exempt. Lit windows are the glass-role connected components of a layer, painted one by one
 * onto an overlay in Yellow 400 (Yellow 100 for the far city's dots), each fading in over a short
 * stretch of scroll. Everything is a function of the timeline position: stepping back unsteps,
 * and windows dim and go out in reverse order.
 */
import { hexToRgb, readToken } from './palette';
import type { Drawable } from './sprites';

export type ColorMap = Record<string, string>;
export const NIGHT_STEPS = 12;

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const hexOf = (p: number) => `#${p.toString(16).padStart(6, '0').toUpperCase()}`;
const lum = (p: number) => 0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255);

export interface NightTokens {
  k: string;
  n9: string;
  n7: string;
  g7: string;
  g5: string;
  y1: string;
  y4: string;
  dw: string;
}
export function nightTokens(): NightTokens {
  return {
    k: readToken('--color-outline-black'),
    n9: readToken('--color-green-900'),
    n7: readToken('--color-green-700'),
    g7: readToken('--color-grey-700'),
    g5: readToken('--color-grey-500'),
    y1: readToken('--color-yellow-100'),
    y4: readToken('--color-yellow-400'),
    dw: readToken('--color-daisy-white'),
  };
}

/** An image decoded once: each pixel's colour index into `colors`, plus alpha. */
class Indexed {
  readonly w: number;
  readonly h: number;
  readonly colors: number[] = [];
  readonly counts: number[] = [];
  readonly idx: Uint16Array;
  readonly alpha: Uint8Array;

  constructor(readonly src: Drawable) {
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    this.w = canvas.width;
    this.h = canvas.height;
    const n = this.w * this.h;
    this.idx = new Uint16Array(n);
    this.alpha = new Uint8Array(n);
    const lookup = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const a = d[i * 4 + 3]!;
      this.alpha[i] = a;
      if (a === 0) continue;
      const p = pack(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
      let c = lookup.get(p);
      if (c === undefined) {
        c = this.colors.length;
        lookup.set(p, c);
        this.colors.push(p);
        this.counts.push(0);
      }
      this.counts[c]!++;
      this.idx[i] = c;
    }
  }
}

const indexedCache = new WeakMap<Drawable, Indexed>();
const indexed = (src: Drawable) => {
  let i = indexedCache.get(src);
  if (!i) indexedCache.set(src, (i = new Indexed(src)));
  return i;
};

/**
 * Map every colour of `src` to one of `targets` by luminance rank, splitting the colours by
 * cumulative pixel share (`weights`, default equal), then apply explicit `roles` on top.
 */
export function rankMap(src: Drawable, targets: string[], weights?: number[], roles: ColorMap = {}): ColorMap {
  const im = indexed(src);
  const order = im.colors.map((p, i) => ({ p, n: im.counts[i]! })).sort((a, b) => lum(a.p) - lum(b.p));
  const total = order.reduce((s, c) => s + c.n, 0);
  const w = weights ?? targets.map(() => 1);
  const wsum = w.reduce((s, v) => s + v, 0);
  const map: ColorMap = {};
  let acc = 0;
  for (const c of order) {
    const share = (acc + c.n / 2) / total;
    let cut = 0;
    let t = 0;
    for (; t < targets.length - 1; t++) {
      cut += w[t]! / wsum;
      if (share < cut) break;
    }
    map[hexOf(c.p)] = targets[t]!;
    acc += c.n;
  }
  for (const [from, to] of Object.entries(roles)) map[from.toUpperCase()] = to;
  return map;
}

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 200 });
  else window.setTimeout(fn, 0);
};

/** A drawable with `steps` palette steps toward `map`; variants are built off the frame and kept around the current step. */
export class Stepper {
  private readonly cache = new Map<number, HTMLCanvasElement>();
  private readonly pending = new Set<number>();
  private targets: number[] | null = null;

  constructor(
    readonly src: Drawable,
    private readonly map: ColorMap,
    readonly steps = NIGHT_STEPS,
  ) {}

  /** The best variant available for step `k` (never blocks: builds in idle time and returns the nearest lower step meanwhile). */
  at(k: number): Drawable {
    const want = Math.max(0, Math.min(this.steps, Math.round(k)));
    if (want === 0) return this.src;
    for (const n of [want, want + 1, want - 1]) if (n > 0 && n <= this.steps && !this.cache.has(n)) this.schedule(n);
    for (let n = want; n > 0; n--) {
      const v = this.cache.get(n);
      if (v) {
        this.evict(want);
        return v;
      }
    }
    return this.src;
  }

  private schedule(k: number): void {
    if (this.pending.has(k)) return;
    this.pending.add(k);
    idle(() => {
      this.pending.delete(k);
      if (!this.cache.has(k)) this.cache.set(k, this.build(k));
    });
  }

  private evict(current: number): void {
    for (const k of [...this.cache.keys()]) if (Math.abs(k - current) > 2) this.cache.delete(k);
  }

  private build(k: number): HTMLCanvasElement {
    const im = indexed(this.src);
    if (!this.targets) this.targets = im.colors.map((p) => {
      const to = this.map[hexOf(p)];
      return to ? pack(...hexToRgb(to)) : p;
    });
    const u = k / this.steps;
    const pal = im.colors.map((p, i) => {
      const q = this.targets![i]!;
      const r = Math.round(((p >> 16) & 255) + ((((q >> 16) & 255) - ((p >> 16) & 255)) * u));
      const g = Math.round(((p >> 8) & 255) + ((((q >> 8) & 255) - ((p >> 8) & 255)) * u));
      const b = Math.round((p & 255) + (((q & 255) - (p & 255)) * u));
      return [r, g, b] as const;
    });
    const canvas = document.createElement('canvas');
    canvas.width = im.w;
    canvas.height = im.h;
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(im.w, im.h);
    const d = out.data;
    for (let i = 0, n = im.w * im.h; i < n; i++) {
      const a = im.alpha[i]!;
      if (a === 0) continue;
      const c = pal[im.idx[i]!]!;
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = a;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }
}

interface Run {
  y: number;
  x0: number;
  x1: number;
}
interface LitWindow {
  runs: Run[];
}
/** The windows of a layer: glass-role pixels grouped into connected components, lit one by one. */
export class Lights {
  readonly overlay: HTMLCanvasElement;
  private components: LitWindow[] | null = null;
  private state: Float32Array | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly litRgb: [number, number, number];

  /**
   * @param wrap true for a layer tiled plainly at its own width: a window cut by the tile edge
   *   continues at the other edge of the next tile, so the two parts are one window
   */
  constructor(
    readonly src: Drawable,
    private readonly glass: string[],
    private readonly lit: string,
    private readonly wrap = false,
  ) {
    this.overlay = document.createElement('canvas');
    this.overlay.width = src.width;
    this.overlay.height = src.height;
    this.ctx = this.overlay.getContext('2d')!;
    this.litRgb = hexToRgb(lit);
  }

  /** Build the component list off the frame. */
  prepare(): void {
    if (this.components) return;
    idle(() => {
      if (!this.components) this.components = this.find();
    });
  }

  get count(): number {
    return this.components?.length ?? 0;
  }

  /**
   * Light the windows smoothly: of the first `share` of them (in the shuffled order), each fades in
   * over `fade` of the layer's lighting range, their starts spread across the rest of it, so at
   * any moment a few are mid-fade while earlier ones glow and later ones are still dark. Only the
   * windows whose alpha changed are repainted. Returns the overlay, or null while nothing is lit.
   */
  at(progress: number, share: number, fade = 0.2): Drawable | null {
    if (!this.components) {
      this.prepare();
      return null;
    }
    const m = Math.min(this.components.length, Math.round(this.components.length * share));
    if (!this.state || this.state.length !== m) {
      this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.state = new Float32Array(m);
    }
    const spread = 1 - fade;
    let any = false;
    for (let i = 0; i < m; i++) {
      const start = (i / Math.max(1, m)) * spread;
      const a = Math.min(1, Math.max(0, (progress - start) / fade));
      if (a > 0) any = true;
      if (a === this.state[i]) continue;
      // Only the glass pixels light, so the frame between a window's panes keeps the facade's night colour.
      const w = this.components[i]!;
      for (const r of w.runs) this.ctx.clearRect(r.x0, r.y, r.x1 - r.x0 + 1, 1);
      if (a > 0) {
        this.ctx.fillStyle = `rgb(${this.litRgb[0]} ${this.litRgb[1]} ${this.litRgb[2]} / ${a.toFixed(3)})`;
        for (const r of w.runs) this.ctx.fillRect(r.x0, r.y, r.x1 - r.x0 + 1, 1);
      }
      this.state[i] = a;
    }
    return any ? this.overlay : null;
  }

  private find(): LitWindow[] {
    const im = indexed(this.src);
    const glassIdx = new Set<number>();
    const wanted = new Set(this.glass.map((h) => pack(...hexToRgb(h))));
    im.colors.forEach((p, i) => {
      if (wanted.has(p)) glassIdx.add(i);
    });
    const { w, h, idx, alpha } = im;
    const seen = new Uint8Array(w * h);
    const isGlass = (i: number) => alpha[i] !== 0 && glassIdx.has(idx[i]!);
    const comps: Run[][] = [];
    const stack: number[] = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !isGlass(start)) continue;
      const runs: Run[] = [];
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        const y = (i / w) | 0;
        let x0 = i % w;
        let x1 = x0;
        while (x0 - 1 >= 0 && !seen[y * w + x0 - 1] && isGlass(y * w + x0 - 1)) {
          x0--;
          seen[y * w + x0] = 1;
        }
        while (x1 + 1 < w && !seen[y * w + x1 + 1] && isGlass(y * w + x1 + 1)) {
          x1++;
          seen[y * w + x1] = 1;
        }
        runs.push({ y, x0, x1 });
        for (const ny of [y - 1, y + 1]) {
          if (ny < 0 || ny >= h) continue;
          for (let x = x0; x <= x1; x++) {
            const j = ny * w + x;
            if (!seen[j] && isGlass(j)) {
              seen[j] = 1;
              stack.push(j);
            }
          }
        }
      }
      comps.push(runs);
    }
    return shuffle(mergePanes(comps, this.wrap ? w : 0));
  }
}

/** Bounding box of a component. */
function box(runs: Run[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of runs) {
    if (r.x0 < x0) x0 = r.x0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.y < y0) y0 = r.y;
    if (r.y > y1) y1 = r.y;
  }
  return { x0, y0, x1, y1 };
}

/** Frames between panes of one window are up to this wide; walls between windows are wider. */
const MULLION = 6;

/**
 * Panes of one window are separate glass components split by a mullion: stacked panes share
 * their left and right edges, side-by-side panes share their top or their sill (a balcony door
 * whose glass runs on behind the railing stands beside the window panes under one lintel), and the
 * glass seen between a balcony's slats lies within the columns of the pane right above it (a
 * transom, within the window under it). Merge them so a window lights as one, on its glass pixels
 * only. What is still narrow and short after that, or a single row, in a layer whose windows are
 * big is a sliver by a drainpipe or a cut edge, not a window: it never lights.
 */
function mergePanes(comps: Run[][], wrapWidth = 0): LitWindow[] {
  const boxes = comps.map(box);
  const parent = comps.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  if (wrapWidth) {
    // The tile edge cuts through windows: the part ending on the last column and the part starting
    // on the first column of the next tile share their rows and are one window.
    const atRight = boxes.map((_, i) => i).filter((i) => boxes[i]!.x1 === wrapWidth - 1);
    const atLeft = boxes.map((_, i) => i).filter((i) => boxes[i]!.x0 === 0);
    for (const i of atRight) {
      for (const j of atLeft) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (Math.abs(a.y0 - b.y0) <= 1 && Math.abs(a.y1 - b.y1) <= 1) parent[root(i)] = root(j);
      }
    }
  }
  const byRow = boxes.map((_, i) => i).sort((a, b) => boxes[a]!.y0 - boxes[b]!.y0);
  for (let oi = 0; oi < byRow.length; oi++) {
    const i = byRow[oi]!;
    const a = boxes[i]!;
    for (let oj = oi + 1; oj < byRow.length; oj++) {
      const j = byRow[oj]!;
      const b = boxes[j]!;
      if (b.y0 - a.y1 - 1 > MULLION) break; // sorted by top row: nothing later starts close enough
      const vGap = b.y0 - a.y1 - 1;
      const hGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1;
      const aligned = Math.abs(a.y0 - b.y0) <= 1 || Math.abs(a.y1 - b.y1) <= 1;
      const sameCols = Math.abs(a.x0 - b.x0) <= 1 && Math.abs(a.x1 - b.x1) <= 1;
      const inside = (n: typeof a, wide: typeof a) => n.x0 >= wide.x0 - 1 && n.x1 <= wide.x1 + 1 && n.x1 - n.x0 < wide.x1 - wide.x0;
      if (aligned && hGap >= 0 && hGap <= MULLION) parent[root(i)] = root(j);
      else if (vGap >= 0 && vGap <= MULLION && (sameCols || inside(b, a) || inside(a, b))) parent[root(i)] = root(j);
    }
  }
  const groups = new Map<number, Run[]>();
  comps.forEach((runs, i) => {
    const r = root(i);
    const g = groups.get(r);
    if (g) g.push(...runs);
    else groups.set(r, [...runs]);
  });
  const windows = [...groups.values()].map((runs) => ({ runs, ...box(runs) }));
  const median = (vs: number[]) => vs.sort((a, b) => a - b)[vs.length >> 1] ?? 0;
  const typicalW = median(windows.map((w) => w.x1 - w.x0 + 1));
  const typicalH = median(windows.map((w) => w.y1 - w.y0 + 1));
  return windows
    .filter((w) => {
      const ww = w.x1 - w.x0 + 1;
      const hh = w.y1 - w.y0 + 1;
      const sliver = typicalW > 2 * MULLION && ww <= MULLION && hh < 4 * MULLION;
      const line = typicalH >= 8 && hh <= 2;
      return !sliver && !line;
    })
    .map(({ runs }) => ({ runs }));
}

/** A deterministic shuffle, so windows light across the facade rather than in scan order. */
function shuffle<T>(items: T[]): T[] {
  let seed = 1664525;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
