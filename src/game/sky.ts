/**
 * The page's sky after Sam breaks out: Vega's clouds (the blue-and-white set of the game's own sky) scattered over
 * the page at Sam's scale and drifting on one wind, from the opening down to the footer's field.
 *
 * Natural, not laid out: the clouds are scattered with uneven gaps and never overlap where they are placed; big
 * near ones are many, small far ones fewer, and the near ones drift faster and part more with the scroll (softer than
 * vega.io's depth, so a scroll never flings them). They all arrive together at the breakout, wherever the page is:
 * each fades in over a few seconds, already drifting at its own pace, then drifts on with the wind, out of one side
 * and round again from the other.
 *
 * They sit behind everything on the page (z-index −1, under the page's own text and every window and the drawer),
 * showing in its gaps and margins only, and never take a click. None ever passes behind the opening's text or its
 * 3D (the wordmark, the broken monitor, its remote, the glass on the floor), nor under the nav at the page's top:
 * no drifting cloud's track crosses the opening above its tagline while it is on screen. Instead a few clouds keep
 * to the room either side of the monitor, drifting to and fro there. Only the clouds near the screen move, at
 * whole device px, and nothing moves while the tab is hidden or the Register dialog is open.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { queryFooterScene, samK } from './footer';
import { mulberry32 } from '../lib/math';
import { around, pingpong, snap } from '../lib/drift';

/**
 * The clouds: how often each turns up (big near ones most, small far ones fewer), the wind's pace for each (art px a second: near
 * ones faster), and their depth: each moves with the page's scroll at its own rate (1.03–1.15 times the page,
 * softly), near ones more.
 */
const CLOUDS = [
  { key: 'cloudB', weight: 0.32, speed: 2.4, depth: 1.15 },
  { key: 'cloudA', weight: 0.3, speed: 2, depth: 1.1 },
  { key: 'cloudG', weight: 0.22, speed: 1.6, depth: 1.06 },
  { key: 'cloudH', weight: 0.16, speed: 1.2, depth: 1.03 },
] as const;
/**
 * Each cloud drifts at its own share of its kind's pace, most of them slowly and some barely at all (from about
 * 4 % of it), so the sky never moves in step. Drawn from their own seed, so the clouds' places stay the same.
 */
const paceShare = (r: number) => 0.04 + 0.96 * r * r;
/** About this many clouds on a screen, as on vega.io. */
const PER_SCREEN = 9;
/** CSS px kept between clouds where they are placed, across and down. */
const GAP_X = 70;
const GAP_Y = 22;
/** Out of sight between passes: this share of the screen's width. */
const OFF = 0.15;
/** Arriving: they set off within this many seconds of the breakout, and fade in over GLIDE_S at their own drifting pace. */
const SPREAD_S = 1.2;
const GLIDE_S = 6;
/** The clouds beside the opening's monitor, two a side: which cloud, and its height as a share of the opening's band. */
const SIDES = [
  { side: -1, pick: 1, at: 0.3 },
  { side: -1, pick: 2, at: 0.62 },
  { side: 1, pick: 0, at: 0.24 },
  { side: 1, pick: 3, at: 0.66 },
] as const;

interface Cloud {
  el: HTMLCanvasElement;
  w: number;
  h: number;
  /** Its place: page x and y (CSS px), y where it is when it is mid-screen; its scroll rate and wind (CSS px a second). */
  x: number;
  y: number;
  depth: number;
  v: number;
  /** When it sets off (s from the breakout). */
  start: number;
  /** Beside the opening's monitor: it stays at its height and drifts to and fro in the room beside it, never under it. */
  beside?: { lo: number; hi: number };
  placed: string;
  shown: number;
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

  const make = (pick: number, a: number) => {
    const img = images[pick]!;
    const el = document.createElement('canvas');
    el.width = img.width;
    el.height = img.height;
    const ctx = el.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${img.width * a}px`,
      height: `${img.height * a}px`,
      imageRendering: 'pixelated',
      opacity: '0',
    });
    layer.append(el);
    return { el, w: img.width * a, h: img.height * a };
  };

  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const a = samK() / dpr;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sy = window.scrollY;
    const sceneBox = scene.getBoundingClientRect();
    // down to the page's end: clouds drift behind the footer's hills, which hide them as hills do
    layer.style.height = `${Math.max(0, sceneBox.bottom + sy)}px`;
    for (const c of clouds) c.el.remove();
    clouds = [];
    const rnd = mulberry32(1630);
    const pace = mulberry32(4271);

    // The opening: from the page's top (under the nav) to under its tagline, where the glass lies.
    const box = (sel: string) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r && r.width > 0 ? { left: r.left, right: r.right, top: r.top + sy, bottom: r.bottom + sy } : null;
    };
    const copy = box('.hero__copy');
    const monitor = box('.hero__monitor');
    const tagline = box('.hero__tagline');
    const heroEnd = Math.max(0, (document.querySelector('[data-world]')?.getBoundingClientRect().bottom ?? 0) + sy);
    const bandBottom = tagline ? tagline.bottom + 24 : 0;
    /** A cloud's page y at scroll s (its depth: where it is placed when it is mid-screen). */
    const yAt = (y: number, h: number, depth: number, s: number) => y - (depth - 1) * (s - (y + h / 2 - vh / 2));

    // Scattered over the sky: each tries places at random until one keeps its gaps from the others.
    const bottom = sceneBox.top + sy;
    const want = Math.round((bottom / vh) * PER_SCREEN);
    const pickOf = (r: number) => {
      let acc = 0;
      for (let i = 0; i < CLOUDS.length; i++) if (r < (acc += CLOUDS[i]!.weight)) return i;
      return CLOUDS.length - 1;
    };
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (let tries = 0; tries < want * 40 && placed.length < want; tries++) {
      const pick = pickOf(rnd());
      const spec = CLOUDS[pick]!;
      const img = images[pick]!;
      const w = img.width * a;
      const h = img.height * a;
      const x = rnd() * (vw + w * 0.6) - w * 0.3;
      const y = rnd() * (bottom - h);
      // over every scroll that shows the opening, its track (it drifts all the way across) stays under the tagline
      if (tagline && Math.min(yAt(y, h, spec.depth, 0), yAt(y, h, spec.depth, heroEnd)) < bandBottom) continue;
      if (placed.some((p) => Math.abs(p.x + p.w / 2 - (x + w / 2)) < (p.w + w) / 2 + GAP_X && Math.abs(p.y + p.h / 2 - (y + h / 2)) < (p.h + h) / 2 + GAP_Y))
        continue;
      placed.push({ x, y, w, h });
      const c = make(pick, a);
      clouds.push({
        ...c,
        x: snap(x, dpr),
        y: snap(y, dpr),
        depth: spec.depth,
        v: spec.speed * a * paceShare(pace()),
        start: rnd() * SPREAD_S,
        placed: '',
        shown: -1,
      });
    }

    // Beside the monitor: each at its height in the opening, to and fro in the room left or right of the opening's
    // text and 3D there, partly past the screen's edge if it must be; none where there is no room (phones).
    if (copy && tagline) {
      const zone = [copy, tagline, monitor].filter((r): r is NonNullable<typeof r> => !!r);
      if (monitor) {
        const mw = monitor.right - monitor.left;
        zone.push({
          left: monitor.left - 1.15 * mw,
          right: monitor.right + 0.45 * mw,
          top: monitor.top + 0.55 * (monitor.bottom - monitor.top),
          bottom: tagline.bottom + 24,
        });
      }
      const zoneAt = (y0: number, y1: number) => {
        const hit = zone.filter((r) => r.top - 12 < y1 && r.bottom + 12 > y0);
        return hit.length ? { l: Math.min(...hit.map((r) => r.left)) - 16, r: Math.max(...hit.map((r) => r.right)) + 16 } : null;
      };
      const span = tagline.bottom - copy.top;
      for (const sd of SIDES) {
        const spec = CLOUDS[sd.pick]!;
        const img = images[sd.pick]!;
        const w = img.width * a;
        const h = img.height * a;
        const y = snap(copy.top + sd.at * span - h / 2, dpr);
        const z = zoneAt(y, y + h);
        const lo = sd.side < 0 ? -0.35 * w : (z?.r ?? vw / 2);
        const hi = sd.side < 0 ? (z?.l ?? vw / 2) - w : vw - 0.65 * w;
        if (hi - lo < 16) continue;
        const c = make(sd.pick, a);
        clouds.push({
          ...c,
          x: lo + (0.3 + 0.4 * rnd()) * (hi - lo),
          y,
          depth: 1,
          v: spec.speed * a * paceShare(pace()),
          start: rnd() * SPREAD_S,
          beside: { lo, hi },
          placed: '',
          shown: -1,
        });
      }
    }
    draw(performance.now(), true);
  };

  /** Where each cloud is at time `now`: drifting on the wind at its own pace, fading in at first. */
  const draw = (now: number, all = false) => {
    const dpr = window.devicePixelRatio || 1;
    const vw = document.documentElement.clientWidth;
    const s = window.scrollY;
    const vh = window.innerHeight;
    const t = (now - t0) / 1000;
    for (const c of clouds) {
      const y = snap(c.y - (c.depth - 1) * (s - (c.y + c.h / 2 - vh / 2)), dpr);
      const near = y + c.h > s - 200 && y < s + vh + 200;
      if (!near && !all) continue;
      const u = Math.min(1, Math.max(0, (t - c.start) / GLIDE_S));
      const ease = u * u * (3 - 2 * u); // a gentle start, a gentle stop
      // one pace throughout: it fades in already drifting, reaching its place as it is fully there
      const drift = (Math.max(t, c.start) - c.start - GLIDE_S) * c.v;
      let x: number;
      if (c.beside) {
        const { lo, hi } = c.beside;
        x = lo + pingpong(c.x - lo + drift, hi - lo);
      } else {
        const period = vw + c.w + OFF * vw;
        x = around(c.x + c.w + drift, 0, c.w, period);
      }
      const place = `${snap(x, dpr)},${y}`;
      if (place !== c.placed) {
        c.placed = place;
        c.el.style.transform = `translate(${snap(x, dpr)}px, ${y}px)`;
      }
      // fading in on the 16-bit steps (eighths), then fully there
      const shown = Math.round(ease * 8) / 8;
      if (shown !== c.shown) {
        c.shown = shown;
        c.el.style.opacity = shown >= 1 ? '' : String(shown);
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
