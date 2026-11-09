/**
 * Boot the world: feature gate, load Level 1, take over the hero area, pin the section with
 * ScrollTrigger, and run the loop. The static hero stays as the fallback when this never runs.
 *
 * Who moves what: native scroll sets the timeline's target and the visual eases
 * toward it — nothing here ever scrolls the page back. Keys and the d-pad run Sam with real
 * velocity, set the timeline directly, and scroll the page to match; those are the only
 * scrollTo calls. A scroll we did not cause cancels the run for 150 ms. Scroll wins.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { worldBuffer } from './scale';
import { Timeline, pinnedDistance } from './timeline';
import { Input } from './input';
import { Motion } from './motion';
import { Dust } from './dust';
import { Sam, SAM_CELL } from './sam';
import { Coins, LEVEL1_COINS, TOTAL_COINS } from './coins';
import { loadCity, loadLevel1 } from './assets';
import { Level1 } from './world';
import { skyAt } from './stages';
import { GROUND_BAND } from '../data/layers';

const W = 6000;
/** Levels 1–3 are exposed: the field, the walk into town, the afternoon street and the night (world x 0–5040). */
const T_MAX = 0.84;
const X_MAX = T_MAX * W;
/** A scroll we did not cause suspends keys for this long. */
const SCROLL_OVERRIDE_MS = 150;
/** Our own scrollTo echoes back through ScrollTrigger; within this many px it is ours. */
const ECHO_PX = 1.5;

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
  rows: HTMLElement[]; // nav, copy, gap, window, gap2, stage
  copy: HTMLElement;
  windowRow: HTMLElement;
  hud: HTMLElement | null;
  hudCoins: HTMLElement | null;
  hudClock: HTMLElement | null;
  sessions: HTMLElement[];
  hint: HTMLElement | null;
  loading: HTMLElement | null;
  loadingText: HTMLElement | null;
  dpadLeft: HTMLElement | null;
  dpadRight: HTMLElement | null;
  buttonA: HTMLElement | null;
}

function query(section: HTMLElement): Overlay {
  const q = <T extends HTMLElement>(sel: string) => section.querySelector<T>(sel);
  const rows = ['nav', 'copy', 'gap', 'window', 'gap2', 'stage'].map((n) => q<HTMLElement>(`.hero__row--${n}`)!);
  return {
    section,
    canvas: q<HTMLCanvasElement>('.world__canvas')!,
    rows,
    copy: rows[1]!,
    windowRow: rows[3]!,
    hud: q('.world__hud'),
    hudCoins: q('[data-hud-coins]'),
    hudClock: q('[data-hud-clock]'),
    sessions: [...section.querySelectorAll<HTMLElement>('.world__session')],
    hint: q('.world__hint'),
    loading: q('.world__loading'),
    loadingText: q('[data-loading-text]'),
    dpadLeft: q('[data-dpad="left"]'),
    dpadRight: q('[data-dpad="right"]'),
    buttonA: q('[data-button="a"]'),
  };
}

const steps = (p: number, n: number) => Math.ceil(Math.min(1, Math.max(0, p)) * n) / n;

function clockFor(t: number): string {
  // 07:00 during the title; 10:00 at t 0.08 → 14:00 at 0.36 → 18:00 at 0.62 → 22:00 at 0.84,
  // stepped to 10 minutes.
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

  // Loading window only if assets take longer than 300 ms.
  const loadingTimer = window.setTimeout(() => {
    if (o.loading) o.loading.hidden = false;
  }, 300);
  const assets = await loadLevel1((done, total) => {
    if (o.loadingText) o.loadingText.textContent = `LOADING… ${Math.round((done / total) * 100)}%`;
  });
  window.clearTimeout(loadingTimer);
  if (o.loading) o.loading.hidden = true;

  // ── Viewport, buffer, geometry ──────────────────────────────────────────
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
  const sctx = o.canvas.getContext('2d')!;
  let vp = worldBuffer(window.innerWidth, window.innerHeight);
  let F = vp.bh - GROUND_BAND;
  let sx = Math.round(0.3 * vp.bw);

  const fit = () => {
    vp = worldBuffer(window.innerWidth, window.innerHeight);
    F = vp.bh - GROUND_BAND;
    sx = Math.round(0.3 * vp.bw);
    buffer.width = vp.bw;
    buffer.height = vp.bh;
    o.canvas.width = vp.devW;
    o.canvas.height = vp.devH;
    bctx.imageSmoothingEnabled = false;
    sctx.imageSmoothingEnabled = false;
  };

  section.classList.add('world--live');
  fit();

  // ── Timeline, pin, inputs ───────────────────────────────────────────────
  const timeline = new Timeline(W, T_MAX);
  const motion = new Motion();
  const dust = new Dust();
  const input = new Input(o.canvas);
  if (o.dpadLeft && o.dpadRight && o.buttonA) input.bindDpad(o.dpadLeft, o.dpadRight, o.buttonA);
  const sam = new Sam(assets.sam);
  const coins = new Coins(LEVEL1_COINS);
  const level = new Level1(assets);
  // The city set loads right behind the field; city-far first enters at world x 300.
  loadCity()
    .then((c) => {
      level.city = c;
      level.prepareNight();
    })
    .catch((err) => console.error('[world] city assets failed to load', err));
  let D1 = Math.round(pinnedDistance(window.innerHeight) * T_MAX);
  let expectedY = Number.NaN;
  let scrollOverrideUntil = 0;
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${D1}`,
    pin: true,
    pinSpacing: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      // Our own scrollTo (keys, d-pad) echoes back here; anything else is the user, and the user wins.
      if (Math.abs(window.scrollY - expectedY) <= ECHO_PX) return;
      scrollOverrideUntil = performance.now() + SCROLL_OVERRIDE_MS;
      motion.cancel();
      timeline.setScrollTarget(self.progress * T_MAX);
    },
    onRefresh: (self) => {
      D1 = Math.round(pinnedDistance(window.innerHeight) * T_MAX);
      expectedY = Number.NaN;
      timeline.jumpTo(self.progress * T_MAX);
    },
  });
  timeline.jumpTo(trigger.progress * T_MAX);

  const io = new IntersectionObserver((entries) => {
    input.active = entries.some((e) => e.isIntersecting);
  });
  io.observe(section);

  window.addEventListener(
    'resize',
    () => {
      fit();
      ScrollTrigger.refresh();
    },
    { passive: true },
  );

  // ── HUD wiring ──────────────────────────────────────────────────────────
  const setCoins = (n: number) => {
    if (o.hudCoins) o.hudCoins.textContent = `${String(n).padStart(2, '0')}/${TOTAL_COINS}`;
  };
  coins.onChange = setCoins;
  setCoins(coins.count);

  // ── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let prevSamX = timeline.X;
  let lastClock = '';

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Keys / d-pad: Sam runs with real velocity and the page follows him.
    const held = input.active && now >= scrollOverrideUntil ? input.dir : 0;
    // While the visual is still easing after a scroll, keys move the target (the page) from where
    // the user left it and the visual catches up; otherwise they move Sam directly.
    const catchingUp = Math.abs(timeline.tTarget - timeline.t) * W > 2;
    const base = catchingUp ? timeline.tTarget * W : timeline.X;
    const wall = base >= X_MAX ? 1 : base <= 0 ? -1 : 0;
    // Turning away from an end of the level: he was stopped there, so no momentum and no skid.
    if (wall !== 0 && held === -wall && motion.vx * wall > 0) motion.cancel();
    if (held !== 0 || motion.moving) {
      const dx = motion.step(dt, held, !sam.airborne, now);
      let X = base + dx;
      let overflow = 0;
      if (X > X_MAX) {
        overflow = X - X_MAX;
        X = X_MAX;
      } else if (X < 0) {
        overflow = X;
        X = 0;
      }
      // Pushing into an end of the level: Sam stands still while the page keeps scrolling on.
      const blocked = (X >= X_MAX && motion.vx > 0) || (X <= 0 && motion.vx < 0);
      const source = input.dpadDir ? 'dpad' : 'keys';
      if (catchingUp) timeline.driveTarget(X, source);
      else timeline.drive(X, blocked ? 0 : motion.vx, source);
      if (motion.puff) dust.spawn(X + SAM_CELL / 2, Math.sign(motion.vx), now);
      const pxPerWorld = D1 / X_MAX;
      // 'instant' overrides the page's CSS scroll-behavior: smooth, which would otherwise restart
      // a smooth animation every frame and never move.
      if (overflow !== 0) window.scrollBy({ top: overflow * pxPerWorld, behavior: 'instant' });
      else window.scrollTo({ top: trigger.start + X * pxPerWorld, behavior: 'instant' });
      expectedY = window.scrollY;
    }

    if (input.active) {
      if (input.consumeJumpPress()) sam.jumpPress(now);
      if (!input.jumpHeld) sam.jumpRelease();
    }

    timeline.step(dt);
    // While catching up the visual still follows the ease, so Sam faces the way he actually moves.
    sam.update(dt, timeline.speed, now, catchingUp ? 0 : held, !catchingUp && motion.skidding);

    const X = timeline.X;
    const camLeft = X - sx;
    coins.update(X, prevSamX, sam.lift);
    prevSamX = X;

    if (input.active) {
      const sky = skyAt(timeline.t);
      level.draw(bctx, { t: timeline.t, X, camLeft, sx, F, bw: vp.bw, bh: vp.bh, now, sky, sam, samX: X, coins, dust });
      sctx.clearRect(0, 0, o.canvas.width, o.canvas.height);
      sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, vp.bh * vp.k);

      // The title overlay is a pure function of the scroll position (not the eased visual, so a
      // scrollbar jump removes it at once): six hard steps over t 0.05–0.08, gone by 0.08.
      const t = timeline.t;
      const out = steps((timeline.tTarget - 0.05) / 0.03, 6);
      o.copy.style.transform = `translateY(${-out * 48}px)`;
      o.copy.style.opacity = String(1 - out);
      o.windowRow.style.transform = `translateY(${-out * 32}px)`;
      o.windowRow.style.opacity = String(1 - out);
      o.copy.style.visibility = o.windowRow.style.visibility = out >= 1 ? 'hidden' : 'visible';
      o.hud?.classList.toggle('is-visible', t >= 0.06);
      // Session windows: Level 1 from 0.08 until the gate, Level 2 once the street has started.
      for (const el of o.sessions) {
        const level = el.dataset.session;
        el.classList.toggle('is-visible', level === '1' ? t >= 0.08 && t < 0.34 : level === '2' ? t >= 0.36 && t < 0.6 : level === '3' ? t >= 0.62 && t < 0.83 : false);
      }
      o.hint?.classList.toggle('is-visible', t > 0.005 && t < 0.14);
      const clock = clockFor(t);
      if (clock !== lastClock && o.hudClock) {
        o.hudClock.textContent = clock;
        lastClock = clock;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

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
      get D1() {
        return D1;
      },
    };
  }
}

export const samCell = SAM_CELL;
