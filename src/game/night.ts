/**
 * Night: palette maps for buildings, street and props, applied in small
 * steps. Each source colour moves toward its night token over NIGHT_STEPS equal steps; layers step
 * far first, near last. Step k is exactly the source with the fully mapped night image drawn over
 * it at opacity k / NIGHT_STEPS (a per-pixel linear blend), so each layer needs one night image —
 * built in a worker at load, in the order the night reaches them — and each step is two GPU draws
 * into one reused canvas. Nothing here ever blocks: a layer whose night image is not back yet draws
 * its day colours, windows whose list is not back yet stay dark. Lit windows are painted one by one
 * onto an overlay, each fading in over a short stretch of scroll; everything is a function of t.
 */
import { hexToRgb, readToken } from './palette';
import type { Drawable } from './sprites';
import { findWindows, indexImage, mapOf, nightImage, windowSprites, type ColorMap, type NightSpec } from './night-core';

export type { ColorMap, NightSpec } from './night-core';
export const NIGHT_STEPS = 12;
/** Opacity levels a window passes through as it lights. */
const FADE_LEVELS = 12;

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

/** A night palette by luminance rank into `targets` (pixel-share `weights`), with explicit role colours on top. */
export const rank = (targets: string[], weights?: number[], roles: ColorMap = {}): NightSpec => ({ rank: { targets, weights, roles } });

// ── The job queue: a worker when there is one, else one job per idle callback ──────────────
type NightResult = { bitmap: ImageBitmap };
type LightsResult = { boxes: Int32Array; sprites: Drawable[] };
type Job =
  | { kind: 'night'; src: Drawable; spec: NightSpec; done: (r: NightResult) => void }
  | { kind: 'lights'; src: Drawable; glass: string[]; wrap: boolean; lit: string; done: (r: LightsResult) => void };

class NightJobs {
  private worker: Worker | null = null;
  private readonly waiting = new Map<number, (r: never) => void>();
  private next = 1;
  private chain: Promise<void> = Promise.resolve();

  constructor() {
    try {
      if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
        this.worker = new Worker(new URL('./night.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<{ id: number } & Record<string, unknown>>) => {
          const done = this.waiting.get(e.data.id);
          this.waiting.delete(e.data.id);
          done?.(e.data as never);
        };
      }
    } catch {
      this.worker = null;
    }
  }

  /** Jobs run in the order they are queued. */
  add(job: Job): void {
    if (this.worker) {
      const id = this.next++;
      this.waiting.set(id, job.done as (r: never) => void);
      // createImageBitmap is async and off-thread; chaining keeps the posting order = the queue order.
      this.chain = this.chain.then(async () => {
        const bitmap = await createImageBitmap(job.src);
        const msg = job.kind === 'night' ? { id, kind: 'night', bitmap, spec: job.spec } : { id, kind: 'lights', bitmap, glass: job.glass, wrap: job.wrap, lit: job.lit };
        this.worker!.postMessage(msg, [bitmap]);
      });
      return;
    }
    this.chain = this.chain.then(() => new Promise<void>((resolve) => idle(() => {
      runHere(job);
      resolve();
    })));
  }
}

/** The fallback: the same work on the main thread, one job per idle callback. */
function runHere(job: Job): void {
  const c = document.createElement('canvas');
  c.width = job.src.width;
  c.height = job.src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(job.src, 0, 0);
  const im = indexImage(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  if (job.kind === 'night') {
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const data = ctx.createImageData(c.width, c.height);
    data.data.set(nightImage(im, mapOf(im, job.spec)));
    out.getContext('2d')!.putImageData(data, 0, 0);
    (job.done as unknown as (r: { bitmap: Drawable }) => void)({ bitmap: out });
  } else {
    const { boxes, pixels } = windowSprites(findWindows(im, job.glass, job.wrap), hexToRgb(job.lit));
    const sprites = pixels.map((px, i) => {
      const s = document.createElement('canvas');
      s.width = boxes[i * 4 + 2]!;
      s.height = boxes[i * 4 + 3]!;
      const sctx = s.getContext('2d')!;
      const d = sctx.createImageData(s.width, s.height);
      d.data.set(px);
      sctx.putImageData(d, 0, 0);
      return s;
    });
    job.done({ boxes, sprites });
  }
}

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 500 });
  else window.setTimeout(fn, 16);
};

let jobs: NightJobs | null = null;
const queue = () => (jobs ??= new NightJobs());

/** A drawable with NIGHT_STEPS palette steps toward its night palette. Queue `prepare()` in need order. */
export class Stepper {
  private night: Drawable | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private shown = -1;
  private queued = false;

  constructor(
    readonly src: Drawable,
    private readonly spec: NightSpec,
    readonly steps = NIGHT_STEPS,
  ) {}

  /** Queue this layer's night image. */
  prepare(): this {
    if (this.queued) return this;
    this.queued = true;
    queue().add({
      kind: 'night',
      src: this.src,
      spec: this.spec,
      done: (r) => {
        this.night = r.bitmap;
        // Compose the first step now, in idle time, so the night image's GPU upload never lands on a scroll frame.
        idle(() => this.at(1));
      },
    });
    return this;
  }

  get ready(): boolean {
    return this.night !== null;
  }

  /** Step k: the source with the night image over it at k / steps. The day image until the night one is ready. */
  at(k: number): Drawable {
    const want = Math.max(0, Math.min(this.steps, Math.round(k)));
    if (!this.queued) this.prepare();
    if (want === 0 || !this.night) return this.src;
    if (want === this.steps) return this.night;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.src.width;
      this.canvas.height = this.src.height;
    }
    if (this.shown !== want) {
      const ctx = this.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.src, 0, 0);
      ctx.globalAlpha = want / this.steps;
      ctx.drawImage(this.night, 0, 0);
      ctx.globalAlpha = 1;
      this.shown = want;
    }
    return this.canvas;
  }
}

/** The windows of a layer: glass-role pixels grouped into connected components, lit one by one. */
export class Lights {
  readonly overlay: HTMLCanvasElement;
  private components: { boxes: Int32Array; sprites: Drawable[] } | null = null;
  private state: Float32Array | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private queued = false;

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
  }

  /** Queue the window list. */
  prepare(): void {
    if (this.queued) return;
    this.queued = true;
    queue().add({ kind: 'lights', src: this.src, glass: this.glass, wrap: this.wrap, lit: this.lit, done: (r) => (this.components = r) });
  }

  get count(): number {
    return this.components?.sprites.length ?? 0;
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
    const { boxes, sprites } = this.components;
    const m = Math.min(sprites.length, Math.round(sprites.length * share));
    const ctx = this.ctx;
    if (!this.state || this.state.length !== m) {
      ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.state = new Float32Array(m);
    }
    const spread = 1 - fade;
    let any = false;
    for (let i = 0; i < m; i++) {
      const start = (i / Math.max(1, m)) * spread;
      // Twelve opacity levels per fade: smooth to the eye, and a window repaints only when it crosses one.
      const a = Math.round(Math.min(1, Math.max(0, (progress - start) / fade)) * FADE_LEVELS) / FADE_LEVELS;
      if (a > 0) any = true;
      const was = this.state[i]!;
      if (a === was) continue;
      // Only this window changes: its sprite holds its own glass pixels only, so erasing with it
      // (destination-out) and redrawing it leaves every other window — and the mullions — as they are.
      const sprite = sprites[i]!;
      const x = boxes[i * 4]!;
      const y = boxes[i * 4 + 1]!;
      if (was > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.drawImage(sprite, x, y);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, x, y);
      }
      ctx.globalAlpha = 1;
      this.state[i] = a;
    }
    return any ? this.overlay : null;
  }

}
