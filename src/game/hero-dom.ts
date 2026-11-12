/**
 * The opening's DOM: the monitor poster in its canvas, PRESS START laid on the
 * screen, and the static opening used wherever there is no 3D (reduced motion, no WebGL, a 3D that
 * failed or never arrived): the powered-on poster with PRESS START placed on its screen.
 */
import { POSTER } from '../monitor/poster';
import { quadMatrix, subQuad, type Quad } from './quad';

export interface HeroDom {
  stage: HTMLElement;
  gl: HTMLCanvasElement;
  slot: HTMLElement;
  poster: HTMLCanvasElement;
  start: HTMLElement;
  startButton: HTMLButtonElement;
}

export function queryHero(section: HTMLElement): HeroDom | null {
  const q = <T extends HTMLElement>(sel: string) => section.querySelector<T>(sel);
  const stage = q<HTMLElement>('[data-stage]');
  const gl = q<HTMLCanvasElement>('[data-gl]');
  const slot = q<HTMLElement>('[data-monitor]');
  const poster = q<HTMLCanvasElement>('[data-poster]');
  const start = q<HTMLElement>('[data-start]');
  const startButton = q<HTMLButtonElement>('[data-start-button]');
  if (!stage || !gl || !slot || !poster || !start || !startButton) return null;
  return { stage, gl, slot, poster, start, startButton };
}

/**
 * START's rectangle on the screen, u and v across the opening (0–1): the window drawn at its true size —
 * one CSS px per px, like every other window on the page, the same in both directions — measured against
 * the screen as it is drawn (the poster's screen, which the 3D at rest matches). Only a screen too small to
 * hold it shrinks it, evenly. Centred a little above the middle so Sam and the ground stay in view below.
 */
export function startRect(d: HeroDom): [number, number, number, number] {
  const q = posterScreen(d);
  const sw = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
  const sh = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
  const w = Math.max(1, d.start.offsetWidth);
  const h = Math.max(1, d.start.offsetHeight);
  const k = Math.min(1, (0.9 * sw) / w, (0.8 * sh) / h);
  const fw = (k * w) / Math.max(1, sw);
  const fh = (k * h) / Math.max(1, sh);
  const vc = 0.42;
  return [0.5 - fw / 2, vc - fh / 2, 0.5 + fw / 2, vc + fh / 2];
}

/**
 * PRESS START carries the tube's scanlines at the screen's own period: `lines` across the opening's
 * height, of which its box spans v0–v1, so one line is this many of its own px.
 */
export function scanStart(d: HeroDom, rect: [number, number, number, number], lines: number): void {
  const fh = rect[3] - rect[1];
  if (fh > 0 && lines > 0) d.start.style.setProperty('--scan', `${(d.start.offsetHeight / (fh * lines)).toFixed(3)}px`);
}

/** Lay PRESS START on `quad`, px of the stage. */
export function placeStart(d: HeroDom, quad: Quad): void {
  d.start.style.transform = quadMatrix(d.start.offsetWidth, d.start.offsetHeight, quad);
}

/** The slot's box in px of the stage. */
export function slotBox(d: HeroDom): { x: number; y: number; w: number; h: number } {
  const s = d.slot.getBoundingClientRect();
  const st = d.stage.getBoundingClientRect();
  return { x: s.left - st.left, y: s.top - st.top, w: s.width, h: s.height };
}

/** The poster's screen, px of the stage. */
function posterScreen(d: HeroDom): Quad {
  const b = slotBox(d);
  return POSTER.screen.map(([fx, fy]) => [b.x + fx * b.w, b.y + fy * b.h]) as unknown as Quad;
}

/** Paint a poster into the canvas: `off` (dark glass) while the 3D loads, `on` where there is no 3D. */
function paintPoster(d: HeroDom, which: 'on' | 'off'): Promise<void> {
  if (d.poster.dataset.state === which && d.poster.dataset.painted === '1') return Promise.resolve();
  d.poster.dataset.state = which;
  d.poster.dataset.painted = '';
  const src = which === 'on' ? d.poster.dataset.on : d.poster.dataset.off;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (d.poster.dataset.state !== which) return resolve();
      const ctx = d.poster.getContext('2d')!;
      ctx.clearRect(0, 0, d.poster.width, d.poster.height);
      ctx.drawImage(img, 0, 0, d.poster.width, d.poster.height);
      d.poster.dataset.painted = '1';
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src ?? '';
  });
}

/**
 * The static opening: the powered-on poster with PRESS START on its screen, placed again on every
 * resize. Whoever owns the page wires the button.
 */
export function staticHero(d: HeroDom): void {
  const place = () => {
    const r = startRect(d);
    placeStart(d, subQuad(posterScreen(d), r[0], r[1], r[2], r[3]));
    scanStart(d, r, POSTER.scanLines);
  };
  d.poster.classList.remove('is-hidden');
  d.gl.classList.remove('is-on');
  void paintPoster(d, 'on').then(() => {
    place();
    d.start.classList.add('is-ready');
  });
  window.addEventListener('resize', place, { passive: true });
}
