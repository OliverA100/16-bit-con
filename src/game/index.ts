/**
 * Boot the world: feature gate, load Level 1, take over the hero area and run the loop. The static
 * hero stays as the fallback when this never runs.
 *
 * Two modes, on :root (src/components/World.astro styles from them). By default the page is a normal
 * landing page: the monitor powered on with the game live on its screen, then Register and Schedule,
 * no pin and no extra scroll; the keys belong to the page. PRESS START enters play mode (.is-playing):
 * only then is the ScrollTrigger pin created, and the enter segment plays from the top — the dive, the
 * run, the breakout. Exit game or Esc leaves it (the pin reverted, back at the top of the hero); when
 * Sam lands on the Register window the game closes itself ('done'), the scroll shifted by the pin's
 * length in the same frame so nothing moves. In play mode "Register now" opens the form in a dialog
 * over the paused game (src/game/register-dialog.ts).
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
import { BREAKOUT, CRACK_STAGES, DIVE, ENTER, clamp01, crackStage, hitTarget, playMs, playP, scrollLengths, smooth } from './segments';
import { drawCell, idleOnPerch, queryPerch } from './landing';
import { createRegisterDialog, focusRegister } from './register-dialog';
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
/**
 * The finale's pace, ms per stretch of the breakout: a beat from the sixth hit to the burst; Sam's jump
 * up out of the screen to its top (the leap, src/monitor/breakout.ts); his fall from there onto the
 * Register window (the landing: the pin lets go with the hero as it is on load, and the page follows him
 * down until the Register window is centred). One jump, airborne ~1.3 s. The glass keeps its own clock
 * (GLASS_MS) and is never sped up.
 */
const FINALE_MS = { toBurst: 300, leap: 650, land: 650 } as const;
/** After the landing has settled, the hero's copy waits, then fades back in over this long, ms. */
const COPY_BACK_MS = { wait: 200, fade: 600 } as const;
/** The glass's flight, ms: the shatter's own clock (src/monitor/breakout.ts FALL.time), whatever Sam's pace. */
const GLASS_MS = 1100;
/**
 * The breakout can't be skipped, however the page is scrolled: past the plaza's end the scroll drives it
 * no faster than this — the pull-back at the dive's own pace (segments.ts PLAY), and a crack at most every
 * CRACK_MIN_MS (mashing speed) — and the page holds at the monitor until Sam
 * has landed. Scroll beyond that is absorbed.
 */
const CRACK_MIN_MS = 150;
/** One crack's stretch of the breakout's progress q. */
const CRACK_STEP = (BREAKOUT.cracks[1] - BREAKOUT.cracks[0]) / CRACK_STAGES;
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
  exit: HTMLButtonElement | null;
  status: HTMLElement | null;
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
    exit: q<HTMLButtonElement>('[data-exit]'),
    status: q('[data-world-status]'),
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

  const root = document.documentElement;
  section.classList.add('world--live');
  root.classList.add('has-game');
  // The opening is up: the touch controls belong to the run and wait until it has gone.
  if (o.hero) section.classList.add('world--opening');
  fit();

  // ── Timeline, pin, inputs ───────────────────────────────────────────────
  // The pin (play mode only): the enter segment (D_E), the run (D_W) and, where the monitor's 3D can
  // run, the breakout (D_B). The timeline's t runs below 0 through the enter segment, from −D_E / D_W
  // at the top of the page, and above 1 through the breakout, to 1 + D_B / D_W. By default it rests at
  // the top (the monitor at rest); after the landing, at the end (the broken monitor glided up).
  // Dev only: ?hero=poster holds the poster (the swap check), ?hero=static is the no-3D opening.
  const devHero = import.meta.env.DEV ? new URLSearchParams(location.search).get('hero') : null;
  let wantBreakout = !!o.hero && 'WebGL2RenderingContext' in window && devHero !== 'static' && devHero !== 'poster';
  let { DE, DW, DB, D } = scrollLengths(window.innerHeight, wantBreakout);
  const timeline = new Timeline(W, T_MAX + DB / DW, -DE / DW);
  /** The lengths for this viewport, and the timeline's ends with them. */
  const syncLengths = () => {
    ({ DE, DW, DB, D } = scrollLengths(window.innerHeight, wantBreakout));
    timeline.tMin = -DE / DW;
    timeline.tMax = T_MAX + DB / DW;
    setLandingVars();
  };
  const tOf = (progress: number) => (progress * D - DE) / DW;
  /** The breakout's q at timeline position tl (0 before it). */
  const qAt = (tl: number) => (DB > 0 ? clamp01(((tl - T_MAX) * DW) / DB) : 0);
  /** The timeline position of a saved spot, for this viewport's lengths. */
  const tlOf = (spot: { t: number; q: number }) => (spot.q > 0 ? T_MAX + (spot.q * DB) / DW : spot.t);
  /** The enter progress the monitor shows at timeline position tl: 1 in the run, pulling back through the breakout. */
  const heroPAt = (tl: number) => {
    const q = qAt(tl);
    return q > 0 ? 1 - clamp01(q / BREAKOUT.pullBack[1]) : clamp01(1 + (tl * DW) / DE);
  };
  /** 'default': a normal page, no pin. 'play': after PRESS START, the pin and the game. 'done': Sam has landed, the pin is gone for good. */
  let mode: 'default' | 'play' | 'done' = 'default';
  /** The Register dialog is open over the game: no input, no plays. */
  let paused = false;
  let pausedAt = 0;
  /** The pin, only while playing. */
  let trigger: ScrollTrigger | null = null;
  /** Exit game is zooming the camera back out of the screen; the pin goes when it is done. */
  let exiting = false;
  /**
   * The camera along the dive without the page: in when the game resumes, out when it closes. p from p0 to
   * p1 at PRESS START's pace (segments.ts PLAY; the camera's DIVE curve does the easing), then `done`.
   */
  let zoom: { p0: number; p1: number; t0: number; done: () => void } | null = null;
  /** Where the player left the game (Exit game): the run's t and the breakout's q. In memory only, so a reload starts over. */
  let saved: { t: number; q: number } | null = null;
  /** The enter progress the monitor shows (the last frame's), where an exit's zoom starts. */
  let lastHeroP = 0;
  /**
   * The breakout's finale — the glass bursting, Sam's leap, the landing on the Register window — is an
   * event, not a camera move: once it starts (the sixth hit, or a scroll past the last crack) it plays to
   * the end at its own pace, the page held still under it (:root.is-finale), and the scroll never scrubs it.
   */
  let finale = false;
  /** How far Sam's fall onto the Register window has gone in time (0–1), through the finale's landing. */
  let landT = 0;
  /**
   * The landing: the page following Sam down from the hero to the Register window — scroll eased from 0
   * to y1 from t0 — while he drops from the top of his jump to (x, y) on screen, where his cell on the
   * Register window's title bar comes to rest under him.
   */
  let landing: { t0: number; y1: number; x: number; y: number } | null = null;
  /** "Register now" during the finale: the form gets focus once Sam is on it. */
  let focusAfterLanding = false;
  /** When everything settled after the landing: the hero's copy fades back in from then (COPY_BACK_MS). */
  let settledAt: number | null = null;
  /** When the glass burst (the finale's clock time), so it falls at its own pace; null before it bursts. */
  let glassT0: number | null = null;
  /** The breakout progress the page may reach so far (the speed limit grows it); the page holds there. */
  let allowQ = 0;
  /** A wheel push at the hold (absorbed), when: it keeps the breakout moving at its capped pace. */
  let gatePushAt = -Infinity;
  const pinTop = () => trigger?.start ?? 0;
  // Sam stands on the Register window at the game's own scale (--sam-px, CSS px per art px).
  const setLandingVars = () => {
    root.style.setProperty('--sam-px', `${vp.k / (window.devicePixelRatio || 1)}px`);
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
  let breakPlay: { q0: number; q1: number; ms: number; t0: number; keys?: [number, number][]; floorY?: number } | null = null;
  let scrollOverrideUntil = 0;
  /** A tap or click on the monitor's screen during the cracks (its DOM hit target). */
  let pendingHit = false;
  /** The pin, created by PRESS START (never on load), so the page is only as long as its content until then. */
  const createPin = () =>
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: () => `+=${D}`,
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // Our own scrollTo (keys, d-pad, a hit, the auto-break) echoes back here; anything else is the user, and the user wins.
        if (paused || exiting || finale || Math.abs(window.scrollY - expectedY) <= ECHO_PX) return;
        scrollOverrideUntil = clockNow() + SCROLL_OVERRIDE_MS;
        motion.cancel();
        playing = null;
        breakPlay = null;
        timeline.setScrollTarget(tOf(self.progress));
      },
      onRefresh: (self) => {
        syncLengths();
        expectedY = Number.NaN;
        timeline.jumpTo(tOf(self.progress));
      },
    });
  timeline.jumpTo(timeline.tMin);

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
      if (trigger) {
        if (!heightOnly) ScrollTrigger.refresh();
      } else if (!heightOnly) {
        // no pin: the lengths only place the landing (after it) and the timeline's resting end
        syncLengths();
        timeline.jumpTo(mode === 'done' ? timeline.tMax : saved ? tlOf(saved) : timeline.tMin);
      }
      hero3d?.frameChanged(true);
      layoutHero();
    },
    { passive: true },
  );

  // ── Progress rail: a click jumps the world to a level with no smear ──
  for (const btn of o.railStops) {
    btn.addEventListener('click', () => {
      if (mode !== 'play' || paused || zoom || finale) return;
      const t = Number(btn.dataset.jump);
      motion.cancel();
      playing = null;
      window.scrollTo({ top: Math.round(pinTop() + DE + t * DW), behavior: 'instant' });
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
    const y1 = Math.round(pinTop() + DE);
    if (window.scrollY < y1 - 1) playing = { from: playMs((window.scrollY - pinTop()) / DE), y1, t0: -1 };
  };
  // PRESS START: by default it opens the game (enterPlay, below); in the game, at the monitor, it plays the dive again.
  d?.startButton.addEventListener('click', () => {
    if (mode === 'default') enterPlay();
    else if (mode === 'play' && !paused && !zoom) start();
  });

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
      syncLengths();
      if (trigger) ScrollTrigger.refresh();
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
    if (p < ENTER.copyOut[1]) placeStart(d, hero3d.quad(...startUV));
    if (phase === 'on' && !startShown) {
      startShown = true;
      d.start.classList.add('is-ready');
    }
  };

  /** The breakout for the monitor at q: the cracks, the shatter, Sam's billboard (his frame drawn into it), the landing's glide. */
  let samBillboard = '';
  const breakState = (q: number, now: number): BreakoutState => {
    // the glass on its own clock from the burst (Sam may leave before it settles); from q where there is no burst clock
    if (q > BREAKOUT.shatter[0] && glassT0 === null && finale) glassT0 = now;
    const shatter =
      glassT0 !== null
        ? clamp01((now - glassT0) / GLASS_MS)
        : q > BREAKOUT.shatter[0]
          ? clamp01((q - BREAKOUT.shatter[0]) / (BREAKOUT.shatter[1] - BREAKOUT.shatter[0]))
          : 0;
    const leap = clamp01((q - BREAKOUT.leap[0]) / (BREAKOUT.leap[1] - BREAKOUT.leap[0]));
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
    // the monitor stays where it is on load: no glide (the page follows Sam down to the Register window instead)
    return { stage: crackStage(q), shatter, sam: samB, glide: { up: 0, scale: 1 } };
  };

  // ── Sam on the page (src/game/landing.ts): perched on the Register window only once he has escaped
  //    the game (the 'done' mode, for the rest of the visit); until then the perch is empty. With the
  //    breakout he leaps out, then in flight from the monitor — shrinking smoothly from twice the
  //    game's scale (where the page takes him from the billboard, exactly) to its own — landing on the
  //    window's title bar as the pin releases, at whole device px per art px again. In flight his box stays
  //    on the perch and a transform carries him, so the page never lays anything out again: no layout shift.
  const perch = queryPerch();
  let perchBox = '';
  /** Where the page took Sam over, on screen: the top of his jump out of the monitor. */
  let flightFrom: { x: number; y: number } | null = null;
  let perchFrame = '';
  if (perch) idleOnPerch(perch, assets.sam.idle, () => perch.root.classList.contains('is-landed'));
  const updatePerch = (q: number) => {
    if (!perch) return;
    const landed = mode === 'done' && !landing;
    const flying = !!landing;
    if (perch.root.classList.contains('is-landed') !== landed) {
      perch.root.classList.toggle('is-landed', landed);
      perchFrame = '';
      if (landed) perch.root.dispatchEvent(new Event('landed'));
    }
    const c = perch.canvas;
    if (c.classList.contains('is-flying') !== flying) c.classList.toggle('is-flying', flying);
    if (!flying) {
      flightFrom = null;
      if (perchBox) {
        perchBox = '';
        c.style.transform = '';
      }
      return;
    }
    if (!landing || !flightFrom) return;
    if (perchFrame !== 'jump') {
      perchFrame = 'jump';
      drawCell(c, assets.sam.jump, 0);
    }
    const dpr = window.devicePixelRatio || 1;
    // The second half of one jump: from its top he drops onto his cell on the title bar (where the CSS
    // places him, and his box always is) as the page brings it up under him — across at an even pace, down
    // under gravity (from rest at the top, faster as he falls), shrinking from twice the game's scale to
    // its own. By the landing's own time.
    const u = landT;
    const big = 2 * vp.k;
    const scale = big + (vp.k - big) * u;
    const size = (SAM_CELL * scale) / dpr;
    const pr = perch.root.getBoundingClientRect();
    const land = (SAM_CELL * vp.k) / dpr;
    const x0 = pr.left;
    const y0 = pr.bottom + (FOOT_SINK * vp.k) / dpr - land;
    const { x: hx, y: hy } = flightFrom;
    const x = Math.round((hx + (landing.x - hx) * u - size / 2) * dpr) / dpr;
    const y = Math.round((hy + (landing.y - hy) * u * u - size / 2) * dpr) / dpr;
    const key = `${x},${y},${size}`;
    if (key !== perchBox) {
      perchBox = key;
      c.style.transform = `translate(${x - x0}px, ${y - y0}px) scale(${scale / vp.k})`;
    }
  };


  // ── The two modes ───────────────────────────────────────────────────────
  const announce = (message: string) => {
    if (o.status) o.status.textContent = message;
  };
  /**
   * Where PRESS START was pressed, px: the stage starts there, so adding the pin never moves the view, and
   * comes to its place along the camera's own dive curve, so the two are one motion into the screen.
   */
  let entryShift = 0;
  /** The canvas world under the opening is shown only once the dive draws it (it keeps the last frame it drew). */
  let worldShown = true;
  /** The opening as it is at rest (p 0), at once: a hidden PRESS START could not take focus. */
  const resetStage = () => {
    entryShift = 0;
    if (!d) return;
    d.stage.style.translate = '';
    d.stage.style.setProperty('--out', '0');
    d.stage.classList.remove('is-copy-gone');
    d.stage.style.opacity = '';
    d.stage.style.pointerEvents = '';
    lastOut = 0;
    lastFade = 1;
    section.classList.add('world--opening');
    o.prompt?.classList.remove('is-visible');
    hitEl?.classList.remove('is-active');
  };
  /** Stop everything that moves the page or the world by itself. */
  const stopPlays = () => {
    input.enabled = false;
    input.reset();
    motion.cancel();
    playing = null;
    breakPlay = null;
    pendingHit = false;
  };

  /**
   * PRESS START on the page: the pin, created now. From the top, the enter segment plays as the page
   * scrolls; after an Exit game, the page goes straight to where the player left (the section stays
   * pinned at the top of the view, so nothing moves) and the camera dives into the screen there.
   */
  const enterPlay = () => {
    if (mode !== 'default' || trigger) return;
    const y0 = Math.max(0, Math.round(window.scrollY));
    endFinale();
    mode = 'play';
    root.classList.add('is-playing');
    syncLengths();
    const resume = saved ? tlOf(saved) : null;
    allowQ = saved?.q ?? 0;
    lastCrackSeen = crackStage(allowQ);
    glassT0 = null;
    gatePushAt = -Infinity;
    saved = null;
    timeline.jumpTo(resume ?? timeline.tMin);
    motion.cancel();
    input.reset();
    input.enabled = true;
    // the page goes to its top as the pin takes the section there; the stage keeps its place on screen
    entryShift = y0;
    if (d && y0 > 0) d.stage.style.translate = `0 ${-y0}px`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    expectedY = window.scrollY;
    trigger = createPin();
    expectedY = window.scrollY;
    if (resume === null) start();
    else {
      window.scrollTo({ top: Math.round(pinTop() + DE + resume * DW), behavior: 'instant' });
      expectedY = window.scrollY;
      // the pin's refresh put the timeline at the page's top (scroll 0 when it was made): back to the spot
      timeline.jumpTo(resume);
      const p1 = heroPAt(resume);
      if (p1 > 0) zoom = { p0: 0, p1, t0: -1, done: () => {} };
    }
    announce('Game started. Scroll or use the arrow keys to play. Press Escape to exit.');
  };

  /**
   * The page holds still through the finale: wheel, touch drags and scroll keys do nothing. Listeners, not
   * CSS: an `overflow: hidden` hold on the root makes the browser count Sam's landing as a layout shift.
   * They exist only while the finale plays, so scrolling anywhere else never waits on them.
   */
  const SCROLL_KEYS = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '];
  const holdScroll = (e: Event) => e.preventDefault();
  const holdKeys = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.includes(e.key)) e.preventDefault();
  };
  const holdPage = (on: boolean) => {
    const add = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
    add('wheel', holdScroll, { passive: false } as AddEventListenerOptions);
    add('touchmove', holdScroll, { passive: false } as AddEventListenerOptions);
    add('keydown', holdKeys as EventListener);
  };
  /**
   * The hold at the breakout: a wheel that would carry the page past what the breakout has played so far
   * (allowQ) is absorbed, and counts as a push that keeps it going at its capped pace (the frame grows
   * allowQ). Attached only while the page is near the breakout, so the run's scrolling never waits on it.
   */
  const gateY = () => pinTop() + DE + DW + allowQ * DB;
  const gateWheel = (e: WheelEvent) => {
    if (!trigger || e.deltaY <= 0) return;
    const y = gateY();
    if (window.scrollY + e.deltaY <= y + 1) return;
    e.preventDefault();
    gatePushAt = clockNow();
    if (window.scrollY < y - 0.5) {
      window.scrollTo({ top: y, behavior: 'instant' });
      expectedY = window.scrollY;
    }
  };
  let gateWheelOn = false;
  const setGateWheel = (on: boolean) => {
    if (on === gateWheelOn) return;
    gateWheelOn = on;
    if (on) window.addEventListener('wheel', gateWheel, { passive: false });
    else window.removeEventListener('wheel', gateWheel);
  };
  /** The crack stage last seen, so a crack the scroll makes gets Sam's hop, as a hit does. */
  let lastCrackSeen = 0;
  /** The picture's breakout progress last frame: the picture, too, goes through the breakout no faster than the cap. */
  let lastPicQ = 0;
  /** The breakout's speed limit at progress q, per ms: the pull-back at the dive's pace, then a crack per CRACK_MIN_MS. */
  const breakoutRate = (q: number) => (q < BREAKOUT.cracks[0] ? BREAKOUT.pullBack[1] / playMs(1) : CRACK_STEP / CRACK_MIN_MS);
  /** The finale from breakout progress `from` to the landing, at its own pace (FINALE_MS; the glass on GLASS_MS). */
  const startFinale = (from: number) => {
    if (finale) return;
    finale = true;
    root.classList.add('is-finale');
    holdPage(true);
    input.enabled = false;
    input.reset();
    motion.cancel();
    playing = null;
    pendingHit = false;
    // Keyframes (ms, q) from `from` to the landing, each stretch lasting its FINALE_MS (a share of it
    // when `from` is inside it): from the sixth hit's crack to the burst, the leap, the landing.
    const sixthHit = BREAKOUT.cracks[0] + (CRACK_STAGES - 1.5) * CRACK_STEP;
    const stretches: [number, number, number][] = [
      [sixthHit, BREAKOUT.shatter[0], FINALE_MS.toBurst],
      [BREAKOUT.shatter[0], BREAKOUT.land[0], FINALE_MS.leap],
    ];
    const keys: [number, number][] = [[0, from]];
    let prev = 0;
    for (const [a, b, ms] of stretches) {
      if (b <= from) continue;
      // the beat before the burst is always whole, however far into the sixth crack the finale starts
      prev += a === sixthHit ? ms : (ms * (b - Math.max(from, a))) / (b - a);
      keys.push([prev, b]);
    }
    // (the page never goes back up: the picture may trail where the page was let go, behind the pinned monitor)
    breakPlay = { q0: from, q1: Math.max(from, BREAKOUT.land[0]), ms: prev, t0: -1, keys, floorY: window.scrollY };
    // the picture is where the finale starts from this very frame (a fast scroll may have left it behind)
    timeline.jumpTo(T_MAX + (from * DB) / DW);
  };
  const endFinale = () => {
    if (finale) holdPage(false);
    finale = false;
    root.classList.remove('is-finale');
  };

  /** The pin's last step, at once: Sam lands on the Register window and the game closes. */
  const landNow = () => {
    stopPlays();
    timeline.jumpTo(timeline.tMax);
    window.scrollTo({ top: pinTop() + D, behavior: 'instant' });
    expectedY = window.scrollY;
    finish();
  };

  /**
   * Exit game or Esc: the spot is saved, the game's UI goes, and the camera pulls back out of the screen
   * to the monitor (the dive backwards, at its pace); then the pin goes and the page is the hero again,
   * the monitor showing the game frozen where the player left. The skip link does it at once. Through the
   * breakout's finale (it plays itself out in ~2.4 s) Esc does nothing; the skip link lands Sam instead.
   */
  const exitPlay = (focus: 'start' | 'main') => {
    if (mode !== 'play' || regDialog?.open) return;
    if (exiting) {
      if (focus === 'main') {
        zoom = null;
        finishExit('main');
      }
      return;
    }
    const tl = timeline.t;
    const q = qAt(tl);
    if (wantBreakout && q >= BREAKOUT.shatter[0]) {
      if (focus === 'main') {
        landNow();
        document.getElementById('main')?.focus({ preventScroll: true });
      }
      return;
    }
    saved = tl >= 0 ? { t: Math.min(T_MAX, tl), q } : null;
    stopPlays();
    timeline.jumpTo(tl);
    exiting = true;
    root.classList.add('is-exiting');
    root.classList.remove('is-playing');
    const from = lastHeroP;
    if (focus === 'main' || from <= 0) {
      zoom = null;
      finishExit(focus);
    } else zoom = { p0: from, p1: 0, t0: -1, done: () => finishExit(focus) };
  };

  /** The zoom out has landed on the monitor at rest: the pin goes, the page is at the top of the hero. */
  const finishExit = (focus: 'start' | 'main') => {
    exiting = false;
    trigger?.kill(true);
    trigger = null;
    mode = 'default';
    root.classList.remove('is-exiting', 'is-playing');
    syncLengths();
    timeline.jumpTo(saved ? tlOf(saved) : timeline.tMin);
    resetStage();
    window.scrollTo({ top: 0, behavior: 'instant' });
    expectedY = Number.NaN;
    if (focus === 'start' && d?.start.classList.contains('is-ready')) d.startButton.focus({ preventScroll: true });
    else document.getElementById('main')?.focus({ preventScroll: true });
    announce('Game closed.');
  };

  /**
   * Sam has landed: the game closes itself. Removing the pin's spacer shortens the page above the
   * landing by the pin's length; the page scrolls back by exactly what the landing moved, in the same
   * frame, so nothing on screen moves. The world stays at its end (the broken monitor in the masthead),
   * focus stays put.
   */
  const finish = () => {
    if (mode !== 'play' || !trigger) return;
    // the page's hold through the finale goes first, so the swap below is the only change this frame
    endFinale();
    setGateWheel(false);
    const ref = perch?.root ?? document.getElementById('register');
    const before = ref?.getBoundingClientRect().top ?? 0;
    // The page keeps its height through the swap: otherwise layout clamps the scroll to the shorter
    // page before it is set, and the browser sees the landing jump in from off screen (a layout shift).
    document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;
    trigger.kill(true);
    trigger = null;
    const after = ref?.getBoundingClientRect().top ?? 0;
    window.scrollTo({ top: window.scrollY + after - before, behavior: 'instant' });
    document.body.style.minHeight = '';
    expectedY = Number.NaN;
    mode = 'done';
    root.classList.add('is-done');
    root.classList.remove('is-playing');
    stopPlays();
    timeline.jumpTo(timeline.tMax);
    announce('Sam made it. Register below.');
  };

  /**
   * The top of Sam's jump out of the monitor: the pin lets go — the hero exactly as on load, the glass
   * broken, the page at its top so nothing on screen moves — and the page follows him down as he falls,
   * until the Register window is centred and he is on it (the frame's landing step). The page stays held
   * (the finale's listeners) until he has landed.
   */
  const releaseToLanding = (now: number) => {
    if (mode !== 'play' || !trigger) return;
    trigger.kill(true);
    trigger = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
    expectedY = Number.NaN;
    mode = 'done';
    root.classList.add('is-done');
    root.classList.remove('is-playing');
    input.enabled = false;
    input.reset();
    motion.cancel();
    playing = null;
    pendingHit = false;
    setGateWheel(false);
    timeline.jumpTo(timeline.tMax);
    // Where he is (the top of his jump, on screen) and where his cell on the title bar is on the page. The
    // page scrolls until the view ends halfway down the form's email field: Sam on the title bar, the form's
    // first fields under him, the broken monitor still above (on review 2026-11-10); he falls onto it as it
    // arrives, never back up the screen.
    const dpr = window.devicePixelRatio || 1;
    const sprite = hero3d?.samSprite();
    const g0 = d?.gl.getBoundingClientRect();
    const from = sprite && g0 ? { x: g0.left + sprite.x, y: g0.top + sprite.y } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    flightFrom = from;
    const pr = perch?.root.getBoundingClientRect();
    const cell = (SAM_CELL * vp.k) / dpr;
    const cellX = pr ? pr.left + cell / 2 : from.x;
    const cellY = pr ? pr.bottom + (FOOT_SINK * vp.k) / dpr - cell / 2 : from.y;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const email = document.getElementById('reg-email')?.getBoundingClientRect();
    const win = document.getElementById('register')?.getBoundingClientRect();
    // (once the player has registered the field is hidden: the same depth into the window)
    const endAt = email && email.height > 0 ? email.top + email.height / 2 : win ? win.top + 260 : window.innerHeight;
    const want = endAt - window.innerHeight;
    // (never so far that his cell would come to rest above him: he only ever falls)
    const y1 = Math.max(0, Math.min(maxY, cellY - from.y, want));
    landing = { t0: now, y1, x: cellX, y: cellY - y1 };
    landT = 0;
  };
  /** The landing's step: the page eases down to the Register window as Sam falls onto it; then he is on it. */
  const stepLanding = (now: number) => {
    if (!landing) return;
    landT = clamp01((now - landing.t0) / FINALE_MS.land);
    window.scrollTo({ top: landing.y1 * smooth(landT, [0, 1]), behavior: 'instant' });
    if (landT < 1) return;
    landing = null;
    settledAt = now;
    endFinale();
    announce('Sam made it. Register below.');
    if (focusAfterLanding) {
      focusAfterLanding = false;
      focusRegister();
    }
  };

  // ── Register over the game: the dialog pauses it, and the plays pick up where they were ──
  const regDialog = createRegisterDialog({
    onOpen: () => {
      paused = true;
      pausedAt = clockNow();
      input.enabled = false;
      input.reset();
      motion.cancel();
    },
    onClose: () => {
      const away = clockNow() - pausedAt;
      if (playing && playing.t0 >= 0) playing.t0 += away;
      if (breakPlay && breakPlay.t0 >= 0) breakPlay.t0 += away;
      lastInputAt = clockNow();
      paused = false;
      input.enabled = mode === 'play';
    },
  });
  /**
   * "Register now" in play mode: the form in the dialog, over the game. From the leap on, the Register
   * window is on screen with Sam flying to it, so the form stays there: he lands at once and the game
   * closes, focus in the form. While the camera zooms out it does nothing. Outside the game the nav's own
   * script centres the Register window (Nav.astro).
   */
  const openRegister = (from: HTMLElement | null): boolean => {
    if (mode !== 'play') return false;
    if (paused || exiting) return true;
    if (finale) {
      // the finale is already carrying the page down to the form: it gets focus once Sam is on it
      focusAfterLanding = true;
      return true;
    }
    if (!regDialog) return false;
    regDialog.show(from);
    return true;
  };
  for (const link of document.querySelectorAll<HTMLElement>('[data-register-link]')) {
    link.addEventListener('click', (e) => {
      if (mode === 'play') e.preventDefault();
      openRegister(link);
    });
  }
  o.exit?.addEventListener('click', () => exitPlay('start'));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || mode !== 'play' || paused || exiting || regDialog?.open) return;
    e.preventDefault();
    exitPlay('start');
  });
  // The skip link in the game: out of it first, then to the content.
  document.querySelector<HTMLAnchorElement>('.skip-link')?.addEventListener('click', (e) => {
    if (mode !== 'play') return;
    e.preventDefault();
    exitPlay('main');
  });

  // ── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let prevSamX = timeline.X;
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
      window.scrollTo({ top: pinTop() + DE + X * pxPerWorld, behavior: 'instant' });
      expectedY = window.scrollY;
    };

    /** Only in play mode, and not while the Register dialog is open, does anything move the page or the world. */
    const live = mode === 'play' && !paused && !zoom;
    // PRESS START playing the enter segment: the page scrolls on, the visual follows it exactly.
    if (playing && live) {
      if (playing.t0 < 0) playing.t0 = now;
      const pp = playP(playing.from + now - playing.t0);
      const y = pp >= 1 ? playing.y1 : pinTop() + pp * DE;
      window.scrollTo({ top: y, behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.drive((y - pinTop() - DE) / pxPerWorld, 0, 'auto');
      if (pp >= 1) playing = null;
    }

    // ── The breakout, after the run (src/game/segments.ts BREAKOUT): q from the page, its plays, the hits ──
    const qOf = (tt: number) => (DB > 0 ? clamp01(((tt - T_MAX) * DW) / DB) : 0);
    const yOfQ = (qq: number) => pinTop() + DE + DW + qq * DB;
    const xOfQ = (qq: number) => (T_MAX + (qq * DB) / DW) * W;
    if (breakPlay && live) {
      if (breakPlay.t0 < 0) breakPlay.t0 = now;
      const el = now - breakPlay.t0;
      const k = Math.min(1, el / Math.max(1, breakPlay.ms));
      let qq = breakPlay.q0 + (breakPlay.q1 - breakPlay.q0) * k;
      const keys = breakPlay.keys;
      if (keys) {
        // the finale: q along its keyframes, each stretch at its own pace
        const i = keys.findIndex(([ms]) => ms >= el);
        if (i <= 0) qq = i === 0 ? keys[0]![1] : breakPlay.q1;
        else {
          const [m0, a] = keys[i - 1]!;
          const [m1, b] = keys[i]!;
          qq = a + (b - a) * clamp01((el - m0) / Math.max(1, m1 - m0));
        }
      }
      window.scrollTo({ top: Math.max(yOfQ(qq), breakPlay.floorY ?? -Infinity), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.drive(xOfQ(qq), 0, 'auto');
      allowQ = Math.max(allowQ, Math.min(qq, BREAKOUT.shatter[0]));
      if (k >= 1) {
        breakPlay = null;
        // the top of Sam's jump: the page lets the monitor go and follows him down to the Register window
        if (finale) releaseToLanding(now);
      }
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
    const hit = () => {
      const next = hitTarget(qT);
      sam.jumpPress(now);
      sam.jumpRelease();
      lastInputAt = now;
      if (next === null) {
        startFinale(qT);
        return;
      }
      allowQ = Math.max(allowQ, next);
      lastCrackSeen = crackStage(next);
      window.scrollTo({ top: yOfQ(next), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.driveTarget(xOfQ(next), 'mash');
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
    const endY = pinTop() + D;
    if (!live) {
      // by default, after the landing and under the dialog nothing here moves the page
    } else if (window.scrollY > endY + 1) {
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
    if (input.active && live) {
      if (input.consumeJumpPress() || pendingHit) {
        lastInputAt = now;
        if (hitZone) hit();
        else if (DB > 0 && !breakPlay && (atEnd || (qT > 0 && qT < BREAKOUT.cracks[0]))) pullTo(BREAKOUT.cracks[0]);
        else if (!heroUp && !inBreak) sam.jumpPress(now);
      }
      if (!input.jumpHeld && !inBreak) sam.jumpRelease();
    }
    pendingHit = false;
    // The glass cracks only when the player hits it or scrolls: it never cracks by itself.

    // ── The breakout can't be skipped: past the plaza's end the page goes no further than the breakout has
    //    played (allowQ), which a push down grows at the capped pace — the pull-back at the dive's, then a
    //    crack every CRACK_MIN_MS at most; scroll beyond it is absorbed. The sixth crack starts the finale.
    // (A scrollbar drag or End straight past the whole pin is a deliberate skip: the end check lands Sam.)
    const gateOn =
      mode === 'play' && wantBreakout && !finale && !exiting && !paused && !zoom && !!trigger && window.scrollY < trigger.end - 1;
    setGateWheel(gateOn && window.scrollY > gateY() - 2.5 * window.innerHeight);
    if (gateOn) {
      const qPage = qOf((window.scrollY - pinTop() - DE) / DW);
      const pushed = now - gatePushAt < 120;
      if ((qPage > allowQ + 1e-6 || pushed) && allowQ < BREAKOUT.shatter[0]) {
        const rate = breakoutRate(allowQ);
        const cap = pushed ? BREAKOUT.shatter[0] : Math.min(qPage, BREAKOUT.shatter[0]);
        allowQ = Math.min(cap, allowQ + rate * dt * 1000);
        lastInputAt = now;
      }
      if (qPage > allowQ + 1e-6 || pushed) {
        const y = gateY();
        if (Math.abs(window.scrollY - y) > 0.5) {
          window.scrollTo({ top: y, behavior: 'instant' });
          expectedY = window.scrollY;
        }
        timeline.setScrollTarget(T_MAX + (allowQ * DB) / DW);
      }
    }

    timeline.step(dt);
    // The picture eases behind the page; through the breakout it may not catch up faster than the cap, so the
    // cracks one sees are never closer than CRACK_MIN_MS (the finale has its own pace).
    {
      const qv = qOf(timeline.t);
      if (gateOn && qv > lastPicQ) {
        const maxQ = lastPicQ + breakoutRate(lastPicQ) * dt * 1000;
        if (qv > maxQ) timeline.t = T_MAX + (maxQ * DB) / DW;
      }
      lastPicQ = qOf(timeline.t);
      if (gateOn) {
        // a crack the scroll made, as it shows: Sam hops on the screen, as on a hit
        const stage = crackStage(lastPicQ);
        if (stage > lastCrackSeen && stage < CRACK_STAGES) {
          sam.jumpPress(now);
          sam.jumpRelease();
        }
        lastCrackSeen = Math.max(lastCrackSeen, stage);
        // the sixth crack, as it shows: the finale, from there
        if (stage >= CRACK_STAGES) startFinale(Math.min(lastPicQ, BREAKOUT.shatter[0]));
      }
    }
    // A fast scroll runs ahead of the picture (it eases ~0.3 s behind the page), so the page decides, not the
    // picture. Past the end of the pin — a fling into the Register section or beyond — the game is over
    // where the user is: Sam lands at once and the pin goes, the page never pulled back up to play anything.
    if (mode === 'play' && !finale && !exiting && !paused && !zoom && trigger && window.scrollY >= trigger.end - 1) {
      stopPlays();
      timeline.jumpTo(timeline.tMax);
      finish();
    }
    // A scroll past the last crack is the sixth hit: the finale takes over from where the picture is. A
    // scroll that has already carried the page into the landing (the Register section rising into view)
    // starts it from where the page is, so the form and the world never disagree.
    if (mode === 'play' && wantBreakout && !finale && !exiting && !paused && !zoom) {
      // read from the page itself: ScrollTrigger's own update (the timeline's target) can land a frame later
      const qPage = qOf((window.scrollY - pinTop() - DE) / DW);
      if (qPage >= BREAKOUT.land[0]) startFinale(qPage);
      else {
        const qPic = qOf(timeline.t);
        if (qPic >= BREAKOUT.shatter[0] && qPic < 1) startFinale(qPic);
      }
    }
    // The world's own t (0 through the enter segment, 1 through the breakout), the enter segment's
    // progress p and the breakout's q; through the breakout the monitor shows the enter segment backwards.
    const t = Math.min(T_MAX, Math.max(0, timeline.t));
    const p = clamp01(1 + (timeline.t * DW) / DE);
    const q = qOf(timeline.t);
    const inBreakout = q > 0;
    // What the monitor shows: the page's enter progress in the game; a zoom's while one plays (the world
    // frozen where it is); the monitor at rest on the page, showing the game where the player left it.
    let zoomEnded = false;
    let heroP = inBreakout ? 1 - clamp01(q / BREAKOUT.pullBack[1]) : p;
    if (zoom) {
      if (zoom.t0 < 0) zoom.t0 = now;
      const dir = zoom.p1 >= zoom.p0 ? 1 : -1;
      const zp = playP(playMs(zoom.p0) + dir * (now - zoom.t0));
      heroP = dir > 0 ? Math.min(zp, zoom.p1) : Math.max(zp, zoom.p1);
      zoomEnded = heroP === zoom.p1;
    } else if (mode === 'default') heroP = 0;
    lastHeroP = heroP;
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
        // The copy goes with the dive and comes back with a zoom out; through the breakout it stays away,
        // clear of Sam's jump and fall, and fades back in its own place round the monitor (the hero as on
        // load) only once everything has settled after the landing (on review 2026-11-10 it came in with the
        // burst, then during the fall: in the way both times). PRESS START: never after the breakout, nor
        // through it in the game; on the page it shows over the monitor wherever the game was left.
        const rawOut =
          mode === 'done'
            ? landing
              ? 1
              : settledAt !== null
                ? 1 - smooth(now - settledAt, [COPY_BACK_MS.wait, COPY_BACK_MS.wait + COPY_BACK_MS.fade])
                : 0
            : inBreakout && mode === 'play' && !exiting
              ? 1
              : smooth(heroP, ENTER.copyOut);
        const out = Math.round(rawOut * 100) / 100;
        const startGone = mode === 'done' || (mode === 'play' && !exiting && (out >= 1 || inBreakout));
        if (out !== lastOut || d.stage.classList.contains('is-copy-gone') !== startGone) {
          lastOut = out;
          d.stage.style.setProperty('--out', String(out));
          d.stage.classList.toggle('is-copy-gone', startGone);
        }
        // after the breakout the copy only fades (World.astro): the dive's slide is the opening's alone
        if (d.stage.classList.contains('is-settled') !== (mode === 'done')) d.stage.classList.toggle('is-settled', mode === 'done');
        // Faded out, the stage stays in the accessibility tree (the h1 is in it): only clicks pass through.
        const f2 = Math.round(fade * 1000) / 1000;
        if (f2 !== lastFade) {
          lastFade = f2;
          d.stage.style.opacity = f2 < 1 ? String(f2) : '';
          d.stage.style.pointerEvents = f2 <= 0 ? 'none' : '';
        }
        section.classList.toggle('world--opening', heroP < ENTER.overlays);
        if (fade > 0) {
          const b = inBreakout ? breakState(q, now) : null;
          drawHero({ ...view, samX: X, hideSam: !!b?.sam }, now, heroP, b);
          // the monitor's screen takes taps through the cracks; BREAK OUT · n/6 labels it
          const prompting = live && !!b && q >= BREAKOUT.cracks[0] - 0.005 && b.stage < CRACK_STAGES && !breakPlay;
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
      // Until the dive draws it, the canvas world still holds its last frame (where the game was left): hidden,
      // so a stage lifted by a scrolled start never shows it under its bottom edge.
      const showWorld = !d || heroP >= ENTER.drawWorld;
      if (showWorld !== worldShown) {
        worldShown = showWorld;
        o.canvas.style.visibility = showWorld ? '' : 'hidden';
      }
      if (showWorld) {
        // Through the enter segment (and the breakout) the far sky snaps to whole art px, as on the monitor's
        // screen, so the two agree at the handover; it glides at device px while the run moves (where the switch can't be seen).
        const glide = !d || (t > 0 && !inBreakout);
        // The game frame, then the far sky at device resolution (clouds glide) and the buffer over it.
        level.draw(bctx, { ...view, samX: X });
        level.drawFar(sctx, { ...view, samX: X }, vp.k, glide);
        sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, vp.bh * vp.k);
      }

      // The game's overlays come in at the end of the enter segment.
      const inGame = mode === 'play' && !exiting && (!d || heroP >= ENTER.overlays);
      o.hud?.classList.toggle('is-visible', inGame);
      // Session windows: Level 1 from 0.08 until the gate, Level 2 once the street has started.
      for (const el of o.sessions) {
        const level = el.dataset.session;
        el.classList.toggle('is-visible', inGame && (level === '1' ? t >= 0.08 && t < 0.34 : level === '2' ? t >= 0.36 && t < 0.6 : level === '3' ? t >= 0.62 && t < 0.83 : false));
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
    // The stage starts where it was when PRESS START was pressed and comes to its place at the camera's
    // pace (DIVE, as the camera's own view offset does), landing with it: one motion, not two.
    if (entryShift > 0 && d) {
      const e = DIVE(clamp01((heroP - ENTER.camera[0]) / (ENTER.camera[1] - ENTER.camera[0])));
      const shift = entryShift * (1 - e);
      d.stage.style.translate = shift > 0.01 ? `0 ${(-shift).toFixed(2)}px` : '';
      if (shift <= 0.01) entryShift = 0;
    }
    // The end of the finale: the page at the pin's end and the world there too. Sam is on the Register
    // window; the game closes itself.
    // (The finale lands only when it has played out: its page eases in, so it is at the end a little early.)
    if (live && trigger && !breakPlay && window.scrollY >= trigger.end - 1 && timeline.t >= timeline.tMax - 1e-4) finish();
    // A zoom has reached its end: the game goes on (resume), or the page takes over (exit).
    if (zoomEnded && zoom) {
      const then = zoom.done;
      zoom = null;
      then();
    }
    stepLanding(now);
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
      get trigger() {
        return trigger;
      },
      get mode() {
        return { mode, paused };
      },
      enterPlay,
      exitPlay,
      get saved() {
        return saved;
      },
      get finale() {
        return finale;
      },
      get gate() {
        return { allowQ, wheel: gateWheelOn, glassT0 };
      },
      get zoom() {
        return zoom ? { ...zoom, p: lastHeroP } : null;
      },
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
        return { want: wantBreakout, play: breakPlay, stage: crackStage(DB > 0 ? clamp01(((timeline.t - T_MAX) * DW) / DB) : 0), perch: perch?.root.className ?? null, samOnScreen };
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
