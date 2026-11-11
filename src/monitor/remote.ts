/**
 * The controller on the floor in front of the monitor, plugged into the port on its chin — a prop of
 * the opening, built in code like the monitor. A simple classic pad, original: a flat dog-bone body
 * (two round ends joined by a straight middle) in hard, glossy Florets Yellow plastic with tight
 * rounded edges; a d-pad on the left, Vega's wordmark in the middle, and A and B on the right,
 * lettered. Brand colours: A in Leaf Green and B in Yellow 600, lettered in Daisy White; the d-pad, the plug's boots and the cable in Green 900, the brand's ink; the plug in the
 * monitor's port in the pad's own plastic. Five meshes.
 *
 * It lies flat on the floor in the monitor's body space (so it turns with the parallax). The cable
 * leaves the port's plug, drops down the chin onto the floor, swings out across it in a loose S and
 * comes back into the controller's top edge;
 * in dev, a check says so if it ever passes through the monitor or the controller. Seen from the front
 * right, anything behind the monitor lands to its right on the page, so cable and controller keep to
 * its front, inside a phone's width.
 */
import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  SRGBColorSpace,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
  type Color,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { portShape, svgShapes } from './mesh';
import { DIMS, faceRise, ROW2_Y, scaleAt } from './spec';

/**
 * The controller's measurements (monitor units; the screen opening is 0.7 wide), where it lies in the
 * monitor's body space, and its cable. `reach` is its footprint for the breakout's glass, which never
 * comes to rest inside it.
 */
export const REMOTE = {
  /** The body: its ends' radius and centres (±x), the middle's half-height, its thickness and the round of its edges. */
  end: 0.1,
  ends: 0.15,
  waist: 0.072,
  depth: 0.034,
  bevel: 0.009,
  /**
   * Where it lies (x, z), its turn (radians about y; its top edge toward the monitor) and its scale.
   * Searched at 320, 390, 768, 1024 and 1440 px wide for the largest controller whose box, through the
   * parallax turn (the touch sway on phones), stays inside the page and clear of the tagline below,
   * its footprint clear of the monitor's.
   */
  at: [0.5, 0.2] as const,
  turn: 0.3,
  scale: 0.85,
  /** Its footprint: a circle round `at` this wide (before the scale). */
  reach: 0.27,
  /** The cable's radius. */
  cable: { r: 0.0075 },
} as const;

/** The floor: the feet's soles. */
const FLOOR = -DIMS.feet.h;

/** The body's outline, seen from above: two round ends joined by a straight middle, a little waisted. */
function outline(): Shape {
  const { end: r, ends: c, waist: w } = REMOTE;
  // where the middle's straight edge meets each end's circle
  const a = Math.asin(w / r);
  const s = new Shape();
  s.absarc(c, 0, r, -Math.PI + a, Math.PI - a, false);
  s.absarc(-c, 0, r, a, 2 * Math.PI - a, false);
  return s;
}

/** The d-pad's outline: a plus, `arm` from the centre to each end, `w` wide (its bevel rounds it). */
function plus(arm: number, w: number): Shape {
  const h = w / 2;
  const pts: [number, number][] = [
    [h, -arm], [h, -h], [arm, -h], [arm, h], [h, h], [h, arm],
    [-h, arm], [-h, h], [-arm, h], [-arm, -h], [-h, -h], [-h, -arm],
  ];
  return new Shape(pts.map(([x, y]) => new Vector2(x, y)));
}

/** The d-pad's arrows: a triangle pointing along +x, scaled by `k`, its centre this far out along each arm. */
const ARROW_AT = 0.025;
function arrow(k: number): Shape {
  return new Shape([new Vector2(0.006 * k, 0), new Vector2(-0.004 * k, 0.0062 * k), new Vector2(-0.004 * k, -0.0062 * k)]);
}

/** A button's profile for LatheGeometry: a low cap with a crisp rounded edge, `r` across, `h` tall, from below its base up and over. */
function cap(r: number, h: number): Vector2[] {
  const e = Math.min(r, h) * 0.45;
  const pts = [new Vector2(r, -0.006), new Vector2(r, 0)];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new Vector2(r - e + e * Math.cos(a), h - e + e * Math.sin(a)));
  }
  pts.push(new Vector2(0, h + 0.001));
  return pts;
}

/** The two buttons' tops, side by side in one texture: each its colour, its letter in `ink`. */
function letterAtlas(cells: { fill: Color; letter: string }[], ink: Color): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = `700 70px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  cells.forEach((cell, i) => {
    ctx.fillStyle = cell.fill.getStyle();
    ctx.fillRect(i * 128, 0, 128, 128);
    // the letter engraved: set into the button, painted, the wall of its recess in shade along its top
    // and left edges (the light comes from the top left)
    const l = document.createElement('canvas');
    l.width = l.height = 128;
    const lc = l.getContext('2d')!;
    lc.font = ctx.font;
    lc.textAlign = 'center';
    lc.textBaseline = 'middle';
    lc.fillStyle = cell.fill.clone().multiplyScalar(0.45).getStyle();
    lc.fillText(cell.letter, 64, 68);
    lc.globalCompositeOperation = 'source-atop';
    lc.fillStyle = ink.getStyle();
    lc.fillText(cell.letter, 66.5, 71);
    ctx.drawImage(l, i * 128, 0);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface RemoteParts {
  group: Group;
  /** Every mesh, for the shadow and the visibility. */
  meshes: Mesh[];
  /** The cable's points, body space (for checks). */
  cable: Vector3[];
}

/** Build the controller and its cable (body space). */
export function buildRemote(colors: { body: Color; a: Color; b: Color; letter: Color; ink: Color; arrow: Color }, logoSvg = ''): RemoteParts {
  const { depth, bevel } = REMOTE;
  // Built lying flat in its own space — the outline's x stays x, its y (the top edge) runs toward −z,
  // its thickness up from the floor at y = 0 — then placed: turned, scaled about the floor, moved.
  const top = depth + 2 * bevel;
  const place = new Matrix4()
    .makeTranslation(REMOTE.at[0], FLOOR, REMOTE.at[1])
    .multiply(new Matrix4().makeRotationY(REMOTE.turn))
    .multiply(new Matrix4().makeScale(REMOTE.scale, REMOTE.scale, REMOTE.scale));
  const flat = new Matrix4().makeRotationX(-Math.PI / 2);
  /** A point on the controller's flat top (outline x, y) in its own space, `up` above it. */
  const onTop = (x: number, y: number, up = 0) => new Vector3(x, top + up, -y);

  // The body: the outline extruded, its edges rounded tight, smooth-shaded.
  let bodyGeo: BufferGeometry = new ExtrudeGeometry(outline(), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 28 });
  bodyGeo.applyMatrix4(flat).translate(0, bevel, 0);
  bodyGeo.deleteAttribute('uv');
  bodyGeo.deleteAttribute('normal');
  bodyGeo = mergeVertices(bodyGeo, 1e-6);
  bodyGeo.computeVertexNormals();
  bodyGeo.applyMatrix4(place);

  // A (the big main button) and the smaller B on the right end, on a diagonal, lettered: one mesh, their
  // tops from one texture.
  const buttons = [
    { x: REMOTE.ends + 0.034, y: 0.016, r: 0.034, fill: colors.a, letter: 'A' },
    { x: REMOTE.ends - 0.036, y: -0.034, r: 0.023, fill: colors.b, letter: 'B' },
  ];
  const buttonGeo = mergeGeometries(
    buttons.map((b, i) => {
      const g = new LatheGeometry(cap(b.r, 0.011), 36);
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let k = 0; k < p.count; k++) uv.setXY(k, (i + p.getX(k) / (2 * b.r) + 0.5) / 2, -p.getZ(k) / (2 * b.r) + 0.5);
      const at = onTop(b.x, b.y);
      return g.translate(at.x, at.y, at.z).applyMatrix4(place).toNonIndexed();
    }),
  )!;
  // a soft sheen only, so each reads as its own brand colour
  const buttonMat = new MeshPhysicalMaterial({ color: 0xffffff, map: letterAtlas(buttons, colors.letter), roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3 });

  // Marked on it, as A and B are: an arrow on each arm of the d-pad.
  // (the arrows are recessed: cut through the d-pad below, their floor here, Leaf Green, half its height down)
  const arrowGeo = mergeGeometries(
    [0, 1, 2, 3].map((k) => {
      const g = new ExtrudeGeometry(arrow(1.25), { depth: 0.0008, bevelEnabled: false });
      g.rotateZ((k * Math.PI) / 2).translate(Math.cos((k * Math.PI) / 2) * ARROW_AT, Math.sin((k * Math.PI) / 2) * ARROW_AT, 0);
      const at = onTop(-REMOTE.ends, 0, 0.0005 + 0.0012);
      g.applyMatrix4(flat).translate(at.x, at.y, at.z).applyMatrix4(place);
      g.deleteAttribute('uv');
      return g;
    }),
  )!;
  const arrowMat = new MeshPhysicalMaterial({ color: colors.arrow, roughness: 0.45, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  // Vega's wordmark, raised a hair in the middle of the top, in Leaf Green as on the monitor
  let logoGeo: BufferGeometry | null = null;
  const logoShapes = logoSvg ? svgShapes(logoSvg, 0.024) : [];
  if (logoShapes.length) {
    logoGeo = new ExtrudeGeometry(logoShapes, { depth: 0.0008, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0003, bevelSegments: 1 });
    const at = onTop(0, 0.004, 0);
    logoGeo.applyMatrix4(flat).translate(at.x, at.y, at.z).applyMatrix4(place);
    logoGeo.deleteAttribute('uv');
    logoGeo = mergeGeometries([logoGeo.toNonIndexed(), arrowGeo.toNonIndexed()])!;
  }

  // The ink parts (Green 900): the d-pad, the plug's sleeve on the top
  // edge, the plug in the monitor's port, and the cable.
  const ink: BufferGeometry[] = [];
  const put = (g: BufferGeometry, at: Vector3, local = true) => {
    g.translate(at.x, at.y, at.z);
    if (local) g.applyMatrix4(place);
    ink.push(g.index ? g.toNonIndexed() : g);
  };
  {
    const pad = plus(0.038, 0.024);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const pts = arrow(1)
        .getPoints()
        .map((q) => new Vector2(q.x * Math.cos(a) - q.y * Math.sin(a) + Math.cos(a) * ARROW_AT, q.x * Math.sin(a) + q.y * Math.cos(a) + Math.sin(a) * ARROW_AT));
      pad.holes.push(new Path(pts));
    }
    const g = new ExtrudeGeometry(pad, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0012, bevelSegments: 2 });
    put(g.applyMatrix4(flat), onTop(-REMOTE.ends, 0, 0.0005));
  }
  const plugLocal = new Vector3(0, top / 2, -(REMOTE.waist + 0.012));
  put(new CylinderGeometry(0.011, 0.013, 0.026, 16).rotateX(Math.PI / 2), plugLocal.clone());
  const plugAt = plugLocal.clone().applyMatrix4(place);
  const out = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), REMOTE.turn);
  // The plug in the monitor's port, in the pad's own plastic: a simple housing the socket's shape, seated in
  // its bezel, rounded all over and narrowing toward the back. The cable leaves it through a short Green 900
  // strain-relief boot.
  const P = DIMS.port;
  const portX = DIMS.button.x;
  const portZ = faceRise(portX, ROW2_Y);
  const plugOut = 0.03;
  let plugGeo: BufferGeometry;
  {
    const housing = new ExtrudeGeometry(portShape(P.w * 0.94, P.h * 0.96), { depth: plugOut - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0035, bevelSegments: 4, curveSegments: 10 });
    // narrowing toward the back
    const hp = housing.getAttribute('position');
    for (let k = 0; k < hp.count; k++) {
      const f = 1 - 0.14 * Math.min(1, Math.max(0, hp.getZ(k) / (plugOut - 0.006)));
      hp.setXY(k, hp.getX(k) * f, hp.getY(k) * f);
    }
    housing.translate(portX, ROW2_Y, portZ + 0.004);
    const nose = new ExtrudeGeometry(portShape(P.w * 0.84, P.h * 0.84), { depth: 0.014, bevelEnabled: false, curveSegments: 10 });
    nose.translate(portX, ROW2_Y, portZ - 0.012);
    plugGeo = mergeGeometries([housing, nose].map((g) => {
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      return g.toNonIndexed();
    }))!;
    plugGeo = mergeVertices(plugGeo, 1e-6);
    plugGeo.computeVertexNormals();
    put(new CylinderGeometry(0.0068, 0.0092, 0.018, 18).rotateX(Math.PI / 2), new Vector3(portX, ROW2_Y - 0.0015, portZ + plugOut + 0.007), false);
  }

  // The cable: out of the port's plug, down the chin onto the floor, into the controller's plug.
  const R = REMOTE.cable.r;
  const fy = FLOOR + R;
  const start = new Vector3(portX, ROW2_Y - 0.0015, portZ + plugOut + 0.016);
  const end = plugAt.clone().addScaledVector(out, 0.013 * REMOTE.scale);
  // a real pad's cable is long: it drops from the plug to the floor, swings out to the left across the
  // floor in front of the monitor in a loose S, and comes back along the face's foot into the pad's plug
  const pts = [
    start,
    new Vector3(start.x, start.y - 0.012, start.z + 0.03),
    new Vector3(start.x - 0.01, fy + 0.03, start.z + 0.06),
    new Vector3(start.x - 0.05, fy, 0.15),
    new Vector3(0.08, fy, 0.25),
    new Vector3(-0.12, fy, 0.25),
    new Vector3(-0.21, fy, 0.15),
    new Vector3(-0.1, fy, 0.065),
    new Vector3(0.12, fy, 0.04),
    end.clone().addScaledVector(out, 0.1).setY(fy),
    end.clone().addScaledVector(out, 0.035).setY((fy + end.y) / 2),
    end,
  ];
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  ink.push(new TubeGeometry(curve, 200, R, 6, false).toNonIndexed());
  // one set of attributes for the merge: positions and normals only
  for (const g of ink) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const inkGeo = mergeGeometries(ink)!;
  for (const g of ink) g.dispose();

  // hard, glossy plastic: the pad is shinier than the monitor's matt casing
  const bodyMat = new MeshPhysicalMaterial({ color: colors.body, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 });
  const inkMat = new MeshPhysicalMaterial({ color: colors.ink, roughness: 0.45, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const meshes = [new Mesh(bodyGeo, bodyMat), new Mesh(plugGeo, bodyMat), new Mesh(buttonGeo, buttonMat), new Mesh(inkGeo, inkMat), new Mesh(logoGeo ?? arrowGeo, arrowMat)];
  const group = new Group();
  group.add(...meshes);
  const cable = curve.getSpacedPoints(160);
  if (import.meta.env.DEV) checkCable(cable, R);
  return { group, meshes, cable };
}

/** Is a body-space point inside the monitor (the frame and the tapered body, grown by `pad`)? */
function inMonitor(p: Vector3, pad: number): boolean {
  const F = DIMS.frame;
  if (p.z > pad || p.z < -DIMS.DEPTH - pad || p.y < -pad) return false;
  if (p.z > -F.depth) return Math.abs(p.x) < DIMS.W / 2 + pad && p.y < DIMS.H + pad;
  const s = scaleAt(p.z);
  return Math.abs(p.x) < (DIMS.W / 2 - F.step) * s + pad && p.y < F.step + (DIMS.H - 2 * F.step) * s + pad;
}

/** Dev only: say so if the cable passes through the monitor (past its plug) or the controller (before its plug). */
function checkCable(pts: Vector3[], r: number): void {
  const n = pts.length;
  const centre = new Vector3(REMOTE.at[0], 0, REMOTE.at[1]);
  const bad = pts.filter((p, i) => (i > n * 0.12 && inMonitor(p, r)) || (i < n * 0.85 && Math.hypot(p.x - centre.x, p.z - centre.z) < REMOTE.reach * REMOTE.scale - 0.06));
  if (bad.length) console.warn(`[monitor] the controller's cable passes through the monitor or the controller at ${bad.length} of ${n} points`);
}
