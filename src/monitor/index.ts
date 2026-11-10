/**
 * The monitor scene: plain three.js, lazy-loaded, the only 3D on the page. A
 * transparent canvas so the floor is the page's own Daisy White; RoomEnvironment through PMREM
 * (no HDR file), a key light from the top left and a faint rim from the back right, ACES Filmic,
 * sRGB out, antialias, device pixel ratio capped at 2.
 *
 * The camera frames the monitor by its projected silhouette (sampled casing vertices, not a
 * bounding box), so "22 % of the viewport width" means the visible monitor, and a view offset puts
 * that silhouette's centre on the layout slot's centre.
 *
 * Setup is a sequence of steps (renderer, room light, the build, the camera) so the page can run
 * them one task at a time and keep every main-thread task short (createMonitorAsync). Nearly all of
 * the room light's cost is compiling its programs on first use (a second PMREM of the same room takes
 * 1 ms), so the page compiles the room's programs in parallel first and only then renders it.
 */
import {
  ACESFilmicToneMapping,
  Color,
  CubeCamera,
  DirectionalLight,
  HalfFloatType,
  LinearMipmapLinearFilter,
  NearestFilter,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { readToken } from '../game/palette';
import { buildMonitor, measure, type MonitorParts } from './build';
import { createCrtMaterial, coverRect } from './crt';
import { CENTRE, DIMS, FOV, OPENING_Y, REST, restWidth, type Slot, type View } from './spec';

export { FOV, REST, restWidth, VIEWS, type Slot, type View } from './spec';

const DEG = Math.PI / 180;

const color = (token: string) => new Color().setStyle(readToken(token));

/** A box in CSS px of the canvas. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A camera pose: looking at `target` from `dist` away along the direction yaw / pitch (degrees, from
 * the front), through a lens of `fov` (vertical, degrees), its picture shifted by (ox, oy) CSS px.
 */
export interface Pose {
  target: Vector3;
  dist: number;
  yaw: number;
  pitch: number;
  fov: number;
  ox: number;
  oy: number;
}

/** The game's screen frame as the native pose needs it: its size in texels and where the viewport frame sits in it. */
export interface FrameGeom {
  W: number;
  H: number;
  mx: number;
  mt: number;
}

export interface Monitor {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  parts: MonitorParts;
  crt: ReturnType<typeof createCrtMaterial>;
  lights: { key: DirectionalLight; rim: DirectionalLight };
  setSize(cssW: number, cssH: number): void;
  /** The drawing buffer, bufW × bufH px, under a CSS box of cssW × cssH. */
  setBuffer(cssW: number, cssH: number, bufW: number, bufH: number): void;
  /** Place the camera for `view` with the monitor on `slot`; returns its silhouette box and the screen's projected size (CSS px). */
  frame(view: View, slot: Slot): { box: Box; screenW: number; screenH: number };
  /**
   * The rest pose on `slot`. The camera stands where the posters were rendered from (DIST_REST, the
   * distance the 30° lens needs at 1440 × 900) and only the lens changes to fit the slot: from the
   * same point the picture is the same up to scale, so the 3D lands on the poster at every size.
   */
  restPose(slot: Slot): Pose;
  /**
   * The native pose: straight at the flat screen, one texel of the game's frame exactly k device px
   * and the viewport frame's top-left texel on the buffer's top-left pixel — what the canvas world
   * shows, pixel for pixel, at a buffer of devW × devH.
   */
  nativePose(frame: FrameGeom, k: number, devW: number, devH: number, fov: number): Pose;
  applyPose(p: Pose): void;
  /** The screen's projected size at the current pose, CSS px. */
  screenSize(): { w: number; h: number };
  setFrame(texture: Texture, aspect: number): void;
  /**
   * A point on the tube's surface in world space (the bulged cap, as the vertex shader moves it):
   * u across the opening left → right, v top → bottom, both 0–1.
   */
  screenPoint(u: number, v: number, target?: Vector3): Vector3;
  /** World → CSS px of the canvas, through the current camera (view offset included). */
  toCss(p: Vector3): [number, number];
  render(): void;
  measure(): Record<string, number>;
  dispose(): void;
}

/** The setup, one step per `yield` (a yielded promise is awaited first); returns the monitor. */
function* steps(canvas: HTMLCanvasElement, context?: WebGL2RenderingContext, precompile = false): Generator<Promise<unknown> | void, Monitor> {
  const renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  // Reading a program's link status makes the main thread wait for the GPU's compile; only dev reads the log.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  yield;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  if (precompile) {
    // The room's programs, compiled in parallel (KHR_parallel_shader_compile) exactly as PMREM will
    // use them, into a half-float cube target: then fromScene only compiles its own three passes.
    const target = new WebGLCubeRenderTarget(256, { type: HalfFloatType });
    const cube = new CubeCamera(0.1, 100, target);
    renderer.setRenderTarget(target, 0);
    const compiled = renderer.compileAsync(room, cube.children[0] as PerspectiveCamera);
    renderer.setRenderTarget(null);
    yield compiled.finally(() => target.dispose());
  }
  const env = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  room.dispose();
  // A dim room for the plastic, so the clearcoat carries highlights rather than a white sheen and the
  // key light shapes the casing (front lit, the side falling into orange). Exposure, room and key were
  // swept against reference 01's front/side colours.
  scene.environment = env;
  scene.environmentIntensity = 0.22;
  yield;

  const key = new DirectionalLight(0xffffff, 3);
  key.position.set(-2.4, 3.4, 2.8);
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(2.8, 1.6, -3.2);
  scene.add(key, rim);

  // The tube when it is off: Outline Black lifted a little toward Grey 700.
  const tube = color('--color-outline-black').lerp(color('--color-grey-700'), 0.35);
  const crt = createCrtMaterial(tube);
  // ACES Filmic compresses red first, so a lit Florets Yellow drifts green (measured red/green 1.09
  // against the token's 1.22). The plastic's albedo is Florets mixed 75 % toward Yellow 500, which
  // lands the lit front back on Florets' hue (1.19) and lets the side fall into orange (1.41).
  const parts = buildMonitor(
    {
      plastic: color('--color-florets-yellow').lerp(color('--color-yellow-500'), 0.75),
      bevel: color('--color-yellow-500'),
      slot: color('--color-grey-700'),
      button: color('--color-daisy-white'),
      led: color('--color-green-100'),
      shadow: color('--color-outline-black'),
    },
    crt,
  );
  scene.add(parts.pivot);
  // The glass gets the room directly: a material on scene.environment has its envMapIntensity
  // overwritten by scene.environmentIntensity, and the pane needs a much stronger reflection.
  parts.materials.glass.envMap = env;
  parts.materials.glass.envMapIntensity = 2.2;
  parts.materials.glass.roughness = 0.22;
  // turned so the room's bright panel lands as a soft sheet in the glass's upper left, as in reference 01
  parts.materials.glass.envMapRotation.set(0.45, 5.2, 0);
  yield;

  const camera = new PerspectiveCamera(FOV, 1, 0.02, 40);
  let cssW = 1;
  let cssH = 1;
  let bufW = 1;
  let bufH = 1;
  const dirOf = (yaw: number, pitch: number) =>
    new Vector3(Math.sin(yaw * DEG) * Math.cos(pitch * DEG), Math.sin(pitch * DEG), Math.cos(yaw * DEG) * Math.cos(pitch * DEG));

  // Silhouette samples (body space, so they turn with the monitor): every third casing and foot vertex.
  const silhouette: Vector3[] = [];
  parts.pivot.updateMatrixWorld(true);
  for (const m of [parts.casing, ...parts.feet]) {
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) silhouette.push(new Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrix));
  }
  const corners = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ] as const;
  const scaleAt = (z: number) => 1 - DIMS.TAPER * Math.min(1, Math.max(0, -z / DIMS.DEPTH));

  const tmp = new Vector3();
  const project = (pts: Vector3[], space: 'body' | 'world') => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      tmp.copy(p);
      if (space === 'body') tmp.applyMatrix4(parts.body.matrixWorld);
      tmp.project(camera);
      const x = ((tmp.x + 1) / 2) * cssW;
      const y = ((1 - tmp.y) / 2) * cssH;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  };

  const monitor: Monitor = {
    renderer,
    scene,
    camera,
    parts,
    crt,
    lights: { key, rim },
    setSize(w, h) {
      cssW = w;
      cssH = h;
      renderer.setSize(w, h, false);
      bufW = renderer.domElement.width;
      bufH = renderer.domElement.height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    setBuffer(w, h, bw, bh) {
      cssW = w;
      cssH = h;
      if (bw !== bufW || bh !== bufH || renderer.getPixelRatio() !== 1) {
        renderer.setPixelRatio(1);
        renderer.setSize(bw, bh, false);
      }
      bufW = bw;
      bufH = bh;
      camera.aspect = bw / bh;
      camera.updateProjectionMatrix();
    },
    restPose(slot) {
      const turned = parts.pivot.quaternion.clone();
      parts.pivot.quaternion.identity();
      parts.pivot.updateMatrixWorld(true);
      const target = new Vector3(0, 0, 0);
      camera.clearViewOffset();
      camera.aspect = bufW / bufH;
      camera.position.copy(target).addScaledVector(dirOf(REST.yaw, REST.pitch), DIST_REST);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      // From a fixed point the picture scales exactly with the lens's focal length.
      let fov = FOV;
      for (let i = 0; i < 2; i++) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        const box = project(silhouette, 'body');
        fov = (2 * Math.atan((Math.tan((fov * DEG) / 2) * (box.x1 - box.x0)) / slot.w)) / DEG;
      }
      camera.fov = fov;
      camera.updateProjectionMatrix();
      const box = project(silhouette, 'body');
      parts.pivot.quaternion.copy(turned);
      parts.pivot.updateMatrixWorld(true);
      return { target, dist: DIST_REST, yaw: REST.yaw, pitch: REST.pitch, fov, ox: (box.x0 + box.x1) / 2 - slot.cx, oy: (box.y0 + box.y1) / 2 - slot.cy };
    },
    nativePose(fr, k, devW, devH, fov) {
      const f = crt.uniforms.uFrame.value;
      const s = scaleAt(-DIMS.recess);
      const { w, h } = DIMS.opening;
      // world units per texel (the cover fit keeps texels square), and the lens's focal length in device px
      const texel = (h * s) / ((f.w - f.y) * fr.H);
      const fpx = devH / 2 / Math.tan((fov * DEG) / 2);
      // the texel under the buffer's centre; the texture is flipped, so v counts up from the bottom
      const cx = fr.mx + devW / (2 * k);
      const cy = fr.mt + devH / (2 * k);
      const u = (cx / fr.W - f.x) / (f.z - f.x);
      const v = (1 - cy / fr.H - f.y) / (f.w - f.y);
      const target = new Vector3((u - 0.5) * w * s - CENTRE.x, (OPENING_Y + (v - 0.5) * h) * s - CENTRE.y, -DIMS.recess - CENTRE.z);
      return { target, dist: (fpx * texel) / k, yaw: 0, pitch: 0, fov, ox: 0, oy: 0 };
    },
    applyPose(p) {
      camera.fov = p.fov;
      camera.aspect = bufW / bufH;
      camera.position.copy(p.target).addScaledVector(dirOf(p.yaw, p.pitch), p.dist);
      camera.lookAt(p.target);
      if (p.ox !== 0 || p.oy !== 0) camera.setViewOffset(cssW, cssH, p.ox, p.oy, cssW, cssH);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
    screenSize() {
      const s = project(corners.map(([u, v]) => monitor.screenPoint(u, v)), 'world');
      return { w: s.x1 - s.x0, h: s.y1 - s.y0 };
    },
    frame(view, slot) {
      // Framed with the monitor square to the world (no parallax turn), so the rest pose never moves.
      const turned = parts.pivot.quaternion.clone();
      parts.pivot.quaternion.identity();
      parts.pivot.updateMatrixWorld(true);
      const screenCorners = corners.map(([u, v]) => monitor.screenPoint(u, v));
      const target = view.fit === 'screen' ? monitor.screenPoint(0.5, 0.5) : new Vector3(0, 0, 0);
      const fitPts = view.fit === 'screen' ? screenCorners : silhouette;
      const space = view.fit === 'screen' ? 'world' : 'body';
      const yaw = view.yaw * DEG;
      const pitch = view.pitch * DEG;
      const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      camera.clearViewOffset();
      camera.aspect = cssW / cssH;
      camera.updateProjectionMatrix();
      let d = 5;
      let box = { x0: 0, y0: 0, x1: 1, y1: 1 };
      for (let i = 0; i < 10; i++) {
        camera.position.copy(target).addScaledVector(dir, d);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        box = project(fitPts, space);
        d *= (box.x1 - box.x0) / slot.w;
      }
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      box = project(fitPts, space);
      camera.setViewOffset(cssW, cssH, (box.x0 + box.x1) / 2 - slot.cx, (box.y0 + box.y1) / 2 - slot.cy, cssW, cssH);
      camera.updateMatrixWorld();
      const s = project(screenCorners, 'world');
      const result = { box: project(silhouette, 'body'), screenW: s.x1 - s.x0, screenH: s.y1 - s.y0 };
      parts.pivot.quaternion.copy(turned);
      parts.pivot.updateMatrixWorld(true);
      return result;
    },
    setFrame(texture, aspect) {
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = NearestFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      crt.uniforms.uMap.value = texture;
      crt.uniforms.uFrame.value = coverRect(aspect);
    },
    screenPoint(u, v, target = new Vector3()) {
      const { w, h } = DIMS.opening;
      const cx = 2 * u - 1;
      const cy = 2 * v - 1;
      const z = -DIMS.recess + crt.uniforms.uBulge.value * (1 - cx * cx) * (1 - cy * cy);
      const s = scaleAt(-DIMS.recess);
      return target.set((u - 0.5) * w * s, (OPENING_Y + (0.5 - v) * h) * s, z).applyMatrix4(parts.body.matrixWorld);
    },
    toCss(p) {
      tmp.copy(p).project(camera);
      return [((tmp.x + 1) / 2) * cssW, ((1 - tmp.y) / 2) * cssH];
    },
    render() {
      renderer.render(scene, camera);
    },
    measure() {
      return measure(parts);
    },
    dispose() {
      scene.traverse((o) => {
        const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) m.dispose();
      });
      env.dispose();
      renderer.dispose();
    },
  };
  // The posters' camera distance: what the 30° lens needs to fit the rest slot at 1440 × 900 (where
  // they were rendered). The page keeps it and fits the slot with the lens instead.
  // (Only the projection is set up for it: the drawing buffer is left alone.)
  cssW = 1440;
  cssH = 900;
  monitor.frame(REST, { cx: 720, cy: 450, w: restWidth(1440) });
  const DIST_REST = camera.position.length();

  return monitor;
}

/** Build the monitor in one go (the review page). */
export function createMonitor(canvas: HTMLCanvasElement): Monitor {
  const it = steps(canvas);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Build the monitor one step per task, awaiting `pause` between steps (the page, with the context it made). */
export async function createMonitorAsync(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, pause: () => Promise<void>): Promise<Monitor> {
  const it = steps(canvas, context, true);
  for (let i = 0; ; i++) {
    const t0 = performance.now();
    const r = it.next();
    if (import.meta.env.DEV) performance.measure(`monitor:step${i}`, { start: t0, end: performance.now() });
    if (r.done) return r.value;
    if (r.value) await r.value;
    await pause();
  }
}
