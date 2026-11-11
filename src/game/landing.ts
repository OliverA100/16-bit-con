/**
 * Sam on the Register window: where the breakout lands him, and where the static
 * page (reduced motion, no WebGL) shows him from the start. His own idle sheet with the brand goggles,
 * one 60 × 60 cell on a canvas the page sizes to whole device px per art px; idling once he is there.
 */
import { sprites } from '../data/sprites.manifest';
import { remap, SAM_BRAND_MAP } from './palette';
import { IDLE_FPS } from './sam';
import { loadImage, makeStrip, type Strip } from './sprites';

/** The idle loop's pace, ms a frame (as in the game). */
const IDLE_MS = 1000 / IDLE_FPS;

export interface Perch {
  canvas: HTMLCanvasElement;
  bubble: HTMLElement | null;
  root: HTMLElement;
}

export function queryPerch(): Perch | null {
  const root = document.querySelector<HTMLElement>('[data-landing]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-landing-sam]');
  if (!root || !canvas) return null;
  return { root, canvas, bubble: root.querySelector<HTMLElement>('[data-landing-bubble]') };
}

/**
 * His smile, as Vega draws it on his climbing face: in his fur's shade, a corner one row up at the back, then
 * a short line forward to just short of the nose (which stands at column 38, row 27 in every idle frame),
 * along his own mouth, the row between his muzzle and his jaw. Under the corner, the fur pixel left between
 * his jaw and the line takes the jaw's orange, so the smile reads as one curve.
 */
const SMILE: [number, number][] = [
  [33, 29],
  [34, 30],
  [35, 30],
  [36, 30],
  [37, 30],
];
const JAW_FILL: [number, number] = [33, 30];

/**
 * Sam smiling on the Register window: his idle sheet with the smile drawn in at load, in his own colours read
 * from the sheet (the shade at the back of his jaw, column 30 of row 30; the jaw's orange, column 32 of row 30).
 * Vega's file is untouched.
 */
export function withSmile(idle: Strip): Strip {
  const c = document.createElement('canvas');
  c.width = idle.image.width;
  c.height = idle.image.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(idle.image, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const at = (x: number, y: number) => (y * c.width + x) * 4;
  const colour = (x: number, y: number) => {
    const i = at(x, y);
    return [d[i]!, d[i + 1]!, d[i + 2]!];
  };
  const shade = colour(30, 30);
  const jaw = colour(32, 30);
  const set = (x: number, y: number, v: number[]) => {
    const i = at(x, y);
    d[i] = v[0]!;
    d[i + 1] = v[1]!;
    d[i + 2] = v[2]!;
    d[i + 3] = 255;
  };
  for (let f = 0; f < idle.frames; f++) {
    const x0 = f * idle.pitch;
    for (const [x, y] of SMILE) set(x0 + x, y, shade);
    set(x0 + JAW_FILL[0], JAW_FILL[1], jaw);
  }
  ctx.putImageData(im, 0, 0);
  return makeStrip(c, idle.fw, idle.fh, idle.pitch);
}

/** Draw one cell of a strip into a Sam canvas (its own 60 × 60 art px), mirrored when `flip`. */
export function drawCell(canvas: HTMLCanvasElement, strip: Strip, frame: number, flip = false): void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strip.draw(ctx, frame, 0, 0, flip);
}

/**
 * Sam away from the Register window (out on the page: src/game/journey.ts): his perch and Agent Sam's
 * bubble hide, so there is only ever one Sam; back on it, both return ('returned': the line types again).
 */
export function setAway(perch: Perch, away: boolean): void {
  if (perch.root.classList.contains('is-away') === away) return;
  perch.root.classList.toggle('is-away', away);
  if (!away) perch.root.dispatchEvent(new Event('returned'));
}

/** The static page: Sam already on the Register window, one still frame. */
export async function perchStill(perch: Perch): Promise<void> {
  const idle = withSmile(makeStrip(remap(await loadImage(sprites.samIdle.file), SAM_BRAND_MAP)));
  drawCell(perch.canvas, idle, 0);
  perch.root.classList.add('is-landed');
}

/**
 * Sam idling on the window once he has landed: the idle loop, only while the perch is on screen and
 * he is there (`landed()`), so it costs nothing anywhere else on the page.
 */
export function idleOnPerch(perch: Perch, idle: Strip, landed: () => boolean): void {
  let visible = false;
  let timer = 0;
  let frame = -1;
  const tick = () => {
    if (!visible || !landed()) {
      timer = 0;
      return;
    }
    // hopping (src/game/journey.ts) draws its own frames; the idle picks up again after
    if (perch.root.classList.contains('is-hopping')) {
      frame = -1;
      timer = window.setTimeout(tick, IDLE_MS);
      return;
    }
    const f = Math.floor(performance.now() / IDLE_MS) % idle.frames;
    if (f !== frame) {
      frame = f;
      drawCell(perch.canvas, idle, f);
    }
    timer = window.setTimeout(tick, IDLE_MS);
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !timer) tick();
  }).observe(perch.root);
  // a landing (or coming back from the page) restarts the loop if it had stopped while he was away
  const restart = () => {
    frame = -1;
    if (!timer) tick();
  };
  perch.root.addEventListener('landed', restart);
  perch.root.addEventListener('returned', restart);
}
