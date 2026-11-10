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
 * curvature, bulge, scanlines growing with the screen, every effect — until its picture nearly fills
 * the view, then drops it in a cut while the bezel's last strips slide out (as in the reference, on
 * review 2026-11-09); the glass's reflection goes early. At the landing the screen shows the game's
 * pixels exactly and the page can hand over to the canvas world without a jump. No brightness flash.
 */
import { CanvasTexture, Color, Quaternion, Vector3, type Texture } from 'three';
import { readToken } from '../game/palette';
import type { Quad } from '../game/quad';
import { DIVE, ENTER, smooth } from '../game/segments';
import { CRT_REST, tuneAtRest, tuneOnScreen } from './crt';
import { createMonitorAsync, type FrameGeom, type Monitor, type Pose } from './index';
import { DIMS, type Slot } from './spec';

/**
 * The power-on, ms: the line growing from the centre, brightening, the picture opening, PRESS START's
 * wait; the line faint then bright, thin then thick (fractions of the screen height).
 */
export const POWER = { grow: 170, brighten: 40, open: 170, ready: 70, faint: 0.45, bright: 1.6, thin: 0.0025, thick: 0.007 } as const;
/** The turn toward the pointer, degrees, and its ease (a time constant of 130 ms settles in ~400 ms). */
const PARALLAX = { yaw: 8, pitch: 4, tau: 0.13 } as const;
/** Touch screens: a slow idle sway instead, degrees and seconds per cycle. */
const SWAY = { yaw: 2, pitch: 1, yawPeriod: 7, pitchPeriod: 9.5 } as const;
/** Hovering PRESS START brightens the screen 10 %. */
const HOVER = { bright: 1.1, tau: 0.06 } as const;
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

export interface Hero {
  monitor: Monitor;
  layout(l: HeroLayout): void;
  /** The screen frame was redrawn; `resized` when its canvas changed size. */
  frameChanged(resized: boolean): void;
  /** Where the pointer is, −1…1 from the slot's centre across the viewport; null when it left. */
  pointer(nx: number | null, ny?: number): void;
  /** Touch screens sway instead of following a pointer. */
  sway(on: boolean): void;
  hover(on: boolean): void;
  powerOn(now: number): void;
  readonly phase: PowerPhase;
  /** Scanlines across the screen's height at rest (PRESS START's own lines match them). */
  readonly scanLines: number;
  /** Where on the way in the screen's picture first nearly fills the view (p), for this layout: the tube's look is cut there. */
  readonly fillP: number;
  /** The enter segment's progress: 0 at rest, 1 in the game (the camera lands at ENTER.camera[1]). */
  enter(p: number): void;
  /** Advance to `now` (ms, the page's clock) and draw. */
  render(now: number): PowerPhase;
  /** CSS px corners (top left, top right, bottom right, bottom left) of a rectangle on the screen; u, v across the opening, 0–1. */
  quad(u0: number, v0: number, u1: number, v1: number): Quad;
  dispose(): void;
}

const DEG = Math.PI / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** The opening gathers speed a little, as the reference's band does. */
const easeIn = (x: number) => clamp01(x) ** 1.2;
const lerp = (a: number, b: number, e: number) => a + (b - a) * e;
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

  // A first size so the programs compile for the real render target, then every program in parallel
  // (KHR_parallel_shader_compile where there is one) and every texture uploaded, each in its own task.
  const mark = (name: string, t0: number) => import.meta.env.DEV && performance.measure(`monitor:${name}`, { start: t0, end: performance.now() });
  let t0 = performance.now();
  const w0 = Math.max(1, canvas.clientWidth);
  const h0 = Math.max(1, canvas.clientHeight);
  m.setBuffer(w0, h0, Math.round(w0 * Math.min(2, devicePixelRatio || 1)), Math.round(h0 * Math.min(2, devicePixelRatio || 1)));
  m.applyPose(m.restPose({ cx: w0 / 2, cy: h0 / 2, w: 300 }));
  const compiling = renderer.compileAsync(m.scene, m.camera);
  mark('compile-start', t0);
  await compiling;
  await pause();
  t0 = performance.now();
  const shadowMap = (parts.shadow.material as { map?: Texture | null }).map ?? null;
  for (const t of [parts.materials.plastic.roughnessMap, bevel.emissiveMap, shadowMap, texture]) {
    if (t) renderer.initTexture(t);
  }
  mark('textures', t0);
  await pause();

  const right = new Vector3(1, 0, 0);
  const qYaw = new Quaternion();
  const qPitch = new Quaternion();
  const Y = new Vector3(0, 1, 0);
  let swaying = false;
  let target = { yaw: 0, pitch: 0 };
  let turn = { yaw: 0, pitch: 0 };
  let hoverTarget = 1;
  let hoverB = 1;
  let powerAt = -1;
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
  let fillP: number = ENTER.cutBy;
  const pose: Pose = { target: new Vector3(), dist: 1, yaw: 0, pitch: 0, fov: 30, ox: 0, oy: 0 };
  const probe: Pose = { target: new Vector3(), dist: 1, yaw: 0, pitch: 0, fov: 30, ox: 0, oy: 0 };

  const p0 = new Vector3();

  /** The camera at enter progress q: rest → native along the reference's dive, the distance in log space, the turn done before the cut. */
  const poseAt = (q: number, out: Pose): Pose => {
    if (!rest || !native) return out;
    const [c0, c1] = ENTER.camera;
    const e = DIVE(clamp01((q - c0) / (c1 - c0)));
    const tn = smooth(q, ENTER.turn);
    out.target.copy(rest.target).lerp(native.target, e);
    out.dist = Math.exp(lerp(Math.log(rest.dist), Math.log(native.dist), e));
    out.yaw = lerp(rest.yaw, native.yaw, tn);
    out.pitch = lerp(rest.pitch, native.pitch, tn);
    out.fov = rest.fov;
    out.ox = e >= 1 ? 0 : lerp(rest.ox, 0, e);
    out.oy = e >= 1 ? 0 : lerp(rest.oy, 0, e);
    return out;
  };

  /**
   * Where on the way in the screen's picture first nearly covers the view (p): the view, less a strip
   * of ENTER.fillInset on each side, inside the screen's outline, the monitor square to the world (the
   * parallax has settled long before). The bezel's last strips slide out after it, as in the reference.
   */
  const fillAt = (): number => {
    if (!lay || !rest || !native) return ENTER.cutBy;
    const turned = parts.pivot.quaternion.clone();
    parts.pivot.quaternion.identity();
    parts.pivot.updateMatrixWorld(true);
    const { cssW: W, cssH: H } = lay;
    const ix = W * ENTER.fillInset;
    const iy = H * ENTER.fillInset;
    const view: Pt[] = [[ix, iy], [W - ix, iy], [W - ix, H - iy], [ix, H - iy]];
    const at = (uu: number, vv: number) => m.toCss(m.screenPoint(uu, vv, p0));
    let found: number = ENTER.cutBy;
    for (let i = 0; i * 0.0025 < ENTER.cutBy; i++) {
      const q = i * 0.0025;
      m.applyPose(poseAt(q, probe));
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
    get fillP() {
      return fillP;
    },
    layout(l) {
      lay = l;
      prRest = Math.min(2, devicePixelRatio || 1);
      restBuf = { w: Math.round(l.cssW * prRest), h: Math.round(l.cssH * prRest) };
      setRes(fullRes);
      rest = m.restPose(l.slot);
      native = m.nativePose(l.frame, l.k, l.devW, l.devH, rest.fov);
      fillP = fillAt();
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
      target = nx === null ? { yaw: 0, pitch: 0 } : { yaw: PARALLAX.yaw * nx, pitch: PARALLAX.pitch * ny };
    },
    sway(on) {
      swaying = on;
    },
    hover(on) {
      hoverTarget = on ? HOVER.bright : 1;
    },
    powerOn(now) {
      if (powerAt < 0) powerAt = now;
    },
    enter(np) {
      p = clamp01(np);
    },
    render(now) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;

      // ── The turn: toward the pointer, or the idle sway — settling to nothing as the camera dives ──
      if (swaying) {
        const s = now / 1000;
        target = { yaw: SWAY.yaw * Math.sin((2 * Math.PI * s) / SWAY.yawPeriod), pitch: SWAY.pitch * Math.sin((2 * Math.PI * s) / SWAY.pitchPeriod) };
      }
      const a = 1 - Math.exp(-dt / PARALLAX.tau);
      turn = { yaw: turn.yaw + (target.yaw - turn.yaw) * a, pitch: turn.pitch + (target.pitch - turn.pitch) * a };
      const settle = 1 - smooth(p, ENTER.parallaxOut);
      qYaw.setFromAxisAngle(Y, turn.yaw * settle * DEG);
      qPitch.setFromAxisAngle(right, turn.pitch * settle * DEG);
      parts.pivot.quaternion.copy(qYaw).multiply(qPitch);
      parts.pivot.updateMatrixWorld(true);

      // ── The camera: rest → native ──
      if (rest && native) {
        if (p >= ENTER.fullRes !== fullRes) setRes(p >= ENTER.fullRes);
        m.applyPose(poseAt(p, pose));
      }

      // ── Power: the line grows from the centre, brightens, then the picture opens from it ──
      // (scrolled in before it had finished: it plays on during the dive)
      if (p > 0 && powerAt < 0) powerAt = now;
      let on = 0;
      let open = 0;
      let line = 0;
      let lineW = 0;
      let lineH: number = POWER.thin;
      if (powerAt >= 0 && now >= powerAt) {
        const e = now - powerAt;
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
        } else {
          phase = 'on';
          on = open = 1;
        }
      } else phase = 'off';
      hoverB += (hoverTarget - hoverB) * (1 - Math.exp(-dt / HOVER.tau));
      const hb = phase === 'on' ? hoverB : 1;

      // ── The tube: its whole look held on the way in, cut as its picture fills the view ──
      const cutEnd = Math.min(fillP, ENTER.cutBy);
      const fx = 1 - smooth(p, [cutEnd - ENTER.cut, cutEnd]);
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
      u.uTime.value = now / 1000;
      bevel.emissiveIntensity = BEVEL_GLOW * on * open * hb;
      // The glass: its reflection, the key light's highlight on it and its 15 % shade go as the camera
      // leaves the rest pose (it adds its light, so its opacity alone would leave the highlight), then the pane.
      const gx = fx * (1 - smooth(p, ENTER.glass));
      glass.opacity = GLASS.opacity * gx;
      glass.envMapIntensity = GLASS.env * gx;
      glass.specularIntensity = gx;
      parts.glass.visible = gx > 0.001;

      m.render();
      return phase;
    },
    quad(u0, v0, u1, v1) {
      const c = (uu: number, vv: number): [number, number] => m.toCss(m.screenPoint(uu, vv, p0));
      return [c(u0, v0), c(u1, v0), c(u1, v1), c(u0, v1)];
    },
    dispose() {
      texture.dispose();
      m.dispose();
    },
  };
  return hero;
}
