/**
 * Boot the world: feature gate, load Level 1, take over the hero area, pin the section with
 * ScrollTrigger, and run the loop. The static hero stays as the fallback when this never runs.
 *
 * Who moves what: native scroll sets the timeline's target and the visual eases
 * toward it — nothing here ever scrolls the page back. Keys and the d-pad run Sam with real
 * velocity, set the timeline directly, and scroll the page to match; a hit on the glass and the
 * auto-break move the target one step and scroll the page with it. Those are the only scrollTo
 * calls. A scroll we did not cause cancels them all for 150 ms. Scroll wins.
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
import { Arrival } from './arrival';
import { AUTO_IDLE_MS, AUTO_SPEED, BREAK, CRACK_STAGES, Dissolve, bezelAt, crackStage, dissolveLevel, drawCracks, flightAt, impactPoint, mashTarget, promptOn } from './breakout';
import { skyAt } from './stages';
import { GROUND_BAND } from '../data/layers';
import { levelLabel, railStops, samLines, type SamLine } from '../data/guide';
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';

const W = 6000;
/** The whole run: the field, the city, the night, the breakout and the arrival at Booth 630 (world x 0–6000). */
const T_MAX = 1;
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

const steps = (p: number, n: number) => Math.ceil(Math.min(1, Math.max(0, p)) * n) / n;

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

  // Loading window only if assets take longer than 300 ms.
  const loadingTimer = window.setTimeout(() => {
    if (o.loading) o.loading.hidden = false;
  }, 300);
  const assets = await loadLevel1((done, total) => {
    if (o.loadingText) o.loadingText.textContent = `LOADING… ${Math.round((done / total) * 100)}%`;
  });
  window.clearTimeout(loadingTimer);
  if (o.loading) o.loading.hidden = true;

  // ── Viewport, buffers, geometry ─────────────────────────────────────────
  // Two offscreen frames: the game frame, and the real frame the dissolve reveals behind it.
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
  const realBuf = document.createElement('canvas');
  const rctx = realBuf.getContext('2d')!;
  const sctx = o.canvas.getContext('2d')!;
  let vp = worldBuffer(window.innerWidth, window.innerHeight);
  let F = vp.bh - GROUND_BAND;
  let sx = Math.round(0.3 * vp.bw);

  const fit = () => {
    vp = worldBuffer(window.innerWidth, window.innerHeight);
    F = vp.bh - GROUND_BAND;
    sx = Math.round(0.3 * vp.bw);
    buffer.width = realBuf.width = vp.bw;
    buffer.height = realBuf.height = vp.bh;
    o.canvas.width = vp.devW;
    o.canvas.height = vp.devH;
    bctx.imageSmoothingEnabled = false;
    rctx.imageSmoothingEnabled = false;
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
  const real = new Arrival(assets);
  const dissolve = new Dissolve();
  dissolve.warm(vp.bw, vp.bh, impactPoint(vp.bw, F));
  // The city set (and the arrival's art) loads right behind the field; city-far first enters at world x 300.
  loadCity()
    .then((c) => {
      level.city = c;
      real.warm(c);
      level.prepareNight();
    })
    .catch((err) => console.error('[world] city assets failed to load', err));
  let D1 = Math.round(pinnedDistance(window.innerHeight) * T_MAX);
  let expectedY = Number.NaN;
  let scrollOverrideUntil = 0;
  let autoArmed = false;
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${D1}`,
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
      timeline.setScrollTarget(self.progress * T_MAX);
    },
    onRefresh: (self) => {
      D1 = Math.round(pinnedDistance(window.innerHeight) * T_MAX);
      expectedY = Number.NaN;
      timeline.jumpTo(self.progress * T_MAX);
    },
  });
  // A link to a section (/#register) was resolved by the browser before the pin added its scroll
  // length: jump there again now that the page has its real height, and snap the world to match.
  const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target && !section.contains(target)) {
    window.scrollTo({ top: Math.round(target.getBoundingClientRect().top + window.scrollY), behavior: 'instant' });
    ScrollTrigger.update();
  }
  timeline.jumpTo(trigger.progress * T_MAX);

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
      window.scrollTo({ top: Math.round(trigger.start + t * D1), behavior: 'instant' });
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

  // ── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let prevSamX = timeline.X;
  let prevT = timeline.t;
  let lastInputAt = performance.now();
  let lastClock = '';

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const pxPerWorld = D1 / X_MAX;
    // 'instant' overrides the page's CSS scroll-behavior: smooth, which would otherwise restart
    // a smooth animation every frame and never move.
    const scrollToX = (X: number) => {
      window.scrollTo({ top: trigger.start + X * pxPerWorld, behavior: 'instant' });
      expectedY = window.scrollY;
    };
    const tNow = timeline.t;

    // Keys / d-pad: Sam runs with real velocity and the page follows him.
    const held = input.active && now >= scrollOverrideUntil ? input.dir : 0;
    if (held !== 0) lastInputAt = now;
    // While the visual is still easing after a scroll, keys move the target (the page) from where
    // the user left it and the visual catches up; otherwise they move Sam directly.
    const catchingUp = Math.abs(timeline.tTarget - timeline.t) * W > 2;
    const base = catchingUp ? timeline.tTarget * W : timeline.X;
    const wall = base >= X_MAX ? 1 : base <= 0 ? -1 : 0;
    // Turning away from an end of the level: he was stopped there, so no momentum and no skid.
    if (wall !== 0 && held === -wall && motion.vx * wall > 0) motion.cancel();
    const endY = trigger.start + X_MAX * pxPerWorld;
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
        overflow = X;
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
    const hitting = tNow >= BREAK.flight[0] && tNow < BREAK.dissolve[1];
    if (input.active) {
      if (input.consumeJumpPress()) {
        lastInputAt = now;
        if (hitting) {
          const next = mashTarget(timeline.tTarget);
          timeline.driveTarget(next * W, 'mash');
          scrollToX(next * W);
        } else if (tNow < BREAK.flight[0]) sam.jumpPress(now);
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
    const t = timeline.t;
    // The flight: on the propeller from 0.84, up and across in the game frame, down again on the plaza.
    const flight = flightAt(t, vp.bw, sx);
    sam.flight = flight ? flight.lift : null;
    // While catching up the visual still follows the ease, so Sam faces the way he actually moves.
    sam.update(dt, timeline.speed, now, catchingUp ? 0 : held, !catchingUp && motion.skidding);

    const X = timeline.X;
    const camLeft = X - sx;
    coins.update(X, prevSamX, sam.lift);
    prevSamX = X;

    if (input.active) {
      const shown = dissolveLevel(t);
      const view = { t, X, camLeft, sx, F, bw: vp.bw, bh: vp.bh, now, sky: skyAt(t), sam, coins, dust };
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
      if (shown < 64) level.drawFar(sctx, { ...view, samX: X }, vp.k);
      else real.drawFar(sctx, { ...view, samX: X }, vp.k);
      sctx.drawImage(buffer, 0, 0, vp.bw * vp.k, vp.bh * vp.k);

      // The title overlay is a pure function of the scroll position (not the eased visual, so a
      // scrollbar jump removes it at once): six hard steps over t 0.05–0.08, gone by 0.08.
      const out = steps((timeline.tTarget - 0.05) / 0.03, 6);
      o.copy.style.transform = `translateY(${-out * 48}px)`;
      o.copy.style.opacity = String(1 - out);
      o.windowRow.style.transform = `translateY(${-out * 32}px)`;
      o.windowRow.style.opacity = String(1 - out);
      o.copy.style.visibility = o.windowRow.style.visibility = out >= 1 ? 'hidden' : 'visible';
      o.hud?.classList.toggle('is-visible', t >= 0.06 && t < BREAK.hudOut);
      // Session windows: Level 1 from 0.08 until the gate, Level 2 once the street has started.
      for (const el of o.sessions) {
        const level = el.dataset.session;
        el.classList.toggle('is-visible', level === '1' ? t >= 0.08 && t < 0.34 : level === '2' ? t >= 0.36 && t < 0.6 : level === '3' ? t >= 0.62 && t < 0.83 : false);
      }
      o.hint?.classList.toggle('is-visible', t > 0.005 && t < 0.14);
      // The rail: each stop done, current or next by t.
      o.rail?.classList.toggle('is-visible', t >= 0.06);
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

      // The breakout's DOM: the bezel's opacity and the MASH prompt, both functions of t.
      section.style.setProperty('--bezel', bezelAt(t).toFixed(3));
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
      get breakout() {
        return { stage: crackStage(timeline.t), level: dissolveLevel(timeline.t), armed: autoArmed, bezel: bezelAt(timeline.t), flight: flightAt(timeline.t, vp.bw, sx) };
      },
      get loop() {
        return { overrideUntil: scrollOverrideUntil, expectedY, lastInputAt, active: input.active, dir: input.dir };
      },
      level,
      real,
    };
  }
}

export const samCell = SAM_CELL;
