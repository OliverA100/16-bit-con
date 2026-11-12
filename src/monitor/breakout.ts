/**
 * The breakout on the real monitor. The glass cracks in six cumulative stages
 * from where Sam stands on the screen; then he jumps through it. It shatters round him all at once:
 * every piece of clear glass thrown its own way at its own speed — about half the small ones round his
 * spot, which he punches out, at the viewer and past the camera; the rest out and down — tumbling,
 * glinting, falling, bouncing (a big piece breaks again where it lands) and coming to rest on the floor
 * round the monitor, with a dust of fine glass. A jagged rim
 * stays in the frame — the same glass as the shards, its broken edge as thick and as lit as theirs —
 * and the tube behind it shows static. Sam is a billboard from then on — his own
 * pixels, nearest-filtered — leaping on toward the viewer until he is a whole number of device px per
 * art px on the page, where the page takes him over.
 *
 * One crack pattern per layout (Sam's spot on the screen moves with the viewport), a planar graph:
 * rays from the impact point to the edge, four rings joining them and a jagged rim just in from the
 * edge. Every edge is one jagged path, used three times — drawn as the crack, the outline of the shard
 * on each side of it, the rim's inner edge — so what breaks is exactly what cracked. The cracks are thin
 * ribbons on the glass, each segment carrying its stage, so the overlay shows stage ≤ n with no redraw
 * and laying a pattern out costs a millisecond or two.
 * Everything moves as a pure function of the breakout's progress, so scrolling back un-breaks it.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Points,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  type Camera,
  type Texture,
} from 'three';
import { readToken } from '../game/palette';
import type { MonitorParts } from './build';
import type { CrtMaterial } from './crt';
import { REMOTE } from './remote';
import { DIMS, OPENING_Y, scaleAt } from './spec';
import { mulberry32 } from '../lib/math';

const O = DIMS.opening;
const ASPECT = O.w / O.h;
/**
 * The pattern: rays from the impact point to the screen's edge, four rings joining them (radii in
 * screen heights, or a share of the way to the rim on short rays) and the rim — a jagged band `inset`
 * in from the edge that stays when everything inside it has gone.
 */
const PATTERN = { rays: 12, rings: [0.075, 0.17, 0.3, 0.48], share: [0.2, 0.4, 0.6, 0.8], inset: 0.07, bend: 0.12, jag: 0.25, seed: 630 } as const;
/** Which rays crack first: four at the first hit, four more as the third ring forms. */
const FIRST = new Set([0, 3, 6, 9]);
const SECOND = new Set([1, 5, 8, 10]);
/** A crack's path: a point every `step` (screen heights), wandering off the straight line by up to `amp`. */
const PATH = { step: 0.009, amp: 0.0055 } as const;
/** A crack's ribbon: its half-width on the glass (screen heights; ~2 px at rest), the bright core within it and the shadow beside it. */
const CRACK_HALF = 0.0052;
/** Sam stands just in front of the picture. */
const SAM_LIFT = 0.002;
/** The glass: its thickness, and how far in front of the picture it is. */
const THICK = 0.003;
/**
 * The break, in seconds of its own clock over the shatter (0–1 of it): gravity in monitor heights
 * per s², the floor (the feet's soles), each piece's single bounce (restitution, what the floor keeps
 * of its speed along the floor) and its slide to rest; a piece landing further out than `far` in front
 * or `wide` to the side has flown out of the frame.
 */
const FALL = { time: 1.1, g: 14, floor: -DIMS.feet.h, bounce: 0.3, keep: 0.45, slide: 0.07, far: 2.2, wide: 2 } as const;
/**
 * The pieces that fly at the viewer: about half of the small ones round the impact, which Sam punches
 * out. Each is aimed beside the camera (body units off it, along its right and up, out the way it was
 * going), flies there at its own speed (body units a second) on a flat arc (gravity, monitor heights per
 * s²), tumbling, and is gone as it passes out of view (a share of the way there).
 */
const FLY = { share: 0.5, speed: [7, 15], aim: [0.18, 0.8], g: 3, turns: [4, 12], gone: 0.92 } as const;
/**
 * A big piece (area in the screen's own units) that lands in view breaks again where it hits the floor,
 * with this chance: in two, and the bigger half again if it is still big, along a jagged crack; the
 * pieces hop apart (up, and out from where they were in it, body units a second) with a spray of fine glass.
 */
const AGAIN = { area: 0.02, chance: 0.7, again: 0.014, hop: [0.35, 1], spread: [0.25, 0.75], grains: 10 } as const;
/** Fine glass dust from the impact: how many grains, and their size in px of the canvas. */
const DUST = { count: 90, size: [1.2, 2.6] } as const;

/** Normalised screen space: x 0–ASPECT, y 0–1 upward (the screen's own UV, x scaled to keep distances true). */
type P2 = [number, number];
interface Edge {
  a: number;
  b: number;
  stage: number;
  /** From a to b, jagged, both ends included. */
  path: P2[];
  /** In the rim (the glass that stays once the shards have gone): its cracks stay too. */
  rim: boolean;
  /** Cracked before the break (else only where it breaks: the outer rings are partial arcs, as in real glass). */
  drawn: boolean;
}
interface Pattern {
  impact: P2;
  pts: P2[];
  edges: Edge[];
  /** Each shard's outline: its edges in order, and whether each runs forward (a → b). */
  cells: { loop: [number, boolean][]; inner: boolean }[];
  /** Hairline cracks and the crushed glass at the impact: drawn, not cut. */
  extra: { path: P2[]; stage: number; core: number }[];
  /** The rim's inner edge, closed. */
  rim: P2[];
}

const inRect = (p: P2): P2 => [Math.min(ASPECT, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))];

/** How far from p along the unit direction d the edge of the screen, inset by m, is. */
function toEdge(p: P2, d: P2, m = 0): number {
  let t = Infinity;
  if (d[0] > 1e-6) t = Math.min(t, (ASPECT - m - p[0]) / d[0]);
  if (d[0] < -1e-6) t = Math.min(t, (m - p[0]) / d[0]);
  if (d[1] > 1e-6) t = Math.min(t, (1 - m - p[1]) / d[1]);
  if (d[1] < -1e-6) t = Math.min(t, (m - p[1]) / d[1]);
  return Math.max(0, t);
}

/** A crack from a to b: a point every PATH.step, each pushed off the line by a wandering amount, the ends exact. */
function jagged(a: P2, b: P2, rnd: () => number, amp: number = PATH.amp): P2[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(len / PATH.step));
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  const out: P2[] = [a];
  let o = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    o = 0.55 * o + 0.45 * (rnd() * 2 - 1);
    const k = amp * o * Math.sin(Math.PI * t);
    out.push(inRect([a[0] + dx * t + nx * k, a[1] + dy * t + ny * k]));
  }
  out.push(b);
  return out;
}

function makePattern(impact: P2): Pattern {
  const rnd = mulberry32(PATTERN.seed);
  const N = PATTERN.rays;
  const L = PATTERN.rings.length; // ring levels 1–L, the rim L + 1, the edge L + 2
  const pts: P2[] = [impact];
  /** rays[i][level] → point index; level 0 is the impact. */
  const rays: number[][] = [];
  for (let i = 0; i < N; i++) {
    const base = (2 * Math.PI * i) / N + (rnd() - 0.5) * (Math.PI / N);
    const d: P2 = [Math.cos(base), Math.sin(base)];
    const rim = toEdge(impact, d, PATTERN.inset * (0.7 + 0.6 * rnd()));
    const idx = [0];
    for (let k = 0; k <= L; k++) {
      const rad = k < L ? Math.min(PATTERN.rings[k]!, PATTERN.share[k]! * rim) : rim;
      const a = base + (rnd() - 0.5) * PATTERN.bend;
      idx.push(pts.push(inRect([impact[0] + rad * Math.cos(a), impact[1] + rad * Math.sin(a)])) - 1);
    }
    const a = base + (rnd() - 0.5) * PATTERN.bend;
    const e: P2 = [Math.cos(a), Math.sin(a)];
    const last = pts[idx[idx.length - 1]!]!;
    const t = toEdge(last, e);
    idx.push(pts.push(inRect([last[0] + t * e[0], last[1] + t * e[1]])) - 1);
    rays.push(idx);
  }
  // the jags between neighbouring rays on each ring and on the rim
  const jags: number[][] = [];
  for (let k = 1; k <= L + 1; k++) {
    jags[k] = rays.map((r, i) => {
      const a = pts[r[k]!]!;
      const b = pts[rays[(i + 1) % N]![k]!]!;
      const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const out: P2 = [m[0] - impact[0], m[1] - impact[1]];
      const len = Math.hypot(out[0], out[1]) || 1;
      const j = (rnd() - 0.5) * PATTERN.jag * Math.min(len, Math.hypot(b[0] - a[0], b[1] - a[1]));
      return pts.push(inRect([m[0] + (out[0] / len) * j, m[1] + (out[1] / len) * j])) - 1;
    });
  }
  const edges: Edge[] = [];
  const edge = (a: number, b: number, stage: number, rim = false, drawn = true) =>
    edges.push({ a, b, stage, path: jagged(pts[a]!, pts[b]!, rnd), rim, drawn }) - 1;
  // rays: impact → ring 1 → … → ring L → rim → edge
  const rayEdge: number[][] = rays.map((r, i) => {
    const s = FIRST.has(i) ? 0 : SECOND.has(i) ? 1 : 2;
    const stages = [s === 0 ? 1 : 2, s === 0 ? 2 : 3, s < 2 ? 3 : 4, s === 0 ? 4 : 5, s === 0 ? 5 : 6, 6];
    return stages.map((st, k) => edge(r[k]!, r[k + 1]!, st, k === stages.length - 1));
  });
  // rings and the rim: ray i → jag → ray i + 1
  const ringStage = [0, 3, 4, 5, 6, 6];
  const ringEdge: [number, number][][] = [];
  for (let k = 1; k <= L + 1; k++) {
    ringEdge[k] = rays.map((r, i) => {
      const st = k === 3 && i % 2 ? 6 : ringStage[k]!;
      // the outer rings crack in arcs, not whole loops
      const drawn = k < 3 || k === L + 1 || rnd() < 0.55;
      return [edge(r[k]!, jags[k]![i]!, st, k === L + 1, drawn), edge(jags[k]![i]!, rays[(i + 1) % N]![k]!, st, k === L + 1, drawn)];
    });
  }
  // the shards: inside the rim, between neighbouring rays and successive rings
  const cells: Pattern['cells'] = [];
  for (let i = 0; i < N; i++) {
    const n = (i + 1) % N;
    cells.push({
      inner: true,
      loop: [
        [rayEdge[i]![0]!, true],
        [ringEdge[1]![i]![0], true],
        [ringEdge[1]![i]![1], true],
        [rayEdge[n]![0]!, false],
      ],
    });
    for (let k = 1; k <= L; k++) {
      cells.push({
        inner: k === 1,
        loop: [
          [ringEdge[k]![i]![0], true],
          [ringEdge[k]![i]![1], true],
          [rayEdge[n]![k]!, true],
          [ringEdge[k + 1]![i]![1], false],
          [ringEdge[k + 1]![i]![0], false],
          [rayEdge[i]![k]!, false],
        ],
      });
    }
  }
  // hairline cracks off the rays, and the crushed glass at the impact
  const extra: Pattern['extra'] = [];
  rayEdge.forEach((es) =>
    es.slice(1, L + 1).forEach((ei) => {
      if (rnd() > 0.6) return;
      const e = edges[ei]!;
      const from = e.path[Math.floor(rnd() * (e.path.length - 2)) + 1]!;
      const a0 = Math.atan2(pts[e.b]![1] - pts[e.a]![1], pts[e.b]![0] - pts[e.a]![0]) + (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.5);
      const len = 0.02 + rnd() * 0.045;
      const to = inRect([from[0] + len * Math.cos(a0), from[1] + len * Math.sin(a0)]);
      extra.push({ path: jagged(from, to, rnd, PATH.amp * 0.6), stage: Math.min(6, e.stage + 1), core: 0.7 });
    }),
  );
  for (let i = 0; i < 14; i++) {
    const a0 = rnd() * 2 * Math.PI;
    const len = 0.008 + rnd() * 0.022;
    extra.push({ path: jagged(impact, inRect([impact[0] + len * Math.cos(a0), impact[1] + len * Math.sin(a0)]), rnd, PATH.amp * 0.4), stage: 1, core: 0.85 });
  }
  // the rim's inner edge
  const rim: P2[] = [];
  for (let i = 0; i < N; i++) for (const ei of ringEdge[L + 1]![i]!) rim.push(...edges[ei]!.path.slice(0, -1));
  return { impact, pts, edges, cells, extra, rim };
}

/** A cell's outline: its edges' paths joined, each the right way round. */
function outline(p: Pattern, loop: [number, boolean][]): P2[] {
  const out: P2[] = [];
  for (const [ei, fwd] of loop) {
    const path = p.edges[ei]!.path;
    const run = fwd ? path : [...path].reverse();
    out.push(...run.slice(0, -1));
  }
  return out;
}

/** A polygon's area, signed: positive when it runs counter-clockwise. */
function signedArea(q: P2[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    const r = q[(i + 1) % q.length]!;
    a += p[0] * r[1] - r[0] * p[1];
  }
  return a / 2;
}

/**
 * A piece cracked in two: a jagged crack through its middle at a random angle, both sides sharing it.
 * Null when no clean cut is found (a line crossing the outline more than twice, or a sliver off one side).
 */
function cut(poly: P2[], rnd: () => number): [P2[], P2[]] | null {
  const n = poly.length;
  const c: P2 = [0, 0];
  for (const q of poly) {
    c[0] += q[0] / n;
    c[1] += q[1] / n;
  }
  const whole = Math.abs(signedArea(poly));
  for (let tries = 0; tries < 8; tries++) {
    const a = rnd() * Math.PI;
    const d: P2 = [Math.cos(a), Math.sin(a)];
    const o: P2 = [c[0] + (rnd() - 0.5) * 0.012, c[1] + (rnd() - 0.5) * 0.012];
    const side = (q: P2) => d[0] * (q[1] - o[1]) - d[1] * (q[0] - o[0]);
    const hits: { i: number; at: P2 }[] = [];
    for (let i = 0; i < n; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % n]!;
      const sp = side(p);
      const sq = side(q);
      if (sp < 0 !== sq < 0) {
        const t = sp / (sp - sq);
        hits.push({ i, at: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] });
      }
    }
    if (hits.length !== 2) continue;
    const [h1, h2] = hits as [(typeof hits)[0], (typeof hits)[0]];
    const crack = jagged(h1.at, h2.at, rnd, PATH.amp * 0.8).slice(1, -1);
    const one: P2[] = [h1.at];
    for (let k = h1.i + 1; k <= h2.i; k++) one.push(poly[k]!);
    one.push(h2.at, ...[...crack].reverse());
    const two: P2[] = [h2.at];
    for (let k = h2.i + 1; k <= h1.i + n; k++) two.push(poly[k % n]!);
    two.push(h1.at, ...crack);
    if (Math.min(Math.abs(signedArea(one)), Math.abs(signedArea(two))) < 0.25 * whole) continue;
    return [one, two];
  }
  return null;
}

/**
 * The cracks as ribbons on the glass: one quad per segment of each path, `across` −1…1 over its width,
 * with its stage, how much light it catches (uneven along a crack) and whether it is in the rim.
 */
function ribbons(p: Pattern, onGlass: (q: P2) => Vector3): BufferGeometry {
  const pos: number[] = [];
  const across: number[] = [];
  const stage: number[] = [];
  const glow: number[] = [];
  const rim: number[] = [];
  const rnd = mulberry32(PATTERN.seed + 7);
  const lift = 0.0004;
  const ribbon = (path: P2[], st: number, half: number, inRim: boolean) => {
    for (let j = 0; j < path.length - 1; j++) {
      const a = path[j]!;
      const b = path[j + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      const g = 0.55 + 0.45 * rnd();
      const c = [
        [a[0] + nx, a[1] + ny, 1],
        [a[0] - nx, a[1] - ny, -1],
        [b[0] + nx, b[1] + ny, 1],
        [b[0] - nx, b[1] - ny, -1],
      ] as const;
      for (const k of [0, 1, 2, 2, 1, 3]) {
        const v = onGlass([c[k]![0], c[k]![1]]);
        pos.push(v.x, v.y, v.z + lift);
        across.push(c[k]![2]);
        stage.push(st);
        glow.push(g);
        rim.push(inRim ? 1 : 0);
      }
    }
  };
  for (const e of p.edges) if (e.drawn) ribbon(e.path, e.stage, CRACK_HALF, e.rim);
  for (const x of p.extra) ribbon(x.path, x.stage, CRACK_HALF * x.core, false);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
  g.setAttribute('aStage', new Float32BufferAttribute(stage, 1));
  g.setAttribute('aGlow', new Float32BufferAttribute(glow, 1));
  g.setAttribute('aRim', new Float32BufferAttribute(rim, 1));
  g.computeBoundingSphere();
  return g;
}

const crackVertex = /* glsl */ `
attribute float aAcross;
attribute float aStage;
attribute float aGlow;
attribute float aRim;
varying float vAcross;
varying float vStage;
varying float vGlow;
varying float vRim;
void main() {
  vAcross = aAcross;
  vStage = aStage;
  vGlow = aGlow;
  vRim = aRim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const crackFragment = /* glsl */ `
uniform float uStage;
uniform float uRimOnly;
uniform vec3 uDark;
uniform vec3 uLight;
varying float vAcross;
varying float vStage;
varying float vGlow;
varying float vRim;
void main() {
  if (vStage > uStage + 0.5) discard;
  // once the shards have gone, only the rim keeps its cracks
  if (uRimOnly > 0.5 && vRim < 0.5) discard;
  // light caught in the break down its middle, a faint shadow along one side (never a dark line)
  float bright = (1.0 - smoothstep(0.28, 0.5, abs(vAcross))) * vGlow;
  float dark = smoothstep(0.38, 0.55, -vAcross) * (1.0 - smoothstep(0.8, 1.0, -vAcross));
  float a = max(bright, dark * 0.22);
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(uDark, uLight, bright / max(bright + dark, 1e-3)), a);
  #include <colorspace_fragment>
}
`;

/** Fine glass dust: each grain thrown from the impact, falling, and lying on the floor where it lands, glinting. */
const dustVertex = /* glsl */ `
uniform float uT;
uniform float uG;
uniform float uFloor;
uniform float uPx;
attribute vec3 aVel;
attribute float aSize;
attribute float aSeed;
attribute float aStart;
varying float vLife;
varying float vSeed;
void main() {
  // its own clock: from the break, or from where a big piece broke again on the floor
  float tt = uT - aStart;
  float down = uFloor - position.y;
  float hit = (aVel.y + sqrt(aVel.y * aVel.y + 2.0 * uG * max(0.0, -down))) / uG;
  float t = clamp(tt, 0.0, hit);
  vec3 p = position + aVel * t;
  p.y -= 0.5 * uG * t * t;
  p.y = max(p.y, uFloor);
  vLife = tt >= hit ? 1.0 : 0.0;
  vSeed = aSeed;
  gl_Position = tt < 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = tt < 0.0 ? 0.0 : aSize * uPx;
}
`;
const dustFragment = /* glsl */ `
uniform float uT;
uniform vec3 uColor;
varying float vLife;
varying float vSeed;
void main() {
  // a glint: bright in flight, a faint twinkle once it lies on the floor. Light only, in display colours:
  // premultiplied, it hides a fifth of what it adds (more and the page greys under each grain)
  float tw = 0.5 + 0.5 * sin(vSeed * 40.0 + uT * 30.0);
  float a = mix(0.55 + 0.45 * tw, 0.18 + 0.4 * step(0.82, fract(vSeed * 7.0)), vLife);
  gl_FragColor = vec4(uColor * a, 0.2 * a);
}
`;

/**
 * Glossy clear glass for the shards, composed by hand in display colours (three's physical material
 * spreads the key light over a small, turning piece and makes it a white card). A piece is clear: what
 * is behind it shows through (Schlick-Fresnel: 96 % face-on, less toward grazing), and over that it
 * reflects a room round the monitor — walls in the page's own light, tall windows behind the monitor,
 * rows of ceiling lights and a big softbox behind the viewer where the key light comes from. Each face
 * is very slightly curved (its normal leans out toward its outline, worked out per pixel), so a
 * reflection runs across a piece as it turns instead of lighting it all at once. The light sources show
 * even face-on, as bright patches, and the key light leaves a hot glint. The broken edges, and a thin
 * line along each face's outline, are light caught in the break: always lighter than what is behind,
 * never dark. Both faces are drawn. Premultiplied: the colour is the light the glass sends back, alpha
 * what it hides.
 */
const glassVertex = /* glsl */ `
attribute vec2 aLocal;
attribute float aOut;
attribute float aEdge;
#ifdef RIM
varying vec2 vUv;
#endif
varying float vEdge;
varying vec3 vN;
varying vec3 vTx;
varying vec3 vTy;
varying vec2 vLocal;
varying float vOut;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vN = normalMatrix * normal;
  vTx = normalMatrix * vec3(1.0, 0.0, 0.0);
  vTy = normalMatrix * vec3(0.0, 1.0, 0.0);
#ifdef RIM
  // the rim's face: the pane itself (its own curve, no lean), cut by the rim's mask
  vUv = uv;
  vLocal = vec2(0.0);
  vOut = 0.0;
  vEdge = 0.0;
#else
  vLocal = aLocal;
  vOut = aOut;
  vEdge = aEdge;
#endif
  gl_Position = projectionMatrix * mv;
}
`;
const glassFragment = /* glsl */ `
uniform vec3 uKey;
uniform vec3 uPage;
uniform vec3 uSky;
uniform vec3 uSkyHigh;
uniform float uLean;
#ifdef RIM
uniform sampler2D uRimMask;
varying vec2 vUv;
#endif
varying float vEdge;
varying vec3 vN;
varying vec3 vTx;
varying vec3 vTy;
varying vec2 vLocal;
varying float vOut;
varying vec3 vView;
// The room as the glass reflects it (view space, display colours): rgb, and a how much of it is a light.
vec4 room(vec3 r) {
  vec3 c = uPage * mix(0.88, 1.0, smoothstep(-0.45, 0.35, r.y));
  float lit = 0.0;
  // rows of lights across the ceiling, every ~19° of elevation, from ~15° up
  if (r.y > 0.2) {
    float row = abs(fract(asin(r.y) * 3.0) - 0.5);
    lit += smoothstep(0.38, 0.44, row) * smoothstep(0.2, 0.4, r.y) * step(abs(r.x), 0.75);
  }
  // tall windows behind the monitor, sky in them, white toward the horizon, framed
  if (r.z < -0.05) {
    float u = r.x / -r.z;
    float h = r.y / -r.z;
    float inWin = smoothstep(-0.12, -0.08, h) * (1.0 - smoothstep(0.62, 0.66, h));
    float mull = smoothstep(0.455, 0.47, abs(fract(u * 1.4) - 0.5));
    vec3 sky = mix(mix(vec3(1.0), uSky, smoothstep(-0.2, 0.15, h)), uSkyHigh, smoothstep(0.25, 0.7, h));
    c = mix(c, mix(sky, uPage * 0.84, clamp(mull, 0.0, 1.0)), inWin);
  }
  // the softbox behind the viewer, up and to the left: a soft-edged panel
  float k = dot(r, uKey);
  if (k > 0.0) {
    vec3 ax = normalize(cross(uKey, vec3(0.0, 1.0, 0.0)));
    vec3 ay = cross(ax, uKey);
    vec2 q = vec2(dot(r, ax), dot(r, ay)) / k;
    lit += (1.0 - smoothstep(0.42, 0.5, abs(q.x))) * (1.0 - smoothstep(0.28, 0.36, abs(q.y)));
  }
  lit = clamp(lit, 0.0, 1.0);
  return vec4(mix(c, vec3(1.0), lit), lit);
}
void main() {
#ifdef RIM
  // the mask: 1 keeps the glass, 0 is the hole the shards left, a band in between runs along the broken edge
  float mask = texture2D(uRimMask, vUv).r;
  if (mask < 0.5) discard;
#endif
  vec3 v = normalize(vView);
  // the side of the piece toward the viewer, whichever way its outline winds
  float toward = dot(vN, v) < 0.0 ? -1.0 : 1.0;
  vec3 n = toward * normalize(normalize(vN) + uLean * (vLocal.x * normalize(vTx) + vLocal.y * normalize(vTy)));
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 4.0);
  vec3 r = reflect(-v, n);
  vec4 env = room(r);
  float glint = pow(max(dot(r, uKey), 0.0), 700.0) * 2.0;
  // the face: clear, a breath of the sky's tint, the room over it, the lights even face-on
  float a = F + 0.025;
  vec3 col = env.rgb * F + uSky * 0.025 + vec3(env.a * (0.16 + 0.5 * F) + glint);
  // the light caught in the break: the broken edges, and a line along each face's outline
  float line = vEdge > 0.5 ? 0.7 + 0.5 * max(dot(n, uKey), 0.0) : 1.0 - smoothstep(0.0, fwidth(vOut) * 2.0, 1.0 - vOut);
#ifdef RIM
  // the face's line along its broken edge, as on a shard's face
  line = 1.0 - smoothstep(0.8, 0.95, mask);
#endif
  float e = clamp((vEdge > 0.5 ? 0.42 : 0.5) * line, 0.0, 0.7);
  col = vec3(e) + col * (1.0 - e);
  a = e + a * (1.0 - e);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

/** A falling piece's path, worked out ahead: thrown, to the floor, one bounce, a slide to rest. */
interface Fall {
  v: Vector3;
  t1: number;
  t2: number;
  hit: Vector3;
  bounceV: number;
  slideV: Vector3;
  rest: Vector3;
  restQ: Quaternion;
  /** Lands out of the frame: gone once it is down. */
  gone: boolean;
}

interface Shard {
  mesh: Mesh;
  /** Its centre on the glass, in the monitor's body space. */
  at: Vector3;
  /** Its spin: the axis, and radians a second. */
  axis: Vector3;
  turns: number;
  /** Flying at the viewer: aimed beside the camera (along its right and up, body units) at a speed (units a second). */
  fly: { aim: [number, number]; speed: number } | null;
  /** Falling: from p0, turned q0, from t0 of the break's clock (a piece broken again on the floor starts as its parent lands). */
  t0: number;
  p0: Vector3;
  q0: Quaternion;
  fall: Fall | null;
  /** Breaks again where it lands: gone from then, its pieces carry on. */
  splits: boolean;
}

export interface BreakoutParts {
  /** Lay the pattern out from Sam's spot on the screen (screen UV, v up). */
  layout(impact: [number, number]): void;
  /** The crack stage shown (0–6), the break (0–1 of the glass's own clock; the tube shows static behind it), and the camera the flying pieces pass. */
  set(stage: number, shatter: number, camera: Camera): void;
  /**
   * Sam as a billboard: his cell's centre in screen UV (v up) and its size in screen heights (null: none),
   * how far he has leapt (0–1), the camera, the scale (device px per art px) the leap ends at, whether he
   * shows, and how a world point lands on the page (CSS px) with the device pixel ratio.
   */
  sam(
    centre: [number, number] | null,
    size: number,
    leap: number,
    camera: Camera,
    scale: number,
    hidden: boolean,
    toCss: (v: Vector3) => [number, number],
    dpr: number,
  ): void;
  /** Sam's 60 × 60 canvas: the caller draws his frame into it and calls samDrawn(). */
  readonly samCanvas: HTMLCanvasElement;
  samDrawn(): void;
  /** The billboard's centre in world space and its edge length (world units), while it shows. */
  readonly samWorld: { centre: Vector3; size: number } | null;
  /** Everything the breakout added, made visible for the shader compile, then hidden again. */
  showAll(on: boolean): void;
  /** The texture a layout changes (the rim's mask), to upload ahead of time. */
  textures(): Texture[];
  dispose(): void;
}

/** The breakout's meshes on the monitor's body, sharing the screen's CRT uniforms. */
export function createBreakout(parts: MonitorParts, crt: CrtMaterial): BreakoutParts {
  const s0 = scaleAt(-DIMS.recess);
  /** Normalised screen point → the monitor's body space, on the tube's cap (bulge at rest), lifted toward the viewer by `lift`. */
  const body = (p: P2, lift = 0): Vector3 => {
    const u = p[0] / ASPECT;
    const v = p[1];
    const cx = Math.min(1, Math.abs(2 * u - 1));
    const cy = Math.min(1, Math.abs(2 * v - 1));
    return new Vector3((u - 0.5) * O.w * s0, (OPENING_Y + (v - 0.5) * O.h) * s0, -DIMS.recess + DIMS.bulge * (1 - cx * cx) * (1 - cy * cy) + lift);
  };
  /** The same point on the glass, as build.ts lays the pane out. */
  const onGlass = (p: P2): Vector3 => {
    const x = (p[0] / ASPECT - 0.5) * O.w;
    const y = (p[1] - 0.5) * O.h;
    const cx = Math.min(1, Math.abs(x) / (O.w / 2));
    const cy = Math.min(1, Math.abs(y) / (O.h / 2));
    const z = -DIMS.recess + DIMS.glassGap + DIMS.bulge * (1 - cx * cx) * (1 - cy * cy);
    const s = scaleAt(z);
    return new Vector3(x * s, (y + OPENING_Y) * s, z);
  };

  // ── The cracks: ribbons on the glass, shown by stage; the rim's alpha map for the pane ──
  const rimCanvas = document.createElement('canvas');
  rimCanvas.width = 512;
  rimCanvas.height = Math.round(512 / ASPECT);
  const rimCtx = rimCanvas.getContext('2d')!;
  rimCtx.fillStyle = 'white';
  rimCtx.fillRect(0, 0, rimCanvas.width, rimCanvas.height);
  const rim = new CanvasTexture(rimCanvas);
  const light = new Color().setStyle(readToken('--color-cloud-white'));
  const crackMat = new ShaderMaterial({
    uniforms: {
      uStage: { value: 0 },
      uRimOnly: { value: 0 },
      uDark: { value: new Color().setStyle(readToken('--color-grey-700')) },
      uLight: { value: light },
    },
    vertexShader: crackVertex,
    fragmentShader: crackFragment,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const crackMesh = new Mesh(new BufferGeometry(), crackMat);
  crackMesh.frustumCulled = false;
  crackMesh.renderOrder = 3;
  crackMesh.visible = false;
  parts.body.add(crackMesh);

  // ── The shards: glossy clear glass (glassFragment), the broken edges lit; both faces drawn ──
  /** A token's colour as the display shows it (the glass is composed in display colours). */
  const asShown = (token: string) => {
    const c = new Color().setStyle(readToken(token)).convertLinearToSRGB();
    return new Vector3(c.r, c.g, c.b);
  };
  const glassUniforms = {
    // the key light, up and to the left of the view, as the monitor's own key light falls
    uKey: { value: new Vector3(-0.42, 0.62, 0.66).normalize() },
    uPage: { value: asShown('--color-daisy-white') },
    uSky: { value: asShown('--color-blue-100') },
    uSkyHigh: { value: asShown('--color-sky-blue') },
    uLean: { value: 0.2 },
    uRimMask: { value: rim },
  };
  /** The glass's one material, for the shards and the rim's broken edge; with RIM, for the rim's face (the pane, cut by its mask). */
  const glassMaterial = (rimFace: boolean) =>
    new ShaderMaterial({
      uniforms: glassUniforms,
      defines: rimFace ? { RIM: '' } : {},
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  const shardMat = glassMaterial(false);
  const rimMat = glassMaterial(true);
  const shards: Shard[] = [];

  // ── The rim that stays: the pane itself (its geometry shared with the glass) in the shards' glass, cut
  //    by the rim's mask; and its broken edge, a wall THICK deep along the rim's inner edge, lit as theirs ──
  const rimFace = new Mesh(parts.glass.geometry, rimMat);
  rimFace.renderOrder = 2;
  rimFace.visible = false;
  const rimEdge = new Mesh(new BufferGeometry(), shardMat);
  rimEdge.renderOrder = 2;
  rimEdge.visible = false;
  rimEdge.frustumCulled = false;
  parts.body.add(rimFace, rimEdge);

  // ── Fine glass dust ──
  const dustGeo = new BufferGeometry();
  const dustMat = new ShaderMaterial({
    uniforms: { uT: { value: 0 }, uG: { value: FALL.g }, uFloor: { value: FALL.floor }, uPx: { value: 1 }, uColor: { value: asShown('--color-cloud-white') } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.visible = false;
  dust.renderOrder = 5;
  parts.body.add(dust);

  // ── Sam: his own pixels on a square, nearest-filtered ──
  const samCanvas = document.createElement('canvas');
  samCanvas.width = samCanvas.height = 60;
  const samTex = new CanvasTexture(samCanvas);
  samTex.colorSpace = SRGBColorSpace;
  samTex.magFilter = NearestFilter;
  samTex.minFilter = NearestFilter;
  samTex.generateMipmaps = false;
  const samMat = new MeshBasicMaterial({ map: samTex, transparent: true, alphaTest: 0.5, toneMapped: false, depthWrite: false });
  const samMesh = new Mesh(new PlaneGeometry(1, 1), samMat);
  samMesh.renderOrder = 4;
  samMesh.visible = false;
  parts.body.add(samMesh);
  let samWorld: { centre: Vector3; size: number } | null = null;

  let pattern: Pattern | null = null;
  let key = '';
  let shown = false;
  const tmpQ = new Quaternion();
  const tmpQ2 = new Quaternion();
  const tmpQ3 = new Quaternion();
  const tmpV = new Vector3();
  const camPos = new Vector3();
  const camBody = new Vector3();
  const camRight = new Vector3();
  const camUp = new Vector3();
  const X = new Vector3(1, 0, 0);
  const Y = new Vector3(0, 1, 0);

  /** One piece of glass: its outline on the pane, a thin prism round its own centre, every face wound the way it faces. */
  const prism = (outlineOf: P2[]): { geo: BufferGeometry; at: Vector3 } => {
    const poly = signedArea(outlineOf) < 0 ? [...outlineOf].reverse() : outlineOf;
    const front = poly.map(onGlass);
    const at = front.reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(1 / front.length);
    const f = front.map((p) => p.clone().sub(at));
    const b = f.map((p) => p.clone().setZ(p.z - THICK));
    const pos: number[] = [];
    const nor: number[] = [];
    // aLocal: where a face's point lies from the piece's centre, over its reach (the glass shader leans the
    // normal out by it, per pixel, as if the face were barely curved); aOut: 0 at the centre, 1 on the outline
    const local: number[] = [];
    const outer: number[] = [];
    const edge: number[] = [];
    const reach = Math.max(...f.map((p) => Math.hypot(p.x, p.y))) || 1;
    const vert = (p: Vector3, n: Vector3, o: number, onFace: boolean) => {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      local.push(onFace ? p.x / reach : 0, onFace ? p.y / reach : 0);
      outer.push(o);
      edge.push(onFace ? 0 : 1);
    };
    const tri = (p: Vector3, q: Vector3, r: Vector3, n: Vector3) => {
      vert(p, n, 1, false);
      vert(q, n, 1, false);
      vert(r, n, 1, false);
    };
    const zero = new Vector3();
    const back = zero.clone().setZ(-THICK);
    const up = new Vector3(0, 0, 1);
    const down = new Vector3(0, 0, -1);
    for (let j = 0; j < f.length; j++) {
      const k = (j + 1) % f.length;
      vert(zero, up, 0, true);
      vert(f[j]!, up, 1, true);
      vert(f[k]!, up, 1, true);
      vert(back, down, 0, true);
      vert(b[k]!, down, 1, true);
      vert(b[j]!, down, 1, true);
    }
    // the broken edges, facing out (the outline runs counter-clockwise)
    for (let j = 0; j < f.length; j++) {
      const k = (j + 1) % f.length;
      const n = new Vector3().subVectors(f[k]!, f[j]!).cross(up).normalize();
      tri(f[j]!, b[j]!, b[k]!, n);
      tri(f[j]!, b[k]!, f[k]!, n);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    geo.setAttribute('aLocal', new Float32BufferAttribute(local, 2));
    geo.setAttribute('aOut', new Float32BufferAttribute(outer, 1));
    geo.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
    return { geo, at };
  };

  /** The rim's broken edge: a wall from the glass's face to THICK behind it, along the rim's inner edge, facing into the hole. */
  const buildRimEdge = (p: Pattern): BufferGeometry => {
    const loop = signedArea(p.rim) < 0 ? [...p.rim].reverse() : p.rim;
    const f = loop.map(onGlass);
    const pos: number[] = [];
    const nor: number[] = [];
    const up = new Vector3(0, 0, 1);
    for (let j = 0; j < f.length; j++) {
      const a = f[j]!;
      const c = f[(j + 1) % f.length]!;
      // the outline runs counter-clockwise round the hole, so into the hole is to its left
      const n = new Vector3().crossVectors(up, new Vector3().subVectors(c, a)).normalize();
      const ab = a.clone().setZ(a.z - THICK);
      const cb = c.clone().setZ(c.z - THICK);
      for (const q of [a, ab, cb, a, cb, c]) {
        pos.push(q.x, q.y, q.z);
        nor.push(n.x, n.y, n.z);
      }
    }
    const n = pos.length / 3;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    geo.setAttribute('aLocal', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    geo.setAttribute('aOut', new Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    geo.setAttribute('aEdge', new Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    return geo;
  };

  const buildShards = (p: Pattern) => {
    for (const sh of shards) {
      sh.mesh.geometry.dispose();
      parts.body.remove(sh.mesh);
    }
    shards.length = 0;
    const rnd = mulberry32(PATTERN.seed + 1);
    const lerp = (r: readonly [number, number]) => r[0] + rnd() * (r[1] - r[0]);
    const sign = () => (rnd() < 0.5 ? -1 : 1);
    const spin = () => new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const imp = onGlass(p.impact);
    const ctrl = { x: REMOTE.at[0], z: REMOTE.at[1], r: REMOTE.reach * REMOTE.scale + 0.02 };
    const rest = FALL.floor + THICK / 2;
    const piece = (poly: P2[]) => {
      const { geo, at } = prism(poly);
      const mesh = new Mesh(geo, shardMat);
      mesh.position.copy(at);
      mesh.visible = false;
      mesh.renderOrder = 2;
      parts.body.add(mesh);
      return { mesh, at };
    };
    /** From p0, thrown at v: to the floor, one bounce, a slide to rest — flat, face up or down, turned any way. */
    const fall = (p0: Vector3, v: Vector3): Fall => {
      const t1 = (v.y + Math.sqrt(v.y * v.y + 2 * FALL.g * Math.max(0, p0.y - rest))) / FALL.g;
      const hit = new Vector3(p0.x + v.x * t1, rest, p0.z + v.z * t1);
      const bounceV = FALL.bounce * (FALL.g * t1 - v.y);
      const t2 = (2 * bounceV) / FALL.g;
      const slideV = new Vector3(v.x, 0, v.z).multiplyScalar(FALL.keep);
      const end = hit.clone().addScaledVector(slideV, t2 + FALL.slide);
      // no glass comes to rest inside the controller on the floor: a piece that would is slid just past it
      {
        const dx = end.x - ctrl.x;
        const dz = end.z - ctrl.z;
        const d = Math.hypot(dx, dz);
        if (d < ctrl.r) end.set(ctrl.x + (dx / (d || 1)) * ctrl.r, end.y, ctrl.z + (dz / (d || 1)) * ctrl.r);
      }
      const restQ = new Quaternion().setFromAxisAngle(Y, rnd() * Math.PI * 2).multiply(tmpQ.setFromAxisAngle(X, sign() * Math.PI * 0.5));
      return { v, t1, t2, hit, bounceV, slideV, rest: end, restQ, gone: end.z > FALL.far || Math.abs(end.x) > FALL.wide };
    };
    // the dust: grains thrown from the impact, and sprays where big pieces break again on the floor
    const grains: { at: Vector3; vel: Vector3; start: number }[] = [];
    for (const cell of p.cells) {
      const poly = outline(p, cell.loop);
      const size = Math.abs(signedArea(poly));
      if (size < 2e-5) continue; // a sliver where a short ray squeezed its rings together
      const { mesh, at } = piece(poly);
      const out = at.clone().sub(imp).setZ(0);
      const away = out.length();
      out.multiplyScalar(1 / (away || 1));
      // One burst, every piece at once, each its own way and speed. Sam punches through at the impact:
      // about half the small pieces round it fly at the viewer, past the camera; the rest are thrown out
      // and forward — the nearer the impact, the faster — and fall.
      if (cell.inner && rnd() < FLY.share) {
        const aim = lerp(FLY.aim);
        shards.push({
          mesh,
          at,
          axis: spin(),
          turns: sign() * lerp(FLY.turns),
          fly: { aim: [out.x * aim, out.y * aim], speed: lerp(FLY.speed) },
          t0: 0,
          p0: at,
          q0: new Quaternion(),
          fall: null,
          splits: false,
        });
        continue;
      }
      const near = Math.max(0, 1 - away / 0.4);
      const v = new Vector3(
        out.x * (0.3 + rnd() * 1.3) + (rnd() - 0.5) * 0.8,
        out.y * (0.2 + rnd() * 0.8) + 0.2 + rnd() * 0.9 + near * rnd() * 1.4,
        0.5 + rnd() * 1.4 + near * (2 + rnd() * 4.5),
      );
      const sh: Shard = {
        mesh,
        at,
        axis: spin(),
        turns: sign() * (5 + rnd() * 12),
        fly: null,
        t0: 0,
        p0: at,
        q0: new Quaternion(),
        fall: fall(at, v),
        splits: false,
      };
      shards.push(sh);
      // a big piece that lands in view breaks again where it hits the floor
      const f = sh.fall!;
      if (size < AGAIN.area || f.gone || rnd() >= AGAIN.chance) continue;
      const halves = cut(poly, rnd);
      if (!halves) continue;
      let subs: P2[][] = halves;
      const bigger = Math.abs(signedArea(halves[0])) >= Math.abs(signedArea(halves[1])) ? 0 : 1;
      if (Math.abs(signedArea(halves[bigger])) > AGAIN.again && rnd() < 0.6) {
        const more = cut(halves[bigger], rnd);
        if (more) subs = [halves[1 - bigger]!, ...more];
      }
      sh.splits = true;
      // each piece starts where it was in its parent as that lands, turned as it was, and hops off on its own
      const turned = new Quaternion().setFromAxisAngle(sh.axis, sh.turns * f.t1);
      for (const sub of subs) {
        const part = piece(sub);
        const off = part.at.clone().sub(at).applyQuaternion(turned);
        const p0 = f.hit.clone().add(off);
        p0.y = Math.max(rest, p0.y);
        const apart = new Vector3(off.x, 0, off.z);
        if (apart.lengthSq() < 1e-8) apart.set(rnd() - 0.5, 0, rnd() - 0.5);
        apart.normalize().multiplyScalar(lerp(AGAIN.spread));
        const v2 = f.slideV.clone().multiplyScalar(0.6).add(apart);
        v2.y = lerp(AGAIN.hop);
        shards.push({
          mesh: part.mesh,
          at: part.at,
          axis: spin(),
          turns: sign() * (3 + rnd() * 6),
          fly: null,
          t0: f.t1,
          p0,
          q0: turned.clone(),
          fall: fall(p0, v2),
          splits: false,
        });
      }
      for (let i = 0; i < AGAIN.grains; i++) {
        const a = rnd() * Math.PI * 2;
        const sp = 0.15 + rnd() * 0.55;
        grains.push({ at: f.hit.clone().setY(FALL.floor + 0.003), vel: new Vector3(Math.cos(a) * sp, 0.3 + rnd() * 0.7, Math.sin(a) * sp), start: f.t1 });
      }
    }
    for (let i = 0; i < DUST.count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.06;
      grains.push({
        at: new Vector3(imp.x + r * Math.cos(a), imp.y + r * Math.sin(a), imp.z + 0.002),
        vel: new Vector3(Math.cos(a) * (0.2 + rnd() * 0.9), Math.sin(a) * 0.5 + rnd() * 0.6, 0.3 + rnd() * 1.2),
        start: 0,
      });
    }
    const pos = new Float32Array(grains.length * 3);
    const vel = new Float32Array(grains.length * 3);
    const size = new Float32Array(grains.length);
    const seed = new Float32Array(grains.length);
    const start = new Float32Array(grains.length);
    grains.forEach((g, i) => {
      g.at.toArray(pos, i * 3);
      g.vel.toArray(vel, i * 3);
      size[i] = DUST.size[0] + rnd() * (DUST.size[1] - DUST.size[0]);
      seed[i] = rnd();
      start[i] = g.start;
    });
    dustGeo.setAttribute('position', new BufferAttribute(pos, 3));
    dustGeo.setAttribute('aVel', new BufferAttribute(vel, 3));
    dustGeo.setAttribute('aSize', new BufferAttribute(size, 1));
    dustGeo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    dustGeo.setAttribute('aStart', new BufferAttribute(start, 1));
  };

  const drawRim = (p: Pattern) => {
    const w = rimCanvas.width;
    const h = rimCanvas.height;
    // an alpha map: white keeps the glass, black is the hole the shards left
    rimCtx.fillStyle = 'white';
    rimCtx.fillRect(0, 0, w, h);
    rimCtx.fillStyle = 'black';
    rimCtx.beginPath();
    p.rim.forEach((q, i) => {
      const x = (q[0] / ASPECT) * w;
      const y = (1 - q[1]) * h;
      if (i === 0) rimCtx.moveTo(x, y);
      else rimCtx.lineTo(x, y);
    });
    rimCtx.closePath();
    // the band along the broken edge (the face's line), then the hole over its inner half
    rimCtx.strokeStyle = 'rgb(180,180,180)';
    rimCtx.lineWidth = 6;
    rimCtx.lineJoin = 'round';
    rimCtx.stroke();
    rimCtx.fill();
    rim.needsUpdate = true;
  };

  /** A falling piece `tau` s after it set off: thrown, tumbling; one bounce off the floor, settling flat; a short slide to rest. */
  const fallAt = (sh: Shard, tau: number) => {
    const m = sh.mesh;
    const f = sh.fall!;
    if (tau <= f.t1) {
      m.position.set(sh.p0.x + f.v.x * tau, sh.p0.y + f.v.y * tau - 0.5 * FALL.g * tau * tau, sh.p0.z + f.v.z * tau);
      m.quaternion.setFromAxisAngle(sh.axis, sh.turns * tau).multiply(sh.q0);
      return;
    }
    const tb = tau - f.t1;
    // the tumble at the hit, easing to lying flat through the bounce
    tmpQ2.setFromAxisAngle(sh.axis, sh.turns * f.t1).multiply(sh.q0);
    const settle = Math.min(1, tb / (f.t2 + 0.05));
    m.quaternion.slerpQuaternions(tmpQ2, f.restQ, settle * settle * (3 - 2 * settle));
    if (tb <= f.t2) {
      m.position.copy(f.hit).addScaledVector(f.slideV, tb);
      m.position.y += f.bounceV * tb - 0.5 * FALL.g * tb * tb;
      return;
    }
    const ts = tb - f.t2;
    m.position.copy(f.hit).addScaledVector(f.slideV, f.t2 + FALL.slide * (1 - Math.exp(-ts / FALL.slide)));
  };

  /**
   * A piece flying at the viewer, t s into the break: straight from the glass to its point beside the
   * camera at its speed, on a flat arc, tumbling; false once it has passed out of view.
   */
  const flyAt = (sh: Shard, t: number): boolean => {
    const f = sh.fly!;
    tmpV.copy(camBody).addScaledVector(camRight, f.aim[0]).addScaledVector(camUp, f.aim[1]).sub(sh.at);
    const T = tmpV.length() / f.speed;
    if (t >= T * FLY.gone) return false;
    const m = sh.mesh;
    m.position.copy(sh.at).addScaledVector(tmpV, t / T);
    m.position.y += 0.5 * FLY.g * t * (T - t);
    m.quaternion.setFromAxisAngle(sh.axis, sh.turns * t);
    return true;
  };

  return {
    samCanvas,
    get samWorld() {
      return samWorld;
    },
    layout(impact) {
      const k = `${impact[0].toFixed(4)},${impact[1].toFixed(4)}`;
      if (k === key) return;
      key = k;
      pattern = makePattern([impact[0] * ASPECT, impact[1]]);
      crackMesh.geometry.dispose();
      crackMesh.geometry = ribbons(pattern, onGlass);
      buildShards(pattern);
      rimEdge.geometry.dispose();
      rimEdge.geometry = buildRimEdge(pattern);
      drawRim(pattern);
    },
    set(stage, shatter, camera) {
      const on = pattern !== null;
      crackMesh.visible = on && stage > 0;
      crackMat.uniforms.uStage!.value = stage;
      const broken = on && shatter > 0;
      crackMat.uniforms.uRimOnly!.value = broken ? 1 : 0;
      // once broken, the pane is the rim: in the shards' glass, shown wherever the pane would be
      rimFace.visible = rimEdge.visible = broken && parts.glass.visible;
      if (broken) parts.glass.visible = false;
      crt.uniforms.uStatic.value = broken ? 1 : 0;
      dust.visible = broken;
      if (!broken) {
        if (shown) for (const s of shards) s.mesh.visible = false;
        shown = false;
        return;
      }
      shown = true;
      const t = shatter * FALL.time;
      dustMat.uniforms.uT!.value = t;
      dustMat.uniforms.uPx!.value = Math.min(2, window.devicePixelRatio || 1);
      // the camera in the monitor's own space: the flying pieces pass beside it however the parallax has turned it
      parts.body.updateMatrixWorld(true);
      camera.getWorldPosition(camPos);
      parts.body.worldToLocal(camBody.copy(camPos));
      parts.body.getWorldQuaternion(tmpQ).invert().multiply(camera.getWorldQuaternion(tmpQ3));
      camRight.set(1, 0, 0).applyQuaternion(tmpQ);
      camUp.set(0, 1, 0).applyQuaternion(tmpQ);
      for (const sh of shards) {
        if (sh.fly) {
          sh.mesh.visible = flyAt(sh, t);
          continue;
        }
        // a piece broken again shows from its parent's landing; one that breaks again, or lands out of the frame, is gone once down
        const tau = t - sh.t0;
        const on = tau >= 0 && !((sh.splits || sh.fall!.gone) && tau > sh.fall!.t1);
        sh.mesh.visible = on;
        if (on) fallAt(sh, tau);
      }
    },
    sam(centre, size, leap, camera, scale, hidden, toCss, dpr) {
      if (!centre) {
        samMesh.visible = false;
        samWorld = null;
        return;
      }
      // On the screen, just in front of the picture; leaping, along the line to the camera until he
      // is `scale` device px per art px on the page, where the page takes him over.
      const start = body([centre[0] * ASPECT, centre[1]], SAM_LIFT);
      parts.body.updateMatrixWorld(true);
      const world = start.clone().applyMatrix4(parts.body.matrixWorld);
      camera.getWorldPosition(camPos);
      const d0 = world.distanceTo(camPos);
      // his scale where he stands on the screen, measured across his width
      const across = new Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(tmpQ)).multiplyScalar((size * O.h * s0) / 2);
      const l = toCss(world.clone().sub(across));
      const r = toCss(world.clone().add(across));
      const there = (Math.hypot(r[0] - l[0], r[1] - l[1]) * dpr) / 60;
      const d1 = d0 / Math.max(1, scale / Math.max(1e-3, there));
      // One jump, like a thrown ball: out through the glass and up toward the viewer, his speed falling
      // evenly (a parabola) to the top of the jump as the leap ends — the one moment he is at rest, where
      // the page takes him over and he falls on to the Register window. (a hop up and
      // back down, then a stop in mid-air, then a second hop read as unnatural.)
      const e = leap * (2 - leap);
      const d = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e);
      const at = camPos.clone().add(
        world
          .clone()
          .sub(camPos)
          .multiplyScalar(d / d0),
      );
      // His size is his own: nearer, he looks bigger.
      const edge = size * O.h * s0;
      const up = new Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(tmpQ));
      at.addScaledVector(up, e * edge * 0.7);
      samWorld = { centre: at, size: edge };
      // the billboard lives in the body (it turns with the parallax): back into its space, facing the camera
      const inv = parts.body.matrixWorld.clone().invert();
      samMesh.position.copy(at.clone().applyMatrix4(inv));
      samMesh.quaternion.copy(parts.body.getWorldQuaternion(new Quaternion()).invert().multiply(camera.getWorldQuaternion(tmpQ)));
      samMesh.scale.setScalar(edge);
      samMesh.visible = !hidden;
    },
    samDrawn() {
      samTex.needsUpdate = true;
    },
    showAll(on) {
      crackMesh.visible = on;
      samMesh.visible = on;
      dust.visible = on;
      rimFace.visible = rimEdge.visible = on;
      for (const s of shards) s.mesh.visible = on;
    },
    textures() {
      return [rim];
    },
    dispose() {
      for (const t of [rim, samTex] as Texture[]) t.dispose();
      crackMesh.geometry.dispose();
      rimEdge.geometry.dispose();
      for (const s of shards) s.mesh.geometry.dispose();
      for (const m of [crackMat, shardMat, rimMat, samMat, dustMat]) m.dispose();
      dustGeo.dispose();
      samMesh.geometry.dispose();
    },
  };
}
