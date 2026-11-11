/**
 * What every schedule scene shares: cached loading of Vega's files (the game's loader), Sam's sheets
 * in the brand palette (the game's remap), and small drawing helpers that keep every position on a
 * whole art pixel. Vega's files are never changed; everything derived is made in memory at load.
 */
import { loadImage, makeStrip, type Drawable, type Strip } from '../game/sprites';
import { remap, SAM_BRAND_MAP } from '../game/palette';
import { sprites } from '../data/sprites.manifest';

export type { Drawable, Strip };

export interface View {
  /** Canvas size in art pixels. */
  w: number;
  h: number;
  /** The narrow layout: the scene is a band under the text, not the whole folder. */
  narrow: boolean;
  /**
   * Where the folder's text block ends over the scene, in art px from the canvas's top-left (0, 0
   * when the text is above the scene): scenes keep their detail right of x or below y there.
   */
  clear: { x: number; y: number };
}

export interface Scene {
  draw(ctx: CanvasRenderingContext2D, t: number, v: View): void;
  /** A number that changes whenever the picture would: the runner redraws only then. */
  key(t: number, v: View): number;
  /** Scene time to start from, and the time of the reduced-motion still. */
  start?: number;
  still?: number;
}

export interface SceneModule {
  /** Vega's files the scene draws from: fetched on hover or focus of the tab. */
  files: string[];
  load(): Promise<Scene>;
}

const images = new Map<string, Promise<HTMLImageElement>>();

export function img(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = loadImage(url);
    images.set(url, p);
    p.catch(() => images.delete(url));
  }
  return p;
}

export function preloadFiles(files: string[]): Promise<unknown> {
  return Promise.all(files.map(img));
}

/** Sam's careers-game sheets with the brand goggles and body colours (as the game draws him). */
export async function samStrip(url: string): Promise<Strip> {
  return makeStrip(remap(await img(url), SAM_BRAND_MAP));
}

export async function strip(url: string, fw: number, fh: number, pitch = fw): Promise<Strip> {
  return makeStrip(await img(url), fw, fh, pitch);
}

/**
 * Vega's swaying daisy, lifted out of the clouds it stands in (daisy-clouds-sway): per frame, the
 * head whole, and below it only the stem and leaves (greens and dark outline), at native size.
 * 130 × 318 per frame, the stem's foot at the bottom row.
 */
export const DAISY = { x: 190, y: 10, w: 130, h: 318, head: 140 } as const;
let daisy: Promise<HTMLCanvasElement[]> | null = null;
export function daisyFrames(): Promise<HTMLCanvasElement[]> {
  daisy ??= img(sprites.daisySway.file).then((sheet) =>
    Array.from({ length: sprites.daisySway.frames }, (_, f) =>
      layer(DAISY.w, DAISY.h, (ctx) => {
        ctx.drawImage(sheet, f * sprites.daisySway.fw + DAISY.x, DAISY.y, DAISY.w, DAISY.h, 0, 0, DAISY.w, DAISY.h);
        const im = ctx.getImageData(0, 0, DAISY.w, DAISY.h);
        const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const row = i / 4 / DAISY.w;
          const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
          const lum = (r * 3 + g * 6 + b) / 10;
          const keep = row < DAISY.head || (g > r + 15 && g >= b) || lum < 70;
          if (!keep) d[i + 3] = 0;
        }
        ctx.putImageData(im, 0, 0);
      }),
    ),
  );
  return daisy;
}

/** Frame of a looping animation at `fps`. */
export const frameAt = (t: number, fps: number, frames: number) => Math.floor(t * fps) % frames;

/** x wrapped into [0, period). */
export const wrap = (x: number, period: number) => ((x % period) + period) % period;

/** Combine whole numbers into one state key. */
export function stateKey(...parts: number[]): number {
  let h = 17;
  for (const p of parts) h = (Math.imul(h, 31) + Math.round(p)) | 0;
  return h;
}

/**
 * Draw a horizontal band of `src` (rows sy..sy+sh) repeated across [0, w) at row `dy`, shifted by
 * `offset` art px. Whole pixels only.
 */
export function tileX(ctx: CanvasRenderingContext2D, src: Drawable, sy: number, sh: number, dy: number, w: number, offset = 0): void {
  const period = src.width;
  let x = -wrap(Math.round(offset), period);
  const y = Math.round(dy);
  while (x < w) {
    ctx.drawImage(src, 0, sy, period, sh, x, y, period, sh);
    x += period;
  }
}

/** Draw `src` whole at whole pixels, optionally mirrored in place. */
export function put(ctx: CanvasRenderingContext2D, src: Drawable, x: number, y: number, flip = false): void {
  const dx = Math.round(x);
  const dy = Math.round(y);
  if (!flip) {
    ctx.drawImage(src, dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + src.width, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

export interface Cloud {
  src: Drawable;
  /** Start x as a fraction of the view, row from the top, speed in art px / s. */
  x: number;
  y: number;
  speed: number;
}

/**
 * Clouds drifting right and wrapping round the sky beside the text: from the text block's right edge
 * (`clear.x`) to the view's, cut at that edge so a cloud never passes behind the text.
 */
export function drawClouds(ctx: CanvasRenderingContext2D, clouds: Cloud[], t: number, v: View): void {
  const x0 = v.clear.x;
  const range = v.w - x0;
  ctx.save();
  if (x0 > 0) {
    ctx.beginPath();
    ctx.rect(x0, 0, range, v.h);
    ctx.clip();
  }
  for (const c of clouds) {
    const span = range + c.src.width;
    const x = x0 + wrap(c.x * range + c.speed * t + c.src.width, span) - c.src.width;
    put(ctx, c.src, x, c.y);
  }
  ctx.restore();
}

export function cloudsKey(clouds: Cloud[], t: number, v: View): number {
  return stateKey(v.clear.x, ...clouds.map((c) => Math.floor(c.x * (v.w - v.clear.x) + c.speed * t)));
}

/** A canvas the size of `w` × `h`, drawn once by `paint`, for layers that never move. */
export function layer(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return c;
}

/** Cache a static backdrop per view size. */
export function backdrop(paint: (ctx: CanvasRenderingContext2D, v: View) => void) {
  let cached: { v: View; c: HTMLCanvasElement } | null = null;
  return (v: View): HTMLCanvasElement => {
    if (cached?.v !== v) cached = { v, c: layer(v.w, v.h, (ctx) => paint(ctx, v)) };
    return cached.c;
  };
}
