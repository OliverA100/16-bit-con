/**
 * The page's sky after Sam breaks out: Vega's clouds (the blue-and-white set of the game's own sky) drifting
 * slowly across the page at Sam's scale, in lanes from the opening down to the footer's field.
 *
 * They come in naturally, on a breeze: at the breakout every cloud starts just past a screen edge and is blown
 * in, a quarter of a second after the one before, easing out to its own place across the sky within a few
 * seconds; from there it drifts slowly on, and once across it goes out of the other side and comes round again. They sit behind everything on
 * the page (z-index −1, under the page's own text and every window and the drawer), showing in its gaps and
 * margins only, and never take a click. None ever passes behind the opening's text or its 3D (the wordmark,
 * the broken monitor, its remote, the glass on the floor): no cloud's track crosses that band while the
 * opening is on screen. They part into layers as the page scrolls, each at its own rate (as
 * vega.io's do). Only the clouds near the screen move, at whole device px, and nothing
 * moves while the tab is hidden or the Register dialog is open.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { queryFooterScene, samK } from './footer';

/**
 * The clouds, big and small in turn: their own drifting pace (art px a second), and their depth, as vega.io's
 * clouds have it: each moves with the page's scroll at its own rate (1.15–1.7 times the page), the big near
 * ones faster than the small far ones, so they part into layers as the page moves.
 */
const CLOUDS = [
  { key: 'cloudB', speed: 9, depth: 1.7 },
  { key: 'cloudG', speed: 13, depth: 1.25 },
  { key: 'cloudA', speed: 10, depth: 1.5 },
  { key: 'cloudH', speed: 15, depth: 1.15 },
] as const;
/** CSS px of page height per lane of cloud. */
const LANE = 110;
/** A cloud spends this share of the screen's width out of sight between passes. */
const GAP = 0.15;
/** They drift at this share of their CLOUDS pace. */
const DRIFT = 0.5;
/** The breeze at the breakout: seconds between the clouds' entries, and how long each takes to ease to its place. */
const BREEZE_STAGGER = 0.25;
const BREEZE_S = 3.5;

interface Cloud {
  el: HTMLCanvasElement;
  w: number;
  h: number;
  /** The lane's page y (CSS px): where it is when the lane is in the middle of the screen; its scroll rate. */
  y: number;
  /** Where the breeze leaves it: this share of the screen's width in from its entry edge. */
  spot: number;
  depth: number;
  dir: 1 | -1;
  v: number;
  delay: number;
  placed: string;
}

export async function startSky(paused: () => boolean): Promise<void> {
  const scene = queryFooterScene();
  if (!scene) return;
  const images = await Promise.all(CLOUDS.map((c) => loadImage(sprites[c.key].file)));

  const layer = document.createElement('div');
  layer.className = 'page-sky';
  layer.setAttribute('aria-hidden', 'true');
  // behind the page's content (the root's background is under it), clipped to the page's width: no sideways scroll
  Object.assign(layer.style, { position: 'absolute', left: '0', top: '0', width: '100%', zIndex: '-1', overflow: 'hidden', pointerEvents: 'none' });
  document.body.append(layer);

  const t0 = performance.now();
  let clouds: Cloud[] = [];
  let raf = 0;

  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const k = samK();
    const a = k / dpr;
    // from the page's top: after the breakout the opening's own backgrounds clear (World.astro), so it is sky too
    const top = 0;
    const bottom = scene.getBoundingClientRect().top + window.scrollY;
    // down to the page's end: clouds drift behind the footer's hills, which hide them as hills do
    layer.style.height = `${Math.max(0, scene.getBoundingClientRect().bottom + window.scrollY)}px`;
    const n = Math.max(2, Math.floor((bottom - top) / LANE));
    for (const c of clouds) c.el.remove();
    clouds = [];
    // The opening's band (page px): its text and the 3D, from the date line over the wordmark to under the
    // tagline, where the glass lies.
    const vh = window.innerHeight;
    const copy = document.querySelector('.hero__copy')?.getBoundingClientRect();
    const monitor = document.querySelector('.hero__monitor')?.getBoundingClientRect();
    const tagline = document.querySelector('.hero__tagline')?.getBoundingClientRect();
    const hero = document.querySelector('[data-world]')?.getBoundingClientRect();
    const bandTop = Math.min(copy?.top ?? Infinity, monitor?.top ?? Infinity);
    const band = Number.isFinite(bandTop) && tagline ? { top: bandTop + window.scrollY - 12, bottom: tagline.bottom + window.scrollY + 24 } : null;
    const heroEnd = hero ? Math.max(0, hero.bottom + window.scrollY) : 0;
    /** A cloud's page y at scroll s (its depth: on its lane when the lane is mid-screen). */
    const yAt = (y: number, h: number, depth: number, sc: number) => y - (depth - 1) * (sc - (y + h / 2 - vh / 2));
    // Two clouds a lane, a big one and a small one, set off at different places across the sky (as dense as vega.io's
    // sky: some nine on screen); their different depths part them as the page scrolls.
    const step = (bottom - top) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        const m = i * 2 + j;
        const pick = (i + j * 3) % CLOUDS.length;
        const spec = CLOUDS[pick]!;
        const img = images[pick]!;
        const h = img.height * a;
        // lanes spread down the page, a little off an even step so they never line up
        const y = Math.round((top + step * (i + 0.5) + ((m * 37) % 60) - 30 + j * 18 - h / 2) * dpr) / dpr;
        // over every scroll that shows the opening, its track stays clear of the 3D's band (the track is linear in the scroll)
        if (band) {
          const y0 = yAt(y, h, spec.depth, 0);
          const y1 = yAt(y, h, spec.depth, heroEnd);
          if (Math.min(y0, y1) < band.bottom && Math.max(y0, y1) + h > band.top) continue;
        }
        const el = document.createElement('canvas');
        el.width = img.width;
        el.height = img.height;
        const ctx = el.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${img.width * a}px`, height: `${h}px`, imageRendering: 'pixelated' });
        layer.append(el);
        // places spread over the width (golden-ratio steps, so neighbours never bunch), the pair apart
        const first = 0.08 + ((i * 0.618) % 1) * 0.8;
        const spot = j === 0 ? first : 0.05 + ((first + 0.45) % 0.9);
        clouds.push({ el, w: img.width * a, h, y, spot, depth: spec.depth, dir: i % 2 === 0 ? 1 : -1, v: spec.speed * DRIFT * a, delay: m * (BREEZE_STAGGER / 2), placed: '' });
      }
    draw(performance.now(), true);
  };

  /** Where each cloud is at time `now`: off the screen's edge until its turn, blown in to its place, then drifting across and round again. */
  const draw = (now: number, all = false) => {
    const dpr = window.devicePixelRatio || 1;
    const vw = document.documentElement.clientWidth;
    const s = window.scrollY;
    const vh = window.innerHeight;
    const t = (now - t0) / 1000;
    for (const c of clouds) {
      // its depth: at its own rate with the page's scroll, on its lane when the lane is mid-screen
      const y = Math.round((c.y - (c.depth - 1) * (s - (c.y + c.h / 2 - vh / 2))) * dpr) / dpr;
      const near = y + c.h > s - 200 && y < s + vh + 200;
      if (!near && !all) continue;
      const period = vw + c.w + GAP * vw;
      const u = Math.min(1, Math.max(0, (t - c.delay) / BREEZE_S));
      const blown = (c.w + c.spot * vw) * (1 - (1 - u) ** 3); // the breeze, easing out
      const d = (blown + Math.max(0, t - c.delay) * c.v) % period; // how far it has come on this pass
      const x = c.dir > 0 ? -c.w + d : vw - d;
      const place = `${Math.round(x * dpr) / dpr},${y}`;
      if (place !== c.placed) {
        c.placed = place;
        c.el.style.transform = `translate(${Math.round(x * dpr) / dpr}px, ${y}px)`;
      }
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (document.hidden || paused()) return;
    draw(now);
    raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && !document.hidden && !paused()) raf = requestAnimationFrame(tick);
  };

  layout();
  window.addEventListener('resize', layout);
  new ResizeObserver(layout).observe(document.body);
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  wake();
}
