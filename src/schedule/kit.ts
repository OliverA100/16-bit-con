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
  /** Device px per art px: the canvas is drawn in device pixels, everything placed on whole art pixels
      except what drifts (clouds), which may step by a device pixel for smooth slow motion. */
  k: number;
}

export interface Scene {
  draw(ctx: CanvasRenderingContext2D, t: number, v: View): void;
  /** A number that changes whenever the picture would: the runner redraws only then. */
  key(t: number, v: View): number;
  /** Scene time to start from, and the time of the reduced-motion still. */
  start?: number;
  still?: number;
  /** Draw over the text's area on phones too (the runner otherwise clips the scene below the text there). */
  overText?: boolean;
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

/**
 * Someone (or something) on the ground: drawn with its bottom row, where every sheet's feet are, on a
 * feet line, at a scene time, optionally mirrored to face the other way.
 */
export type Standing = (ctx: CanvasRenderingContext2D, t: number, x: number, feet: number) => void;

/** A single pose standing on a feet line. */
export const standStill = (src: Drawable, flip = false): Standing => (ctx, _t, x, feet) => put(ctx, src, x, feet - src.height + 1, flip);

/** An animated strip standing on a feet line, looping at `fps`. */
export const standAnim = (s: Strip, fps: number, flip = false): Standing => (ctx, t, x, feet) =>
  s.draw(ctx, frameAt(t, fps, s.frames), x, feet - s.fh + 1, flip);

export interface Cloud {
  src: Drawable;
  /** Start x as a fraction of the view, row from the top, speed in art px / s. */
  x: number;
  y: number;
  speed: number;
}

/**
 * The top of a scene's sky in art px: under the text on phones (the text sits over the scene's top),
 * the folder's top on wide folders (where the sky beside the text is the scene's too).
 */
export const skyTop = (v: View) => (v.narrow ? v.clear.y : 0);

/** 0 → len → 0 → …: a position that drifts to an end and back, never wrapping. */
const pingpong = (x: number, len: number) => {
  if (len <= 0) return 0;
  const m = wrap(x, 2 * len);
  return m <= len ? m : 2 * len - m;
};

/**
 * Clouds drifting slowly to and fro in the sky beside the text (right of it on wide folders, under it on
 * phones), each turning back at the edge of that sky: never cut by an edge, never popping in.
 */
/** Clouds drift at this many times their own speed, a device pixel at a time. */
const CLOUD_PACE = 2;

const cloudX = (c: Cloud, t: number, v: View) => {
  const x0 = v.narrow ? 0 : v.clear.x;
  const room = v.w - x0 - c.src.width;
  return Math.round((x0 + pingpong(c.x * room + c.speed * CLOUD_PACE * t, room)) * v.k) / v.k;
};

export function drawClouds(ctx: CanvasRenderingContext2D, clouds: Cloud[], t: number, v: View): void {
  for (const c of clouds) ctx.drawImage(c.src, cloudX(c, t, v), Math.round(skyTop(v) + c.y));
}

export function cloudsKey(clouds: Cloud[], t: number, v: View): number {
  return stateKey(skyTop(v), ...clouds.map((c) => cloudX(c, t, v) * v.k));
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
