/**
 * The monitor, built in code (no model file): a simple vintage all-in-one CRT. Every part is its own
 * mesh so the glass can crack and shatter later.
 *
 * Units (src/monitor/spec.ts): the screen opening is 0.7 wide. x right, y up from the bottom of the
 * front frame, z toward the viewer; the front face sits at z = 0 and the back at z = −DEPTH. Two
 * sweeps of rounded-rect outlines along z, each ring's outline pushed in along its normals so the
 * edges round off: the front frame (a soft lip round its face, a small round at its back), and behind
 * it, standing back from the frame by frame.step all round, the deep body, its top and sides tapering
 * toward a smaller back about its flat bottom (a trapezoid from the side). The screen opening is a
 * third sweep (the rounded lip, then the recess walls). Vega's daisy is embossed on the right side.
 */
import {
  BufferGeometry,
  CanvasTexture,
  CustomBlending,
  DataTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  ShapeGeometry,
  ShapeUtils,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Color,
  type Material,
} from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRemote, REMOTE } from './remote';
import { portShape, subdivide, svgShapes } from './mesh';
import { CENTRE, CHIN, DIMS, faceRise, OPENING_Y, ROW2_Y, SLOT_Y, scaleAt } from './spec';

export { CENTRE, CHIN, DIMS, OPENING_Y, SCREEN_ASPECT, SLOT_Y } from './spec';

interface OutlinePt {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * A rounded rectangle, counter-clockwise from its bottom-right corner, with outward normals.
 * `sideBreaks` adds points along the vertical sides (the vents' grooves need them).
 */
function roundedRect(cx: number, cy: number, w: number, h: number, r: number, seg: number, sideBreaks: number[] = []): OutlinePt[] {
  const pts: OutlinePt[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const corners = [
    { x: cx + hw - r, y: cy - hh + r, a0: -Math.PI / 2 },
    { x: cx + hw - r, y: cy + hh - r, a0: 0 },
    { x: cx - hw + r, y: cy + hh - r, a0: Math.PI / 2 },
    { x: cx - hw + r, y: cy - hh + r, a0: Math.PI },
  ];
  const inside = sideBreaks.filter((y) => y > cy - hh + r && y < cy + hh - r);
  corners.forEach((c, ci) => {
    for (let i = 0; i <= seg; i++) {
      const a = c.a0 + (i / seg) * (Math.PI / 2);
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
    }
    if (ci === 0) for (const y of [...inside].sort((a, b) => a - b)) pts.push({ x: cx + hw, y, nx: 1, ny: 0 });
    if (ci === 2) for (const y of [...inside].sort((a, b) => b - a)) pts.push({ x: cx - hw, y, nx: -1, ny: 0 });
  });
  return pts;
}

/**
 * Sweep an outline along z: `rings` give each cross-section's z and how far the outline is pushed
 * along its normals (negative = inward), tapered by scaleAt about (0, pivotY); `extra(pt, ring)` adds a
 * local push (the vents). Indexed and closed around the outline; `facing` 'out' faces the outline's
 * normals, 'in' faces away.
 */
function sweep(
  outline: OutlinePt[],
  rings: { z: number; push: number; v: number }[],
  facing: 'out' | 'in',
  pivotY = 0,
  extra?: (pt: OutlinePt, ring: number) => number,
): BufferGeometry {
  const n = outline.length;
  const pos: number[] = [];
  const uv: number[] = [];
  let perim = 0;
  const along = outline.map((p, i) => {
    if (i > 0) perim += Math.hypot(p.x - outline[i - 1]!.x, p.y - outline[i - 1]!.y);
    return perim;
  });
  perim += Math.hypot(outline[0]!.x - outline[n - 1]!.x, outline[0]!.y - outline[n - 1]!.y);
  rings.forEach((ring, ri) => {
    const s = scaleAt(ring.z);
    outline.forEach((p, i) => {
      const push = ring.push + (extra ? extra(p, ri) : 0);
      pos.push((p.x + p.nx * push) * s, pivotY + (p.y + p.ny * push - pivotY) * s, ring.z);
      uv.push(along[i]! / perim, ring.v);
    });
  });
  const index: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = r * n + i;
      const b = r * n + j;
      const c = (r + 1) * n + j;
      const d = (r + 1) * n + i;
      if (facing === 'out') index.push(a, d, b, d, c, b);
      else index.push(a, b, d, d, b, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A flat cap from an outline (deduplicated) with optional holes, at depth z, facing +z or −z, tapered about (0, pivotY). */
function cap(outer: Vector2[], holes: Vector2[][], z: number, facing: 1 | -1, pivotY = 0): BufferGeometry {
  const dedupe = (pts: Vector2[]) =>
    pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]!) > 1e-9).filter((p, i, a) => i < a.length - 1 || p.distanceTo(a[0]!) > 1e-9);
  const shape = new Shape(dedupe(outer));
  for (const h of holes) shape.holes.push(new Path(dedupe(h)));
  const g = new ShapeGeometry(shape, 24);
  const p = g.getAttribute('position');
  const s = scaleAt(z);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * s, pivotY + (p.getY(i) - pivotY) * s, z);
  if (facing < 0) {
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A gently rounded disc profile for LatheGeometry (radius r, height h, around the y axis), from the
 * base up and over the top: LatheGeometry's normal is (dy, −dx), so this order faces outward.
 */
function dome(r: number, h: number, steps = 6): Vector2[] {
  const e = Math.min(r, h) * 0.6;
  const pts = [new Vector2(r, 0)];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new Vector2(r - e + e * Math.cos(a), h - e + e * Math.sin(a)));
  }
  pts.push(new Vector2(0, h));
  return pts;
}

/** Plastic micro-variation: a seeded 64 × 64 roughness map around `base` (green channel). */
function roughnessNoise(base: number, amp: number): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const coarse = Array.from({ length: 9 * 9 }, rnd);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // bilinear coarse blobs plus fine grain, so it reads as plastic, not as noise
      const gx = (x / size) * 8;
      const gy = (y / size) * 8;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const at = (i: number, j: number) => coarse[(j % 9) * 9 + (i % 9)]!;
      const c = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      const v = base + amp * (0.7 * (c * 2 - 1) + 0.3 * (rnd() * 2 - 1));
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      data[o + 3] = 255;
    }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The screen's glow on the recess walls: 0 at the lip, 1 at the screen (uv.y of the walls). */
function glowRamp(): DataTexture {
  const n = 32;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.pow(i / (n - 1), 2.2) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const t = new DataTexture(data, 1, n, RGBAFormat);
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The cast shadow's strength fades from full to nothing between these distances from the monitor's footprint (body units). */
const FADE = [0.05, 0.6] as const;

/** A soft dark patch on the floor: centre (x, z), radii, its turn about y (radians), and alpha stops from its centre out. */
interface Blob {
  x: number;
  z: number;
  rx: number;
  rz: number;
  turn?: number;
  stops: [number, number][];
}

/**
 * The contact darkening, baked once: soft patches right under the feet, the body and the controller,
 * on a transparent plane (the floor stays the page's own Daisy White). The shadow proper is cast
 * (src/monitor/index.ts); this keeps the monitor grounded where it meets the floor.
 */
function contactTexture(
  rect: { x0: number; x1: number; z0: number; z1: number },
  blobs: Blob[],
  lines: { pts: [number, number][]; width: number; alpha: number }[] = [],
): CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const toPx = (x: number, z: number): [number, number] => [((x - rect.x0) / (rect.x1 - rect.x0)) * S, (1 - (z - rect.z0) / (rect.z1 - rect.z0)) * S];
  for (const b of blobs) {
    const [px, py] = toPx(b.x, b.z);
    ctx.save();
    ctx.translate(px, py);
    // the canvas's y runs toward +z, so a turn about y (x toward −z) is a turn the other way here
    ctx.rotate(b.turn ?? 0);
    ctx.scale((b.rx / (rect.x1 - rect.x0)) * S, (b.rz / (rect.z1 - rect.z0)) * S);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [o, a] of b.stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  // lines lying on the floor (the cable), softened a little
  ctx.filter = 'blur(1.5px)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const l of lines) {
    ctx.strokeStyle = `rgba(255,255,255,${l.alpha})`;
    ctx.lineWidth = (l.width / (rect.x1 - rect.x0)) * S;
    ctx.beginPath();
    l.pts.forEach(([x, z], i) => (i ? ctx.lineTo(...toPx(x, z)) : ctx.moveTo(...toPx(x, z))));
    ctx.stroke();
  }
  ctx.filter = 'none';
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface MonitorColors {
  plastic: Color;
  bevel: Color;
  slot: Color;
  button: Color;
  shadow: Color;
  /** Vega's wordmark on the chin, the drive's activity LED, and the mark on the power button. */
  brand: Color;
  led: Color;
  ink: Color;
  /** The controller's A and B, their letters, and its ink parts (d-pad, plugs, cable). */
  remoteA: Color;
  remoteB: Color;
  remoteLetter: Color;
  remoteInk: Color;
}

export interface MonitorParts {
  /** Turns with the parallax; its origin is the monitor's visual centre. */
  pivot: Group;
  body: Group;
  /** The front frame's sweep, and the body's (the silhouette is sampled from both and the feet). */
  frame: Mesh;
  casing: Mesh;
  front: Mesh;
  back: Mesh;
  recess: Mesh;
  screen: Mesh;
  glass: Mesh;
  daisy: Mesh | null;
  /** The power button (it presses in when clicked). */
  power: Mesh;
  /** The floor that takes the shadow (a ShadowMaterial), and the baked contact darkening on it. */
  floor: Mesh;
  contact: Mesh;
  /** The controller and its cable, on the floor (in the body, so it turns with the monitor). */
  remote: Group;
  /** Every mesh that casts the shadow. */
  casters: Mesh[];
  /** One mesh, all four. */
  feet: Mesh[];
  materials: { plastic: MeshPhysicalMaterial; bevel: MeshPhysicalMaterial; glass: MeshPhysicalMaterial };
}

/** A foot's profile for LatheGeometry: the rounded sole `h` below y = 0, then straight up to `up` (into the casing). */
function footProfile(r: number, h: number, up: number): Vector2[] {
  // hanging down: the dome mirrored, and reversed so it still faces outward
  const pts = dome(r, h)
    .map((p) => new Vector2(p.x, -p.y))
    .reverse();
  pts.push(new Vector2(r, up), new Vector2(0, up));
  return pts;
}

/**
 * Build every mesh; the screen gets its own material from the caller (the CRT shader). `daisySvg` is the
 * daisy's SVG source and `logoSvg` Vega's wordmark's ('' for none).
 */
export function buildMonitor(colors: MonitorColors, screenMaterial: Material, daisySvg = '', logoSvg = ''): MonitorParts {
  const { R, W, H, DEPTH, opening: O } = DIMS;
  const F = DIMS.frame;

  // ── Materials ──
  const plastic = new MeshPhysicalMaterial({
    color: colors.plastic,
    roughness: 1,
    roughnessMap: roughnessNoise(0.45, 0.03),
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
  });
  const bevel = new MeshPhysicalMaterial({
    color: colors.bevel,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    emissive: colors.button.clone(),
    emissiveMap: glowRamp(),
    emissiveIntensity: 0,
  });
  // the inside of the slot and the port: dark walls, a black back
  const pocketWall = new MeshStandardMaterial({ color: colors.slot, roughness: 0.9, metalness: 0 });
  const pocketBack = new MeshStandardMaterial({ color: colors.shadow, roughness: 1, metalness: 0 });
  // Glass: transmission off. Its reflection is added on top (One) while the tube behind is dimmed by
  // the glass's 15 % (One − src alpha), so a mostly clear pane still carries a visible reflection.
  const glassMat = new MeshPhysicalMaterial({
    color: 0x000000,
    roughness: 0.07,
    metalness: 0,
    ior: 1.5,
    envMapIntensity: 2.2,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });

  const edgeSeg = 10;
  const quarter = (i: number) => (i / edgeSeg) * (Math.PI / 2);

  // ── The front frame: a soft lip round its face, straight sides, a small round at its back ──
  const frameOutline = roundedRect(0, H / 2, W, H, F.r, 12);
  const frameRings: { z: number; push: number; v: number }[] = [];
  for (let i = 0; i <= edgeSeg; i++) frameRings.push({ z: -F.lip * (1 - Math.cos(quarter(i))), push: -F.lip * (1 - Math.sin(quarter(i))), v: 0 });
  for (let i = 0; i <= edgeSeg; i++)
    frameRings.push({ z: -(F.depth - F.back) - F.back * Math.sin(quarter(i)), push: -F.back * (1 - Math.cos(quarter(i))), v: 0 });
  frameRings.forEach((r) => (r.v = -r.z / DEPTH));
  const frame = new Mesh(sweep(frameOutline, frameRings, 'out'), plastic);

  // ── The body: frame.step in from the frame all round, tapering to the back about its flat bottom ──
  //    The vents are grooves pressed into the left side near the back (the right carries the daisy alone):
  //    dips in the sweep, so they catch
  //    the light and the shade as the plastic round them does. Guard rows and rings a hair outside each
  //    groove keep its tilted normals out of the long flat quads beside it (else the side shades in streaks).
  const vent = DIMS.vents;
  const GUARD = 0.002;
  const bodyOutline = roundedRect(0, H / 2, W - 2 * F.step, H - 2 * F.step, F.r - F.step, 12, [
    vent.y0 - GUARD,
    vent.y0,
    vent.y0 + vent.wall,
    vent.y1 - vent.wall,
    vent.y1,
    vent.y1 + GUARD,
  ]);
  const bodyBottom = F.step;
  const bodyRings: { z: number; push: number; v: number }[] = [{ z: -(F.depth - 0.004), push: 0, v: 0 }];
  const deepZ = new Set<number>();
  for (const vz of vent.z)
    for (const [dz, deep] of [
      [-vent.half - GUARD, false],
      [-vent.half, false],
      [-vent.half + vent.wall, true],
      [vent.half - vent.wall, true],
      [vent.half, false],
      [vent.half + GUARD, false],
    ] as const) {
      bodyRings.push({ z: -(vz + dz), push: 0, v: 0 });
      if (deep) deepZ.add(-(vz + dz));
    }
  bodyRings.sort((a, b) => b.z - a.z);
  for (let i = 0; i <= edgeSeg; i++) bodyRings.push({ z: -(DEPTH - R) - R * Math.sin(quarter(i)), push: -R * (1 - Math.cos(quarter(i))), v: 0 });
  bodyRings.forEach((r) => (r.v = -r.z / DEPTH));
  const ventDeep = (p: OutlinePt, ri: number) => (deepZ.has(bodyRings[ri]!.z) && p.nx === -1 && p.y > vent.y0 + 1e-6 && p.y < vent.y1 - 1e-6 ? -vent.depth : 0);
  const casing = new Mesh(sweep(bodyOutline, bodyRings, 'out', bodyBottom, ventDeep), plastic);

  // ── Faces: the frame's front (with the opening, widened by the lip), the step round its back, the body's back ──
  const ring = (o: OutlinePt[], push: number) => o.map((p) => new Vector2(p.x + p.nx * push, p.y + p.ny * push));
  const openOutline = roundedRect(0, OPENING_Y, O.w, O.h, O.r, 10);
  // The face: a cushion, not a plane (faceRise) — subdivided so it can bend, holes cut for the floppy
  // slot and the controller's port.
  const S = DIMS.slot;
  const B = DIMS.button;
  const P = DIMS.port;
  const slotY = SLOT_Y + S.dy;
  const slotOutline = roundedRect(S.x, slotY, S.w, S.h, 0.004, 4);
  // the port: its own outline (src/monitor/mesh.ts portShape), points with outward normals
  const portOutline: OutlinePt[] = (() => {
    let pts = portShape(P.w, P.h)
      .getPoints(4)
      .map((q) => new Vector2(q.x + B.x, q.y + ROW2_Y));
    pts = pts.filter((q, i) => q.distanceTo(pts[(i + 1) % pts.length]!) > 1e-7);
    if (ShapeUtils.isClockWise(pts)) pts.reverse();
    return pts.map((q, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      const e1 = new Vector2(q.y - a.y, a.x - q.x).normalize();
      const e2 = new Vector2(b.y - q.y, q.x - b.x).normalize();
      const n = e1.add(e2).normalize();
      return { x: q.x, y: q.y, nx: n.x, ny: n.y };
    });
  })();
  const frontGeo = subdivide(cap(ring(frameOutline, -F.lip), [ring(openOutline, DIMS.lip), ring(slotOutline, 0), ring(portOutline, 0)], 0, 1), 0.016);
  {
    const p = frontGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, faceRise(p.getX(i), p.getY(i)));
    frontGeo.computeVertexNormals();
  }
  const front = new Mesh(frontGeo, plastic);
  const step = new Mesh(cap(ring(frameOutline, -F.back), [ring(bodyOutline, 0)], -F.depth, -1), plastic);
  const back = new Mesh(cap(ring(bodyOutline, -R), [], -DEPTH, -1, bodyBottom), plastic);

  // ── The opening: the rounded lip (plastic), then the recess walls (the darker bevel) ──
  const lipSeg = 6;
  const openRings: { z: number; push: number; v: number }[] = [];
  for (let i = 0; i <= lipSeg; i++) {
    const a = (i / lipSeg) * (Math.PI / 2);
    openRings.push({ z: -DIMS.lip * (1 - Math.cos(a)), push: DIMS.lip * (1 - Math.sin(a)), v: 0 });
  }
  const wallEnd = DIMS.recess + 0.01;
  const wallSteps = 6;
  for (let i = 1; i <= wallSteps; i++) {
    const z = DIMS.lip + ((wallEnd - DIMS.lip) * i) / wallSteps;
    openRings.push({ z: -z, push: 0, v: Math.min(1, (z - DIMS.lip) / (DIMS.recess - DIMS.lip)) });
  }
  const recessGeo = sweep(openOutline, openRings, 'in');
  const perRing = openOutline.length * 6;
  recessGeo.clearGroups();
  recessGeo.addGroup(0, lipSeg * perRing, 0);
  recessGeo.addGroup(lipSeg * perRing, wallSteps * perRing, 1);
  const recess = new Mesh(recessGeo, [plastic, bevel]);

  // ── Screen: a grid over the opening (a little larger, its edges tucked behind the walls); the CRT
  //    shader bulges it into the tube's cap, so it can flatten during the zoom ──
  const margin = 0.008;
  const screenGeo = new PlaneGeometry(O.w + 2 * margin, O.h + 2 * margin, 56, 46);
  {
    const p = screenGeo.getAttribute('position');
    const uv = screenGeo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i) + OPENING_Y;
      const z = -DIMS.recess;
      const s = scaleAt(z);
      p.setXYZ(i, x * s, y * s, z);
      uv.setXY(i, (x + O.w / 2) / O.w, (y - (OPENING_Y - O.h / 2)) / O.h);
    }
  }
  const screen = new Mesh(screenGeo, screenMaterial);

  // ── Glass: the same cap, a hair in front, its bulge built in ──
  const glassGeo = new PlaneGeometry(O.w + 0.004, O.h + 0.004, 40, 32);
  {
    const p = glassGeo.getAttribute('position');
    const uv = glassGeo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const cx = Math.min(1, Math.abs(x) / (O.w / 2));
      const cy = Math.min(1, Math.abs(y) / (O.h / 2));
      const z = -DIMS.recess + DIMS.glassGap + DIMS.bulge * (1 - cx * cx) * (1 - cy * cy);
      const s = scaleAt(z);
      p.setXYZ(i, x * s, (y + OPENING_Y) * s, z);
      // the screen's own UVs (0–1 across the opening), so the breakout's crack mask lines up with the picture
      uv.setXY(i, (x + O.w / 2) / O.w, (y + O.h / 2) / O.h);
    }
    glassGeo.computeVertexNormals();
  }
  const glass = new Mesh(glassGeo, glassMat);
  glass.renderOrder = 2;

  // ── Chin, on two rows, every part straight on the face's cushion where it stands. The floppy drive:
  //    the slot (a real pocket, its dark flap inside) in a soft raised lip, the activity LED and the
  //    eject button under it. The power button, a power mark on it. Below: Vega's raised wordmark, its
  //    left edge on the drive's; the controller's port under the power button. ──
  /** A rounded ring standing proud round a hole (w × h, corner r), `lip` wide, `depth` proud, its back at z. */
  const lipRing = (x: number, y: number, z: number, w: number, h: number, r: number, lip: number, depth: number) => {
    const shape = new Shape(roundedRect(0, 0, w + 2 * lip, h + 2 * lip, Math.min((h + 2 * lip) / 2 - 0.001, r + lip), 6).map((p) => new Vector2(p.x, p.y)));
    shape.holes.push(new Path(roundedRect(0, 0, w, h, r, 4).map((p) => new Vector2(p.x, p.y))));
    const m = new Mesh(
      new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 3, curveSegments: 8 }),
      plastic,
    );
    m.position.set(x, y, z);
    return m;
  };
  /** The pocket behind a hole in the face, from just proud of `top` back to `bottom`: its walls and its back. */
  const pocketOf = (o: OutlinePt[], top: number, bottom: number) => [
    new Mesh(
      sweep(
        o,
        [
          { z: top + 0.004, push: 0, v: 0 },
          { z: bottom, push: 0, v: 1 },
        ],
        'in',
      ),
      pocketWall,
    ),
    new Mesh(
      cap(
        o.map((p) => new Vector2(p.x, p.y)),
        [],
        bottom,
        1,
      ),
      pocketBack,
    ),
  ];
  /** A small raised rounded rectangle (a button, an LED) at (x, y), its back at z. */
  const pad = (x: number, y: number, z: number, w: number, h: number, depth: number, mat: Material) => {
    const m = new Mesh(
      new ExtrudeGeometry(new Shape(roundedRect(0, 0, w, h, h / 2 - 0.0005, 5).map((p) => new Vector2(p.x, p.y))), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.0012,
        bevelSize: 0.001,
        bevelSegments: 2,
        curveSegments: 5,
      }),
      mat,
    );
    m.position.set(x, y, z);
    return m;
  };
  const ledMat = new MeshStandardMaterial({ color: colors.led, emissive: colors.led, emissiveIntensity: 0.5, roughness: 0.3 });
  const chin: Mesh[] = [];

  // the floppy drive
  const zSlot = faceRise(S.x, slotY);
  chin.push(lipRing(S.x, slotY, zSlot - 0.0018, S.w, S.h, 0.004, S.lip, S.lipDepth));
  chin.push(...pocketOf(slotOutline, zSlot, zSlot - S.deep));
  const flap = new Mesh(new PlaneGeometry(S.w - 0.004, S.h * 0.62), pocketWall);
  flap.position.set(S.x, slotY - S.h * 0.19, zSlot - S.flap);
  chin.push(flap);
  const under = slotY - S.h / 2 - S.lip - 0.016;
  const ejectX = S.x + S.w / 2 - S.eject.w / 2;
  chin.push(pad(ejectX, under, faceRise(ejectX, under) - 0.0012, S.eject.w, S.eject.h, 0.002, plastic));
  const ledX = S.x - S.w / 2 + S.led.w / 2;
  chin.push(pad(ledX, under, faceRise(ledX, under) - 0.0008, S.led.w, S.led.h, 0.0008, ledMat));

  // the power button, a power mark on it
  let powerButton: Mesh | null = null;
  {
    const g = new LatheGeometry(dome(B.r, B.h), 40);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * B.r) + 0.5, -p.getZ(i) / (2 * B.r) + 0.5);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = colors.button.getStyle();
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = colors.ink.getStyle();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(64, 68, 26, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + 2 * Math.PI);
    ctx.moveTo(64, 32);
    ctx.lineTo(64, 64);
    ctx.stroke();
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const power = new Mesh(g, new MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.35, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
    power.rotation.x = Math.PI / 2;
    power.position.set(B.x, SLOT_Y, faceRise(B.x, SLOT_Y) - 0.001);
    chin.push(power);
    powerButton = power;
  }

  // the controller's port
  const zPort = faceRise(B.x, ROW2_Y);
  {
    // a soft raised bezel round the socket, following its outline
    const outer = new Shape(portOutline.map((q) => new Vector2(q.x + q.nx * P.lip - B.x, q.y + q.ny * P.lip - ROW2_Y)));
    outer.holes.push(new Path(portOutline.map((q) => new Vector2(q.x - B.x, q.y - ROW2_Y))));
    const bezel = new Mesh(
      new ExtrudeGeometry(outer, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 3 }),
      plastic,
    );
    bezel.position.set(B.x, ROW2_Y, zPort - 0.0015);
    chin.push(bezel);
  }
  chin.push(...pocketOf(portOutline, zPort, zPort - P.deep));

  // Vega's wordmark, raised: its letters stand a few mm proud of the chin, in the logo's Leaf Green, its
  // left edge on the drive's
  const logoShapes = logoSvg ? svgShapes(logoSvg, DIMS.logo.h) : [];
  if (logoShapes.length) {
    const geo = new ExtrudeGeometry(logoShapes, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0005, bevelSegments: 1 });
    geo.computeBoundingBox();
    const left = S.x - S.w / 2 - S.lip - geo.boundingBox!.min.x;
    // laid onto the cushion where each point of it stands, so no letter sinks into the face
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + faceRise(left + p.getX(i), ROW2_Y + p.getY(i)) - 0.0004);
    geo.computeVertexNormals();
    const badge = new Mesh(geo, new MeshPhysicalMaterial({ color: colors.brand, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    badge.position.set(left, ROW2_Y, 0);
    chin.push(badge);
  }

  // ── Feet: the front pair under the frame's corners, the back pair under the body's (reaching up to it) — one mesh ──
  const ft = DIMS.feet;
  const front2 = new LatheGeometry(footProfile(ft.r, ft.h, 0.02), 24);
  const back2 = new LatheGeometry(footProfile(ft.r, ft.h, bodyBottom + 0.02), 24);
  const feetGeo = mergeGeometries(
    [-1, 1].flatMap((sx) => [front2.clone().translate(sx * ft.x, 0, -ft.zFront), back2.clone().translate(sx * ft.x * scaleAt(-ft.zBack), 0, -ft.zBack)]),
  )!;
  front2.dispose();
  back2.dispose();
  const feet = [new Mesh(feetGeo, plastic)];

  // ── The sides' flat parts are planes: x = ±sideX · s(z), whatever y. A frame on one: along it toward
  //    the back on the right (toward the front on the left, so both read unmirrored from outside), up,
  //    and out of it; at depth zc and height yc (as at the body's front: tapered with it), `lift` out ──
  const sideX = W / 2 - F.step;
  const onSide = (side: 1 | -1, zc: number, yc: number, lift: number) => {
    const z0 = -F.depth;
    const z1 = -DEPTH;
    const along = new Vector3(side * sideX * (scaleAt(z1) - scaleAt(z0)), 0, z1 - z0).normalize();
    const up = new Vector3(0, 1, 0);
    const out = side > 0 ? new Vector3().crossVectors(along, up) : new Vector3().crossVectors(up, along);
    if (side < 0) along.negate();
    const sc = scaleAt(zc);
    return new Matrix4().makeBasis(along, up, out).setPosition(side * sideX * sc + out.x * lift, bodyBottom + (yc - bodyBottom) * sc, zc + out.z * lift);
  };

  // ── Vega's daisy on the right side: big and flush with it, the monitor's own yellow but glossy, so it
  //    shows by its shine against the matt plastic round it ──
  let daisy: Mesh | null = null;
  const shape = daisySvg ? svgShapes(daisySvg, DIMS.daisy.size) : [];
  if (shape.length) {
    // flush with the side, not raised: a flat shape on its plane, only its finish differs
    const geo = new ShapeGeometry(shape, 8);
    const daisyMat = new MeshPhysicalMaterial({
      color: colors.plastic,
      roughness: 0.18,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    daisy = new Mesh(geo, daisyMat);
    daisy.matrixAutoUpdate = false;
    daisy.matrix.copy(onSide(1, DIMS.daisy.z, DIMS.daisy.y, 0.0003));
  }

  // ── The controller and its cable, on the floor to the front right ──
  const remote = buildRemote(
    { body: colors.plastic, a: colors.remoteA, b: colors.remoteB, letter: colors.remoteLetter, ink: colors.remoteInk, arrow: colors.brand },
    logoSvg,
  );

  // ── The floor: a ShadowMaterial plane at the soles, taking the shadow in Outline Black at
  //    the strength the baked shadow had; the contact darkening on it, baked, right where things meet it ──
  const floorY = -DIMS.feet.h - 0.0005;
  const floorGeo = new PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2).translate(0.5, floorY, -0.6);
  const floorMat = new ShadowMaterial({ color: colors.shadow, opacity: 0.42, depthWrite: false, toneMapped: false });
  // The shadow is strongest where it leaves the monitor and fades as it falls
  // away: its strength eases off with the distance from the monitor's footprint (FADE, body units).
  floorMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec2 vFloor;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFloor = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec2 vFloor;\nvoid main() {').replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `vec2 q = abs(vFloor - vec2(0.0, ${(-DEPTH / 2).toFixed(4)})) - vec2(${(W / 2).toFixed(4)}, ${(DEPTH / 2).toFixed(4)});
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float fade = 1.0 - smoothstep(${FADE[0].toFixed(3)}, ${FADE[1].toFixed(3)}, d);
  gl_FragColor = vec4( color, opacity * fade * ( 1.0 - getShadowMask() ) );`,
    );
  };
  floorMat.customProgramCacheKey = () => 'monitor-floor';
  const floor = new Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.renderOrder = -2;
  const rect = { x0: -0.75, x1: 1.15, z0: -1.15, z1: 0.6 };
  const foot = (x: number, z: number): Blob => ({
    x,
    z,
    rx: ft.r * 2.6,
    rz: ft.r * 2.6,
    stops: [
      [0, 0.5],
      [0.45, 0.32],
      [1, 0],
    ],
  });
  const backX = ft.x * scaleAt(-ft.zBack);
  const contactMat = new MeshBasicMaterial({
    color: colors.shadow,
    map: contactTexture(
      rect,
      [
        // the body's underside, just above the floor: a darkening within its footprint, leaning to the side
        // away from the light (none spills onto the lit left)
        {
          x: 0.04,
          z: -DEPTH / 2 - 0.02,
          rx: 0.44,
          rz: 0.52,
          stops: [
            [0, 0.24],
            [0.78, 0.18],
            [1, 0],
          ],
        },
        foot(-ft.x, -ft.zFront),
        foot(ft.x, -ft.zFront),
        foot(-backX, -ft.zBack),
        foot(backX, -ft.zBack),
        // the controller lies on the floor: a tight band all along its underside
        {
          x: REMOTE.at[0],
          z: REMOTE.at[1] - 0.02 * REMOTE.scale,
          rx: 0.27 * REMOTE.scale,
          rz: 0.13 * REMOTE.scale,
          turn: -REMOTE.turn,
          stops: [
            [0, 0.36],
            [0.7, 0.24],
            [1, 0],
          ],
        },
      ],
      [
        // the cable, where it lies on the floor
        {
          pts: remote.cable.filter((q) => q.y < -DIMS.feet.h + REMOTE.cable.r * 1.6).map((q) => [q.x, q.z] as [number, number]),
          width: REMOTE.cable.r * 3,
          alpha: 0.42,
        },
      ],
    ),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const contactGeo = new BufferGeometry();
  const cy = floorY + 0.0002;
  contactGeo.setAttribute('position', new Float32BufferAttribute([rect.x0, cy, rect.z1, rect.x1, cy, rect.z1, rect.x1, cy, rect.z0, rect.x0, cy, rect.z0], 3));
  contactGeo.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  contactGeo.setIndex([0, 1, 2, 0, 2, 3]);
  // the map's alpha is the darkening; its rgb is white so the colour stays Outline Black
  const contact = new Mesh(contactGeo, contactMat);
  contact.renderOrder = -1;

  // The shadow: only the outer shapes cast (the monitor, the controller, the cable), only the floor takes it.
  const casters = [frame, casing, front, step, back, ...feet, ...remote.meshes];
  for (const m of casters) m.castShadow = true;

  const body = new Group();
  body.add(floor, contact, frame, casing, front, step, back, recess, screen, glass, ...chin, ...feet, remote.group);
  if (daisy) body.add(daisy);
  body.position.set(-CENTRE.x, -CENTRE.y, -CENTRE.z);
  const pivot = new Group();
  pivot.add(body);
  return {
    pivot,
    body,
    frame,
    casing,
    front,
    back,
    recess,
    screen,
    glass,
    daisy,
    power: powerButton!,
    floor,
    contact,
    remote: remote.group,
    casters,
    feet,
    materials: { plastic, bevel, glass: glassMat },
  };
}

/** Proportions measured from the built geometry, for checking the model against its spec. */
export function measure(parts: MonitorParts): Record<string, number> {
  const box = (m: Mesh) => {
    m.geometry.computeBoundingBox();
    return m.geometry.boundingBox!;
  };
  const f = box(parts.frame);
  const pos = parts.casing.geometry.getAttribute('position');
  let backW = 0;
  let backH = 0;
  let frontW = 0;
  let frontH = 0;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < -(DIMS.DEPTH - DIMS.R) + 1e-6) {
      backW = Math.max(backW, 2 * Math.abs(pos.getX(i)));
      backH = Math.max(backH, pos.getY(i));
    } else if (z > -DIMS.frame.depth) {
      frontW = Math.max(frontW, 2 * Math.abs(pos.getX(i)));
      frontH = Math.max(frontH, pos.getY(i));
    }
  }
  const frameW = f.max.x - f.min.x;
  const frameH = f.max.y - f.min.y;
  return {
    frameWidth: frameW,
    frameHeight: frameH,
    heightOverWidth: frameH / frameW,
    depth: DIMS.DEPTH,
    taperWidth: 1 - backW / frontW,
    taperHeight: 1 - (backH - DIMS.frame.step) / (frontH - DIMS.frame.step),
    openingWidth: DIMS.opening.w / frameW,
    openingHeight: DIMS.opening.h / frameH,
    topBezel: DIMS.opening.top / frameH,
    chin: CHIN / frameH,
  };
}
