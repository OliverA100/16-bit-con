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
import { FOOT_SINK, Sam, SAM_CELL } from './sam';
import { Coins, LEVEL1_COINS, TOTAL_COINS } from './coins';
import { loadCity, loadLevel1 } from './assets';
import { Level1 } from './world';
import { skyAt } from './stages';
import { GROUND_BAND, PLAZA_TIME } from '../data/layers';
import { levelLabel, railStops, samLines, type SamLine } from '../data/guide';
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';
import { ScreenFrame } from './screen-frame';
import { placeStart, queryHero, scanStart, slotBox, startRect, staticHero, type HeroDom } from './hero-dom';
import type { Frame as WorldFrame, Rect } from './world';
import type { BreakoutState, Hero } from '../monitor/hero';
import { AUTO_HIT_MS, AUTO_IDLE_MS, BREAKOUT, BREAK_PLAY_MS, CRACK_STAGES, ENTER, clamp01, crackStage, hitTarget, playMs, playP, scrollLengths, smooth } from './segments';
import { drawCell, idleOnPerch, queryPerch } from './landing';
import { GL_ATTRIBUTES } from '../monitor/spec';

const W = 6000;
/** The whole run: the field, the city, the night and the dawn at the Javits plaza, the game's last level (world x 0–6000). */
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
  // 07:00 during the title; 10:00 at t 0.08 → 14:00 at 0.36 → 18:00 at 0.62 → 22:00 at 0.84.
  // Then the night fast-forwards with the dawn sky: 05:00 under its Blue 900, 06:00
  // as it turns Yellow 600 (sunrise), 07:30 in the Blue 100 morning, 09:00 at the plaza's end — or,
  // at a night plaza, on to midnight. Stepped to 10 minutes.
  const stops: [number, number][] = [
    [0.08, 10 * 60],
    [0.36, 14 * 60],
    [0.62, 18 * 60],
    [0.84, 22 * 60],
    ...(PLAZA_TIME === 'dawn'
      ? ([
          [0.86, 29 * 60],
          [0.88, 30 * 60],
          [0.92, 31 * 60 + 30],
          [1, 33 * 60],
        ] as [number, number][])
      : ([[1, 24 * 60]] as [number, number][])),
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
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function bootWorld(section: HTMLElement): Promise<void> {
  if (!shouldRunWorld()) return;
  const o = query(section);
  gsap.registerPlugin(ScrollTrigger);
  // ScrollTrigger never re-measures on a resize by itself: the resize handler below decides, so a
  // height-only resize on a touch screen (a keyboard takes ~40 % of the height, beyond what
  // ignoreMobileResize lets pass) never moves the page.
  ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });

  // The opening is a whole page while the world loads (the monitor is its loading state), so no
  // loading window covers it — and the world's ~1 MB of art waits until the wordmark (the LCP
  // element) has painted, so the opening's text never queues behind it.
  await afterOpeningPaint(section.querySelector('#hero-title'));
  const assets = await loadLevel1((done, total) => {
    if (o.loadingText) o.loadingText.textContent = `LOADING… ${Math.round((done / total) * 100)}%`;
  });
  const bootAt = performance.now();

  // ── Viewport, buffers, geometry ─────────────────────────────────────────
  // The game frame, drawn offscreen at art pixels and scaled onto the canvas over the far sky.
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
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
    buffer.width = vp.bw;
    buffer.height = vp.bh;
    o.canvas.width = vp.devW;
    o.canvas.height = vp.devH;
    bctx.imageSmoothingEnabled = false;
    sctx.imageSmoothingEnabled = false;
    screen.fit(vp.bw, vp.bh);
  };

  section.classList.add('world--live');
  // The opening is up: the touch controls belong to the run and wait until it has gone.
  if (o.hero) section.classList.add('world--opening');
  fit();

  // ── Timeline, pin, inputs ───────────────────────────────────────────────
  // The pin: the enter segment (D_E), the run (D_W) and, where the monitor's 3D can run, the breakout
  // (D_B). The timeline's t runs below 0 through the enter segment, from −D_E / D_W at the top of the
  // page, and above 1 through the breakout, to 1 + D_B / D_W.
  // Dev only: ?hero=poster holds the poster (the swap check), ?hero=static is the no-3D opening.
  const devHero = import.meta.env.DEV ? new URLSearchParams(location.search).get('hero') : null;
  let wantBreakout = !!o.hero && 'WebGL2RenderingContext' in window && devHero !== 'static' && devHero !== 'poster';
  let { DE, DW, DB, D } = scrollLengths(window.innerHeight, wantBreakout);
  const timeline = new Timeline(W, T_MAX + DB / DW, -DE / DW);
  const tOf = (progress: number) => (progress * D - DE) / DW;
  // The landing section rises into the pin through the breakout's landing (--rise: exactly its
  // stretch of scroll), and Sam stands on it at the game's own scale (--sam-px, CSS px per art px).
  const root = document.documentElement;
  const setLandingVars = () => {
    root.style.setProperty('--rise', `${wantBreakout ? Math.round((1 - BREAKOUT.land[0]) * DB) : 0}px`);
    root.style.setProperty('--sam-px', `${vp.k / (window.devicePixelRatio || 1)}px`);
    root.classList.toggle('has-breakout', wantBreakout);
  };
  setLandingVars();
  const motion = new Motion();
  const dust = new Dust();
  const input = new Input(o.canvas);
  if (o.dpadLeft && o.dpadRight && o.buttonA) input.bindDpad(o.dpadLeft, o.dpadRight, o.buttonA);
  const sam = new Sam(assets.sam);
  const coins = new Coins(LEVEL1_COINS);
  const level = new Level1(assets);
  // The city set (and the plaza's art) loads right behind the field; city-far first enters at world x 300.
  loadCity()
    .then((c) => {
      const c0 = performance.now();
      level.city = c;
      level.plaza.warm(c);
      level.prepareNight();
      if (import.meta.env.DEV) performance.measure('world:city', { start: c0, end: performance.now() });
    })
    .catch((err) => console.error('[world] city assets failed to load', err));
  // A dev-only virtual clock (?clock=virtual): time stands still until __world.clock.now moves, so the
  // power-on, the zoom and the breakout can be captured at exact steps. Everything that keeps time — the
  // loop, and the scroll lock a user's scroll starts — reads it.
  const vclock = import.meta.env.DEV && new URLSearchParams(location.search).get('clock') === 'virtual' ? { now: performance.now() } : null;
  const clockNow = () => (vclock ? vclock.now : performance.now());
  let expectedY = Number.NaN;
  /**
   * PRESS START's play through the enter segment at the reference's pace (segments.ts PLAY): it began
   * `from` ms into a play from the top, at t0 on the clock, and ends at y1. A scroll of the user's cancels it.
   */
  let playing: { from: number; y1: number; t0: number } | null = null;
  /** The breakout's own plays, q from q0 to q1 in ms: the pull-back (→ or Space at the plaza), and the rest after the sixth hit. */
  let breakPlay: { q0: number; q1: number; ms: number; t0: number } | null = null;
  let scrollOverrideUntil = 0;
  /** The auto-hits: armed on reaching the cracks, they start after a second without input. */
  let autoArmed = false;
  let lastHitAt = 0;
  let wasHitZone = false;
  /** A tap or click on the monitor's screen during the cracks (its DOM hit target). */
  let pendingHit = false;
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
      scrollOverrideUntil = clockNow() + SCROLL_OVERRIDE_MS;
      motion.cancel();
      autoArmed = false;
      playing = null;
      breakPlay = null;
      timeline.setScrollTarget(tOf(self.progress));
    },
    onRefresh: (self) => {
      ({ DE, DW, DB, D } = scrollLengths(window.innerHeight, wantBreakout));
      timeline.tMin = -DE / DW;
      timeline.tMax = T_MAX + DB / DW;
      setLandingVars();
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

  let lastViewW = viewW();
  window.addEventListener(
    'resize',
    () => {
      const w = viewW();
      // A height-only resize on a touch screen (the keyboard opening on the Register form, the address
      // bar) keeps the pin, its lengths and the landing's place: re-measuring them would move the page
      // under the user's thumb. The canvas still fits the new height.
      const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
      const heightOnly = w === lastViewW && touch;
      lastViewW = w;
      fit();
      if (!heightOnly) ScrollTrigger.refresh();
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

  // ── HUD wiring, and the Player 1 bonus line in the Register window at 12/12 ──
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
  /** Sam where the run ends, on the monitor's screen: his cell's centre (screen UV) and size (screen heights) — where the cracks start. */
  let samOnScreen: { centre: [number, number]; size: number } | null = null;
  /** The landing: how far the monitor glides up the page, and how much smaller it ends, to sit between the nav and the rising section. */
  let glideTo = { up: 0, scale: 1 };
  /** The monitor's screen as a tap target through the cracks (the 3D canvas itself takes no pointer events). */
  const hitEl = d ? d.stage.querySelector<HTMLElement>('[data-hit]') : null;
  let hitBox = '';
  if (hitEl) {
    hitEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      hitEl.setPointerCapture(e.pointerId);
      pendingHit = true;
    });
  }
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
    // The breakout: Sam where the run ends — at the camera's left margin, on the ground — on the screen frame.
    const left = sx + g.mx;
    const top = F - SAM_CELL + FOOT_SINK + g.mt;
    const h = hero3d;
    const centre = h.screenUV(left + SAM_CELL / 2, top + SAM_CELL / 2);
    samOnScreen = { centre, size: Math.abs(h.screenUV(left, top)[1] - h.screenUV(left, top + SAM_CELL)[1]) };
    // The crack pattern starts from him: laid out (and uploaded) in idle time, never on a scroll frame.
    const w = window as IdleWindow;
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200)))(() => hero3d?.prepareBreakout(centre));
    // The glide: between the nav and where the landing section's top ends (it rises by --rise), the
    // monitor centred, no taller than 85 % of that room.
    const navH = parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 64;
    const sectionTop = d.gl.clientHeight - Math.round((1 - BREAKOUT.land[0]) * DB);
    const room = Math.max(1, sectionTop - navH);
    glideTo = { up: b.y + b.h / 2 - (navH + room / 2), scale: Math.min(1, (0.85 * room) / b.h) };
  };
  /** No 3D after all (no WebGL 2, an error, too slow): the powered-on poster, PRESS START on it. */
  const toStatic = (why: unknown) => {
    if (heroMode === 'static' || !d) return;
    if (why) console.warn('[world] the monitor stays a poster:', why);
    heroMode = 'static';
    hero3d?.dispose();
    hero3d = null;
    staticHero(d);
    // No 3D, no breakout: the run ends at the plaza and the pin releases into the Register section.
    if (wantBreakout) {
      wantBreakout = false;
      setLandingVars();
      ScrollTrigger.refresh();
    }
  };
  if (d) {
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

  /**
   * The monitor while it shows — the opening, or the breakout (`b`): the screen frame, the first frame in
   * place of the poster, the power-on, PRESS START (the opening only).
   */
  const drawHero = (f: WorldFrame, now: number, p: number, b: BreakoutState | null) => {
    if (heroMode !== '3d' || !hero3d || !d || document.hidden) return;
    hero3d.enter(p);
    hero3d.breakout(b);
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
    if (!b && p < ENTER.copyOut[1]) placeStart(d, hero3d.quad(...startUV));
    if (phase === 'on' && !startShown) {
      startShown = true;
      d.start.classList.add('is-ready');
    }
  };

  /** The breakout for the monitor at q: the cracks, the shatter, Sam's billboard (his frame drawn into it), the landing's glide. */
  let samBillboard = '';
  const breakState = (q: number, now: number): BreakoutState => {
    const shatter = q > BREAKOUT.shatter[0] ? clamp01((q - BREAKOUT.shatter[0]) / (BREAKOUT.shatter[1] - BREAKOUT.shatter[0])) : 0;
    const leap = clamp01((q - BREAKOUT.leap[0]) / (BREAKOUT.leap[1] - BREAKOUT.leap[0]));
    const g = smooth(q, BREAKOUT.land);
    let samB: BreakoutState['sam'] = null;
    if (shatter > 0 && samOnScreen && hero3d) {
      // idling while the glass flies, then the jump as he leaps; the page takes him at twice the game's scale
      const idle = assets.sam.idle;
      const f = Math.floor(now / 125) % idle.frames;
      const key = leap > 0 ? 'jump' : `idle${f}`;
      if (key !== samBillboard) {
        samBillboard = key;
        drawCell(hero3d.samCanvas, leap > 0 ? assets.sam.jump : idle, leap > 0 ? 0 : f);
        hero3d.samDrawn();
      }
      samB = { centre: samOnScreen.centre, size: samOnScreen.size, leap, scale: 2 * vp.k, hidden: q >= BREAKOUT.leap[1] };
    }
    return { stage: crackStage(q), shatter, sam: samB, glide: { up: g * glideTo.up, scale: 1 + g * (glideTo.scale - 1) } };
  };

  // ── Sam on the page (src/game/landing.ts): perched on the Register window; with the breakout, away in
  //    the game until he leaps out, then in flight from the monitor — shrinking smoothly from twice the
  //    game's scale (where the page takes him from the billboard, exactly) to its own — landing on the
  //    window's title bar as the pin releases, at whole device px per art px again. In flight his box stays
  //    on the perch and a transform carries him, so the page never lays anything out again: no layout shift.
  const perch = queryPerch();
  let perchBox = '';
  let perchFrame = '';
  if (perch) idleOnPerch(perch, assets.sam.idle, () => perch.root.classList.contains('is-landed'));
  const updatePerch = (q: number) => {
    if (!perch) return;
    // past the pin he is on the window, whatever the eased picture still shows: a jump down the page
    // (a link, the Register button) never sees him fly in over the form
    const pastPin = window.scrollY >= trigger.start + D - 1;
    const landed = !wantBreakout || pastPin || q >= 1 - 1e-4;
    const flying = wantBreakout && !landed && q >= BREAKOUT.leap[1];
    if (perch.root.classList.contains('is-landed') !== landed) {
      perch.root.classList.toggle('is-landed', landed);
      perchFrame = '';
      if (landed) perch.root.dispatchEvent(new Event('landed'));
    }
    const c = perch.canvas;
    if (c.classList.contains('is-flying') !== flying) c.classList.toggle('is-flying', flying);
    if (!flying) {
      if (perchBox) {
        perchBox = '';
        c.style.transform = '';
      }
      return;
    }
    const sprite = hero3d?.samSprite();
    if (!sprite || !d) return;
    if (perchFrame !== 'jump') {
      perchFrame = 'jump';
      drawCell(c, assets.sam.jump, 0);
    }
    const dpr = window.devicePixelRatio || 1;
    const e = smooth(q, BREAKOUT.land);
    const big = 2 * vp.k;
    const scale = big + (vp.k - big) * e;
    const size = (SAM_CELL * scale) / dpr;
    // from where the billboard left him (its centre at the end of the leap) …
    const gl = d.gl.getBoundingClientRect();
    const hx = gl.left + sprite.x;
    const hy = gl.top + sprite.y;
    // … over an arc to his cell on the title bar, where the CSS places him (and his box always is)
    const pr = perch.root.getBoundingClientRect();
    const land = (SAM_CELL * vp.k) / dpr;
    const x0 = pr.left;
    const y0 = pr.bottom + (FOOT_SINK * vp.k) / dpr - land;
    const arc = Math.min(window.innerHeight * 0.18, 160) * 4 * e * (1 - e);
    const x = Math.round((hx + (x0 + land / 2 - hx) * e - size / 2) * dpr) / dpr;
    const y = Math.round((hy + (y0 + land / 2 - hy) * e - arc - size / 2) * dpr) / dpr;
    const key = `${x},${y},${size}`;
    if (key !== perchBox) {
      perchBox = key;
      c.style.transform = `translate(${x - x0}px, ${y - y0}px) scale(${scale / vp.k})`;
    }
  };


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

    // ── The breakout, after the run (src/game/segments.ts BREAKOUT): q from the page, its plays, the hits ──
    const qOf = (tt: number) => (DB > 0 ? clamp01(((tt - T_MAX) * DW) / DB) : 0);
    const yOfQ = (qq: number) => trigger.start + DE + DW + qq * DB;
    const xOfQ = (qq: number) => (T_MAX + (qq * DB) / DW) * W;
    if (breakPlay) {
      if (breakPlay.t0 < 0) breakPlay.t0 = now;
      const k = Math.min(1, (now - breakPlay.t0) / Math.max(1, breakPlay.ms));
      const qq = breakPlay.q0 + (breakPlay.q1 - breakPlay.q0) * k;
      window.scrollTo({ top: yOfQ(qq), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.drive(xOfQ(qq), 0, 'auto');
      if (k >= 1) breakPlay = null;
    }
    const qT = qOf(timeline.tTarget);
    const inBreak = qT > 0 || breakPlay !== null;
    /** The plaza's end: the run is over, and → or Space pulls the camera back out of the game. */
    const atEnd = DB > 0 && timeline.tTarget >= T_MAX - 1e-6;
    /** The glass is there to hit: the monitor at rest, fewer than six cracks, nothing playing. */
    const hitZone = DB > 0 && !breakPlay && qT >= BREAKOUT.cracks[0] - 1e-3 && crackStage(qT) < CRACK_STAGES;
    /** Out to the monitor, or back into the game: the enter segment's pace, backwards. */
    const pullTo = (to: number) => {
      if (Math.abs(to - qT) < 1e-4) return;
      breakPlay = { q0: qT, q1: to, ms: (playMs(1) * Math.abs(to - qT)) / BREAKOUT.pullBack[1], t0: -1 };
      motion.cancel();
    };
    /** One hit on the glass: one crack further, Sam hopping on the screen; the sixth breaks it and the rest plays itself. */
    const hit = (auto: boolean) => {
      const next = hitTarget(qT);
      sam.jumpPress(now);
      sam.jumpRelease();
      lastHitAt = now;
      if (!auto) lastInputAt = now;
      if (next === null) {
        breakPlay = { q0: qT, q1: 1, ms: (BREAK_PLAY_MS * (1 - qT)) / (1 - BREAKOUT.shatter[0]), t0: -1 };
        autoArmed = false;
        return;
      }
      window.scrollTo({ top: yOfQ(next), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.driveTarget(xOfQ(next), auto ? 'auto' : 'mash');
    };

    // While the monitor shows, the keys never drive the world: Space or → at it is PRESS START.
    // (A → press is read every frame, so one from the run can never start the game later.)
    const pT = clamp01(1 + (timeline.tTarget * DW) / DE);
    const heroUp = !!d && pT < ENTER.handover[1];
    const rightPress = input.consumeRightPress();
    if (heroUp && input.active && (rightPress || input.dir > 0 || input.consumeJumpPress()) && now >= scrollOverrideUntil && !playing) start();
    // At the plaza's end and through the pull-back: → pulls the camera back to the monitor, ← dives back into the game.
    if (input.active && DB > 0 && !breakPlay && !heroUp && now >= scrollOverrideUntil && qT < BREAKOUT.cracks[0]) {
      if ((atEnd || qT > 0) && (rightPress || (qT > 0 && input.dir > 0))) pullTo(BREAKOUT.cracks[0]);
      else if (qT > 0 && input.dir < 0) pullTo(0);
    }
    // Keys / d-pad: Sam runs with real velocity and the page follows him.
    const held = input.active && now >= scrollOverrideUntil && !heroUp && !playing && !inBreak && !breakPlay ? input.dir : 0;
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
      if (overflow !== 0 && DB > 0) {
        // pushing on past the plaza's end: the camera pulls back out of the game
        scrollToX(X_MAX);
        pullTo(BREAKOUT.cracks[0]);
      } else if (overflow !== 0) {
        window.scrollBy({ top: overflow * pxPerWorld, behavior: 'instant' });
        expectedY = window.scrollY;
      } else scrollToX(X);
    }

    // Space / tap / A: a jump, all the way to the plaza; there, out to the monitor; at the monitor, a
    // hit on the glass (as is a tap or click on its screen).
    if (input.active) {
      if (input.consumeJumpPress() || pendingHit) {
        lastInputAt = now;
        if (hitZone) hit(false);
        else if (DB > 0 && !breakPlay && (atEnd || (qT > 0 && qT < BREAKOUT.cracks[0]))) pullTo(BREAKOUT.cracks[0]);
        else if (!heroUp && !inBreak) sam.jumpPress(now);
      }
      if (!input.jumpHeld && !inBreak) sam.jumpRelease();
    }
    pendingHit = false;
    // The auto-hits: armed on reaching the glass; after a second with no input the page
    // hits it by itself, a crack every AUTO_HIT_MS. A scroll of the user's disarms them (onUpdate).
    if (hitZone && !wasHitZone) {
      autoArmed = true;
      lastInputAt = now;
    }
    wasHitZone = hitZone;
    if (!hitZone) autoArmed = false;
    if (autoArmed && hitZone && input.active && now >= scrollOverrideUntil && now - lastInputAt >= AUTO_IDLE_MS && now - lastHitAt >= AUTO_HIT_MS) hit(true);
    prevT = tNow;

    timeline.step(dt);
    // The world's own t (0 through the enter segment, 1 through the breakout), the enter segment's
    // progress p and the breakout's q; through the breakout the monitor shows the enter segment backwards.
    const t = Math.min(T_MAX, Math.max(0, timeline.t));
    const p = clamp01(1 + (timeline.t * DW) / DE);
    const q = qOf(timeline.t);
    const inBreakout = q > 0;
    const heroP = inBreakout ? 1 - clamp01(q / BREAKOUT.pullBack[1]) : p;
    // While catching up the visual still follows the ease, so Sam faces the way he actually moves.
    sam.update(dt, timeline.t > 0 && !inBreak && !inBreakout ? timeline.speed : 0, now, catchingUp ? 0 : held, !catchingUp && motion.skidding);

    const X = t * W;
    const camLeft = X - sx;
    coins.update(X, prevSamX, sam.lift);
    prevSamX = X;

    if (input.active) {
      const view = { t, X, camLeft, sx, F, bw: vp.bw, bh: vp.bh, range: viewport, span: screen.rect, now, sky: skyAt(t), sam, coins, dust };
      // The enter segment, a pure function of p: the copy and PRESS START go first, then the whole
      // opening hands over to the canvas world under it — only the top layer fades, over an opaque world.
      const fade = d ? 1 - smooth(heroP, ENTER.handover) : 0;
      if (d) {
        // the opening's copy and PRESS START never come back: the breakout's monitor stands alone
        const out = inBreakout ? 1 : Math.round(smooth(p, ENTER.copyOut) * 100) / 100;
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
        section.classList.toggle('world--opening', heroP < ENTER.overlays);
        if (fade > 0) {
          const b = inBreakout ? breakState(q, now) : null;
          drawHero({ ...view, samX: X, hideSam: !!b?.sam }, now, heroP, b);
          // the monitor's screen takes taps through the cracks; BREAK OUT · n/6 labels it
          const prompting = !!b && q >= BREAKOUT.cracks[0] - 0.005 && b.stage < CRACK_STAGES && !breakPlay;
          o.prompt?.classList.toggle('is-visible', prompting);
          const count = `BREAK OUT · ${b ? b.stage : 0}/${CRACK_STAGES}`;
          if (o.promptTitle && o.promptTitle.textContent !== count) o.promptTitle.textContent = count;
          if (hitEl) {
            hitEl.classList.toggle('is-active', prompting);
            if (prompting && hero3d) {
              const qd = hero3d.quad(0, 0, 1, 1);
              const xs = qd.map((c) => c[0]);
              const ys = qd.map((c) => c[1]);
              const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round);
              const key = box.join(',');
              if (key !== hitBox) {
                hitBox = key;
                Object.assign(hitEl.style, { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2]! - box[0]!}px`, height: `${box[3]! - box[1]!}px` });
              }
            }
          }
        } else o.prompt?.classList.remove('is-visible');
      }
      if (!d || heroP >= ENTER.drawWorld) {
        // Through the enter segment (and the breakout) the far sky snaps to whole art px, as on the monitor's
        // screen, so the two agree at the handover; it glides at device px while the run moves (where the switch can't be seen).
        const glide = !d || (t > 0 && !inBreakout);
        // The game frame, then the far sky at device resolution (clouds glide) and the buffer over it.
        level.draw(bctx, { ...view, samX: X });
        level.drawFar(sctx, { ...view, samX: X }, vp.k, glide);
        sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, vp.bh * vp.k);
      }

      // The game's overlays come in at the end of the enter segment.
      const inGame = (!d || p >= ENTER.overlays) && (!inBreakout || heroP >= ENTER.overlays);
      o.hud?.classList.toggle('is-visible', inGame);
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
      const line = inGame ? (samLines.find((l) => t >= l.from && t < l.to) ?? null) : null;
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

      const clock = clockFor(t);
      if (clock !== lastClock && o.hudClock) {
        o.hudClock.textContent = clock;
        lastClock = clock;
      }
    }
    // Sam on the page, wherever the page is (below the pin the world no longer draws).
    updatePerch(q);
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
        return { DE, DW, DB, D };
      },
      get p() {
        return clamp01(1 + (timeline.t * DW) / DE);
      },
      get q() {
        return DB > 0 ? clamp01(((timeline.t - T_MAX) * DW) / DB) : 0;
      },
      get breakout() {
        return { want: wantBreakout, play: breakPlay, armed: autoArmed, stage: crackStage(DB > 0 ? clamp01(((timeline.t - T_MAX) * DW) / DB) : 0), perch: perch?.root.className ?? null, samOnScreen, glideTo };
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
    };
  }
}

export const samCell = SAM_CELL;
