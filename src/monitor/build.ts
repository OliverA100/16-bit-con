/**
 * The monitor, built in code (no model file): a late-80s all-in-one in the spirit of a compact
 * Macintosh. Every part is its own mesh so the glass can crack and shatter later.
 *
 * Units: the front face is 1 wide (W = 1). x right, y up from the bottom of the casing, z toward the
 * viewer; the front face sits at z = 0 and the back at z = −DEPTH. The casing is a sweep of its
 * rounded-rect outline along z — the inset of the outline follows a quarter circle at the front and
 * back, which rounds those edges with the same radius as the vertical corners, so nothing is sharp —
 * then tapered toward the back about the bottom centre, so it stands flat. The seam and the vents are
 * dips in that sweep; the screen opening is a second sweep (rounded lip, then the recess walls).
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
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type Color,
  type Material,
} from 'three';

export const DIMS = {
  W: 1,
  H: 1,
  DEPTH: 1.05,
  /** The back is this much smaller than the front (x and y, about the bottom centre). */
  TAPER: 0.06,
  /** Every casing edge: the vertical corners and the front and back edges. */
  R: 0.06,
  /** Screen opening: 70 % of the width, 57 % of the height, top bezel 9 % → chin 34 %. */
  opening: { w: 0.7, h: 0.57, top: 0.09, r: 0.035 },
  /** The rounded inner edge of the opening, before the recess walls. */
  lip: 0.015,
  /** The screen's edge sits this far behind the bezel. */
  recess: 0.04,
  /** The tube's cap bulges 3 % of the screen width at its centre. */
  bulge: 0.021,
  glassGap: 0.004,
  seam: { z: 0.22, depth: 0.0028, half: 0.0028 },
  vents: { z: [0.74, 0.79, 0.84, 0.89], half: 0.009, y0: 0.44, y1: 0.8, depth: 0.0045, wall: 0.0035 },
  /** Floppy slot: 45 % of the width, centred 60 % of the chin height above the base. */
  slot: { w: 0.45, h: 0.022, at: 0.6, lip: 0.011, lipDepth: 0.004 },
  button: { r: 0.0225, x: 0.36, h: 0.009 },
  led: { r: 0.0055, x: 0.316 },
  feet: { r: 0.034, h: 0.022, x: 0.38, z: [0.12, 0.93] },
} as const;

export const OPENING_Y = DIMS.H - DIMS.opening.top - DIMS.opening.h / 2; // 0.625
export const CHIN = DIMS.H - DIMS.opening.top - DIMS.opening.h; // 0.34
export const SLOT_Y = CHIN * DIMS.slot.at;
/** Screen aspect (width / height of the opening). */
export const SCREEN_ASPECT = DIMS.opening.w / DIMS.opening.h;
/** The visual centre of the monitor, the pivot for the parallax turn. */
export const CENTRE = { x: 0, y: DIMS.H / 2, z: -DIMS.DEPTH / 2 } as const;

const scaleAt = (z: number) => 1 - DIMS.TAPER * Math.min(1, Math.max(0, -z / DIMS.DEPTH));

interface OutlinePt {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * A rounded rectangle, counter-clockwise from its bottom-right corner, with outward normals.
 * `rightBreaks` / `leftBreaks` add points along the vertical sides (the vents need them).
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
 * along its normals (negative = inward); `extra(pt, ring)` adds a local push (the vents). Indexed
 * and closed around the outline; `facing` 'out' faces the outline's normals, 'in' faces away.
 */
function sweep(
  outline: OutlinePt[],
  rings: { z: number; push: number; v: number }[],
  facing: 'out' | 'in',
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
      pos.push((p.x + p.nx * push) * s, (p.y + p.ny * push) * s, ring.z);
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

/** A flat cap from an outline (deduplicated) with optional holes, at depth z, facing +z or −z. */
function cap(outer: Vector2[], holes: Vector2[][], z: number, facing: 1 | -1): BufferGeometry {
  const dedupe = (pts: Vector2[]) => pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]!) > 1e-9).filter((p, i, a) => i < a.length - 1 || p.distanceTo(a[0]!) > 1e-9);
  const shape = new Shape(dedupe(outer));
  for (const h of holes) shape.holes.push(new Path(dedupe(h)));
  const g = new ShapeGeometry(shape, 24);
  const p = g.getAttribute('position');
  const s = scaleAt(z);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, z);
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
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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

/**
 * The contact shadow, baked once: a tight dark core under the footprint and a soft lobe falling
 * away from the key light, on a transparent plane, so the floor stays the page's own Daisy White.
 */
function shadowTexture(rect: { x0: number; x1: number; z0: number; z1: number }, lobe: { x: number; z: number; rx: number; rz: number; a: number }): CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const toPx = (x: number, z: number): [number, number] => [((x - rect.x0) / (rect.x1 - rect.x0)) * S, (1 - (z - rect.z0) / (rect.z1 - rect.z0)) * S];
  const blob = (x: number, z: number, rx: number, rz: number, stops: [number, number][]) => {
    const [px, py] = toPx(x, z);
    const sx = (rx / (rect.x1 - rect.x0)) * S;
    const sy = (rz / (rect.z1 - rect.z0)) * S;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };
  // the soft lobe first, then the contact core on top of it
  blob(lobe.x, lobe.z, lobe.rx, lobe.rz, [
    [0, lobe.a],
    [0.45, lobe.a * 0.6],
    [1, 0],
  ]);
  blob(0, -DIMS.DEPTH / 2, 0.6, 0.64, [
    [0, 0.62],
    [0.7, 0.52],
    [0.88, 0.2],
    [1, 0],
  ]);
  // the contact itself: a tight, darker band right under the base, densest on the side away from the key
  blob(0.12, -DIMS.DEPTH / 2 + 0.02, 0.55, 0.57, [
    [0, 0.3],
    [0.85, 0.24],
    [1, 0],
  ]);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface MonitorColors {
  plastic: Color;
  bevel: Color;
  slot: Color;
  button: Color;
  led: Color;
  shadow: Color;
}

export interface MonitorParts {
  /** Turns with the parallax; its origin is the monitor's visual centre. */
  pivot: Group;
  body: Group;
  casing: Mesh;
  front: Mesh;
  back: Mesh;
  recess: Mesh;
  screen: Mesh;
  glass: Mesh;
  shadow: Mesh;
  feet: Mesh[];
  materials: { plastic: MeshPhysicalMaterial; bevel: MeshPhysicalMaterial; glass: MeshPhysicalMaterial };
}

/** Build every mesh; the screen gets its own material from the caller (the CRT shader). */
export function buildMonitor(colors: MonitorColors, screenMaterial: Material): MonitorParts {
  const { R, W, H, DEPTH, opening: O } = DIMS;

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
  const slotMat = new MeshStandardMaterial({ color: colors.slot, roughness: 0.85, metalness: 0 });
  const buttonMat = new MeshPhysicalMaterial({ color: colors.button, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const ledMat = new MeshStandardMaterial({ color: colors.led, emissive: colors.led, emissiveIntensity: 1.4, roughness: 0.3 });
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

  // ── Casing: one sweep, front and back edges rounded by R, the seam and the vents as dips ──
  const vent = DIMS.vents;
  // Guard rows and rings a hair outside every groove: without them the grooves' tilted normals are
  // averaged into the long flat quads beside them and shade the whole side in streaks.
  const GUARD = 0.002;
  const sideBreaks = [vent.y0 - GUARD, vent.y0, vent.y0 + vent.wall, vent.y1 - vent.wall, vent.y1, vent.y1 + GUARD];
  const outline = roundedRect(0, H / 2, W, H, R, 10, sideBreaks);
  const rings: { z: number; push: number; v: number }[] = [];
  const edgeSeg = 10;
  for (let i = 0; i <= edgeSeg; i++) {
    const a = (i / edgeSeg) * (Math.PI / 2);
    rings.push({ z: -R * (1 - Math.cos(a)), push: -R * (1 - Math.sin(a)), v: 0 });
  }
  const seam = DIMS.seam;
  const mid: { z: number; push: number }[] = [
    { z: -(seam.z - seam.half - GUARD), push: 0 },
    { z: -(seam.z - seam.half), push: 0 },
    { z: -seam.z, push: -seam.depth },
    { z: -(seam.z + seam.half), push: 0 },
    { z: -(seam.z + seam.half + GUARD), push: 0 },
  ];
  const ventRing: number[] = [];
  for (const vz of vent.z) {
    for (const [dz, deep] of [
      [-vent.half - GUARD, false],
      [-vent.half, false],
      [-vent.half + vent.wall, true],
      [vent.half - vent.wall, true],
      [vent.half, false],
      [vent.half + GUARD, false],
    ] as const) {
      mid.push({ z: -(vz + dz), push: 0 });
      if (deep) ventRing.push(mid.length - 1);
    }
  }
  const ventRingZ = new Set(ventRing.map((i) => mid[i]!.z));
  for (const m of mid.sort((a, b) => b.z - a.z)) rings.push({ ...m, v: 0 });
  for (let i = 0; i <= edgeSeg; i++) {
    const a = (i / edgeSeg) * (Math.PI / 2);
    rings.push({ z: -(DEPTH - R) - R * Math.sin(a), push: -R * (1 - Math.cos(a)), v: 0 });
  }
  rings.forEach((r) => (r.v = -r.z / DEPTH));
  const ventDeep = (p: OutlinePt, ri: number) => {
    const r = rings[ri]!;
    if (!ventRingZ.has(r.z)) return 0;
    if (Math.abs(p.nx) !== 1) return 0;
    return p.y > vent.y0 + 1e-6 && p.y < vent.y1 - 1e-6 ? -vent.depth : 0;
  };
  const casing = new Mesh(sweep(outline, rings, 'out', ventDeep), plastic);

  // ── Front face (with the opening, widened by the lip) and back face ──
  const frontRing = outline.map((p) => new Vector2(p.x - p.nx * R, p.y - p.ny * R));
  const openOutline = roundedRect(0, OPENING_Y, O.w, O.h, O.r, 8);
  const hole = openOutline.map((p) => new Vector2(p.x + p.nx * DIMS.lip, p.y + p.ny * DIMS.lip));
  const front = new Mesh(cap(frontRing, [hole], 0, 1), plastic);
  const back = new Mesh(cap(frontRing, [], -DEPTH, -1), plastic);

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
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const cx = Math.min(1, Math.abs(x) / (O.w / 2));
      const cy = Math.min(1, Math.abs(y) / (O.h / 2));
      const z = -DIMS.recess + DIMS.glassGap + DIMS.bulge * (1 - cx * cx) * (1 - cy * cy);
      const s = scaleAt(z);
      p.setXYZ(i, x * s, (y + OPENING_Y) * s, z);
    }
    glassGeo.computeVertexNormals();
  }
  const glass = new Mesh(glassGeo, glassMat);
  glass.renderOrder = 2;

  // ── Chin: the floppy slot in its lip, the power button, the LED ──
  const S = DIMS.slot;
  const lipShape = new Shape();
  {
    const o = roundedRect(0, 0, S.w + 2 * S.lip, S.h + 2 * S.lip, (S.h + 2 * S.lip) / 2 - 0.002, 6).map((p) => new Vector2(p.x, p.y));
    lipShape.setFromPoints(o);
    lipShape.holes.push(new Path(roundedRect(0, 0, S.w, S.h, 0.004, 4).map((p) => new Vector2(p.x, p.y))));
  }
  const slotLip = new Mesh(
    new ExtrudeGeometry(lipShape, { depth: S.lipDepth, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 3, curveSegments: 8 }),
    plastic,
  );
  slotLip.position.set(0, SLOT_Y, -0.0018);
  const slot = new Mesh(new PlaneGeometry(S.w, S.h), slotMat);
  slot.position.set(0, SLOT_Y, 0.0012);
  const button = new Mesh(new LatheGeometry(dome(DIMS.button.r, DIMS.button.h), 40), buttonMat);
  button.rotation.x = Math.PI / 2;
  button.position.set(DIMS.button.x, SLOT_Y, 0);
  const led = new Mesh(new SphereGeometry(DIMS.led.r, 16, 10), ledMat);
  led.scale.z = 0.45;
  led.position.set(DIMS.led.x, SLOT_Y, 0.0008);

  // ── Feet ──
  const feet: Mesh[] = [];
  // hanging down from the casing's underside: mirrored, and reversed so it still faces outward
  const footGeo = new LatheGeometry(
    dome(DIMS.feet.r, DIMS.feet.h)
      .map((p) => new Vector2(p.x, -p.y))
      .reverse(),
    28,
  );
  for (const fz of DIMS.feet.z)
    for (const sx of [-1, 1]) {
      const m = new Mesh(footGeo, plastic);
      m.position.set(sx * DIMS.feet.x * scaleAt(-fz), 0, -fz);
      feet.push(m);
    }

  // ── Contact shadow on the floor, under the feet ──
  const rect = { x0: -1.2, x1: 1.9, z0: -1.9, z1: 0.9 };
  const shadowGeo = new BufferGeometry();
  const fy = -DIMS.feet.h - 0.0005;
  shadowGeo.setAttribute(
    'position',
    new Float32BufferAttribute([rect.x0, fy, rect.z1, rect.x1, fy, rect.z1, rect.x1, fy, rect.z0, rect.x0, fy, rect.z0], 3),
  );
  shadowGeo.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  shadowGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const shadowMat = new MeshBasicMaterial({
    color: colors.shadow,
    map: shadowTexture(rect, { x: 0.55, z: -0.75, rx: 1.0, rz: 0.75, a: 0.42 }),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  // the map's alpha is the shadow; its rgb is white so the colour stays Outline Black
  const shadow = new Mesh(shadowGeo, shadowMat);
  shadow.renderOrder = -1;

  const body = new Group();
  body.add(casing, front, back, recess, screen, glass, slotLip, slot, button, led, ...feet, shadow);
  body.position.set(-CENTRE.x, -CENTRE.y, -CENTRE.z);
  const pivot = new Group();
  pivot.add(body);
  return { pivot, body, casing, front, back, recess, screen, glass, shadow, feet, materials: { plastic, bevel, glass: glassMat } };
}

/** Proportions measured from the built geometry, for the review table. */
export function measure(parts: MonitorParts): Record<string, number> {
  const pos = parts.casing.geometry.getAttribute('position');
  let frontW = 0;
  let backW = 0;
  let maxH = 0;
  let backH = 0;
  let minZ = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i));
    const y = pos.getY(i);
    const z = pos.getZ(i);
    minZ = Math.min(minZ, z);
    if (z > -DIMS.R - 1e-6) frontW = Math.max(frontW, 2 * x);
    if (z > -DIMS.R - 1e-6) maxH = Math.max(maxH, y);
    if (z < -(DIMS.DEPTH - DIMS.R) + 1e-6) {
      backW = Math.max(backW, 2 * x);
      backH = Math.max(backH, y);
    }
  }
  const rp = parts.recess.geometry.getAttribute('position');
  let ox0 = Infinity;
  let ox1 = -Infinity;
  let oy0 = Infinity;
  let oy1 = -Infinity;
  for (let i = 0; i < rp.count; i++) {
    if (Math.abs(rp.getZ(i) + DIMS.lip) > 1e-6) continue; // the ring where the lip meets the walls
    ox0 = Math.min(ox0, rp.getX(i));
    ox1 = Math.max(ox1, rp.getX(i));
    oy0 = Math.min(oy0, rp.getY(i));
    oy1 = Math.max(oy1, rp.getY(i));
  }
  return {
    frontWidth: frontW,
    frontHeight: maxH,
    depth: -minZ,
    depthOverWidth: -minZ / frontW,
    taperWidth: 1 - backW / frontW,
    taperHeight: 1 - backH / maxH,
    openingWidth: (ox1 - ox0) / frontW,
    openingHeight: (oy1 - oy0) / maxH,
    topBezel: (maxH - oy1) / maxH,
    chin: oy0 / maxH,
    openingCentreX: (ox0 + ox1) / 2,
    edgeRadius: DIMS.R,
    recess: DIMS.recess,
    bulgeOverScreenWidth: DIMS.bulge / DIMS.opening.w,
    slotWidth: DIMS.slot.w / frontW,
    slotAtChin: SLOT_Y / oy0,
  };
}
