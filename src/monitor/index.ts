/**
 * The monitor scene: plain three.js, lazy-loaded, the only 3D on the page. A
 * transparent canvas so the floor is the page's own Daisy White; RoomEnvironment through PMREM
 * (no HDR file), a key light from the top left and a faint rim from the back right, ACES Filmic,
 * sRGB out, antialias, device pixel ratio capped at 2.
 *
 * The camera frames the monitor by its projected silhouette (sampled casing vertices, not a
 * bounding box), so "22 % of the viewport width" means the visible monitor, and a view offset puts
 * that silhouette's centre on the layout slot's centre.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  LinearMipmapLinearFilter,
  NearestFilter,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { readToken } from '../game/palette';
import { buildMonitor, DIMS, OPENING_Y, measure, type MonitorParts } from './build';
import { createCrtMaterial, coverRect } from './crt';

const DEG = Math.PI / 180;

/** A layout slot in CSS px of the canvas: the monitor's projected silhouette is centred on (cx, cy) and `w` wide. */
export interface Slot {
  cx: number;
  cy: number;
  w: number;
}

export interface View {
  yaw: number;
  pitch: number;
  /** What the camera looks at, and what is fitted to the slot width. */
  fit: 'casing' | 'screen';
}

/** The rest pose: a 3/4 view from the front right, 20° yaw, 6° above. */
export const REST: View = { yaw: 20, pitch: 6, fit: 'casing' };
export const VIEWS: Record<string, View> = {
  front34: REST,
  side: { yaw: 78, pitch: 6, fit: 'casing' },
  closeup: { yaw: 13, pitch: 4, fit: 'screen' },
};
export const FOV = 30;

/** At rest the monitor is 22 % of the viewport width, never under 220 CSS px. */
export function restWidth(viewportW: number): number {
  return Math.max(0.22 * viewportW, 220);
}

const color = (token: string) => new Color().setStyle(readToken(token));

export interface Monitor {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  parts: MonitorParts;
  crt: ReturnType<typeof createCrtMaterial>;
  lights: { key: DirectionalLight; rim: DirectionalLight };
  setSize(cssW: number, cssH: number): void;
  /** Place the camera for `view` with the monitor on `slot`; returns its silhouette box and the screen's projected size (CSS px). */
  frame(view: View, slot: Slot): { box: { x0: number; y0: number; x1: number; y1: number }; screenW: number; screenH: number };
  setFrame(texture: Texture, aspect: number): void;
  render(): void;
  measure(): Record<string, number>;
}

export function createMonitor(canvas: HTMLCanvasElement): Monitor {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  // A dim room for the plastic, so the clearcoat carries highlights rather than a white sheen and the
  // key light shapes the casing (front lit, the side falling into orange). Exposure, room and key were
  // swept against reference 01's front/side colours.
  scene.environment = env;
  scene.environmentIntensity = 0.22;

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

  const camera = new PerspectiveCamera(FOV, 1, 0.02, 40);
  let cssW = 1;
  let cssH = 1;

  // Silhouette samples (world space once the pivot is placed): every casing and foot vertex.
  const silhouette: Vector3[] = [];
  const screenCorners: Vector3[] = [];
  const collect = () => {
    parts.pivot.updateMatrixWorld(true);
    silhouette.length = 0;
    for (const m of [parts.casing, ...parts.feet]) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 3) silhouette.push(new Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld));
    }
    screenCorners.length = 0;
    const { w, h } = DIMS.opening;
    for (const [x, y] of [
      [-w / 2, OPENING_Y - h / 2],
      [w / 2, OPENING_Y - h / 2],
      [w / 2, OPENING_Y + h / 2],
      [-w / 2, OPENING_Y + h / 2],
    ] as const)
      screenCorners.push(new Vector3(x, y, -DIMS.recess).applyMatrix4(parts.body.matrixWorld));
  };
  collect();

  const project = (pts: Vector3[]) => {
    const v = new Vector3();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      v.copy(p).project(camera);
      const x = ((v.x + 1) / 2) * cssW;
      const y = ((1 - v.y) / 2) * cssH;
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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    frame(view, slot) {
      const target = view.fit === 'screen' ? new Vector3(0, OPENING_Y, -DIMS.recess).applyMatrix4(parts.body.matrixWorld) : new Vector3(0, 0, 0);
      const pts = view.fit === 'screen' ? screenCorners : silhouette;
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
        box = project(pts);
        d *= (box.x1 - box.x0) / slot.w;
      }
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      box = project(pts);
      camera.setViewOffset(cssW, cssH, (box.x0 + box.x1) / 2 - slot.cx, (box.y0 + box.y1) / 2 - slot.cy, cssW, cssH);
      camera.updateMatrixWorld();
      const s = project(screenCorners);
      return { box: project(silhouette), screenW: s.x1 - s.x0, screenH: s.y1 - s.y0 };
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
    render() {
      renderer.render(scene, camera);
    },
    measure() {
      return measure(parts);
    },
  };
  return monitor;
}
