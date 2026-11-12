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
 * over the paused game (src/register/register-dialog.ts).
 *
 * Who moves what: native scroll sets the timeline's target and the visual eases
 * toward it — nothing here ever scrolls the page back. Keys and the d-pad run Sam with real
 * velocity, set the timeline directly, and scroll the page to match; a hit on the glass
 * moves the target one step and scrolls the page with it. Those are the only scrollTo
 * calls. A scroll the game did not cause cancels them all for 150 ms. Scroll wins.
 *
 * The opening: a Daisy White page with the monitor, the copy and PRESS START lies over
 * the canvas world. Once the page has loaded and gone idle, the monitor's 3D (three.js, its own
 * chunk) is built a step per task, takes the poster's place in one frame and powers on with the live
 * game on its screen. The pin starts with the enter segment (src/game/segments.ts): scrolling it, the
 * camera dives into the screen and lands on the native pose, and the opening hands over to the canvas
 * world beneath it pixel for pixel. This loop draws the game into the screen frame and renders the 3D
 * while the opening shows, and only the canvas world after. PRESS START plays the segment at the
 * dive's own pace (segments.ts PLAY: the dive in 770 ms, 970 ms in all).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { worldBuffer } from './scale';
import { Timeline } from './timeline';
import { Input } from './input';
import { Motion } from './motion';
import { Dust } from './dust';
import { FallingFlyer, FlyerSprites } from './flyer';
import { FOOT_SINK, Sam, SAM_CELL } from './sam';
import { Coins, LEVEL1_COINS, TOTAL_COINS } from './coins';
import { loadCity, loadLevel1 } from './assets';
import { Level1 } from './world';
import { clockFor, skyAt } from './stages';
import { GROUND_BAND } from '../data/layers';
import { GG_LINE, samLines, type SamLine } from '../data/guide';
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';
import { ScreenFrame } from './screen-frame';
import { placeStart, scanStart, slotBox, startRect, staticHero } from './hero-dom';
import type { Frame as WorldFrame, Rect } from './world';
import type { BreakoutState, Hero } from '../monitor/hero';
import { BREAKOUT, CRACK_STAGES, CRACK_STEP, DIVE, ENTER, HITS, LAST_CRACK, PLAY, crackStage, hitNext, playMs, playP, scrollLengths, smooth } from './segments';
import { queryOverlay } from './overlay';
import { afterOpeningPaint, pauseTask, whenIdleAfterLoad, type IdleWindow } from './idle';
import { drawCell, idleOnPerch, queryPerch, withSmile } from '../page/landing';
import { createRegisterDialog, focusRegister } from '../register/register-dialog';
import { createFlyerDialog } from './flyer-dialog';
import { typeOut } from './typing';
import { GL_ATTRIBUTES } from '../monitor/spec';
import * as sound from './sound';
import { clamp01 } from '../lib/math';
import { reducedMotion } from '../lib/reduced-motion';

const W = 6000;
/** The whole run: the field, the city, the night and the dawn at the Javits plaza, the game's last level (world x 0–6000). */
const T_MAX = 1;
const X_MAX = T_MAX * W;
/** A scroll the game did not cause suspends keys for this long. */
const SCROLL_OVERRIDE_MS = 150;
/** The game's own scrollTo echoes back through ScrollTrigger; within this many px it is the game's. */
const ECHO_PX = 1.5;
/**
 * The 3D shows its dark glass this long before it powers on. It takes the poster's place in one frame,
 * with no fade: the two match (a mean 1.7 / 255 apart), and a fade would make both half-transparent at
 * once, letting the page show through the whole monitor — a flash (the dark screen 89 → 131 of 255).
 */
const POWER_DELAY_MS = 200;
/**
 * The finale's pace, ms per stretch of the breakout: a beat from the last hit to the burst; Sam's jump
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
 * The breakout can't be skipped, however the page is scrolled: past the plaza's end the scroll drives the
 * pull-back to the monitor no faster than the dive's own pace (segments.ts PLAY) and stops at the glass.
 * The scroll that brought it there never cracks it, however long its momentum runs; once it has rested
 * (SCROLL_REST_MS), a new scroll cracks the glass, at most a crack every CRACK_MIN_MS, and breaks it after
 * the sixth. Hits crack it at once, any time. The page holds there until Sam has
 * landed; scroll beyond what has played is absorbed.
 */
const CRACK_MIN_MS = 150;
/** At the glass, the scroll must have rested this long before a new one cracks it (momentum never does). */
const SCROLL_REST_MS = 250;
/** After the page reaches the glass, a wheel step there counts only after this long (the swipe that arrived doesn't). */
const GLASS_GRACE_MS = 400;
/** A 3D that is not on screen this long after it was asked for gives way to the static opening. */
const HERO_TIMEOUT_MS = 10000;

export function shouldRunWorld(): boolean {
  if (typeof window === 'undefined') return false;
  if (reducedMotion.matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) <= 2) return false;
  return !!document.createElement('canvas').getContext('2d');
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

export async function bootWorld(section: HTMLElement): Promise<void> {
  if (!shouldRunWorld()) return;
  const o = queryOverlay(section);
  gsap.registerPlugin(ScrollTrigger);
  // ScrollTrigger never re-measures on a resize by itself: the resize handler below decides, so a
  // height-only resize on a touch screen (a keyboard takes ~40 % of the height, beyond what
  // ignoreMobileResize lets pass) never moves the page.
  ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });

  // The opening is a whole page while the world loads (the monitor is its loading state), so no
  // loading window covers it — and the world's ~1 MB of art waits until the opening's LCP element
  // has painted, so the opening's text never queues behind it.
  await afterOpeningPaint(section.querySelector('[data-stage]'));
  const assets = await loadLevel1();

  // ── Viewport, buffers, geometry ─────────────────────────────────────────
  // The game frame, drawn offscreen at art pixels and scaled onto the canvas over the far sky.
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
  const sctx = o.canvas.getContext('2d')!;
  // The layout width (without a classic scrollbar), so the canvas world's buffer maps 1:1 onto device
  // pixels under its CSS box — and onto the 3D's buffer at the handover.
  const viewW = () => document.documentElement.clientWidth || window.innerWidth;
  /**
   * The section's height, CSS px: the viewport's at load, and again on a resize — except a height-only
   * one on a touch screen (the address bar showing or hiding mid-scroll, a keyboard opening). With 100dvh
   * the hero grew and shrank with the toolbar as the page scrolled, stretching the 3D canvas under
   * PRESS START (placed in px) until the resize event came, so START drifted off the screen. Held, the
   * hero, the canvas world and the 3D keep one size, and nothing moves under the user's thumb.
   */
  const isTouch = () => navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  const touchScreen = isTouch();
  let heldH = window.innerHeight;
  const viewH = () => heldH;
  section.style.setProperty('--world-h', `${heldH}px`);
  /**
   * The skirt, CSS px: on a touch screen the canvas runs on below the section, to the bottom of the
   * largest viewport (100lvh, the toolbar hidden), so a phone's browser bar — floating over the page, or
   * gone mid-scroll — has the ground under it, not the page. Sam's ground line stays on the section's
   * height (F), so nothing he stands on goes under the bar; the rows below it are the ground's fill
   * carrying on down. It only shows while the run fills the screen (World.astro); it only ever grows.
   */
  const lvhProbe = document.createElement('div');
  lvhProbe.style.cssText = 'position:absolute;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
  const largestH = () => {
    document.body.append(lvhProbe);
    const h = lvhProbe.getBoundingClientRect().height;
    lvhProbe.remove();
    return Math.max(h, window.innerHeight);
  };
  let skirtH = 0;
  /** ...and this much further, CSS px: the rows that show under Safari's pill, below the largest viewport. */
  const SKIRT_BELOW = 96;
  const measureSkirt = () => (isTouch() ? Math.max(0, Math.ceil(largestH() - heldH)) + SKIRT_BELOW : 0);
  skirtH = measureSkirt();
  let vp = worldBuffer(viewW(), viewH());
  let skirtRows = 0;
  let F = vp.bh - GROUND_BAND;
  let sx = Math.round(0.3 * vp.bw);
  let viewport: Rect = { x0: 0, y0: 0, x1: vp.bw, y1: vp.bh };
  /** What the canvas draws: the viewport and the skirt's rows below it. */
  let canvasRange: Rect = viewport;
  // The monitor's screen: the same world, with margins (src/game/screen-frame.ts).
  const screen = new ScreenFrame();

  const fit = () => {
    vp = worldBuffer(viewW(), viewH());
    const dpr = window.devicePixelRatio || 1;
    const skirtDev = Math.round(skirtH * dpr);
    skirtRows = Math.ceil(skirtDev / vp.k);
    section.style.setProperty('--world-skirt', `${skirtDev / dpr}px`);
    F = vp.bh - GROUND_BAND;
    sx = Math.round(0.3 * vp.bw);
    viewport = { x0: 0, y0: 0, x1: vp.bw, y1: vp.bh };
    canvasRange = { ...viewport, y1: vp.bh + skirtRows };
    buffer.width = vp.bw;
    buffer.height = vp.bh + skirtRows;
    o.canvas.width = vp.devW;
    o.canvas.height = vp.devH + skirtDev;
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
  let wantBreakout = !!o.hero && 'WebGL2RenderingContext' in window;
  let { DE, DW, DB, D } = scrollLengths(viewH(), wantBreakout);
  const timeline = new Timeline(W, T_MAX + DB / DW, -DE / DW);
  /** The lengths for this viewport, and the timeline's ends with them. */
  const syncLengths = () => {
    ({ DE, DW, DB, D } = scrollLengths(viewH(), wantBreakout));
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
   * event, not a camera move: once it starts (the last hit, or a scroll past the last crack) it plays to
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
  /**
   * At the glass, scrolling cracks it only once the scroll that brought the page there has come to rest
   * (no push for SCROLL_REST_MS): a fresh scroll is the player's, momentum still settling is not. Hits
   * (click, tap, Space) crack it any time.
   */
  let scrollCracks = false;
  let lastPushAt = -Infinity;
  /** When the page reached the glass (the grace before a scroll there counts starts then). */
  let atGlassSince = -Infinity;
  /** The last wheel step that was the player's (not momentum's shrinking tail), and the last step's size and time. */
  let wheelFreshAt = -Infinity;
  let lastWheelAbs = 0;
  let lastWheelAt = -Infinity;
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
      level.city = c;
      level.plaza.warm(c);
      level.prepareNight();
    })
    .catch((err) => console.error('[world] city assets failed to load', err));
  const clockNow = () => performance.now();
  let expectedY = Number.NaN;
  /**
   * PRESS START's play through the enter segment at the dive's own pace (segments.ts PLAY): it began
   * `from` ms into a play from the top, at t0 on the clock, and ends at y1. A scroll of the user's cancels it.
   */
  let playing: { from: number; y1: number; t0: number } | null = null;
  /** The breakout's own plays, q from q0 to q1 in ms: the pull-back (→ or Space at the plaza), and the rest after the last hit. */
  let breakPlay: { q0: number; q1: number; ms: number; t0: number; keys?: [number, number][]; floorY?: number } | null = null;
  let scrollOverrideUntil = 0;
  /** A tap or click on the monitor's screen during the cracks (its DOM hit target). */
  let pendingHit = false;
  /**
   * The enter or exit sound and the play it follows (playing, zoom or breakPlay). It starts on the frame the
   * play's clock starts (t0), `lag` ms into itself: that frame's time is from before the click's handler ran
   * (making the AudioContext there can take ~100 ms), so the sound starts where the picture already is. A
   * play that ends lets its sound ring out (cueDone); one that goes early cuts it with a fast fade.
   */
  let cue: { voice: sound.Voice; owner: object } | null = null;
  const cueFor = (owner: object, voice: sound.Voice | null) => {
    cue?.voice.stop();
    cue = voice ? { voice, owner } : null;
  };
  const cueDone = (owner: object) => {
    if (cue?.owner === owner) cue = null;
  };
  const frameLag = (now: number) => Math.min(200, Math.max(0, performance.now() - now));
  /** When, in a dive from the top, the camera passes the glass: the picture nearly fills the view (the monitor finds it per viewport). */
  const glassMs = () => playMs(hero3d ? hero3d.flatP + ENTER.flatten.lead : ENTER.fillBy);
  /** The pin, created by PRESS START (never on load), so the page is only as long as its content until then. */
  /**
   * The story holds the page (holdStory, below): from PRESS START until the flyer is read nothing the player does
   * scrolls it, so a scroll the trigger sees then is never theirs — iOS Safari can land the dive's scrollTo a few px
   * off, and taken for the user's that stopped the dive half way, with no swipe left to finish it.
   */
  let storyHeld = false;
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
        // The game's own scrollTo (keys, d-pad, a hit) echoes back here; anything else is the user, and the user wins.
        if (paused || exiting || finale || storyHeld || Math.abs(window.scrollY - expectedY) <= ECHO_PX) return;
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

  // the frame loop's state (the loop itself is at the end): running, and whether it exists yet to be woken
  let looping = false;
  let loopReady = false;
  const io = new IntersectionObserver((entries) => {
    input.active = entries.some((e) => e.isIntersecting);
    wake();
  });
  io.observe(section);

  let lastViewW = viewW();
  window.addEventListener(
    'resize',
    () => {
      const w = viewW();
      // A height-only resize on a touch screen (the keyboard opening on the Register form, the address
      // bar) changes nothing: the section, the pin, its lengths and the landing's place keep the held
      // height (viewH) — re-measuring them would move the page under the user's thumb.
      const heightOnly = w === lastViewW && isTouch();
      lastViewW = w;
      if (heightOnly) {
        // ...except the skirt, which grows to a taller screen than it has seen (the bar gone mid-run)
        const s = measureSkirt();
        if (s > skirtH) {
          skirtH = s;
          fit();
        }
        return;
      }
      heldH = window.innerHeight;
      skirtH = measureSkirt();
      section.style.setProperty('--world-h', `${heldH}px`);
      fit();
      if (trigger) ScrollTrigger.refresh();
      else {
        // no pin: the lengths only place the landing (after it) and the timeline's resting end
        syncLengths();
        timeline.jumpTo(mode === 'done' ? timeline.tMax : saved ? tlOf(saved) : timeline.tMin);
      }
      hero3d?.frameChanged(true);
      layoutHero();
    },
    { passive: true },
  );

  // ── Sam: his portrait with the brand goggles, and the line for the current stretch, typed out ──
  if (o.samPortrait) {
    const pctx = o.samPortrait.getContext('2d')!;
    loadImage(sprites.samPortrait.file)
      .then((img) => pctx.drawImage(remap(img, SAM_BRAND_MAP), 0, 0))
      .catch(() => {});
  }
  let samLine: SamLine | null = null;
  let samSince = 0;
  let samShown = -1;
  /** Lines said as Sam passed them, and the ones waiting their turn. */
  const samSaidLines = new Set<SamLine>();
  const samQueue: SamLine[] = [];
  /** A line stays up after it is typed: long enough to read it (a floor, and more for a longer line) … */
  const LINE_READ_MIN = 2200;
  const LINE_READ_PER_CHAR = 55;
  /** … or this long when the next one is waiting. */
  const LINE_NEXT_MS = 800;
  /** A line Sam ran past this far (a jump) is not said; one that is part of the story (`key`) still is, up to the longer reach. */
  const LINE_STALE = 0.04;
  const LINE_STALE_KEY = 0.12;
  /** A waiting line Sam has run this far past is dropped when its turn comes (a `key` line, further): the bubble keeps up with him. */
  const LINE_BEHIND = 0.1;
  const LINE_BEHIND_KEY = 0.15;
  /** Sam has said he is breaking out (typed out, and a beat): until then the run's end holds, and the breakout waits. */
  let twistSaid = false;
  /** Run back this far before a line's place and it is his to say again when he passes it once more. */
  const LINE_REARM = 0.03;
  /** Typewriter pace: one character per this many ms (quick enough for the twist to be typed out before the run's end at full speed). */
  const TYPE_MS = 26;

  // ── The opening: a flyer floats down from the sky, Sam watches it, walks over and picks it up, and it
  //    opens (the flyer dialog). Once per page load; the page and the keys hold still until it is read. ──
  const flyerSprites = new FlyerSprites();
  type OpeningPhase = 'fall' | 'walk' | 'pickup' | 'read' | 'done';
  let opening: { phase: OpeningPhase; t0: number; flyer: FallingFlyer } | null = null;
  /** The flyer has been dropped this visit (an Exit before it is read drops it again on the way back in). */
  let flyerSeen = false;
  /** Sam walks over to it, world px/s (the run cycle at about half its pace). */
  const WALK_SPEED = 90;
  /** He looks at it on the ground for this long before he walks. */
  const LOOK_MS = 300;
  /** Picking it up: it lifts off the ground, then it is in his hands. */
  const PICKUP_MS = 260;
  /** Where it drifts from and lands, from Sam's centre at the start of the run: it swings across him early on. */
  const FLYER_FROM = 4;
  const FLYER_LAND = 84;
  /** The opening is on, or still to come (the dive's last frames, before the flyer drops): the story's UI waits. */
  /**
   * Nothing moves from PRESS START until the flyer has been read: the page (wheel, touch, scroll keys) and the
   * run keys are held through the dive, the fall, the walk and the read. Esc and Exit game still work.
   */
  const holdStory = (on: boolean) => {
    if (on === storyHeld) return;
    storyHeld = on;
    holdPage(on);
    if (on) {
      input.enabled = false;
      input.reset();
      motion.cancel();
    } else {
      input.reset();
      input.enabled = mode === 'play';
    }
  };
  const openingHolds = () => (opening ? opening.phase !== 'done' : !flyerSeen && mode === 'play');
  const startOpening = (now: number) => {
    flyerSeen = true;
    // The run stands still where it is (a scroll in the dive may still be easing it on): the picture and the
    // page settle on the same spot, so Sam stays exactly where the flyer was dropped for him.
    timeline.jumpTo(timeline.t);
    window.scrollTo({ top: Math.round(pinTop() + DE + timeline.t * DW), behavior: 'instant' });
    expectedY = window.scrollY;
    const still = reducedMotion.matches;
    const centre = timeline.X + SAM_CELL / 2;
    // from above the top of the screen (the paper's bottom 30 px over it)
    const flyer = new FallingFlyer(flyerSprites, now, F + 30, centre + FLYER_FROM, centre + FLYER_LAND, { swing: sound.flutter, land: sound.land }, still);
    opening = { phase: 'fall', t0: now, flyer };
    holdStory(true);
  };
  /** The flyer has been read: the run is Sam's. */
  const endOpening = () => {
    if (!opening) return;
    opening.phase = 'done';
    opening.flyer.taken = true;
    holdStory(false);
  };
  /** Exit before the flyer was read: it drops again when the game resumes. */
  const cancelOpening = () => {
    holdStory(false);
    if (!opening || opening.phase === 'done') return;
    opening = null;
    flyerSeen = false;
  };
  /** The flyer opens over the world, out of the little one in Sam's hands; the world waits until it is closed. */
  const flyerDialog = createFlyerDialog({
    onOpen: () => {
      paused = true;
      pausedAt = clockNow();
      // the flyer grows out of Sam's hands over FlyerDialog.astro's 260 ms
      sound.paperOpen(260);
    },
    // and steps out over 150 ms
    onClosing: () => sound.paperClose(150),
    onClose: () => {
      paused = false;
      endOpening();
    },
  });
  const openFlyer = () => {
    if (!flyerDialog || !opening) {
      endOpening();
      return;
    }
    // the little flyer's box on screen: its 16 × 3 strip on the ground, art px to CSS px
    const r = o.canvas.getBoundingClientRect();
    const u = r.width / vp.bw;
    const cx = opening.flyer.landX - (timeline.X - sx);
    const top = F + FOOT_SINK - 1 - 3 - 4;
    flyerDialog.show(new DOMRect(r.left + (cx - 8) * u, r.top + top * u, 16 * u, 3 * u));
  };

  // ── HUD wiring, and the Player 1 bonus line in the Register window at 12/12 ──
  const registerBonus = document.getElementById('register-bonus');
  const setCoins = (n: number) => {
    if (o.hudCoins) o.hudCoins.textContent = `${String(n).padStart(2, '0')}/${TOTAL_COINS}`;
    const all = n >= TOTAL_COINS;
    registerBonus?.toggleAttribute('hidden', !all);
  };
  coins.onChange = setCoins;
  setCoins(coins.count);

  // ── The opening: PRESS START, the monitor's 3D, the parallax ──────────────
  const d = o.hero;
  /** PRESS START — or Space / → at the monitor — plays the enter segment at the dive's own pace, from where the page is: it scrolls with it. */
  const start = () => {
    motion.cancel();
    d?.startButton.blur();
    const y1 = Math.round(pinTop() + DE);
    if (window.scrollY < y1 - 1) playing = { from: playMs((window.scrollY - pinTop()) / DE), y1, t0: -1 };
  };
  // PRESS START: by default it opens the game (enterPlay, below); in the game, at the monitor, it plays the dive again.
  d?.startButton.addEventListener('click', () => {
    // the sound's context is made here, inside the click: browsers allow sound only after a gesture
    sound.unlock();
    if (mode === 'default') enterPlay();
    else if (mode === 'play' && !paused && !zoom && !playing) start();
  });

  let hero3d: Hero | null = null;
  let heroMode: 'poster' | '3d' | 'static' = 'poster';
  let shownAt = -1;
  let startShown = false;
  let startUV: [number, number, number, number] = [0, 0, 1, 1];
  let slotCentre = { x: 0, y: 0 };
  let lastOut = -1;
  let lastFade = -1;
  /** The page's colour while the run fills a touch screen (the sky's, behind Safari's clock), or none. */
  let lastTint = '';
  /**
   * The floor strip: a thin pinned box on the screen's bottom edge. While Safari 26's toolbar is out whole it
   * fills behind it with one flat colour, this box's (else the page's, the sky's here); with the toolbar tucked
   * away the strip is hidden, and the scene's own pixels show under the pill (the strips below). On the body, not in the section: pinned, the section is the box its fixed children are placed
   * in (measured on iOS: the strip sat on the section's bottom, not the screen's). Shown only through the run on a touch screen.
   */
  const floorStrip = document.createElement('div');
  floorStrip.dataset.worldFloor = '';
  floorStrip.setAttribute('aria-hidden', 'true');
  floorStrip.hidden = true;
  floorStrip.style.cssText = 'position:fixed;right:0;bottom:0;left:0;z-index:2;height:12px';
  document.body.append(floorStrip);
  /** The floor strip's colour, read off the canvas a few times a second. */
  let lastFloor = '';
  let floorReadAt = -Infinity;
  const FLOOR_READ_MS = 400;
  /** The ground's colour for the strip: the mean of the buffer's bottom row, which drifts as the world passes and never flips between two of a textured ground's tones. */
  const floorColour = () => {
    const row = bctx.getImageData(0, buffer.height - 1, buffer.width, 1).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let p = 0; p < row.length; p += 4) {
      r += row[p]!;
      g += row[p + 1]!;
      b += row[p + 2]!;
    }
    const n = row.length / 4;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  };
  /**
   * The scene under Safari's bars. Safari draws nothing pinned outside its viewport, but it does draw the page: so
   * two strips of the page itself, kept just past the viewport's bottom and top edges by `position: sticky` (placed
   * by the browser as it scrolls, never a frame late), show the canvas' own pixels, copied in the frame that draws
   * them. Below: the rows under the bottom edge, pixel for pixel. Above, behind the clock: the top row, one device
   * row stretched up, so a building carries on up column for column (the page's background bands, further down,
   * stay under it as the fallback).
   */
  const ABOVE = 120;
  const strip = (css: string) => {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.hidden = true;
    c.style.cssText = `position:sticky;z-index:-1;display:block;width:100%;pointer-events:none;image-rendering:pixelated;${css}`;
    return c;
  };
  const below = strip(`bottom:-${SKIRT_BELOW}px;height:${SKIRT_BELOW}px;margin-top:-${SKIRT_BELOW}px`);
  const above = strip(`top:-${ABOVE}px;height:${ABOVE}px;margin-bottom:-${ABOVE}px`);
  above.height = 1;
  document.body.append(below);
  document.body.prepend(above);
  const belowCtx = below.getContext('2d')!;
  const aboveCtx = above.getContext('2d')!;
  /**
   * The skyline: the page's background through the run on a touch screen, the canvas' top row as vertical bands
   * across the page. Behind Safari's clock it shows the page, which scrolls, so no pixel of the pinned world can be
   * there; bands the same down their whole length look the same at any scroll, so the scene's top edge carries on up
   * (a building as a building, the sky as sky). Read a few times a second, as the world moves under it.
   */
  let lastSkyline = '';
  let skylineReadAt = -Infinity;
  const SKYLINE_READ_MS = 80;
  const SKYLINE_BANDS = 48;
  const skyline = () => {
    const w = o.canvas.width;
    const row = sctx.getImageData(0, 0, w, 1).data;
    const stops: string[] = [];
    let run = '';
    let from = 0;
    for (let i = 0; i <= SKYLINE_BANDS; i++) {
      const p = Math.min(w - 1, Math.floor(((i + 0.5) * w) / SKYLINE_BANDS)) * 4;
      const c = i < SKYLINE_BANDS ? `rgb(${row[p]},${row[p + 1]},${row[p + 2]})` : '';
      if (c === run) continue;
      if (run) stops.push(`${run} ${((from / SKYLINE_BANDS) * 100).toFixed(2)}% ${((i / SKYLINE_BANDS) * 100).toFixed(2)}%`);
      run = c;
      from = i;
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  /** Sam where the run ends, on the monitor's screen: his cell's centre (screen UV) and size (screen heights) — where the cracks start. */
  let samOnScreen: { centre: [number, number]; size: number } | null = null;
  /**
   * The breakout's prompt, centred in the room between the nav and the monitor's top (the monitor is at
   * rest through the cracks; the HUD is hidden then). Placed once as it shows (and again on a resize), not
   * every frame, in the section's own coordinates — the prompt's containing block: the nav's bottom and the
   * monitor's top each less the section's top, read together. On iOS a touch scroll at the hold is pulled
   * back every frame, and a viewport rect read mid-fight comes back off by the scroll; read per frame, it
   * made the prompt jump on alternate frames while the pinned monitor held still.
   */
  let promptPlaced = false;
  const placePrompt = (el: HTMLElement) => {
    if (!d || promptPlaced) return;
    promptPlaced = true;
    const sec = section.getBoundingClientRect().top;
    const nav = (document.querySelector('.nav-slot')?.getBoundingClientRect().bottom ?? sec) - sec;
    const monitorTop = d.slot.getBoundingClientRect().top - sec;
    const top = nav + (monitorTop - nav - el.offsetHeight) / 2;
    el.style.setProperty('--prompt-top', `${Math.round(Math.max(nav + 8, top))}px`);
  };
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
  let breakoutAsk = 0;
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
    promptPlaced = false;
    const r = d.slot.getBoundingClientRect();
    slotCentre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    // The breakout: Sam where the run ends — at the camera's left margin, on the ground — on the screen frame.
    const left = sx + g.mx;
    const top = F - SAM_CELL + FOOT_SINK + g.mt;
    const h = hero3d;
    const centre = h.screenUV(left + SAM_CELL / 2, top + SAM_CELL / 2);
    samOnScreen = { centre, size: Math.abs(h.screenUV(left, top)[1] - h.screenUV(left, top + SAM_CELL)[1]) };
    // The crack pattern starts from him: laid out (and uploaded) in idle time, never on a scroll frame.
    // Only the latest: a drag-resize asks many times, and each earlier centre is already stale.
    const w = window as IdleWindow;
    const ask = ++breakoutAsk;
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200)))(() => {
      if (ask === breakoutAsk) hero3d?.prepareBreakout(centre);
    });
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
    if (!('WebGL2RenderingContext' in window)) toStatic(null);
    else
      whenIdleAfterLoad(() => {
        // The context first: without one the page never downloads three.js.
        const gl = d.gl.getContext('webgl2', GL_ATTRIBUTES);
        if (!gl) return toStatic('no WebGL 2 context');
        const timer = window.setTimeout(() => toStatic(`not ready after ${HERO_TIMEOUT_MS} ms`), HERO_TIMEOUT_MS);
        import('../monitor/hero')
          .then(({ createHero }) => {
            return createHero(d.gl, gl, screen.canvas, pauseTask);
          })
          .then((h) => {
            window.clearTimeout(timer);
            if (heroMode === 'static') return h.dispose();
            hero3d = h;
            layoutHero();
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
      hero3d.render(now);
      d.gl.classList.add('is-on');
      d.poster.classList.add('is-hidden');
      shownAt = now;
      return;
    }
    if (hero3d.phase === 'off' && !powerSwitchedOff && now >= shownAt + POWER_DELAY_MS) hero3d.powerOn(now);
    const phase = hero3d.render(now);
    if (p < ENTER.copyOut[1]) placeStart(d, hero3d.quad(...startUV));
    // PRESS START shows once the picture is up, and goes as soon as the tube is switched off
    if (phase === 'on' && !startShown && hero3d.poweredOn) {
      startShown = true;
      d.start.classList.add('is-ready');
    } else if (startShown && !hero3d.poweredOn) {
      startShown = false;
      d.start.classList.remove('is-ready');
    }
    placePower(p);
  };

  // ── The monitor's power button: on the landing page, with the monitor at rest, a real button over the 3D
  //    one. A click switches the tube off (the power-on in reverse; PRESS START goes with the picture) and
  //    on again (PRESS START comes back once the picture is up, as on load). After the breakout, once Sam
  //    has landed, it works the broken set too: its static squashes into the line like the picture. ──
  const powerButton = section.querySelector<HTMLButtonElement>('[data-power]');
  /** Switched off by the visitor: the page does not power the tube on again by itself. */
  let powerSwitchedOff = false;
  let powerPlaced = '';
  const placePower = (p: number) => {
    if (!powerButton || !hero3d) return;
    const show = (mode === 'default' || (mode === 'done' && !landing)) && p < 0.001;
    if (powerButton.hidden === show) powerButton.hidden = !show;
    if (!show) return;
    const box = hero3d.powerBox();
    // never smaller than a comfortable target: 32 px with a mouse, 44 px to a finger
    const hit = Math.max(window.matchMedia('(pointer: coarse)').matches ? 44 : 32, 2.6 * box.r);
    const key = `${Math.round(box.x - hit / 2)},${Math.round(box.y - hit / 2)},${Math.round(hit)}`;
    if (key === powerPlaced) return;
    powerPlaced = key;
    powerButton.style.left = `${box.x - hit / 2}px`;
    powerButton.style.top = `${box.y - hit / 2}px`;
    powerButton.style.width = powerButton.style.height = `${hit}px`;
  };
  powerButton?.addEventListener('click', () => {
    if (!hero3d || !d || mode === 'play' || landing) return;
    const now = clockNow();
    if (hero3d.poweredOn) {
      powerSwitchedOff = true;
      hero3d.powerOff(now);
      if (document.activeElement === d.startButton) powerButton.focus();
    } else {
      powerSwitchedOff = false;
      hero3d.powerOn(now);
    }
    powerButton.setAttribute('aria-pressed', String(!powerSwitchedOff));
    // the visitor's own press, so it may sound even before START (the context is usually made already, on the press)
    sound.unlock();
    sound.power(powerSwitchedOff ? -1 : 1);
  });
  // The 3D button goes down with the pointer or the key and comes back up on release.
  if (powerButton) {
    // Going down also makes the sound's context (a press is a gesture the browser allows it on): that takes
    // ~100 ms the first time, spent here rather than on the click, so the switch's sound starts with its picture.
    const press = (down: boolean) => {
      hero3d?.pressPower(clockNow(), down);
      if (down && mode !== 'play' && !landing) sound.unlock();
    };
    powerButton.addEventListener('pointerdown', () => press(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur'] as const) powerButton.addEventListener(ev, () => press(false));
    powerButton.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(true);
    });
    powerButton.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') press(false);
    });
  }

  /** The breakout for the monitor at q: the cracks, the shatter, Sam's billboard (his frame drawn into it), the landing's glide. */
  let samBillboard = '';
  const breakState = (q: number, now: number): BreakoutState => {
    // the glass on its own clock from the burst (Sam may leave before it settles); from q where there is no burst clock
    if (q > BREAKOUT.shatter[0] && glassT0 === null && finale) {
      glassT0 = now;
      sound.shatter();
      sound.static();
    }
    // each crack stage as it first shows on this glass, from a hit or a scroll alike
    if (mode === 'play') while (crackHeard < Math.min(CRACK_STAGES, crackStage(q))) sound.crack(++crackHeard);
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

  // ── Sam on the page (src/page/landing.ts): perched on the Register window only once he has escaped
  //    the game (the 'done' mode, for the rest of the visit); until then the perch is empty. With the
  //    breakout he leaps out, then in flight from the monitor — shrinking smoothly from twice the
  //    game's scale (where the page takes him from the billboard, exactly) to its own — landing on the
  //    window's title bar as the pin releases, at whole device px per art px again. In flight his box stays
  //    on the perch and a transform carries him, so the page never lays anything out again: no layout shift.
  const perch = queryPerch();
  /** Sam's line on the Register window: typed out once he lands (the full line stays for screen readers). */
  const landingTyped = document.querySelector<HTMLElement>('[data-landing-typed]');
  let landingLine = '';
  let landingSince = -1;
  let landingShown = -1;
  let perchBox = '';
  /** Where the page took Sam over, on screen: the top of his jump out of the monitor. */
  let flightFrom: { x: number; y: number } | null = null;
  let perchFrame = '';
  // on the Register window he smiles (his idle with a grin; in the game he keeps his own face)
  const perchIdle = withSmile(assets.sam.idle);
  if (perch) idleOnPerch(perch, perchIdle, () => perch.root.classList.contains('is-landed') && !perch.root.classList.contains('is-away'));
  // Back on the Register window from the page, he says something new: an invitation, typed out as before (the
  // full line for screen readers too).
  const RETURN_LINE = 'Come say hi at Booth\u00A0630. I’ll save you a spot.'; // the booth's number kept with it
  /** Sam types a new line on the Register window (the full line for screen readers too). */
  const sayOnPerch = (line: string) => {
    wake(); // his line types out on the Register window, with the opening perhaps off screen
    if (!landingTyped) return;
    landingLine = line;
    const spoken = landingTyped.parentElement?.querySelector('.sr-only');
    if (spoken) spoken.textContent = line;
    typeOut(landingTyped, landingLine, 0);
    landingShown = -1;
    landingSince = clockNow();
  };
  /** Once someone registers, his next line is GG: now if he's on the window, else when he lands or comes back. */
  let nextLine: string | null = null;
  perch?.root.addEventListener('returned', () => {
    sayOnPerch(nextLine ?? RETURN_LINE);
    nextLine = null;
  });
  document.getElementById('register')?.addEventListener('register:done', () => {
    const here = perch && perch.root.classList.contains('is-landed') && !perch.root.classList.contains('is-away');
    if (here) sayOnPerch(GG_LINE);
    else nextLine = GG_LINE;
  });
  /** Sam out on the page after the landing (src/page/journey.ts): loaded on his first landing, never before. */
  let journey: Promise<void> | null = null;
  const updatePerch = () => {
    if (!perch) return;
    const landed = mode === 'done' && !landing;
    const flying = !!landing;
    if (perch.root.classList.contains('is-landed') !== landed) {
      perch.root.classList.toggle('is-landed', landed);
      perchFrame = '';
      if (landed) {
        perch.root.dispatchEvent(new Event('landed'));
        journey ??= import('../page/journey')
          .then((m) =>
            m.startJourney({ perch, sheets: assets.sam, perchIdle, paused: () => paused || root.classList.contains('is-paused') || !!regDialog?.open }),
          )
          .catch((err) => {
            console.error('[journey] Sam stays on the Register window', err);
          });
        // Sam's line on the Register window types out as his lines in the game do
        if (landingTyped) {
          if (nextLine) {
            sayOnPerch(nextLine);
            nextLine = null;
          } else {
            landingLine = landingTyped.textContent ?? '';
            typeOut(landingTyped, landingLine, 0);
            landingSince = clockNow();
          }
        }
      }
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
    wake();
    if (mode !== 'default' || trigger) return;
    const y0 = Math.max(0, Math.round(window.scrollY));
    endFinale();
    mode = 'play';
    root.classList.add('is-playing');
    syncLengths();
    const resume = saved ? tlOf(saved) : null;
    // back in past the start of the run: the flyer was read before the Exit
    if (resume !== null && resume > 0.002) flyerSeen = true;
    allowQ = saved?.q ?? 0;
    scrollCracks = false;
    lastPushAt = -Infinity;
    atGlassSince = -Infinity;
    wheelFreshAt = -Infinity;
    lastCrackSeen = crackStage(allowQ);
    crackHeard = lastCrackSeen;
    glassT0 = null;
    gatePushAt = -Infinity;
    saved = null;
    timeline.jumpTo(resume ?? timeline.tMin);
    motion.cancel();
    input.reset();
    input.enabled = true;
    // a first start: nothing moves until the flyer has dropped and been read
    if (!flyerSeen && resume === null) holdStory(true);
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
    // Momentum (a trackpad's inertia) is a run of steps that shrink, ending in small equal ones; a new
    // swipe comes in growing, or after a pause, and a mouse wheel's notches come in large and equal. Only
    // those are the player's at the glass.
    const t = clockNow();
    const abs = Math.abs(e.deltaY);
    const fresh = t - lastWheelAt >= 120 || abs > lastWheelAbs * 1.02 || (abs >= 40 && abs >= lastWheelAbs);
    lastWheelAbs = abs;
    lastWheelAt = t;
    if (fresh) wheelFreshAt = t;
    const y = gateY();
    if (window.scrollY + e.deltaY <= y + 1) return;
    e.preventDefault();
    gatePushAt = t;
    if (window.scrollY < y - 0.5) {
      window.scrollTo({ top: y, behavior: 'instant' });
      expectedY = window.scrollY;
    }
  };
  /** A new touch at the glass is the player's: it stops momentum, and the scroll it starts may crack the glass. */
  const gateTouch = () => {
    if (allowQ >= BREAKOUT.cracks[0] - 1e-6) scrollCracks = true;
  };
  let gateWheelOn = false;
  const setGateWheel = (on: boolean) => {
    if (on === gateWheelOn) return;
    gateWheelOn = on;
    if (on) {
      window.addEventListener('wheel', gateWheel, { passive: false });
      window.addEventListener('touchstart', gateTouch, { passive: true });
    } else {
      window.removeEventListener('wheel', gateWheel);
      window.removeEventListener('touchstart', gateTouch);
    }
  };
  /** The crack stage last seen, so a crack the scroll makes gets Sam's hop, as a hit does. */
  let lastCrackSeen = 0;
  /** The highest crack stage heard on this glass: each new one cracks once, however the page goes back and forth. */
  let crackHeard = 0;
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
    // Keyframes (ms, q) from `from` to the top of the leap, each stretch lasting its FINALE_MS (a share of
    // it when `from` is inside it): the beat from the breaking hit (the glass at six cracks) to the burst,
    // then the leap.
    const stretches: [number, number, number][] = [
      [LAST_CRACK, BREAKOUT.shatter[0], FINALE_MS.toBurst],
      [BREAKOUT.shatter[0], BREAKOUT.land[0], FINALE_MS.leap],
    ];
    const keys: [number, number][] = [[0, from]];
    let prev = 0;
    for (const [a, b, ms] of stretches) {
      if (b <= from) continue;
      // the beat before the burst is always whole, however far into the sixth crack the finale starts
      prev += a === LAST_CRACK ? ms : (ms * (b - Math.max(from, a))) / (b - a);
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

  /**
   * Exit game or Esc: the spot is saved, the game's UI goes, and the camera pulls back out of the screen
   * to the monitor (the dive backwards, at its pace); then the pin goes and the page is the hero again,
   * the monitor showing the game frozen where the player left. Through the breakout's finale (it plays
   * itself out in ~2.4 s) Esc does nothing.
   */
  const exitPlay = () => {
    // (not in the middle of Skip's fade either: its jump would land in the zoom out)
    if (mode !== 'play' || regDialog?.open || exiting || skipFade) return;
    cancelOpening();
    const tl = timeline.t;
    const q = qAt(tl);
    if (wantBreakout && q >= BREAKOUT.shatter[0]) return;
    saved = tl >= 0 ? { t: Math.min(T_MAX, tl), q } : null;
    stopPlays();
    timeline.jumpTo(tl);
    exiting = true;
    root.classList.add('is-exiting');
    root.classList.remove('is-playing');
    const from = lastHeroP;
    if (from <= 0) {
      zoom = null;
      finishExit();
    } else zoom = { p0: from, p1: 0, t0: -1, done: () => finishExit() };
  };

  /** The zoom out has landed on the monitor at rest: the pin goes, the page is at the top of the hero. */
  const finishExit = () => {
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
    if (d?.start.classList.contains('is-ready')) d.startButton.focus({ preventScroll: true });
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
    // first fields under him, the broken monitor still above; he falls onto it as it
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
      sound.hold('dialog', true);
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
      if (zoom && zoom.t0 >= 0) zoom.t0 += away;
      if (opening && opening.phase !== 'done') {
        opening.t0 += away;
        opening.flyer.shift(away);
      }
      paused = false;
      input.enabled = mode === 'play';
      sound.hold('dialog', false);
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
  o.exit?.addEventListener('click', () => exitPlay());
  // ── Skip: from the start of the game until the twist, straight to the story's end — the run at SKIP_TO, where
  //    Sam realises the Javits is pixels; the twist plays and the breakout follows as ever. Skipped before the
  //    flyer is read, the opening simply ends. A short stepped fade to the sky hides the jump (in the canvas, so
  //    Safari's bars fade with it). It lands at sunrise with the Javits ahead, far enough from the end for the
  //    twist's two lines (from SKIP_SAYS_FROM) to be typed out before it even at full speed. ──
  const SKIP_TO = 0.88;
  const SKIP_SAYS_FROM = 0.85;
  const SKIP_FADE_MS = 400;
  let skipFade: { t0: number; jumped: boolean } | null = null;
  o.skip?.addEventListener('click', () => {
    if (mode !== 'play' || paused || zoom || finale || exiting || skipFade || timeline.t >= SKIP_TO) return;
    if (opening && opening.phase !== 'done') {
      opening.flyer.taken = true;
      opening.phase = 'done';
    }
    flyerSeen = true;
    holdStory(false);
    // the story's lines from before the twist are not said (one already up goes)
    for (const l of samLines) if (l.at < SKIP_SAYS_FROM) samSaidLines.add(l);
    samQueue.splice(0, samQueue.length, ...samQueue.filter((l) => l.at >= SKIP_SAYS_FROM));
    if (samLine && samLine.at < SKIP_SAYS_FROM) samLine = null;
    motion.cancel();
    playing = null;
    skipFade = { t0: clockNow(), jumped: false };
    announce('Skipped to the Javits Center.');
  });
  // Sound on/off (the HUD, play mode only): remembered; off silences everything at once.
  const soundButton = section.querySelector<HTMLButtonElement>('[data-sound]');
  if (soundButton) {
    soundButton.setAttribute('aria-pressed', String(sound.enabled()));
    soundButton.addEventListener('click', () => {
      sound.setEnabled(!sound.enabled());
      soundButton.setAttribute('aria-pressed', String(sound.enabled()));
    });
  }
  // The nav's wordmark (a link home) in the game: the same as Exit game, zooming out to the monitor.
  // While the page zooms out or plays the finale it does nothing, as Register now does then.
  document.querySelector<HTMLAnchorElement>('.nav__brand')?.addEventListener('click', (e) => {
    const root = document.documentElement;
    if (mode === 'play') {
      e.preventDefault();
      exitPlay();
    } else if (root.classList.contains('is-exiting') || root.classList.contains('is-finale')) e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || mode !== 'play' || paused || exiting || regDialog?.open) return;
    e.preventDefault();
    exitPlay();
  });

  // ── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let prevSamX = timeline.X;
  let wasAirborne = false;
  let lastClock = '';

  const frame = (rafNow: number) => {
    const now = rafNow;
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
    // Skip: halfway through its fade the run jumps (the page and the picture together)
    if (skipFade && !skipFade.jumped && now - skipFade.t0 >= SKIP_FADE_MS / 2) {
      skipFade.jumped = true;
      window.scrollTo({ top: Math.round(pinTop() + DE + SKIP_TO * DW), behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.jumpTo(SKIP_TO);
    }
    // PRESS START playing the enter segment: the page scrolls on, the visual follows it exactly.
    if (playing && live) {
      if (playing.t0 < 0) {
        playing.t0 = now;
        // the sound is the camera's move (PLAY.dive), not the world's fade-in after it
        cueFor(playing, sound.enter(PLAY.dive, playing.from + frameLag(now), glassMs()));
      }
      const pp = playP(playing.from + now - playing.t0);
      const y = pp >= 1 ? playing.y1 : pinTop() + pp * DE;
      window.scrollTo({ top: y, behavior: 'instant' });
      expectedY = window.scrollY;
      timeline.drive((y - pinTop() - DE) / pxPerWorld, 0, 'auto');
      if (pp >= 1) {
        cueDone(playing);
        playing = null;
      }
    }

    // ── The breakout, after the run (src/game/segments.ts BREAKOUT): q from the page, its plays, the hits ──
    const qOf = (tt: number) => (DB > 0 ? clamp01(((tt - T_MAX) * DW) / DB) : 0);
    const yOfQ = (qq: number) => pinTop() + DE + DW + qq * DB;
    const xOfQ = (qq: number) => (T_MAX + (qq * DB) / DW) * W;
    if (breakPlay && live) {
      if (breakPlay.t0 < 0) {
        breakPlay.t0 = now;
        // the pull-back (not the finale): out to the monitor sounds like an exit, back into the game like a dive
        if (!breakPlay.keys) {
          const lag = frameLag(now);
          const { q0, q1, ms } = breakPlay;
          // (the pull-back moves q at an even pace; the monitor shows enter progress 1 − q / pullBack's end)
          const heroPOf = (tMs: number) => 1 - clamp01((q0 + ((q1 - q0) * tMs) / Math.max(1, ms)) / BREAKOUT.pullBack[1]);
          cueFor(breakPlay, q1 > q0 ? sound.exit(ms, lag, heroPOf) : sound.enter(ms, lag));
        }
      }
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
        cueDone(breakPlay);
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
    // (with all six cracks showing the glass is still there to hit: that hit breaks it)
    const hitZone = DB > 0 && !breakPlay && qT >= BREAKOUT.cracks[0] - 1e-3 && qT < BREAKOUT.shatter[0] - 1e-6;
    /** Out to the monitor, or back into the game: the enter segment's pace, backwards. */
    const pullTo = (to: number) => {
      if (Math.abs(to - qT) < 1e-4) return;
      breakPlay = { q0: qT, q1: to, ms: (playMs(1) * Math.abs(to - qT)) / BREAKOUT.pullBack[1], t0: -1 };
      motion.cancel();
    };
    /** One hit on the glass: one crack further, Sam hopping on the screen; the sixth breaks it and the rest plays itself. */
    const hit = () => {
      const next = hitNext(qT);
      sam.jumpPress(now);
      sam.jumpRelease();
      if (next === null) {
        startFinale(qT);
        return;
      }
      allowQ = Math.max(allowQ, next);
      lastCrackSeen = crackStage(next);
      window.scrollTo({ top: yOfQ(next), behavior: 'instant' });
      expectedY = window.scrollY;
      // the crack shows the moment it is hit: the picture goes straight there (no ease, and the scroll's
      // speed limit is not a hit's: a crack came 224 ms after its click)
      timeline.drive(xOfQ(next), 0, 'mash');
      lastPicQ = next;
    };

    // While the monitor shows, the keys never drive the world: Space or → at it is PRESS START.
    // (A → press is read every frame, so one from the run can never start the game later.)
    const pT = clamp01(1 + (timeline.tTarget * DW) / DE);
    const heroUp = !!d && pT < ENTER.handover[1];
    const rightPress = input.consumeRightPress();
    if (heroUp && input.active && (rightPress || input.dir > 0 || input.consumeJumpPress()) && now >= scrollOverrideUntil && !playing) start();
    // At the plaza's end and through the pull-back: → pulls the camera back to the monitor, ← dives back into the game.
    if (input.active && DB > 0 && !breakPlay && !heroUp && now >= scrollOverrideUntil && qT < BREAKOUT.cracks[0]) {
      if (((atEnd && twistSaid) || qT > 0) && (rightPress || (qT > 0 && input.dir > 0))) pullTo(BREAKOUT.cracks[0]);
      else if (qT > 0 && input.dir < 0) pullTo(0);
    }
    // Keys / d-pad: Sam runs with real velocity and the page follows him.
    // The opening: the flyer falls; Sam waits, then walks to it and picks it up (the page follows him, as with the keys).
    if (opening && opening.phase !== 'done' && live) {
      const op = opening;
      const fl = op.flyer;
      fl.tick(now);
      if (op.phase === 'fall' && fl.landed(now)) {
        op.phase = 'walk';
        op.t0 = now + LOOK_MS;
      }
      if (op.phase === 'walk' && now >= op.t0) {
        const target = fl.landX - SAM_CELL / 2;
        const X1 = Math.min(target, timeline.X + WALK_SPEED * dt);
        timeline.drive(X1, X1 < target ? WALK_SPEED : 0, 'auto');
        scrollToX(X1);
        if (X1 >= target) {
          op.phase = 'pickup';
          op.t0 = now;
          sound.pickup();
        }
      }
      if (op.phase === 'pickup') {
        const k = (now - op.t0) / PICKUP_MS;
        fl.raise = Math.round(Math.min(1, k) * 4);
        if (k >= 1) {
          fl.taken = true;
          op.phase = 'read';
          openFlyer();
        }
      }
    }
    const held = input.active && now >= scrollOverrideUntil && !heroUp && !playing && !inBreak && !breakPlay ? input.dir : 0;
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
        // pushing on past the plaza's end: the camera pulls back out of the game — once Sam has said he is
        // breaking out (the twist, a few seconds at most); until then he stands at the end
        scrollToX(X_MAX);
        if (twistSaid) pullTo(BREAKOUT.cracks[0]);
      } else if (overflow !== 0) {
        window.scrollBy({ top: overflow * pxPerWorld, behavior: 'instant' });
        expectedY = window.scrollY;
      } else scrollToX(X);
    }

    // Space / tap / A: a jump, all the way to the plaza; there, out to the monitor; at the monitor, a
    // hit on the glass (as is a tap or click on its screen).
    if (input.active && live) {
      if (input.consumeJumpPress() || pendingHit) {
        if (hitZone) hit();
        else if (DB > 0 && !breakPlay && ((atEnd && twistSaid) || (qT > 0 && qT < BREAKOUT.cracks[0]))) pullTo(BREAKOUT.cracks[0]);
        else if (!heroUp && !inBreak) sam.jumpPress(now);
      }
      if (!input.jumpHeld && !inBreak) sam.jumpRelease();
    }
    pendingHit = false;
    // The glass cracks only when the player hits it or scrolls: it never cracks by itself.

    // ── The breakout can't be skipped: past the plaza's end the page goes no further than the breakout has
    //    played (allowQ). A push down grows it through the pull-back at the dive's pace and stops at the
    //    glass; once that scroll has rested, a new one grows it on through the cracks to the break, and
    //    hits move it any time. Scroll beyond it is absorbed.
    // (A scrollbar drag or End straight past the whole pin is a deliberate skip: the end check lands Sam.)
    const gateOn = mode === 'play' && wantBreakout && !finale && !exiting && !paused && !zoom && !!trigger && window.scrollY < trigger.end - 1;
    setGateWheel(gateOn && window.scrollY > gateY() - 2.5 * window.innerHeight);
    if (gateOn) {
      const qPage = qOf((window.scrollY - pinTop() - DE) / DW);
      const pushed = now - gatePushAt < 120;
      // (past the hold by more than a pixel: the page rests on whole pixels, the hold need not)
      const pushing = window.scrollY > gateY() + 1 || pushed;
      const atGlass = allowQ >= BREAKOUT.cracks[0] - 1e-6;
      if (!atGlass) atGlassSince = -Infinity;
      else if (atGlassSince === -Infinity) atGlassSince = now;
      // At the glass a scroll cracks it when it is the player's: a fresh wheel step (not momentum's tail)
      // after the grace, or — for touch and keys — any scroll once the one that arrived has rested (a
      // new touch at the glass counts as rested: it stops momentum).
      if (atGlass && !scrollCracks && now - lastPushAt >= SCROLL_REST_MS) scrollCracks = true;
      if (pushing) lastPushAt = now;
      const freshWheel = now - wheelFreshAt < 120 && now - atGlassSince >= GLASS_GRACE_MS;
      const overshoot = window.scrollY > gateY() + 1;
      const theirs = !atGlass || freshWheel || (scrollCracks && (overshoot || pushed));
      // how far a scroll may take the breakout: through the pull-back to the glass, then through the cracks
      // and on to the break, at most a crack every CRACK_MIN_MS
      const limit = !twistSaid ? 0 : atGlass ? BREAKOUT.shatter[0] : BREAKOUT.cracks[0];
      if (pushing && theirs && allowQ < limit) {
        const rate = breakoutRate(allowQ);
        const cap = pushed ? limit : Math.min(qPage, limit);
        allowQ = Math.min(cap, allowQ + rate * dt * 1000);
      }
      if (pushing) {
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
        if (stage > lastCrackSeen && stage <= CRACK_STAGES) {
          sam.jumpPress(now);
          sam.jumpRelease();
        }
        lastCrackSeen = Math.max(lastCrackSeen, stage);
        // once the sixth crack has shown for its own stretch (the scroll's seventh push): the finale, its
        // beat (FINALE_MS.toBurst) and then the burst
        if (lastPicQ >= BREAKOUT.shatter[0] - 1e-6) startFinale(LAST_CRACK);
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
    // A scroll past the last crack is the last hit: the finale takes over from where the picture is. A
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
    // (held under the Register dialog like every other play: the camera waits where it was)
    if (zoom && !(paused && zoom.t0 < 0)) {
      if (zoom.t0 < 0) {
        zoom.t0 = now;
        const lag = frameLag(now);
        cueFor(zoom, zoom.p1 > zoom.p0 ? sound.enter(Math.min(PLAY.dive, playMs(zoom.p1)), lag, glassMs()) : sound.exit(playMs(zoom.p0), lag));
      }
      const dir = zoom.p1 >= zoom.p0 ? 1 : -1;
      const zp = playP(playMs(zoom.p0) + dir * Math.max(0, (paused ? pausedAt : now) - zoom.t0));
      heroP = dir > 0 ? Math.min(zp, zoom.p1) : Math.max(zp, zoom.p1);
      zoomEnded = heroP === zoom.p1;
    } else if (mode === 'default') heroP = 0;
    lastHeroP = heroP;
    // While catching up the visual still follows the ease, so Sam faces the way he actually moves. He runs
    // whenever the world he is drawn in moves through the run — by the picture, not by where the scroll is
    // headed: a fast scroll's target can be past the plaza while the picture still runs
    // (he would stand still there with the world sliding under him).
    sam.update(dt, timeline.t > 0 && !inBreakout ? timeline.speed : 0, now, catchingUp ? 0 : held, !catchingUp && motion.skidding);
    // The little puffs he kicks up running (on the ground only), and a burst as he lands a jump.
    const onGround = !sam.airborne;
    dust.run(timeline.X + SAM_CELL / 2, onGround && timeline.t > 0 && !inBreakout ? timeline.speed : 0, dt);
    if (onGround && wasAirborne) dust.land(timeline.X + SAM_CELL / 2);
    wasAirborne = !onGround;
    // Sam watches the flyer come down: he turns to whichever side of him it is (with a little slack, so he never flickers).
    if (opening && (opening.phase === 'fall' || (opening.phase === 'walk' && now < opening.t0))) {
      const fx = opening.flyer.pose(now).x;
      const c = timeline.X + SAM_CELL / 2;
      if (fx > c + 6) sam.facing = 1;
      else if (fx < c - 6) sam.facing = -1;
    }

    const X = t * W;
    const camLeft = X - sx;
    coins.update(X, prevSamX, sam.lift);
    prevSamX = X;

    if (input.active) {
      const flyer = opening && !opening.flyer.taken ? opening.flyer : null;
      const view = { t, X, camLeft, sx, F, bw: vp.bw, bh: vp.bh, range: viewport, span: screen.rect, now, sky: skyAt(t), sam, coins, dust, flyer };
      // The enter segment, a pure function of p: the copy and PRESS START go first, then the whole
      // opening hands over to the canvas world under it — only the top layer fades, over an opaque world.
      const fade = d ? 1 - smooth(heroP, ENTER.handover) : 0;
      if (d) {
        // The copy goes with the dive and comes back with a zoom out; through the breakout it stays away,
        // clear of Sam's jump and fall, and fades back in its own place round the monitor (the hero as on
        // load) only once everything has settled after the landing (it came in with the
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
          // the monitor's screen takes taps through the cracks; "Help Sam · n/6" labels it
          const prompting = live && !!b && q >= BREAKOUT.cracks[0] - 0.005 && q < BREAKOUT.shatter[0] && !breakPlay;
          o.prompt?.classList.toggle('is-visible', prompting);
          const count = `Help Sam · ${b ? b.stage : 0}/${HITS}`;
          if (prompting && o.prompt) placePrompt(o.prompt);
          else promptPlaced = false;
          if (o.promptTitle && o.promptTitle.textContent !== count) o.promptTitle.textContent = count;
          if (hitEl) {
            hitEl.classList.toggle('is-active', prompting);
            if (prompting && hero3d) {
              // the whole monitor takes the click or tap (the prompt says "Click the screen"): its glass and its body at rest
              const qd = hero3d.quad(0, 0, 1, 1);
              const sb = slotBox(d);
              const xs = [...qd.map((c) => c[0]), sb.x, sb.x + sb.w];
              const ys = [...qd.map((c) => c[1]), sb.y, sb.y + sb.h];
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
        level.draw(bctx, { ...view, samX: X, range: canvasRange });
        if (skipFade) {
          // to the sky and back, four steps each way
          const k = (now - skipFade.t0) / SKIP_FADE_MS;
          if (k >= 1) skipFade = null;
          else {
            const a = Math.ceil((1 - Math.abs(2 * k - 1)) * 4) / 4;
            bctx.save();
            bctx.globalAlpha = a;
            bctx.fillStyle = view.sky;
            bctx.fillRect(0, 0, buffer.width, buffer.height);
            bctx.restore();
          }
        }
        level.drawFar(sctx, { ...view, samX: X, range: canvasRange }, vp.k, glide);
        sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, (vp.bh + skirtRows) * vp.k);
      }

      // The game's overlays come in at the end of the enter segment.
      const inGame = mode === 'play' && !exiting && (!d || heroP >= ENTER.overlays);
      // The run has begun (the dive is over, however it was scrolled): the flyer drops, once a visit, wherever the
      // run is. Never in the dive itself, where the monitor is still handing over.
      if (inGame && live && !flyerSeen && !opening && !playing && timeline.t >= 0 && timeline.tTarget >= 0) startOpening(now);
      // While the run fills a phone's screen, Safari 26's bars show the world: the pinned section is hidden
      // from Safari (World.astro), so behind the clock it shows the page as it scrolls — the sky's colour;
      // under the bottom bar it extends the floor strip, the ground's colour read off the canvas' bottom row.
      // (From the moment the opening has gone: the world fills the screen before the overlays come in.)
      const bleed = touchScreen && mode === 'play' && !exiting && fade <= 0;
      const tint = bleed ? view.sky : '';
      if (tint !== lastTint) {
        lastTint = tint;
        section.classList.toggle('world--bleed', bleed);
        root.style.backgroundColor = tint;
        root.classList.toggle('is-bleeding', bleed);
        below.hidden = above.hidden = !tint;
        if (!tint) floorStrip.hidden = true;
        if (!tint) {
          root.style.backgroundImage = '';
          lastSkyline = '';
        }
      }
      if (tint) {
        // Safari's toolbar is out while the window is shorter than the tallest it has been: then it fills behind
        // the toolbar with the floor strip's colour; tucked away, the strip must go or its colour covers the page
        const barOut = window.innerHeight < heldH + skirtH - SKIRT_BELOW - 1;
        if (floorStrip.hidden === barOut) floorStrip.hidden = !barOut;
      }
      if (tint && showWorld) {
        const dpr = window.devicePixelRatio || 1;
        const w = o.canvas.width;
        const h = Math.round(SKIRT_BELOW * dpr);
        if (below.width !== w || below.height !== h) {
          below.width = w;
          below.height = h;
        }
        belowCtx.drawImage(o.canvas, 0, Math.min(o.canvas.height - h, Math.round(window.innerHeight * dpr)), w, h, 0, 0, w, h);
        // (not while the flyer crosses the top rows: its colours would stripe up behind the clock)
        if (!(opening?.phase === 'fall' && now - opening.t0 < 900)) {
          if (above.width !== w) above.width = w;
          aboveCtx.drawImage(o.canvas, 0, 0, w, 1, 0, 0, w, 1);
        }
      }
      if (tint && showWorld && now - floorReadAt > FLOOR_READ_MS) {
        floorReadAt = now;
        const floor = floorColour();
        if (floor !== lastFloor) {
          lastFloor = floor;
          floorStrip.style.backgroundColor = floor;
        }
      }
      // (not while the flyer crosses the top rows: its colours would stripe the page up behind the clock)
      const flyerUp = opening?.phase === 'fall' && now - opening.t0 < 900;
      if (tint && showWorld && !flyerUp && now - skylineReadAt > SKYLINE_READ_MS) {
        skylineReadAt = now;
        const sky = skyline();
        if (sky !== lastSkyline) {
          lastSkyline = sky;
          root.style.backgroundImage = sky;
        }
      }
      o.hud?.classList.toggle('is-visible', inGame);
      if (o.skip) {
        const showSkip = inGame && !inBreakout && t < SKIP_TO && !skipFade && opening?.phase !== 'read';
        if (o.skip.hidden === showSkip) o.skip.hidden = !showSkip;
      }
      o.hint?.classList.toggle('is-visible', inGame && !openingHolds() && t < 0.14);
      // Sam: each line is said once, as he passes it; lines queue, each is typed out in full and stays up long
      // enough to read, however fast the run goes (a line went before it was typed). Screen readers get
      // each line whole.
      // The breakout has begun: the run's lines are over (one still up, or waiting, goes), the monitor's prompt speaks.
      if (inBreakout && (samLine || samQueue.length)) {
        for (const l of samLines) samSaidLines.add(l);
        samQueue.length = 0;
        samLine = null;
      }
      if (inGame && !openingHolds()) {
        for (const l of samLines) {
          // back before it (not the one up, nor one still waiting): he says it again on the way through
          if (samSaidLines.has(l) && t < l.at - LINE_REARM && l !== samLine && !samQueue.includes(l)) samSaidLines.delete(l);
          if (samSaidLines.has(l) || t < l.at) continue;
          samSaidLines.add(l);
          if (l.twist) {
            // the twist: whatever older still waits, or is up, gives way to it
            for (let i = samQueue.length - 1; i >= 0; i--) if (!samQueue[i]!.twist) samQueue.splice(i, 1);
            if (samLine && !samLine.twist) samLine = null;
            samQueue.push(l);
          } else if (t - l.at < (l.key ? LINE_STALE_KEY : LINE_STALE)) samQueue.push(l);
        }
      }
      if (samLine) {
        const typedAt = samSince + samLine.text.length * TYPE_MS;
        if (samLine.end && now >= typedAt + LINE_NEXT_MS) twistSaid = true;
        const hold = samQueue.length ? LINE_NEXT_MS : Math.max(LINE_READ_MIN, samLine.text.length * LINE_READ_PER_CHAR);
        if (now >= typedAt + hold) samLine = null;
      }
      // a waiting line Sam has since run well past is dropped: the bubble keeps up with him
      while (samQueue.length && !samQueue[0]!.twist && t - samQueue[0]!.at > (samQueue[0]!.key ? LINE_BEHIND_KEY : LINE_BEHIND)) samQueue.shift();
      if (!samLine && samQueue.length && inGame) {
        samLine = samQueue.shift()!;
        samSince = now;
        samShown = -1;
        if (o.samSaid) o.samSaid.textContent = samLine.text;
      }
      o.sam?.classList.toggle('is-visible', inGame && !!samLine);
      if (samLine && o.samTyped) {
        const n = Math.min(samLine.text.length, Math.floor((now - samSince) / TYPE_MS));
        if (n !== samShown) {
          samShown = n;
          typeOut(o.samTyped, samLine.text, n);
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
      cueDone(zoom);
      zoom = null;
      then();
    }
    // The play a sound follows has gone early (a scroll cancelled it): a fast fade.
    if (cue && cue.owner !== playing && cue.owner !== zoom && cue.owner !== breakPlay) {
      cue.voice.stop();
      cue = null;
    }
    stepLanding(now);
    // Sam on the page, wherever the page is (below the pin the world no longer draws).
    updatePerch();
    if (landingSince >= 0 && landingTyped) {
      const n = Math.min(landingLine.length, Math.floor((now - landingSince) / TYPE_MS));
      if (n !== landingShown) {
        landingShown = n;
        typeOut(landingTyped, landingLine, n);
      }
      if (n >= landingLine.length) landingSince = -1;
    }
    if (idle()) looping = false;
    else requestAnimationFrame(frame);
  };
  /**
   * The loop rests when nothing it draws can be seen or can change: the tab hidden, or, outside the game, the
   * opening scrolled off screen with no landing in flight and no line still typing. In the game it never rests
   * (the section is pinned on screen). It wakes when the opening comes back on screen, when the tab does, when
   * the game starts and when Sam has a line to say on the Register window.
   */
  const idle = () => document.hidden || (mode !== 'play' && !zoom && !cue && !landing && landingSince < 0 && !input.active);
  function wake(): void {
    if (looping || !loopReady) return;
    looping = true;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', wake);
  loopReady = true;
  wake();
}
