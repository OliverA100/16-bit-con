/**
 * The opening: the monitor at rest in its slot with the live game on its screen, the
 * power-on, the pointer parallax, the hover glow — and the enter segment, the camera diving into the
 * screen. The page's one loop calls enter(p) and render() each frame while the monitor is on screen;
 * nothing here owns a requestAnimationFrame, and nothing renders while the levels play.
 *
 * Power-on, on the page's clock from powerOn(), timed on the reference video: dark glass with its
 * reflection → a thin, faint line grows from a point at the centre to the full width (170 ms) → it
 * brightens and thickens (40 ms) → the picture opens vertically from it at its normal brightness
 * (170 ms, gathering speed) — no white field, no flash → PRESS START 70 ms later. The picture's
 * light reaches the inner bevel (its emissive follows the open picture, never the line).
 *
 * The zoom (src/game/segments.ts ENTER, DIVE): the camera dives from the rest pose to the native pose
 * — where one texel of the game's frame is exactly k device px on the canvas world's grid — along the
 * reference's measured curve, turning straight-on on the way. The tube keeps its whole look —
 * curvature, bulge, scanlines growing with the screen, every effect — until its picture all but fills
 * the view (as in the reference, on review 2026-11-09); then its curvature and its vintage look flatten
 * together over ~125 ms while the bezel's last strips slide out, and the camera's last bit of zoom plays
 * on the flat picture (on review 2026-11-10: a ~30 ms cut read as too fast). The glass's reflection goes
 * early. At the landing
 * the screen shows the game's pixels exactly and the page can hand over to the canvas world without a
 * jump. No brightness flash.
 */
import { CanvasTexture, Color, Quaternion, Vector3, type Texture } from 'three';
import { createBreakout } from './breakout';
import { readToken } from '../game/palette';
import type { Quad } from '../game/quad';
import { DIVE, ENTER, smooth } from '../game/segments';
import { CRT_REST, STATIC_RATE, tuneAtRest, tuneOnScreen } from './crt';
import { createMonitorAsync, type FrameGeom, type Monitor, type Pose } from './index';
import { DIMS, type Slot } from './spec';
import { clamp01, lerp } from '../lib/math';
import { reducedMotion } from '../lib/reduced-motion';

/**
 * The power-on, ms: the line growing from the centre, brightening, the picture opening, PRESS START's
 * wait; the line faint then bright, thin then thick (fractions of the screen height).
 */
export const POWER = { grow: 170, brighten: 40, open: 170, ready: 70, faint: 0.45, bright: 1.6, thin: 0.0025, thick: 0.007 } as const;
/**
 * The turn toward the pointer, degrees, and how it chases the pointer: slow and heavy, like the reference
 * site's monitor. Two damped follows in a row, each frame-rate independent (x += (to − x)(1 − e^(−dt/τ))):
 * the aim eases toward the pointer (`lead`, s), and the turn follows the aim (`tau`, s) — so it eases in
 * and out, with no overshoot. Measured against the reference (a jump across the page, 2026-11-10): its
 * monitor swings about ±11° to our ±8°, so our time constants are its fit (0.08 s and 0.32 s) scaled by
 * 8 / 11, for the same speed in degrees a second over our smaller range. `maxDt` keeps a long frame (a
 * tab switch) from jolting it.
 */
const PARALLAX = { yaw: 8, pitch: 4, lead: 0.06, tau: 0.24, maxDt: 1 / 30 } as const;
/** Hovering PRESS START brightens the screen 10 %. */
const HOVER = { bright: 1.1, tau: 0.06 } as const;
/** The power-on's whole length, ms. */
const POWER_END = POWER.grow + POWER.brighten + POWER.open + POWER.ready;
/**
 * The switch-off runs the power-on's own timeline backwards, so it has the same pace, curves and line:
 * the picture closes into the line — squashed into it (scaled toward the centre line) rather than cut —
 * then the line dims and thins and shrinks at an even pace to a point at the centre. 380 ms.
 */
const OFF_END = POWER.grow + POWER.brighten + POWER.open;
/** The power button's press: how far it sinks into the face (most of its height), its ease (s), and the shortest press shown (ms). */
const PRESS = { travel: 0.0075, tau: 0.03, min: 120 } as const;
/** The bevel's emissive at full brightness: the screen's light reaching the recess walls, slightly. */
const BEVEL_GLOW = 0.35;
/** The glass at rest (src/monitor/index.ts): its opacity and its reflection. */
const GLASS = { opacity: 0.15, env: 2.2 } as const;

export type PowerPhase = 'off' | 'line' | 'open' | 'on';

/** What the page knows about its layout: the canvas's CSS box, the slot, and the canvas world it hands over to. */
export interface HeroLayout {
  cssW: number;
  cssH: number;
  slot: Slot;
  /** The canvas world's buffer, device px, and its device px per art px. */
  devW: number;
  devH: number;
  k: number;
  /** The game's screen frame: its size in texels and where the viewport frame sits in it. */
  frame: FrameGeom;
}

/** The breakout, frame by frame (src/game/segments.ts BREAKOUT). */
export interface BreakoutState {
  /** Crack stage on the glass, 0–6. */
  stage: number;
  /** The glass's flight once it breaks, 0–1 (0: whole). */
  shatter: number;
  /**
   * Sam as a billboard: his cell's centre in screen UV (v up), its size in screen heights, how far he has
   * leapt (0–1), and the scale (device px per art px) the leap brings him to — where the page takes him
   * over, so from then he is hidden here (his place is still worked out, for samSprite).
   */
  sam: { centre: [number, number]; size: number; leap: number; scale: number; hidden: boolean } | null;
  /** The landing: how far the monitor has glided up the page (CSS px) and how much smaller it has become (1: as at rest). */
  glide: { up: number; scale: number };
}

export interface Hero {
  monitor: Monitor;
  layout(l: HeroLayout): void;
  /** The screen frame was redrawn; `resized` when its canvas changed size. */
  frameChanged(resized: boolean): void;
  /** Where the pointer is, −1…1 from the slot's centre across the viewport; null when it left. */
  pointer(nx: number | null, ny?: number): void;
  hover(on: boolean): void;
  /** Power the tube on, or switch it off (it squashes into a line that shrinks to a point). */
  powerOn(now: number): void;
  powerOff(now: number): void;
  /** On, or powering on. */
  readonly poweredOn: boolean;
  /** The power button held down (pressed in while held, out on release; a quick click still shows a full press). */
  pressPower(now: number, down: boolean): void;
  /** Where the power button is on the page: its centre and radius, CSS px of the canvas. */
  powerBox(): { x: number; y: number; r: number };
  readonly phase: PowerPhase;
  /** Scanlines across the screen's height at rest (PRESS START's own lines match them). */
  readonly scanLines: number;
  /** Where on the way in (p) the tube starts to flatten, for this layout (dev measurements). */
  readonly flatP: number;
  /** The enter segment's progress: 0 at rest, 1 in the game (the camera lands at ENTER.camera[1]). */
  enter(p: number): void;
  /**
   * The breakout (src/monitor/breakout.ts), applied at the next render; null outside it. Lay its crack
   * pattern out first (prepareBreakout), in idle time: it rasterises the cracks and uploads them.
   */
  breakout(b: BreakoutState | null): void;
  prepareBreakout(impact: [number, number]): void;
  /** Sam's 60 × 60 canvas for the billboard: draw his frame into it, then call samDrawn(). */
  readonly samCanvas: HTMLCanvasElement;
  samDrawn(): void;
  /** Where Sam's billboard is on the page (its centre, CSS px of the canvas) and its scale (device px per art px), while it shows. */
  samSprite(): { x: number; y: number; scale: number } | null;
  /** A point of the game's screen frame (its canvas px, y down) as screen UV (v up). */
  screenUV(fx: number, fy: number): [number, number];
  /** Advance to `now` (ms, the page's clock) and draw. */
  render(now: number): PowerPhase;
  /** CSS px corners (top left, top right, bottom right, bottom left) of a rectangle on the screen; u, v across the opening, 0–1. */
  quad(u0: number, v0: number, u1: number, v1: number): Quad;
  dispose(): void;
}

const DEG = Math.PI / 180;
/** The opening gathers speed a little, as the reference's band does. */
const easeIn = (x: number) => clamp01(x) ** 1.2;
type Pt = [number, number];
/** Is (x, y) inside the convex quadrilateral q (either winding)? */
const inside = (q: Pt[], x: number, y: number) => {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const [ax, ay] = q[i] as Pt;
    const [bx, by] = q[(i + 1) % q.length] as Pt;
    const s = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (s === 0) continue;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

export async function createHero(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, frame: HTMLCanvasElement, pause: () => Promise<void>): Promise<Hero> {
  const m = await createMonitorAsync(canvas, context, pause);
  const { crt, parts, renderer } = m;
  const u = crt.uniforms;

  let texture = new CanvasTexture(frame);
  m.setFrame(texture, frame.width / frame.height);
  u.uOn.value = 0;
  u.uOpen.value = 0;
  u.uLine.value = 0;
  u.uLineW.value = 0;
  // The screen's glow on the bevel: the sky's blue toward white, off until the tube lights.
  const bevel = parts.materials.bevel;
  bevel.emissive.copy(new Color().setStyle(readToken('--color-blue-300')).lerp(new Color().setStyle(readToken('--color-cloud-white')), 0.5));
  bevel.emissiveIntensity = 0;
  const glass = parts.materials.glass;
  // With reduced motion the broken tube's static is one frame, held.
  const still = reducedMotion;
  const staticRate = () => (u.uStaticRate.value = still.matches ? 0 : STATIC_RATE);
  staticRate();
  still.addEventListener('change', staticRate);

  // A first size so the programs compile for the real render target, then every program in parallel
  // (KHR_parallel_shader_compile where there is one) and every texture uploaded, each in its own task.
  const mark = (name: string, t0: number) => import.meta.env.DEV && performance.measure(`monitor:${name}`, { start: t0, end: performance.now() });
  let t0 = performance.now();
  const w0 = Math.max(1, canvas.clientWidth);
  const h0 = Math.max(1, canvas.clientHeight);
  m.setBuffer(w0, h0, Math.round(w0 * Math.min(2, devicePixelRatio || 1)), Math.round(h0 * Math.min(2, devicePixelRatio || 1)));
  m.applyPose(m.restPose({ cx: w0 / 2, cy: h0 / 2, w: 300 }));
  // The breakout's meshes (hidden), then the monitor's programs; then, a task later, the breakout's own —
  // laid out once (any impact point) and shown for their compile, so every program it needs exists before
  // the first scroll and no one task builds them all.
  const bo = createBreakout(parts, crt);
  const compiling = renderer.compileAsync(m.scene, m.camera);
  mark('compile-start', t0);
  await compiling;
  await pause();
  t0 = performance.now();
  bo.layout([0.3, 0.15]);
  bo.showAll(true);
  const compilingBreakout = renderer.compileAsync(m.scene, m.camera);
  mark('compile-breakout', t0);
  await compilingBreakout;
  bo.showAll(false);
  await pause();
  t0 = performance.now();
  const contactMap = (parts.contact.material as { map?: Texture | null }).map ?? null;
  for (const t of [parts.materials.plastic.roughnessMap, bevel.emissiveMap, contactMap, texture]) {
    if (t) renderer.initTexture(t);
  }
  mark('textures', t0);
  await pause();

  const right = new Vector3(1, 0, 0);
  const qYaw = new Quaternion();
  const qPitch = new Quaternion();
  const Y = new Vector3(0, 1, 0);
  /** The turn the shadow was last drawn for: it is redrawn only when the monitor has turned since. */
  const shadowTurn = new Quaternion(0, 0, 0, 0);
  let target = { yaw: 0, pitch: 0 };
  let turn = { yaw: 0, pitch: 0 };
  /** The aim: the pointer's target, eased (the first of the two follows). */
  let aim = { yaw: 0, pitch: 0 };
  let hoverTarget = 1;
  let hoverB = 1;
  /**
   * The power: switched on (the power-on from `at`) or off (the switch-off from `at`), on the page's
   * clock. Unset until the page first powers the tube on.
   */
  let power: { at: number; dir: 1 | -1 } | null = null;
  const setPower = (now: number, dir: 1 | -1) => {
    if (power?.dir === dir) return;
    power = { at: now, dir };
  };
  /** The power button: held down, since when, and how far in it is. */
  let pressDown = false;
  let pressSince = -Infinity;
  /** How far the button is pressed in, 0–1, easing toward where the press wants it. */
  let pressed = 0;
  const powerRest = parts.power.position.z;
  let phase: PowerPhase = 'off';
  let last = -1;
  let p = 0;
  // The layout and the two poses the zoom runs between.
  let lay: HeroLayout | null = null;
  let rest: Pose | null = null;
  let native: Pose | null = null;
  let restBuf = { w: 1, h: 1 };
  let prRest = 1;
  /** The screen's width at rest, px of the canvas at rest. */
  let restW = 1;
  let fullRes = false;
  /** Where the tube starts to flatten (p): ENTER.flatten.lead before its picture nearly fills the view. */
  let flatP: number = ENTER.fillBy - ENTER.flatten.lead;
  const pose: Pose = { target: new Vector3(), dist: 1, yaw: 0, pitch: 0, fov: 30, ox: 0, oy: 0 };
  const probe: Pose = { target: new Vector3(), dist: 1, yaw: 0, pitch: 0, fov: 30, ox: 0, oy: 0 };

  const p0 = new Vector3();
  const p1 = new Vector3();
  const side = new Vector3();
  let brk: BreakoutState | null = null;

  /** The camera's progress along the dive at enter progress q (0–1, its log distance). */
  const diveAt = (q: number): number => DIVE(clamp01((q - ENTER.camera[0]) / (ENTER.camera[1] - ENTER.camera[0])));
  /** How flat the tube is at enter progress q (0 its whole look, 1 flat): eased in and out over ENTER.flatten.length. */
  const flatAt = (q: number): number => smooth(q, [flatP, flatP + ENTER.flatten.length]);

  /** The camera at enter progress q: rest → native along the reference's dive, the distance in log space, turning straight-on. */
  const poseAt = (q: number, out: Pose): Pose => {
    if (!rest || !native) return out;
    const e = diveAt(q);
    const tn = smooth(q, ENTER.turn);
    out.target.copy(rest.target).lerp(native.target, e);
    out.dist = Math.exp(lerp(Math.log(rest.dist), Math.log(native.dist), e));
    out.yaw = lerp(rest.yaw, native.yaw, tn);
    out.pitch = lerp(rest.pitch, native.pitch, tn);
    out.fov = rest.fov;
    out.ox = e >= 1 ? 0 : lerp(rest.ox, 0, e);
    out.oy = e >= 1 ? 0 : lerp(rest.oy, 0, e);
    // the lens's aspect reaches the buffer's with the tube's flattening, so the landing never jumps
    out.native = flatAt(q);
    return out;
  };

  /**
   * Where on the way in the screen's picture first nearly covers the view (p): the view, less a strip
   * of ENTER.fillInset on each side, inside the screen's outline, the monitor square to the world (the
   * parallax has settled long before). The bezel's last strips slide out after it, as in the reference.
   */
  const fillAt = (): number => {
    if (!lay || !rest || !native) return ENTER.fillBy;
    const turned = parts.pivot.quaternion.clone();
    parts.pivot.quaternion.identity();
    parts.pivot.updateMatrixWorld(true);
    const { cssW: W, cssH: H } = lay;
    const ix = W * ENTER.fillInset;
    const iy = H * ENTER.fillInset;
    const view: Pt[] = [[ix, iy], [W - ix, iy], [W - ix, H - iy], [ix, H - iy]];
    const at = (uu: number, vv: number) => m.toCss(m.screenPoint(uu, vv, p0));
    let found: number = ENTER.fillBy;
    for (let i = 0; i * 0.0025 < ENTER.fillBy; i++) {
      const q = i * 0.0025;
      poseAt(q, probe).native = 0; // the outline at the page's own aspect, whatever the flattening
      m.applyPose(probe);
      const outline = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
      if (view.every(([x, y]) => inside(outline, x, y))) {
        found = q;
        break;
      }
    }
    parts.pivot.quaternion.copy(turned);
    parts.pivot.updateMatrixWorld(true);
    return found;
  };

  const setRes = (full: boolean) => {
    if (!lay) return;
    fullRes = full;
    if (full) m.setBuffer(lay.cssW, lay.cssH, lay.devW, lay.devH);
    else m.setBuffer(lay.cssW, lay.cssH, restBuf.w, restBuf.h);
    // At full resolution the buffer is the canvas world's, and the page scales it the same way (nearest).
    canvas.classList.toggle('is-native', full);
  };

  const hero: Hero = {
    monitor: m,
    get phase() {
      return phase;
    },
    get scanLines() {
      return u.uScanLines.value;
    },
    get flatP() {
      return flatP;
    },
    layout(l) {
      lay = l;
      prRest = Math.min(2, devicePixelRatio || 1);
      restBuf = { w: Math.round(l.cssW * prRest), h: Math.round(l.cssH * prRest) };
      setRes(fullRes);
      rest = m.restPose(l.slot);
      native = m.nativePose(l.frame, l.k, l.devW, l.devH, rest.fov);
      flatP = fillAt() - ENTER.flatten.lead;
      // The tube's effects are sized in px of the canvas at rest (the rest buffer is capped at 2×).
      m.applyPose(rest);
      right.setFromMatrixColumn(m.camera.matrixWorld, 0).normalize();
      const s = m.screenSize();
      restW = s.w * prRest;
      tuneAtRest(crt, restW, s.h * prRest);
    },
    frameChanged(resized) {
      if (resized) {
        // a new size needs new storage on the GPU
        texture.dispose();
        texture = new CanvasTexture(frame);
        m.setFrame(texture, frame.width / frame.height);
      } else texture.needsUpdate = true;
    },
    pointer(nx, ny = 0) {
      // with reduced motion the monitor does not follow the pointer at all
      target = nx === null || still.matches ? { yaw: 0, pitch: 0 } : { yaw: PARALLAX.yaw * nx, pitch: PARALLAX.pitch * ny };
    },
    hover(on) {
      hoverTarget = on ? HOVER.bright : 1;
    },
    powerOn(now) {
      setPower(now, 1);
    },
    powerOff(now) {
      setPower(now, -1);
    },
    get poweredOn() {
      return power?.dir === 1;
    },
    pressPower(now, down) {
      if (down && !pressDown) pressSince = now;
      pressDown = down;
    },
    powerBox() {
      parts.body.updateMatrixWorld(true);
      const c = parts.power.getWorldPosition(p0);
      const [x, y] = m.toCss(c);
      side.setFromMatrixColumn(m.camera.matrixWorld, 0).normalize();
      const [x1] = m.toCss(p1.copy(c).addScaledVector(side, DIMS.button.r));
      return { x, y, r: Math.abs(x1 - x) };
    },
    enter(np) {
      p = clamp01(np);
    },
    render(now) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;

      // ── The turn: chasing the pointer on a critically damped spring — and once the dive starts, easing to
      //    the dive's starting pose (square), never snapping. Only a mouse turns it: on a touch screen the
      //    monitor holds still. ──
      {
        const to = p > 0 || still.matches ? { yaw: 0, pitch: 0 } : target;
        const sdt = Math.min(PARALLAX.maxDt, dt);
        const k1 = 1 - Math.exp(-sdt / PARALLAX.lead);
        const k2 = 1 - Math.exp(-sdt / PARALLAX.tau);
        aim = { yaw: aim.yaw + (to.yaw - aim.yaw) * k1, pitch: aim.pitch + (to.pitch - aim.pitch) * k1 };
        turn = { yaw: turn.yaw + (aim.yaw - turn.yaw) * k2, pitch: turn.pitch + (aim.pitch - turn.pitch) * k2 };
      }
      const settle = 1 - smooth(p, ENTER.parallaxOut);
      qYaw.setFromAxisAngle(Y, turn.yaw * settle * DEG);
      qPitch.setFromAxisAngle(right, turn.pitch * settle * DEG);
      parts.pivot.quaternion.copy(qYaw).multiply(qPitch);
      parts.pivot.updateMatrixWorld(true);
      if (1 - Math.abs(parts.pivot.quaternion.dot(shadowTurn)) > 1e-9) {
        shadowTurn.copy(parts.pivot.quaternion);
        renderer.shadowMap.needsUpdate = true;
      }
      // The controller is part of the opening: gone once the dive is well under way (it has left the
      // view by then), back for the pull-back. The monitor has stopped turning by then too, so its shadow
      // in the map stays as it was.
      parts.remote.visible = p < ENTER.fullRes;

      // ── The camera: rest → native ──
      if (rest && native) {
        if (p >= ENTER.fullRes !== fullRes) setRes(p >= ENTER.fullRes);
        const at = poseAt(p, pose);
        // the breakout's landing: the monitor glides up the page (the view moves down over it) and draws back a little
        if (brk) {
          at.oy += brk.glide.up;
          at.dist /= brk.glide.scale;
        }
        m.applyPose(at);
      }

      // ── Power: the line grows from the centre, brightens, then the picture opens from it; switched off,
      //    the same in reverse (scrolled in before it had finished, or off: it powers on and plays on
      //    during the dive) ──
      if (p > 0 && power?.dir !== 1) setPower(now, 1);
      // the power button: down while held, and for at least PRESS.min after it went down; it travels in fast and springs back
      const want = pressDown || now < pressSince + PRESS.min ? 1 : 0;
      pressed += (want - pressed) * (1 - Math.exp(-dt / PRESS.tau));
      parts.power.position.z = powerRest - PRESS.travel * pressed;
      let on = 0;
      let open = 0;
      let line = 0;
      let lineW = 0;
      let lineH: number = POWER.thin;
      let squash = 1;
      // switching off: where the power-on would be, running back from the open picture to nothing
      const off = power && power.dir < 0 ? Math.max(0, OFF_END - (now - power.at)) : null;
      const e = off ?? (power && power.dir > 0 ? Math.min(POWER_END, Math.max(0, now - power.at)) : 0);
      if (e > 0) {
        const lineEnd = POWER.grow + POWER.brighten;
        if (e < lineEnd) {
          phase = 'line';
          // the line grows at an even pace, as in the reference
          lineW = clamp01(e / POWER.grow);
          const b = clamp01((e - POWER.grow) / POWER.brighten);
          line = POWER.faint + (POWER.bright - POWER.faint) * b;
          lineH = POWER.thin + (POWER.thick - POWER.thin) * b;
        } else if (e < lineEnd + POWER.open + POWER.ready) {
          phase = 'open';
          const s = clamp01((e - lineEnd) / POWER.open);
          on = 1;
          open = easeIn(s);
          line = POWER.bright * (1 - s) ** 2;
          lineW = 1;
          lineH = POWER.thick;
          // switching off, the picture squashes into the line instead of being cut down to it
          if (off !== null) squash = Math.max(open, 0.002);
        } else {
          phase = 'on';
          on = open = 1;
        }
      } else phase = 'off';
      hoverB += (hoverTarget - hoverB) * (1 - Math.exp(-dt / HOVER.tau));
      const hb = phase === 'on' ? hoverB : 1;

      // ── The tube: its whole look held on the way in until its picture nearly fills the view; then its
      //    curvature and its vintage look flatten together (one factor for every effect) while the bezel's
      //    last strips slide out, the camera's last bit of zoom on the flat picture ──
      const fx = 1 - flatAt(p);
      // the bloom and the grain keep their size on the page as the screen grows; the convergence error grows, capped
      const size = m.screenSize();
      tuneOnScreen(crt, size.w * prRest, size.h * prRest, restW);
      u.uBarrel.value = CRT_REST.barrel * fx;
      u.uBulge.value = DIMS.bulge * fx;
      u.uScan.value = CRT_REST.scan * fx;
      u.uMask.value = CRT_REST.mask * fx;
      u.uAberr.value *= fx;
      u.uGlow.value = CRT_REST.glow * fx;
      u.uVignette.value = CRT_REST.vignette * fx;
      u.uBar.value = CRT_REST.bar * fx;
      u.uHum.value = CRT_REST.hum * fx;
      u.uNoise.value = CRT_REST.noise * fx;
      u.uGrade.value = CRT_REST.grade * fx;
      u.uBright.value = 1 + (CRT_REST.bright * hb - 1) * fx;
      u.uOn.value = on;
      u.uOpen.value = open;
      u.uLine.value = line;
      u.uLineW.value = lineW;
      u.uLineH.value = lineH;
      u.uSquash.value = squash;
      u.uTime.value = now / 1000;
      bevel.emissiveIntensity = BEVEL_GLOW * on * open * hb;
      // The glass: its reflection, the key light's highlight on it and its 15 % shade go as the camera
      // leaves the rest pose (it adds its light, so its opacity alone would leave the highlight), then the pane.
      const gx = fx * (1 - smooth(p, ENTER.glass));
      glass.opacity = GLASS.opacity * gx;
      glass.envMapIntensity = GLASS.env * gx;
      glass.specularIntensity = gx;
      parts.glass.visible = gx > 0.001;

      // ── The breakout: the cracks, the shatter with static behind it, Sam's billboard ──
      bo.set(brk ? brk.stage : 0, brk ? brk.shatter : 0, m.camera);
      const sb = brk?.sam ?? null;
      bo.sam(sb ? sb.centre : null, sb ? sb.size : 0, sb ? sb.leap : 0, m.camera, sb ? sb.scale : 1, sb ? sb.hidden : true, (v) => m.toCss(v), window.devicePixelRatio || 1);

      m.render();
      return phase;
    },
    breakout(b) {
      brk = b;
    },
    prepareBreakout(impact) {
      bo.layout(impact);
      // uploaded here, in this idle task, so no scroll frame ever does it
      for (const t of bo.textures()) renderer.initTexture(t);
    },
    get samCanvas() {
      return bo.samCanvas;
    },
    samDrawn() {
      bo.samDrawn();
    },
    screenUV(fx, fy) {
      const f = u.uFrame.value;
      const uf = fx / frame.width;
      const vf = 1 - fy / frame.height;
      return [(uf - f.x) / (f.z - f.x), (vf - f.y) / (f.w - f.y)];
    },
    samSprite() {
      const w = bo.samWorld;
      if (!w) return null;
      side.setFromMatrixColumn(m.camera.matrixWorld, 0).normalize();
      const a = m.toCss(p0.copy(w.centre).addScaledVector(side, -w.size / 2));
      const b = m.toCss(p1.copy(w.centre).addScaledVector(side, w.size / 2));
      const c = m.toCss(p0.copy(w.centre));
      return { x: c[0], y: c[1], scale: (Math.hypot(b[0] - a[0], b[1] - a[1]) * (window.devicePixelRatio || 1)) / 60 };
    },
    quad(u0, v0, u1, v1) {
      const c = (uu: number, vv: number): [number, number] => m.toCss(m.screenPoint(uu, vv, p0));
      return [c(u0, v0), c(u1, v0), c(u1, v1), c(u0, v1)];
    },
    dispose() {
      still.removeEventListener('change', staticRate);
      texture.dispose();
      bo.dispose();
      m.dispose();
    },
  };
  return hero;
}
