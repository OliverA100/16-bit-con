/**
 * The page's footer: Vega's golden evening field (as the Closing Credits folder draws it) in a band under
 * the footer's text, whole, at the page's Sam scale (--sam-px, whole device px per art px), so Sam, the
 * ground and the beanstalk share one pixel size. Two canvases: the back (clouds drifting, the golden
 * hills, Vega's two daisies swaying) and the front (the meadow, Sam's ground), with the beanstalk's foot
 * between them so it grows out of the meadow.
 *
 * It moves only while the band is on screen with the game on the page (not on the static page, not with
 * reduced motion, not under the Register dialog); otherwise the band is one still.
 */
import { sprites } from '../data/sprites.manifest';
import { cloudsKey, daisyFrames, drawClouds, frameAt, img, paintGoldenHills, paintMeadow, put, stateKey, sunsetArt, sunsetDaisies, SWAY_FPS, type Cloud, type View } from '../schedule/kit';

/**
 * The band in art rows: the ground line (the meadow's surface) this many rows above its bottom, so the
 * meadow shows whole, down to its last row (51 rows, its surface at row 6). The field is never cropped.
 */
export const FOOTER_GROUND_BELOW = 45;


const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/** CSS px per art px: the page's Sam scale. */
export function samPx(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sam-px'));
  return v > 0 ? v : 2;
}

/** Device px per art px for the page's Sam scale: whole, never 0. */
export function samK(): number {
  return Math.max(1, Math.round(samPx() * (window.devicePixelRatio || 1)));
}

/** The footer band: the page Sam reads its ground line from it. */
export function queryFooterScene(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-footer-scene]');
}

/** The ground line in page px (the band's canvases are anchored to its bottom, in whole art px). */
export function footerGroundY(scene: HTMLElement): number {
  const r = scene.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return r.bottom + window.scrollY - (FOOTER_GROUND_BELOW * samK()) / dpr;
}

export async function startFooter(): Promise<void> {
  const scene = queryFooterScene();
  const back = scene?.querySelector<HTMLCanvasElement>('[data-footer-back]');
  const front = scene?.querySelector<HTMLCanvasElement>('[data-footer-front]');
  if (!scene || !back || !front) return;
  const [art, daisy, lg, md] = await Promise.all([sunsetArt(), daisyFrames(), img(sprites.cloudLg.file), img(sprites.cloudMd.file)]);
  // as in the folder: the big cloud over the hills, the smaller one lower and to the left
  const clouds: Cloud[] = [
    { src: lg, x: 0.4, y: 0, speed: 2 },
    { src: md, x: 0.05, y: 40, speed: 3 },
  ];

  let view: View | null = null;
  let t = 0;
  let lastKey = NaN;
  let visible = false;
  let raf = 0;
  let last = 0;
  const moving = () => !reduced.matches && document.documentElement.classList.contains('has-game') && !document.documentElement.classList.contains('is-paused');

  /** Fit both canvases to the band in whole art px, anchored bottom-left (as the schedule's scenes are). */
  const size = (): boolean => {
    const r = scene.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const k = samK();
    const w = Math.ceil((r.width * dpr) / k);
    const hh = Math.ceil((r.height * dpr) / k);
    if (view && view.w === w && view.h === hh && view.k === k) return false;
    for (const c of [back, front]) {
      c.width = w * k;
      c.height = hh * k;
      c.style.width = `${(w * k) / dpr}px`;
      c.style.height = `${(hh * k) / dpr}px`;
    }
    view = { w, h: hh, narrow: false, clear: { x: 0, y: 0 }, k };
    paintFront();
    lastKey = NaN;
    return true;
  };

  const ground = (v: View) => v.h - FOOTER_GROUND_BELOW;

  /** The front never moves: the meadow, drawn once per size. */
  const paintFront = () => {
    if (!view) return;
    const ctx = front.getContext('2d')!;
    ctx.setTransform(view.k, 0, 0, view.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.w, view.h);
    paintMeadow(ctx, art, ground(view), view.w);
  };

  const drawBack = () => {
    if (!view) return;
    const f = frameAt(t, SWAY_FPS, daisy.length);
    const key = stateKey(f, cloudsKey(clouds, t, view), view.w, view.h, view.k);
    if (key === lastKey) return;
    lastKey = key;
    const ctx = back.getContext('2d')!;
    ctx.setTransform(view.k, 0, 0, view.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.w, view.h);
    const gy = ground(view);
    drawClouds(ctx, clouds, t, view);
    paintGoldenHills(ctx, art, gy, view.w);
    // the daisies stand on the right, their stems running down behind the meadow
    for (const d of sunsetDaisies(view.w, gy, 0).reverse()) put(ctx, daisy[(f + d.phase) % daisy.length]!, d.x, d.y);
  };

  const tick = (now: number) => {
    raf = 0;
    if (!visible || !moving()) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    drawBack();
    raf = requestAnimationFrame(tick);
  };

  const update = () => {
    size();
    drawBack();
    if (visible && moving() && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    update();
  }).observe(scene);
  new ResizeObserver(update).observe(scene);
  reduced.addEventListener('change', update);
  // pausing (the Register dialog) stops the drift; closing it lets it go on
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  update();
  scene.dataset.drawn = '';
}
