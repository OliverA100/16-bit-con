/**
 * Sam on the Register window: where the breakout lands him, and where the static
 * page (reduced motion, no WebGL) shows him from the start. His own idle sheet with the brand goggles,
 * one 60 × 60 cell on a canvas the page sizes to whole device px per art px; idling once he is there.
 */
import { sprites } from '../data/sprites.manifest';
import { remap, SAM_BRAND_MAP } from './palette';
import { loadImage, makeStrip, type Strip } from './sprites';

/** The idle loop's pace, ms a frame (as in the game). */
const IDLE_MS = 125;

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

/** Draw one cell of a strip into the perch canvas (its own 60 × 60 art px). */
export function drawCell(canvas: HTMLCanvasElement, strip: Strip, frame: number): void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strip.draw(ctx, frame, 0, 0, false);
}

/** The static page: Sam already on the Register window, one still frame. */
export async function perchStill(perch: Perch): Promise<void> {
  const idle = makeStrip(remap(await loadImage(sprites.samIdle.file), SAM_BRAND_MAP));
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
  // a landing restarts the loop if it had stopped while he was away
  perch.root.addEventListener('landed', () => {
    frame = -1;
    if (!timer) tick();
  });
}
