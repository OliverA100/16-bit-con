/**
 * The opening: the monitor at rest in its slot with the live game on its screen, the
 * power-on, the pointer parallax and the hover glow. The page's one loop calls render() each frame
 * while the hero is on screen; nothing here owns a requestAnimationFrame, and nothing renders
 * while the levels play.
 *
 * Power-on, on the page's clock from powerOn(), timed on the reference video: dark glass with its
 * reflection → a thin, faint line grows from a point at the centre to the full width (170 ms) → it
 * brightens and thickens (40 ms) → the picture opens vertically from it at its normal brightness
 * (170 ms, gathering speed) — no white field, no flash → PRESS START 70 ms later. The picture's
 * light reaches the inner bevel (its emissive follows the open picture, never the line).
 */
import { CanvasTexture, Color, Quaternion, Vector3, type Texture } from 'three';
import { readToken } from '../game/palette';
import type { Quad } from '../game/quad';
import { CRT_REST, tuneAtRest } from './crt';
import { createMonitorAsync, REST, type Monitor } from './index';
import type { Slot } from './spec';

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

export type PowerPhase = 'off' | 'line' | 'open' | 'on';

export interface Hero {
  monitor: Monitor;
  /** Size the canvas (CSS px) and frame the monitor at rest on its slot. */
  layout(cssW: number, cssH: number, slot: Slot): void;
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

  // A first size so the programs compile for the real render target, then every program in parallel
  // (KHR_parallel_shader_compile where there is one) and every texture uploaded, each in its own task.
  const mark = (name: string, t0: number) => import.meta.env.DEV && performance.measure(`monitor:${name}`, { start: t0, end: performance.now() });
  let t0 = performance.now();
  m.setSize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));
  m.frame(REST, { cx: canvas.clientWidth / 2, cy: canvas.clientHeight / 2, w: 300 });
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

  const p0 = new Vector3();

  const hero: Hero = {
    monitor: m,
    get phase() {
      return phase;
    },
    get scanLines() {
      return u.uScanLines.value;
    },
    layout(cssW, cssH, slot) {
      m.setSize(cssW, cssH);
      const rest = m.frame(REST, slot);
      right.setFromMatrixColumn(m.camera.matrixWorld, 0).normalize();
      // The tube's effects sized in px of the canvas at rest (the renderer's pixel ratio is capped at 2).
      const pr = renderer.getPixelRatio();
      tuneAtRest(crt, rest.screenW * pr, rest.screenH * pr);
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
    render(now) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;

      // ── The turn: toward the pointer, or the idle sway ──
      if (swaying) {
        const s = now / 1000;
        target = { yaw: SWAY.yaw * Math.sin((2 * Math.PI * s) / SWAY.yawPeriod), pitch: SWAY.pitch * Math.sin((2 * Math.PI * s) / SWAY.pitchPeriod) };
      }
      const a = 1 - Math.exp(-dt / PARALLAX.tau);
      turn = { yaw: turn.yaw + (target.yaw - turn.yaw) * a, pitch: turn.pitch + (target.pitch - turn.pitch) * a };
      qYaw.setFromAxisAngle(Y, turn.yaw * DEG);
      qPitch.setFromAxisAngle(right, turn.pitch * DEG);
      parts.pivot.quaternion.copy(qYaw).multiply(qPitch);
      parts.pivot.updateMatrixWorld(true);

      // ── Power: the line grows from the centre, brightens, then the picture opens from it ──
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
      u.uOn.value = on;
      u.uOpen.value = open;
      u.uLine.value = line;
      u.uLineW.value = lineW;
      u.uLineH.value = lineH;
      u.uBright.value = CRT_REST.bright * (phase === 'on' ? hoverB : 1);
      u.uTime.value = now / 1000;
      bevel.emissiveIntensity = BEVEL_GLOW * on * open * (phase === 'on' ? hoverB : 1);

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
