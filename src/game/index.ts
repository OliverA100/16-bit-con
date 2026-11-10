/**
 * Boot the world: feature gate, load Level 1, take over the hero area, pin the section with
 * ScrollTrigger, and run the loop. The static hero stays as the fallback when this never runs.
 *
 * Who moves what: native scroll sets the timeline's target and the visual eases
 * toward it — nothing here ever scrolls the page back. Keys and the d-pad run Sam with real
 * velocity, set the timeline directly, and scroll the page to match; a hit on the glass and the
 * auto-break move the target one step and scroll the page with it. Those are the only scrollTo
 * calls. A scroll we did not cause cancels them all for 150 ms. Scroll wins.
 *
 * The opening: a Daisy White page with the monitor, the copy and PRESS START lies over
 * the canvas world. Once the page has loaded and gone idle, the monitor's 3D (three.js, its own
 * chunk) is built a step per task, takes the poster's place in one frame and powers on with the live
 * game on its screen. The pin starts with the enter segment (src/game/segments.ts): scrolling it, the
 * camera dives into the screen and lands on the native pose, and the opening hands over to the canvas
 * world beneath it pixel for pixel. This loop draws the game into the screen frame and renders the 3D
 * while the opening shows, and only the canvas world after. PRESS START plays the segment at the
 * reference's pace (segments.ts PLAY: the dive in 770 ms, 970 ms in all).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { worldBuffer } from './scale';
import { Timeline } from './timeline';
import { Input } from './input';
import { Motion } from './motion';
import { Dust } from './dust';
import { Sam, SAM_CELL } from './sam';
import { Coins, LEVEL1_COINS, TOTAL_COINS } from './coins';
import { loadCity, loadLevel1 } from './assets';
import { Level1 } from './world';
import { Arrival } from './arrival';
import { AUTO_IDLE_MS, AUTO_SPEED, BREAK, CRACK_STAGES, Dissolve, crackStage, dissolveLevel, drawCracks, flightAt, impactPoint, mashTarget, promptOn } from './breakout';
import { skyAt } from './stages';
import { GROUND_BAND } from '../data/layers';
import { levelLabel, railStops, samLines, type SamLine } from '../data/guide';
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';
import { ScreenFrame } from './screen-frame';
import { placeStart, queryHero, scanStart, slotBox, startRect, staticHero, type HeroDom } from './hero-dom';
import type { Frame as WorldFrame, Rect } from './world';
import type { Hero } from '../monitor/hero';
import { ENTER, clamp01, playMs, playP, scrollLengths, smooth } from './segments';
import { GL_ATTRIBUTES } from '../monitor/spec';

const W = 6000;
/** The whole run: the field, the city, the night, the breakout and the arrival at Booth 630 (world x 0–6000). */
const T_MAX = 1;
const X_MAX = T_MAX * W;
/** A scroll we did not cause suspends keys for this long. */
const SCROLL_OVERRIDE_MS = 150;
/** Our own scrollTo echoes back through ScrollTrigger; within this many px it is ours. */
const ECHO_PX = 1.5;
/**
 * The 3D shows its dark glass this long before it powers on. It takes the poster's place in one frame,
 * with no fade: the two match (a mean 1.7 / 255 apart), and a fade would make both half-transparent at
 * once, letting the page show through the whole monitor — a flash (the dark screen 89 → 131 of 255).
 */
const POWER_DELAY_MS = 200;
/** A 3D that is not on screen this long after it was asked for gives way to the static opening. */
const HERO_TIMEOUT_MS = 10000;

export function shouldRunWorld(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) <= 2) return false;
  return !!document.createElement('canvas').getContext('2d');
}

interface Overlay {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  hero: HeroDom | null;
  hud: HTMLElement | null;
  hudCoins: HTMLElement | null;
  hudClock: HTMLElement | null;
  sessions: HTMLElement[];
  hint: HTMLElement | null;
  prompt: HTMLElement | null;
  promptTitle: HTMLElement | null;
  rail: HTMLElement | null;
  railStops: HTMLButtonElement[];
  sam: HTMLElement | null;
  samTyped: HTMLElement | null;
  samSaid: HTMLElement | null;
  samPortrait: HTMLCanvasElement | null;
  hudLevel: HTMLElement | null;
  loading: HTMLElement | null;
  loadingText: HTMLElement | null;
  dpadLeft: HTMLElement | null;
  dpadRight: HTMLElement | null;
  buttonA: HTMLElement | null;
}

function query(section: HTMLElement): Overlay {
  const q = <T extends HTMLElement>(sel: string) => section.querySelector<T>(sel);
  return {
    section,
    canvas: q<HTMLCanvasElement>('.world__canvas')!,
    hero: queryHero(section),
    hud: q('.world__hud'),
    hudCoins: q('[data-hud-coins]'),
    hudClock: q('[data-hud-clock]'),
    sessions: [...section.querySelectorAll<HTMLElement>('.world__session')],
    hint: q('.world__hint'),
    prompt: q('.world__prompt'),
    promptTitle: q('.world__prompt .window__title'),
    rail: q('.world__rail'),
    railStops: [...section.querySelectorAll<HTMLButtonElement>('[data-rail]')],
    sam: q('.world__sam'),
    samTyped: q('[data-sam-typed]'),
    samSaid: q('[data-sam-said]'),
    samPortrait: q<HTMLCanvasElement>('[data-sam-portrait]'),
    hudLevel: q('[data-hud-level]'),
    loading: q('.world__loading'),
    loadingText: q('[data-loading-text]'),
    dpadLeft: q('[data-dpad="left"]'),
    dpadRight: q('[data-dpad="right"]'),
    buttonA: q('[data-button="a"]'),
  };
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Once the page has loaded and the main thread has gone idle. */
function whenIdleAfterLoad(cb: () => void): void {
  const w = window as IdleWindow;
  const idle = () => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

/**
 * Once the wordmark has painted: its largest-contentful-paint entry where the browser reports one,
 * else the fonts in and two frames painted with them — and never later than 1.5 s.
 */
function afterOpeningPaint(h1: Element | null): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    window.setTimeout(finish, 1500);
    if (h1 && PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
      const po = new PerformanceObserver((list) => {
        if (!list.getEntries().some((e) => (e as LargestContentfulPaint).element === h1)) return;
        po.disconnect();
        requestAnimationFrame(finish);
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } else {
      void document.fonts?.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(finish)));
    }
  });
}

/** Yield the main thread between the 3D's setup steps, so each runs as its own short task. */
function pauseTask(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 100 });
    else window.setTimeout(resolve, 16);
  });
}

function clockFor(t: number): string {
  // 07:00 during the title; 10:00 at t 0.08 → 14:00 at 0.36 → 18:00 at 0.62 → 22:00 at 0.84,
  // stepped to 10 minutes; the HUD is gone with the game frame after that.
  const stops: [number, number][] = [
    [0.08, 10 * 60],
    [0.36, 14 * 60],
    [0.62, 18 * 60],
    [0.84, 22 * 60],
  ];
  let minutes = 7 * 60;
  if (t >= 0.08) {
    minutes = stops[stops.length - 1]![1];
    for (let i = 1; i < stops.length; i++) {
      const [t0, m0] = stops[i - 1]!;
      const [t1, m1] = stops[i]!;
      if (t < t1) {
        minutes = m0 + ((t - t0) / (t1 - t0)) * (m1 - m0);
        break;
      }
    }
  }
  minutes = Math.floor(minutes / 10) * 10;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function bootWorld(section: HTMLElement): Promise<void> {
  if (!shouldRunWorld()) return;
  const o = query(section);
  gsap.registerPlugin(ScrollTrigger);

  // The opening is a whole page while the world loads (the monitor is its loading state), so no
  // loading window covers it — and the world's ~1 MB of art waits until the wordmark (the LCP
  // element) has painted, so the opening's text never queues behind it.
  await afterOpeningPaint(section.querySelector('#hero-title'));
  const assets = await loadLevel1((done, total) => {
    if (o.loadingText) o.loadingText.textContent = `LOADING… ${Math.round((done / total) * 100)}%`;
  });
  const bootAt = performance.now();

  // ── Viewport, buffers, geometry ─────────────────────────────────────────
  // Two offscreen frames: the game frame, and the real frame the dissolve reveals behind it.
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
  const realBuf = document.createElement('canvas');
  const rctx = realBuf.getContext('2d')!;
  const sctx = o.canvas.getContext('2d')!;
  // The layout width (without a classic scrollbar), so the canvas world's buffer maps 1:1 onto device
  // pixels under its CSS box — and onto the 3D's buffer at the handover.
  const viewW = () => document.documentElement.clientWidth || window.innerWidth;
  let vp = worldBuffer(viewW(), window.innerHeight);
  let F = vp.bh - GROUND_BAND;
  let sx = Math.round(0.3 * vp.bw);
  let viewport: Rect = { x0: 0, y0: 0, x1: vp.bw, y1: vp.bh };
  // The monitor's screen: the same world, with margins (src/game/screen-frame.ts).
  const screen = new ScreenFrame();

  const fit = () => {
    vp = worldBuffer(viewW(), window.innerHeight);
    F = vp.bh - GROUND_BAND;
    sx = Math.round(0.3 * vp.bw);
    viewport = { x0: 0, y0: 0, x1: vp.bw, y1: vp.bh };
    buffer.width = realBuf.width = vp.bw;
    buffer.height = realBuf.height = vp.bh;
    o.canvas.width = vp.devW;
    o.canvas.height = vp.devH;
    bctx.imageSmoothingEnabled = false;
    rctx.imageSmoothingEnabled = false;
    sctx.imageSmoothingEnabled = false;
    screen.fit(vp.bw, vp.bh);
  };

  section.classList.add('world--live');
  // The opening is up: the touch controls belong to the run and wait until it has gone.
  if (o.hero) section.classList.add('world--opening');
  fit();

  // ── Timeline, pin, inputs ───────────────────────────────────────────────
  // The pin: the enter segment (D_E) and the run (D_W). The timeline's t runs below 0 through the
  // enter segment, from −D_E / D_W at the top of the page.
  let { DE, DW, D } = scrollLengths(window.innerHeight);
  const timeline = new Timeline(W, T_MAX, -DE / DW);
  const tOf = (progress: number) => (progress * D - DE) / DW;
  const motion = new Motion();
  const dust = new Dust();
  const input = new Input(o.canvas);
  if (o.dpadLeft && o.dpadRight && o.buttonA) input.bindDpad(o.dpadLeft, o.dpadRight, o.buttonA);
  const sam = new Sam(assets.sam);
  const coins = new Coins(LEVEL1_COINS);
  const level = new Level1(assets);
  const real = new Arrival(assets);
  const dissolve = new Dissolve();
  dissolve.warm(vp.bw, vp.bh, impactPoint(vp.bw, F));
  // The city set (and the arrival's art) loads right behind the field; city-far first enters at world x 300.
  loadCity()
    .then((c) => {
      const c0 = performance.now();
      level.city = c;
      real.warm(c);
      level.prepareNight();
      if (import.meta.env.DEV) performance.measure('world:city', { start: c0, end: performance.now() });
    })
    .catch((err) => console.error('[world] city assets failed to load', err));
  let expectedY = Number.NaN;
  /**
   * PRESS START's play through the enter segment at the reference's pace (segments.ts PLAY): it began
   * `from` ms into a play from the top, at t0 on the clock, and ends at y1. A scroll of the user's cancels it.
   */
  let playing: { from: number; y1: number; t0: number } | null = null;
  let scrollOverrideUntil = 0;
  let autoArmed = false;
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${D}`,
    pin: true,
    pinSpacing: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      // Our own scrollTo (keys, d-pad, a hit, the auto-break) echoes back here; anything else is the user, and the user wins.
      if (Math.abs(window.scrollY - expectedY) <= ECHO_PX) return;
      scrollOverrideUntil = performance.now() + SCROLL_OVERRIDE_MS;
      motion.cancel();
      autoArmed = false;
      playing = null;
      timeline.setScrollTarget(tOf(self.progress));
    },
    onRefresh: (self) => {
      ({ DE, DW, D } = scrollLengths(window.innerHeight));
      timeline.tMin = -DE / DW;
      expectedY = Number.NaN;
      timeline.jumpTo(tOf(self.progress));
    },
  });
  // A link to a section (/#register) was resolved by the browser before the pin added its scroll
  // length: jump there again now that the page has its real height, and snap the world to match.
  const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target && !section.contains(target)) {
    window.scrollTo({ top: Math.round(target.getBoundingClientRect().top + window.scrollY), behavior: 'instant' });
    ScrollTrigger.update();
  }
  timeline.jumpTo(tOf(trigger.progress));

  const io = new IntersectionObserver((entries) => {
    input.active = entries.some((e) => e.isIntersecting);
  });
  io.observe(section);

  window.addEventListener(
    'resize',
    () => {
      fit();
      dissolve.warm(vp.bw, vp.bh, impactPoint(vp.bw, F));
      ScrollTrigger.refresh();
      hero3d?.frameChanged(true);
      layoutHero();
    },
    { passive: true },
  );

  // ── Progress rail: a click jumps the world (or the page, for Register) with no smear ──
  for (const btn of o.railStops) {
    btn.addEventListener('click', () => {
      const jump = btn.dataset.jump!;
      if (jump === 'register') {
        document.getElementById('register')?.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }
      const t = Number(jump);
      motion.cancel();
      playing = null;
      window.scrollTo({ top: Math.round(trigger.start + DE + t * DW), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.jumpTo(t);
    });
  }
  let railCurrent = '';

  // ── Agent Sam: his portrait with the brand goggles, and the line for the current stretch, typed out ──
  if (o.samPortrait) {
    const pctx = o.samPortrait.getContext('2d')!;
    loadImage(sprites.samPortrait.file)
      .then((img) => pctx.drawImage(remap(img, SAM_BRAND_MAP), 0, 0))
      .catch(() => {});
  }
  let samLine: SamLine | null = null;
  let samSince = 0;
  let samShown = -1;
  /** Typewriter pace: one character per this many ms. */
  const TYPE_MS = 32;

  // ── HUD wiring, and the Player 1 bonus in the Arrival section at 12/12 ──
  const bonus = document.getElementById('bonus');
  const registerBonus = document.getElementById('register-bonus');
  const setCoins = (n: number) => {
    if (o.hudCoins) o.hudCoins.textContent = `${String(n).padStart(2, '0')}/${TOTAL_COINS}`;
    const all = n >= TOTAL_COINS;
    bonus?.toggleAttribute('hidden', !all);
    registerBonus?.toggleAttribute('hidden', !all);
  };
  coins.onChange = setCoins;
  setCoins(coins.count);

  // ── The opening: PRESS START, the monitor's 3D, the parallax ──────────────
  const d = o.hero;
  /** PRESS START — or Space / → at the monitor — plays the enter segment at the reference's pace, from where the page is: it scrolls with it. */
  const start = () => {
    motion.cancel();
    d?.startButton.blur();
    const y1 = Math.round(trigger.start + DE);
    if (window.scrollY < y1 - 1) playing = { from: playMs((window.scrollY - trigger.start) / DE), y1, t0: -1 };
  };
  d?.startButton.addEventListener('click', start);

  let hero3d: Hero | null = null;
  let heroMode: 'poster' | '3d' | 'static' = 'poster';
  let shownAt = -1;
  let startShown = false;
  let startUV: [number, number, number, number] = [0, 0, 1, 1];
  let slotCentre = { x: 0, y: 0 };
  let lastOut = -1;
  let lastFade = -1;
  const layoutHero = () => {
    if (!d || !hero3d) return;
    const b = slotBox(d);
    const g = screen.geom;
    hero3d.layout({
      cssW: d.gl.clientWidth,
      cssH: d.gl.clientHeight,
      slot: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w },
      devW: vp.devW,
      devH: vp.devH,
      k: vp.k,
      frame: { W: g.W, H: g.H, mx: g.mx, mt: g.mt },
    });
    startUV = startRect(d);
    scanStart(d, startUV, hero3d.scanLines);
    const r = d.slot.getBoundingClientRect();
    slotCentre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  /** No 3D after all (no WebGL 2, an error, too slow): the powered-on poster, PRESS START on it. */
  const toStatic = (why: unknown) => {
    if (heroMode === 'static' || !d) return;
    if (why) console.warn('[world] the monitor stays a poster:', why);
    heroMode = 'static';
    hero3d?.dispose();
    hero3d = null;
    staticHero(d);
  };
  if (d) {
    // Dev only: ?hero=poster holds the poster (the swap check), ?hero=static is the no-3D opening.
    const devHero = import.meta.env.DEV ? new URLSearchParams(location.search).get('hero') : null;
    if (devHero === 'static' || !('WebGL2RenderingContext' in window)) toStatic(null);
    else if (devHero !== 'poster')
      whenIdleAfterLoad(() => {
        // The context first: without one the page never downloads three.js.
        const c0 = performance.now();
        const gl = d.gl.getContext('webgl2', GL_ATTRIBUTES);
        if (import.meta.env.DEV) performance.measure('monitor:context', { start: c0, end: performance.now() });
        if (!gl) return toStatic('no WebGL 2 context');
        const timer = window.setTimeout(() => toStatic(`not ready after ${HERO_TIMEOUT_MS} ms`), HERO_TIMEOUT_MS);
        if (import.meta.env.DEV) performance.mark('monitor:import');
        import('../monitor/hero')
          .then(({ createHero }) => {
            if (import.meta.env.DEV) performance.mark('monitor:imported');
            return createHero(d.gl, gl, screen.canvas, pauseTask);
          })
          .then((h) => {
            window.clearTimeout(timer);
            if (heroMode === 'static') return h.dispose();
            hero3d = h;
            layoutHero();
            h.sway(!window.matchMedia('(hover: hover) and (pointer: fine)').matches);
            heroMode = '3d'; // the loop draws the screen and the first frame, then swaps it in for the poster
          })
          .catch((err: unknown) => {
            window.clearTimeout(timer);
            toStatic(err);
          });
      });

    // The parallax: the monitor turns toward a mouse anywhere on the page.
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || !hero3d) return;
        hero3d.pointer(clamp1((e.clientX - slotCentre.x) / (window.innerWidth / 2)), clamp1((e.clientY - slotCentre.y) / (window.innerHeight / 2)));
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => hero3d?.pointer(null));
    // Hover or keyboard focus on PRESS START brightens the screen 10 % (the button presses 1 px itself).
    const b = d.startButton;
    b.addEventListener('pointerenter', () => hero3d?.hover(true));
    b.addEventListener('pointerleave', () => hero3d?.hover(b.matches(':focus-visible')));
    b.addEventListener('focus', () => hero3d?.hover(b.matches(':focus-visible')));
    b.addEventListener('blur', () => hero3d?.hover(false));
  }

  /** The monitor while the opening shows: the screen frame, the first frame in place of the poster, the power-on, PRESS START. */
  const drawHero = (f: WorldFrame, now: number, p: number) => {
    if (heroMode !== '3d' || !hero3d || !d || document.hidden) return;
    hero3d.enter(p);
    if (screen.update(f, level, dust, now)) hero3d.frameChanged(false);
    if (shownAt < 0) {
      const t0 = performance.now();
      hero3d.render(now);
      if (import.meta.env.DEV) performance.measure('monitor:first-render', { start: t0, end: performance.now() });
      d.gl.classList.add('is-on');
      d.poster.classList.add('is-hidden');
      shownAt = now;
      return;
    }
    if (hero3d.phase === 'off' && now >= shownAt + POWER_DELAY_MS) hero3d.powerOn(now);
    const phase = hero3d.render(now);
    if (p < ENTER.copyOut[1]) placeStart(d, hero3d.quad(...startUV));
    if (phase === 'on' && !startShown) {
      startShown = true;
      d.start.classList.add('is-ready');
    }
  };

  // A dev-only virtual clock (?clock=virtual): time stands still until __world.clock.now moves, so
  // the power-on can be captured at exact 20 ms steps.
  const vclock = import.meta.env.DEV && new URLSearchParams(location.search).get('clock') === 'virtual' ? { now: performance.now() } : null;

  // ── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let prevSamX = timeline.X;
  let prevT = timeline.t;
  let lastInputAt = performance.now();
  let lastClock = '';

  const frame = (rafNow: number) => {
    const now = vclock ? vclock.now : rafNow;
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    const pxPerWorld = DW / X_MAX;
    // 'instant' overrides the page's CSS scroll-behavior: smooth, which would otherwise restart
    // a smooth animation every frame and never move. X is world px; below 0 it is in the enter segment.
    const scrollToX = (X: number) => {
      window.scrollTo({ top: trigger.start + DE + X * pxPerWorld, behavior: 'instant' });
      expectedY = window.scrollY;
    };
    const tNow = Math.max(0, timeline.t);

    // PRESS START playing the enter segment: the page scrolls on, the visual follows it exactly.
    if (playing) {
      if (playing.t0 < 0) playing.t0 = now;
      const pp = playP(playing.from + now - playing.t0);
      const y = pp >= 1 ? playing.y1 : trigger.start + pp * DE;
      window.scrollTo({ top: y, behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.drive((y - trigger.start - DE) / pxPerWorld, 0, 'auto');
      if (pp >= 1) playing = null;
    }

    // While the monitor shows, the keys never drive the world: Space or → at it is PRESS START.
    // (A → press is read every frame, so one from the run can never start the game later.)
    const pT = clamp01(1 + (timeline.tTarget * DW) / DE);
    const heroUp = !!d && pT < ENTER.handover[1];
    const rightPress = input.consumeRightPress();
    if (heroUp && input.active && (rightPress || input.dir > 0 || input.consumeJumpPress()) && now >= scrollOverrideUntil && !playing) start();
    // Keys / d-pad: Sam runs with real velocity and the page follows him.
    const held = input.active && now >= scrollOverrideUntil && !heroUp && !playing ? input.dir : 0;
    if (held !== 0) lastInputAt = now;
    // While the visual is still easing after a scroll, keys move the target (the page) from where
    // the user left it and the visual catches up; otherwise they move Sam directly.
    const catchingUp = Math.abs(timeline.tTarget - timeline.t) * W > 2;
    // From the tail of the enter segment the keys start the run where it begins.
    const base = Math.max(0, catchingUp ? timeline.tTarget * W : timeline.X);
    const wall = base >= X_MAX ? 1 : base <= 0 ? -1 : 0;
    // Turning away from an end of the level: he was stopped there, so no momentum and no skid.
    if (wall !== 0 && held === -wall && motion.vx * wall > 0) motion.cancel();
    const endY = trigger.start + D;
    if (window.scrollY > endY + 1) {
      // Past the end of the pin, in the Arrival section with the world still partly in view: the keys
      // scroll the page with Sam's run physics and nothing in the world moves — never back to the wall.
      if (held !== 0 || motion.moving) {
        const dx = motion.step(dt, held, true, now);
        window.scrollBy({ top: Math.max(dx * pxPerWorld, endY - window.scrollY), behavior: 'instant' });
        expectedY = window.scrollY;
      }
    } else if (held !== 0 || motion.moving) {
      const dx = motion.step(dt, held, !sam.airborne, now);
      let X = base + dx;
      let overflow = 0;
      if (X > X_MAX) {
        overflow = X - X_MAX;
        X = X_MAX;
      } else if (X < 0) {
        // the start of the run is a wall: the keys never walk back out into the monitor
        X = 0;
      }
      // Pushing into an end of the level: Sam stands still while the page keeps scrolling on —
      // at the end, on into the Arrival section below the pin.
      const blocked = (X >= X_MAX && motion.vx > 0) || (X <= 0 && motion.vx < 0);
      const source = input.dpadDir ? 'dpad' : 'keys';
      if (catchingUp) timeline.driveTarget(X, source);
      else timeline.drive(X, blocked ? 0 : motion.vx, source);
      if (motion.puff) dust.spawn(X + SAM_CELL / 2, Math.sign(motion.vx), now);
      if (overflow !== 0) {
        window.scrollBy({ top: overflow * pxPerWorld, behavior: 'instant' });
        expectedY = window.scrollY;
      } else scrollToX(X);
    }

    // Space / tap / A: a jump on the ground; from the flight on, a hit on the glass:
    // one crack per hit, the page following, and the hit that completes the cracks starts the dissolve.
    const hitting = tNow >= BREAK.flight[0] && tNow < BREAK.dissolve[1] && !heroUp;
    if (input.active) {
      if (input.consumeJumpPress()) {
        lastInputAt = now;
        if (hitting) {
          const next = mashTarget(timeline.tTarget);
          timeline.driveTarget(next * W, 'mash');
          scrollToX(next * W);
        } else if (tNow < BREAK.flight[0] && !heroUp) sam.jumpPress(now);
      }
      if (!input.jumpHeld) sam.jumpRelease();
    }

    // The auto-break: armed on entering the cracks from below, its idle second counted
    // from then or from the last input; the page then completes the breakout at run speed. A native
    // scroll disarms it (onUpdate).
    const cracking = tNow >= BREAK.cracks[0] && tNow < BREAK.dissolve[1];
    if (cracking && prevT < BREAK.cracks[0]) {
      autoArmed = true;
      lastInputAt = now;
    }
    if (!cracking) autoArmed = false;
    if (autoArmed && held === 0 && !input.jumpHeld && now - lastInputAt >= AUTO_IDLE_MS && now >= scrollOverrideUntil && timeline.tTarget < BREAK.dissolve[1]) {
      const next = Math.min(BREAK.dissolve[1], timeline.tTarget + (AUTO_SPEED * dt) / W);
      timeline.driveTarget(next * W, 'auto');
      scrollToX(next * W);
    }
    prevT = tNow;

    timeline.step(dt);
    // The world's own t (0 throughout the enter segment) and the enter segment's progress p.
    const t = Math.max(0, timeline.t);
    const p = clamp01(1 + (timeline.t * DW) / DE);
    // The flight: on the propeller from 0.84, up and across in the game frame, down again on the plaza.
    const flight = flightAt(t, vp.bw, sx);
    sam.flight = flight ? flight.lift : null;
    // While catching up the visual still follows the ease, so Sam faces the way he actually moves.
    sam.update(dt, timeline.t > 0 ? timeline.speed : 0, now, catchingUp ? 0 : held, !catchingUp && motion.skidding);

    const X = t * W;
    const camLeft = X - sx;
    coins.update(X, prevSamX, sam.lift);
    prevSamX = X;

    if (input.active) {
      const shown = dissolveLevel(t);
      const view = { t, X, camLeft, sx, F, bw: vp.bw, bh: vp.bh, range: viewport, span: screen.rect, now, sky: skyAt(t), sam, coins, dust };
      // The enter segment, a pure function of p: the copy and PRESS START go first, then the whole
      // opening hands over to the canvas world under it — only the top layer fades, over an opaque world.
      const fade = d ? 1 - smooth(p, ENTER.handover) : 0;
      if (d) {
        const out = Math.round(smooth(p, ENTER.copyOut) * 100) / 100;
        if (out !== lastOut) {
          lastOut = out;
          d.stage.style.setProperty('--out', String(out));
          d.stage.classList.toggle('is-copy-gone', out >= 1);
        }
        const f2 = Math.round(fade * 1000) / 1000;
        if (f2 !== lastFade) {
          lastFade = f2;
          d.stage.style.opacity = f2 < 1 ? String(f2) : '';
          d.stage.style.visibility = f2 <= 0 ? 'hidden' : '';
        }
        section.classList.toggle('world--opening', p < ENTER.overlays);
        if (fade > 0) drawHero({ ...view, samX: X }, now, p);
      }
      if (!d || p >= ENTER.drawWorld) {
        // Through the enter segment the far sky snaps to whole art px, as on the monitor's screen, so the
        // two agree at the handover; it glides at device px once the run moves (where the switch can't be seen).
        const glide = !d || t > 0;
        if (shown < 64) {
          // The game frame, Sam drifting to the right edge once he is on the propeller, the cracks on its glass.
          level.draw(bctx, { ...view, samX: flight && t < BREAK.dissolve[1] ? camLeft + flight.screenX : X });
          const stage = crackStage(t);
          if (stage > 0 && level.city) drawCracks(bctx, level.city.cracks, stage, vp.bw, F);
        }
        if (shown > 0) {
          // The real frame, Sam back at the left margin: drawn straight once the dissolve is through.
          real.draw(shown >= 64 ? bctx : rctx, { ...view, samX: X }, shown < 64);
          if (shown < 64) dissolve.apply(bctx, realBuf, rctx, shown, vp.bw, vp.bh, impactPoint(vp.bw, F));
        }
        // The far sky at device resolution (clouds glide), then the buffer over it.
        if (shown < 64) level.drawFar(sctx, { ...view, samX: X }, vp.k, glide);
        else real.drawFar(sctx, { ...view, samX: X }, vp.k, glide);
        sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, vp.bh * vp.k);
      }

      // The game's overlays come in at the end of the enter segment.
      const inGame = !d || p >= ENTER.overlays;
      o.hud?.classList.toggle('is-visible', inGame && t < BREAK.hudOut);
      // Session windows: Level 1 from 0.08 until the gate, Level 2 once the street has started.
      for (const el of o.sessions) {
        const level = el.dataset.session;
        el.classList.toggle('is-visible', level === '1' ? t >= 0.08 && t < 0.34 : level === '2' ? t >= 0.36 && t < 0.6 : level === '3' ? t >= 0.62 && t < 0.83 : false);
      }
      o.hint?.classList.toggle('is-visible', inGame && t < 0.14);
      // The rail: each stop done, current or next by t.
      o.rail?.classList.toggle('is-visible', inGame);
      const current = railStops.find((s) => t >= s.from && t < s.to)?.id ?? '';
      if (current !== railCurrent) {
        railCurrent = current;
        let passed = true;
        for (const btn of o.railStops) {
          const isCurrent = btn.dataset.rail === current;
          if (isCurrent) passed = false;
          btn.dataset.state = isCurrent ? 'current' : passed ? 'done' : 'next';
          if (isCurrent) btn.setAttribute('aria-current', 'step');
          else btn.removeAttribute('aria-current');
        }
      }
      if (o.hudLevel) {
        const lvl = levelLabel(t);
        if (o.hudLevel.textContent !== lvl) o.hudLevel.textContent = lvl;
      }
      // Agent Sam: the line for this stretch types out once it starts; screen readers get it whole.
      const line = samLines.find((l) => t >= l.from && t < l.to) ?? null;
      if (line !== samLine) {
        samLine = line;
        samSince = now;
        samShown = -1;
        if (o.samSaid) o.samSaid.textContent = line?.text ?? '';
        o.sam?.classList.toggle('is-visible', !!line);
      }
      if (samLine && o.samTyped) {
        const n = Math.min(samLine.text.length, Math.floor((now - samSince) / TYPE_MS));
        if (n !== samShown) {
          samShown = n;
          o.samTyped.textContent = samLine.text.slice(0, n) + (n < samLine.text.length ? '▌' : '');
        }
      }

      // The breakout's DOM: the MASH prompt, a function of t.
      o.prompt?.classList.toggle('is-visible', promptOn(t));
      const count = `BREAK OUT · ${crackStage(t)}/${CRACK_STAGES}`;
      if (o.promptTitle && o.promptTitle.textContent !== count) o.promptTitle.textContent = count;
      const clock = clockFor(t);
      if (clock !== lastClock && o.hudClock) {
        o.hudClock.textContent = clock;
        lastClock = clock;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) performance.measure('world:boot', { start: bootAt, end: performance.now() });

  if (import.meta.env.DEV) {
    (window as unknown as { __world: unknown }).__world = {
      timeline,
      motion,
      sam,
      coins,
      trigger,
      input,
      get F() {
        return F;
      },
      get vp() {
        return vp;
      },
      get lengths() {
        return { DE, DW, D };
      },
      get p() {
        return clamp01(1 + (timeline.t * DW) / DE);
      },
      get breakout() {
        return { stage: crackStage(timeline.t), level: dissolveLevel(timeline.t), armed: autoArmed, flight: flightAt(timeline.t, vp.bw, sx) };
      },
      get hero() {
        return { mode: heroMode, phase: hero3d?.phase ?? null, shownAt, startShown, startUV, screen: screen.geom, version: screen.version, hero3d };
      },
      clock: vclock,
      start,
      screen,
      get loop() {
        return { overrideUntil: scrollOverrideUntil, expectedY, lastInputAt, active: input.active, dir: input.dir };
      },
      level,
      real,
    };
  }
}

export const samCell = SAM_CELL;
