/**
 * The world renderer: Vega's field and the walk into town, drawn into the offscreen buffer at
 * 1 art px = 1 buffer px. Depth comes from composition only: a flat sky, clouds
 * at every height, Vega's own pale silhouette behind the hills, saturated layers, and the city
 * arriving layer by layer from the right edge, each at its own parallax speed — nothing rises
 * out of the ground and the horizon never moves. Everything is a pure function of the timeline
 * plus wall-clock cloud drift, coin spin, dust and the idle NPC loops, so reverse is free.
 */
import type { CityAssets, Level1Assets } from './assets';
import type { Drawable } from './sprites';
import { FOOT_SINK, type Sam } from './sam';
import type { Coins } from './coins';
import type { Dust } from './dust';
import { Lights, NIGHT_STEPS, Stepper, nightTokens, rank, type NightTokens } from './night';
import { makeStrip, type Strip } from './sprites';
import { CLOUD_ROLES, RANGE_ROLES, Tinted } from './tint';
import { board, letter } from './lettering';
import { readToken } from './palette';
import { Plaza, PLAZA, type PlazaLook } from './plaza';
import { horizonAt } from './stages';
import { PLAZA_TIME } from '../data/layers';

/** A rectangle in viewport art px. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Frame {
  /** Timeline position, for the palette steps. */
  t: number;
  X: number;
  camLeft: number;
  /** Sam's screen x (the camera's left margin), buffer px. */
  sx: number;
  F: number;
  /** The viewport frame, which the world composes itself on (layer ends, Sam's margin, the ground line). */
  bw: number;
  bh: number;
  /**
   * What to draw, viewport art px: the viewport [0, bw] × [0, bh], or the monitor's screen frame —
   * the same composition with margins round it, so its centre is the viewport frame exactly.
   */
  range: Rect;
  /** The screen frame's extent, in every draw: the far clouds wrap over it, so the viewport and the screen agree. */
  span: Rect;
  now: number;
  /** The stage's flat sky colour. */
  sky: string;
  sam: Sam;
  samX: number;
  coins: Coins;
  dust: Dust;
  /** Sam has left the picture (the breakout: from the shatter on he is the monitor's own billboard). */
  hideSam?: boolean;
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * The walk into town, as world x — farthest things first, nearest last, no two changes on the
 * same frame. A layer "begins" where its leading edge enters the right edge of the screen when
 * Sam is at that x, and "ends" where its trailing edge leaves the right edge; from there it
 * simply scrolls at its own parallax speed. Reverse walks out of town the same way backwards.
 */
export const SEQ = {
  farBegin: 300, // city-far: a small skyline at the right end of the horizon, long before anything else
  towersBegin: 1500,
  hillsEnd: 1600, // the hills stop tiling and scroll off to the left
  midHedgeEnd: 1850,
  cityMidBegin: 1850,
  hedgeEnd: 1930, // behind Sam the bushes end (behind the last field tree) …
  fenceBegin: 1944, // … and the city fence starts before the seam, on the grass
  seam: 2000, // X0: the surface changes (grass → pavement); the edge at X0 + 28, the fill at X0 + 56
  subway: 2136, // the entrance stands on the pavement 80 px after the fill seam, like any prop
  nearBegin: 2150, // building fronts
  fenceEnd: 5520, // the street's railing stops before the plaza's first planter
  cityClear: 5900, // the city's last block has cleared the left of the screen by here: the plaza
} as const;

/** Parallax factor and where each layer's bottom sits (art px relative to the ground line F). */
export const STACK = {
  small: { p: 0.02 },
  medium: { p: 0.03 },
  silhouette: { p: 0.04, bottom: -190 },
  cloudBank: { p: 0.05, bottom: -60 },
  cumulus: { p: 0.07, period: 2000 },
  hills: { p: 0.1, bottom: 6 },
  cityFar: { p: 0.2, bottom: -94 }, // its low-rise base ends behind the plain
  towers: { p: 0.35, bottom: -1, period: 2304 }, // standing on the ground; the plain hides their feet
  plain: { p: 0.38, top: -100 }, // the hills' flat field in front of the far city and the towers, covering where their art ends
  cityMid: { p: 0.5, bottom: -1, period: 1151 },
  /** Both hedges sit 20 px into the ground so their dark base is under the grass; only the bushes show. */
  midHedge: { p: 0.45, bottom: 20, treeBottom: 1 },
  /**
   * The near fronts lead with the tall building at column 1063 and, 328 px later, open for 264 px
   * where the low buildings would be (columns 239–503 of the next tile, both roofline steps):
   * a park with a view down the avenue. The mid and tower openings and the Javits silhouette are
   * aligned to it, so that is where the destination is first seen.
   */
  cityNear: { p: 0.75, bottom: 2, leadColumn: 1063, gapFrom: 328, gapTo: 592, period: 1152, ends: [114, 330, 537, 678, 1097] },
  /** Javits at the towers' depth, its base on the far city's line: hidden behind the arriving fronts until the opening shows it between the flanking towers. */
  javits: { p: 0.35 },
  near: { hedgeBottom: 20, bottom: 2, treeBottom: 3 },
  /**
   * The ground band is 48 px, identical in field and city: surface 8 px from F (grass tips and
   * fill / sidewalk rows 0–7), edge 12 px from F + 8 (the daisy row's dirt / the kerb face), fill
   * 28 px from F + 20 (a deeper dirt / the road with its lane marks). Sam's feet never change
   * height. The three seams are vertical and crisp, 28 px apart, farthest-down last.
   */
  ground: { daisyTop: -47, daisyPhase: 492, edgeTop: 8, fillTop: 20, seamStep: 28, seamTileLeft: -8, seamTileTop: -4 },
} as const;

interface Seed {
  i: number;
  u: number;
  yFrac: number;
  drift: number;
}
const SMALL: Seed[] = [
  { i: 0, u: 60, yFrac: 0.05, drift: 1.4 },
  { i: 1, u: 420, yFrac: 0.15, drift: 1 },
  { i: 2, u: 700, yFrac: 0.03, drift: 1.2 },
  { i: 3, u: 1000, yFrac: 0.12, drift: 0.8 },
  { i: 1, u: 1300, yFrac: 0.08, drift: 1 },
];
const MEDIUM: Seed[] = [
  { i: 0, u: 200, yFrac: 0.3, drift: 1.1 },
  { i: 1, u: 900, yFrac: 0.2, drift: 0.9 },
  { i: 2, u: 1500, yFrac: 0.4, drift: 1 },
];
const CUMULUS: Seed[] = [
  { i: 0, u: 120, yFrac: 0.55, drift: 0.6 },
  { i: 1, u: 760, yFrac: 0.4, drift: 0.5 },
  { i: 2, u: 1500, yFrac: 0.7, drift: 0.7 },
];
/** Field trees behind Sam (planter cropped); the last one hides the hedge's end. */
const FIELD_TREES = [600, 900, 1250, 1600, 1900];
/** Mid-layer trees in that layer's own space (u). */
const MID_TREES = [260, 1000, 1760];
/** The street, world x, through Level 3 and into the dawn; the plaza has its own trees and planters (src/game/plaza.ts). */
const STREET_TREES = [2330, 2630, 2930, 3230, 3530, 3830, 4130, 4430, 4730, 5030, 5330];
const PLANTS = [2400, 2950, 3380, 3900, 4500, 5200];
const ARCADES = [2620, 3420];
/** Level 2's life (one office-chair gag, then street chess) and Level 3's crowd toward the after party at Booth 630. */
const NPCS = { molePhone: 2380, moleCoffee: 2680, molesChess: 3340, molesSofa: 4300, molePizza: 4450, dogBark: 4600, molePhone2: 4780 } as const;
/** The after-party spot: vega-sign-horizontal over two arcade machines. */
const PARTY = { x: 4950, arcadeGap: 56 } as const;
/**
 * Signage hierarchy: the event is 16-Bit Con and Vega is a booth at it. A 16-BIT CON ·
 * OCT 3–5 billboard on a Level 2 front (near-layer space), and 16-BIT CON in neon over the party
 * cabinets; "vega" stays only on the cabinets and the Booth 630 sign at the end.
 */
/** On the first front after the park opening (near-layer u, past gapTo), above the street trees. */
const BILLBOARD = { u: 616, bottom: -112 } as const;
interface Signs {
  billboard: { day: Drawable; neon: Drawable };
  party: { day: Drawable; neon: Drawable };
}
function buildSigns(c: CityAssets): Signs {
  const k = readToken('--color-outline-black');
  const g7 = readToken('--color-grey-700');
  const make = (neon: boolean) => ({
    billboard: board([letter(c.letters, '16-BIT CON', 'large', neon), letter(c.letters, 'OCT 3-5', 'small', neon)], { fill: k, outline: k, frame: g7 }),
    party: board([letter(c.letters, '16-BIT CON', 'large', neon)], { fill: k, outline: k, pad: 2 }),
  });
  const day = make(false);
  const neon = make(true);
  return { billboard: { day: day.billboard, neon: neon.billboard }, party: { day: day.party, neon: neon.party } };
}

/**
 * Night: each layer steps its palette over `span` in NIGHT_STEPS, far first and
 * near last, ~150 world px apart; its windows light one by one once it has darkened; the signs
 * flip to neon. All of it is a function of t.
 */
const NIGHT = { span: 0.06, far: 0.64, towers: 0.665, mid: 0.69, near: 0.715, street: 0.74 } as const;
/** Window lighting: [from, to] in t, and the share of a layer's windows that end up lit — a night city is not fully lit, and the shuffled order leaves the dark ones scattered. */
const LIGHTS = { far: [0.7, 0.76, 0.7], towers: [0.72, 0.78, 0.55], mid: [0.74, 0.8, 0.5], near: [0.76, 0.82, 0.45] } as const;
const NEON_AT = 0.76;
/**
 * Dawn at the plaza: each layer steps back to its day palette over `span`, far
 * first and near last — the far skyline, Javits, the towers, the mid and near fronts, then the street
 * and the plaza's props; before that the windows go dark one by one (LIGHTS_OUT) and the neon goes
 * back to day. None of it at a night plaza (PLAZA_TIME).
 */
const DAWN = PLAZA_TIME === 'dawn' ? { span: 0.04, far: 0.845, javits: 0.85, towers: 0.855, mid: 0.865, near: 0.875, street: 0.885 } : null;
const LIGHTS_OUT = { far: [0.845, 0.875], towers: [0.85, 0.88], mid: [0.855, 0.885], near: [0.86, 0.89] } as const;
const NEON_OFF = PLAZA_TIME === 'dawn' ? 0.88 : Infinity;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface NightSet {
  far: Stepper;
  javits: Stepper;
  towers: Stepper;
  mid: Stepper;
  near: Stepper;
  fence: Stepper;
  sidewalk: Stepper;
  kerb: Stepper;
  road: Stepper;
  seam: Stepper;
  subway: Stepper;
  arcade: Stepper;
  plant: Stepper;
  poster: Stepper;
  tree: Stepper;
  strips: Map<Strip, Stepper>;
  lights: { far: Lights; towers: Lights; mid: Lights; near: Lights };
}

const stripCache = new WeakMap<Drawable, Strip>();
/** The same strip over a stepped variant of its sheet. */
function stripOver(img: Drawable, like: Strip): Strip {
  let st = stripCache.get(img);
  if (!st) stripCache.set(img, (st = makeStrip(img, like.fw, like.fh, like.pitch)));
  return st;
}

function buildNight(a: Level1Assets, c: CityAssets, T: NightTokens): NightSet {
  // Glass by layer: the blue panes, and the panes Vega drew in warm "already lit" colours. Both go
  // dark at night and both belong to the window finder, so a window lights only as a whole and
  // only through the overlay — a warm slat gap under a dark pane never glows on its own.
  const glass = {
    far: ['#B9D6DF', '#B9C8E5'],
    towers: ['#629EFB', '#4E88EF', '#5487E2', '#7FB0FF', '#C5B298', '#C48D71'],
    mid: ['#3E81E8', '#2386F1', '#5E9AF9', '#5BABFF', '#EDC18B', '#DE914E', '#EACAAC'],
    near: ['#3A7DE7', '#5C98F9', '#386DD2', '#59A9FF', '#F2C185', '#E38E44', '#F2C6B6', '#F0CAA8', '#F2D2A1', '#DFA67C'],
  };
  const to = (hexes: string[], token: string) => Object.fromEntries(hexes.map((h) => [h, token]));
  const farMap = rank([T.n9], [1], to(glass.far, T.k));
  const towersMap = rank([T.n9, T.g7], [1, 1], to(glass.towers, T.k));
  const midMap = rank([T.n9, T.g7, T.g5], [2, 2, 1], to([...glass.mid, '#B3D0FF'], T.k));
  const nearMap = rank([T.n9, T.g7, T.g5], [35, 40, 25], {
    ...to([...glass.near, '#7796DC', '#95ACDC', '#B5D1FF', '#ACC6F2', '#AAC2E0'], T.k),
    '#E06B4E': T.g7,
    '#2D4365': T.k,
  });
  const pave = { '#E8DECF': T.g5, '#CBC3C7': T.g7, '#CBBFBF': T.g7, '#ACA5A8': T.g7, '#ABA3A3': T.g7, '#BB9147': T.g5, '#767272': T.g7, '#55575B': T.k, '#353535': T.k, '#777B80': T.g7, '#84C5FF': T.g5 };
  const greens = { '#224100': T.n9, '#2E5700': T.n9, '#1F3B00': T.n9, '#457D07': T.n7, '#75A70D': T.n7 };
  const strips = new Map<Strip, Stepper>();
  for (const st of [c.molePhone, c.moleCoffee, c.molesChess, c.molesSofa, c.molePizza, c.dogBark, c.dog]) {
    strips.set(st, new Stepper(st.image, rank([T.k, T.g7, T.g5], [1, 1, 1])));
  }
  return {
    far: new Stepper(c.far, farMap),
    javits: new Stepper(c.javits, rank([T.n9, T.g7], [1, 1], { '#5487E2': T.k, '#629EFB': T.k })),
    towers: new Stepper(c.towers, towersMap),
    mid: new Stepper(c.mid, midMap),
    near: new Stepper(c.near, nearMap),
    fence: new Stepper(c.fence, { map: { '#353535': T.k, '#444444': T.k, '#565656': T.g7, '#777777': T.g7 } }),
    sidewalk: new Stepper(c.sidewalk, { map: pave }),
    kerb: new Stepper(c.kerb, { map: pave }),
    road: new Stepper(c.road, { map: pave }),
    seam: new Stepper(c.seam, rank([T.k, T.n9, T.g7, T.g5])),
    subway: new Stepper(c.subway, { map: { ...greens, '#282828': T.k, '#464646': T.g7, '#FFCF3B': T.y1, '#FFF15B': T.y1, '#FFFFFF': T.y1 } }),
    arcade: new Stepper(c.arcade, rank([T.k, T.g7], [1, 1], { ...greens, '#5DB3FF': T.y1, '#70A736': T.y4, '#FFCF3B': T.y4, '#FFD11B': T.y4, '#F0A125': T.y4 })),
    plant: new Stepper(c.plant, rank([T.n9, T.n7], [1, 1], { '#834622': T.k, '#ABA3A3': T.g7, '#E2DCDC': T.g5, '#FFFFFF': T.g5, '#FFEDCD': T.g5, '#FFCA05': T.g5 })),
    poster: new Stepper(c.poster, rank([T.k, T.g7, T.g5])),
    tree: new Stepper(a.tree, rank([T.n9, T.n7], [1, 1], { '#58311B': T.k, '#834622': T.k, '#AE6228': T.k, '#ABA3A3': T.g7, '#E2DCDC': T.g5, '#FFFFFF': T.g5, '#FFEDCD': T.g5, '#FFCA05': T.g5 })),
    strips,
    lights: {
      far: new Lights(c.far, glass.far, T.y1),
      towers: new Lights(c.towers, glass.towers, T.y4),
      mid: new Lights(c.mid, glass.mid, T.y4, true),
      near: new Lights(c.near, glass.near, T.y4, true),
    },
  };
}
/** The dog patrols the sidewalk on its own clock, independent of Sam: world px and px/s. */
const DOG = { from: 2700, to: 3100, speed: 28, stride: 8 } as const;
const POSTER_U = 140; // on the leading near building, in that layer's space

/** Where the mid fronts and the towers can be cut cleanly: roofline steps, and fully transparent columns. */
const MID_EDGES = [104, 117, 152, 283, 331, 352, 518, 525, 531, 556, 582, 705, 728, 797, 919, 936, 979, 1048, 1078, 1091];
const MID_GAPS: [number, number][] = [
  [283, 556],
  [705, 797],
  [518, 728],
];
const TOWER_CLEAR: [number, number][] = [
  [0, 14], [163, 183], [311, 314], [442, 460], [606, 615], [743, 783], [911, 920], [1008, 1030],
  [1154, 1166], [1315, 1335], [1463, 1466], [1594, 1612], [1758, 1767], [1895, 1935], [2063, 2072], [2160, 2182],
];
const TOWER_GAPS: [number, number][] = [
  [615, 911], [1030, 1315], [1335, 1594], [1612, 1895], [314, 606], [460, 743], [183, 442], [783, 1008], [920, 1154],
];

/**
 * Choose a tile phase for a layer so that one of its candidate openings is centred at `centreU`
 * while its leading edge (at `begin`) falls on a clean column — a roofline step for the mid
 * fronts, a transparent column for the towers. Pure function of the geometry.
 */
function alignOpening(
  period: number,
  begin: number,
  centreU: number,
  gaps: [number, number][],
  clean: (col: number) => number,
): { phase: number; gapL: number; gapR: number } {
  let best = { phase: 0, gapL: 0, gapR: 0, score: Infinity };
  for (const [g0, g1] of gaps) {
    const phase = centreU - (g0 + g1) / 2;
    const lead = mod(begin - phase, period);
    const score = clean(lead);
    if (score < best.score) best = { phase, gapL: phase + g0, gapR: phase + g1, score };
  }
  return best;
}
/**
 * The near fronts' end, in their layer's space: the last of their blocks' clean ends (STACK.cityNear.ends,
 * tile columns: a block's side wall in perspective, or its plain side) at or before `limit`.
 */
function cityEndU(phase: number, limit: number): number {
  const { period, ends } = STACK.cityNear;
  const n = Math.floor((limit - phase) / period);
  let best = -Infinity;
  for (const k of [n, n - 1]) {
    for (const col of ends) {
      const u = phase + k * period + col;
      if (u <= limit && u > best) best = u;
    }
  }
  return best;
}
const nearestEdge = (col: number) => Math.min(...MID_EDGES.map((e) => Math.abs(e - col)));
const insideClear = (col: number) => Math.min(...TOWER_CLEAR.map(([a, b]) => (col >= a && col <= b ? 0 : Math.min(Math.abs(col - a), Math.abs(col - b)))));

/** A tiled far layer on the screen canvas: positions snap to device pixels, tiles abut exactly (k · width is whole). */
export function farTiled(ctx: CanvasRenderingContext2D, img: Drawable, scroll: number, y: number, r: Pick<Rect, 'x0' | 'x1'>, snap: (v: number) => number, mirror: boolean): void {
  const w = img.width;
  const first = Math.floor((scroll + r.x0) / w);
  const last = Math.floor((scroll + r.x1) / w);
  for (let n = first; n <= last; n++) {
    const x = snap(n * w - scroll);
    if (mirror && n & 1) {
      ctx.save();
      ctx.translate(x + w, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else ctx.drawImage(img, x, Math.round(y));
  }
}

export function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  scroll: number,
  y: number,
  r: Pick<Rect, 'x0' | 'x1'>,
  opts: { mirror?: boolean; from?: number; to?: number; phase?: number } = {},
): void {
  const w = img.width;
  const { mirror = false, from = -Infinity, to = Infinity, phase = 0 } = opts;
  const bounded = Number.isFinite(from) || Number.isFinite(to);
  if (bounded) {
    const x0 = Number.isFinite(from) ? Math.round(from - scroll) : -1e6;
    const x1 = Number.isFinite(to) ? Math.round(to - scroll) : 1e6;
    if (x1 <= r.x0 || x0 >= r.x1) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, -1e6, x1 - x0, 2e6);
    ctx.clip();
  }
  const first = Math.floor((scroll - phase + r.x0) / w);
  const last = Math.floor((scroll - phase + r.x1) / w);
  for (let n = first; n <= last; n++) {
    const u0 = n * w + phase;
    if (u0 + w <= from || u0 >= to) continue;
    const x = Math.round(u0 - scroll);
    if (mirror && n & 1) {
      ctx.save();
      ctx.translate(x + w, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, Math.round(y));
    }
  }
  if (bounded) ctx.restore();
}

export class Level1 {
  /** Set once the city assets arrive; until then the city simply has not come into view. */
  city: CityAssets | null = null;
  /** The Javits plaza at the end of the run, the game's last level (src/game/plaza.ts). */
  readonly plaza: Plaza;
  private night: NightSet | null = null;
  private signs: Signs | null = null;
  /** The clouds and the far range, recoloured gradually with the sky. */
  private readonly tints: Map<Drawable, Tinted>;

  constructor(private readonly a: Level1Assets) {
    this.plaza = new Plaza(a);
    this.tints = new Map([...a.small, ...a.medium, ...a.cumulus, a.cloudBank].map((img) => [img, new Tinted(img, CLOUD_ROLES)]));
    this.tints.set(a.silhouette, new Tinted(a.silhouette, RANGE_ROLES));
  }

  /** Build the night palettes and window lists off the frame once the city is here. */
  prepareNight(): void {
    if (!this.city || this.night) return;
    const c = this.city;
    const T = nightTokens();
    this.night = buildNight(this.a, c, T);
    // Queue the night images and window lists in the order the night reaches them:
    // the worker builds them one after another from load, long before dusk.
    const n = this.night;
    n.far.prepare();
    n.javits.prepare();
    n.towers.prepare();
    n.mid.prepare();
    n.lights.far.prepare();
    n.near.prepare();
    n.lights.towers.prepare();
    for (const st of [n.sidewalk, n.kerb, n.road, n.seam, n.fence, n.subway, n.tree, n.plant, n.arcade, n.poster]) st.prepare();
    for (const st of n.strips.values()) st.prepare();
    n.lights.mid.prepare();
    n.lights.near.prepare();
    // the plaza, which the night reaches last
    this.plaza.prepareNight(T, n.tree, n.plant);
  }

  /**
   * The far sky: the flat sky, the small and medium clouds, Vega's pale silhouette, the
   * cloud bank and the big lobes, drawn straight onto the screen canvas at k device px per art px.
   * The sprites stay whole-number scaled and crisp, but their positions round to device pixels
   * instead of art pixels, so a cloud drifting 1 art px a second glides instead of jumping k device
   * px at a time. Everything nearer is drawn in the buffer over it.
   */
  /**
   * @param glide true: positions round to device px (the clouds glide); false: to whole art px, as on
   *   the monitor's screen — while the 3D shows, so the two agree at the handover
   */
  drawFar(sctx: CanvasRenderingContext2D, f: Frame, k: number, glide = true): void {
    const { t, camLeft, F, now, range: r, span } = f;
    const a = this.a;
    const tint = (img: Drawable) => this.tints.get(img)!.at(t);
    const snap = glide ? (v: number) => Math.round(v * k) / k : Math.round;
    sctx.save();
    sctx.scale(k, k);
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = f.sky;
    sctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    // At dawn the horizon glows ahead of the sky, behind the plaza's rooflines (the city's fronts hide it before).
    const horizon = horizonAt(t);
    if (horizon) {
      sctx.fillStyle = horizon;
      sctx.fillRect(r.x0, F - PLAZA.horizon, r.x1 - r.x0, r.y1 - F + PLAZA.horizon);
    }
    sctx.beginPath();
    sctx.rect(r.x0, r.y0, r.x1 - r.x0, F - r.y0);
    sctx.clip();
    const skyTop = Math.max(40, F - 300);
    const drift = (s: Seed, p: number) => s.u + s.drift * (now / 1000) - p * camLeft;
    // The clouds wrap over the screen frame's span in every draw, so the viewport and the monitor's
    // screen show each one in the same place.
    const wrap = (u: number, w: number, period = span.x1 - span.x0 + w) => span.x0 + mod(u - span.x0, period) - w;
    const cloud = (img: Drawable, x: number, y: number) => {
      if (x < r.x1 && x + img.width > r.x0) sctx.drawImage(img, snap(x), y);
    };
    for (const s of SMALL) {
      const img = tint(a.small[s.i]!);
      cloud(img, wrap(drift(s, STACK.small.p), img.width), Math.round(skyTop * s.yFrac));
    }
    for (const s of MEDIUM) {
      const img = tint(a.medium[s.i]!);
      cloud(img, wrap(drift(s, STACK.medium.p), img.width), Math.round(skyTop * s.yFrac));
    }
    farTiled(sctx, tint(a.silhouette), STACK.silhouette.p * camLeft, F + STACK.silhouette.bottom - a.silhouette.height, r, snap, false);
    farTiled(sctx, tint(a.cloudBank), STACK.cloudBank.p * camLeft, F + STACK.cloudBank.bottom - a.cloudBank.height, r, snap, true);
    const period = Math.max(STACK.cumulus.period, span.x1 - span.x0 + 400);
    for (const s of CUMULUS) {
      const img = tint(a.cumulus[s.i]!);
      cloud(img, wrap(drift(s, STACK.cumulus.p), img.width, period), Math.round(skyTop * s.yFrac));
    }
    sctx.restore();
  }

  /**
   * What drawFar shows that moves on the wall clock, as one number: the far clouds' positions in
   * whole art px. The monitor's screen frame redraws only when this, the camera or Sam changes.
   */
  farKey(f: Frame): number {
    const { camLeft, now, span } = f;
    const a = this.a;
    const w = span.x1 - span.x0;
    let key = 0;
    const add = (s: Seed, p: number, period: number) => {
      key = (key * 31 + Math.round(mod(s.u + s.drift * (now / 1000) - p * camLeft - span.x0, period))) % 1e9;
    };
    for (const s of SMALL) add(s, STACK.small.p, w + a.small[s.i]!.width);
    for (const s of MEDIUM) add(s, STACK.medium.p, w + a.medium[s.i]!.width);
    for (const s of CUMULUS) add(s, STACK.cumulus.p, Math.max(STACK.cumulus.period, w + 400));
    return key;
  }

  /**
   * @param clear true for the viewport buffer, which drawFar's sky shows through; false for the
   *   monitor's screen frame, where drawFar has just painted the sky into the same canvas
   */
  draw(ctx: CanvasRenderingContext2D, f: Frame, clear = true): void {
    const { t, camLeft, sx, F, bw, bh, now, range: r } = f;
    const a = this.a;
    const c = this.city;
    const nt = this.night;
    // A layer's palette step: into the night from its NIGHT start, back to day from its DAWN start.
    const toNight = (start: number) => Math.min(NIGHT_STEPS, Math.max(0, Math.floor(((t - start) / NIGHT.span) * NIGHT_STEPS)));
    const toDay = (start: number | undefined) => (DAWN && start !== undefined ? Math.min(NIGHT_STEPS, Math.max(0, NIGHT_STEPS - Math.floor(((t - start) / DAWN.span) * NIGHT_STEPS))) : NIGHT_STEPS);
    const stepOf = (night: number, dawn?: number) => Math.min(toNight(night), toDay(dawn));
    const streetStep = stepOf(NIGHT.street, DAWN?.street);
    // Windows light one by one through the night and, at dawn, go dark one by one.
    const lightsOn = (on: readonly number[], out: readonly [number, number]) =>
      clamp01((t - on[0]!) / (on[1]! - on[0]!)) * (DAWN ? 1 - clamp01((t - out[0]) / (out[1] - out[0])) : 1);
    const lit = (l: Lights, on: readonly [number, number, number], out: readonly [number, number]) => l.at(lightsOn(on, out), on[2]);
    // The plaza's steps: Javits darkens with the towers and comes back to day first of the near layers; its props with the street.
    const plazaLook: PlazaLook = { facade: stepOf(NIGHT.towers, DAWN?.javits), street: streetStep };
    /** Layer-space u of the right edge of the screen when Sam is at world x — where a layer begins or ends. */
    const edgeAt = (p: number, x: number) => p * (x - sx) + bw;
    // Those starts and ends are cut to fall just past the viewport's right edge. The monitor's wider
    // frame draws what lies past that edge as if nothing had begun or ended there yet, so no cut shows
    // in its margin; the viewport itself is unchanged.
    const past = (u: number, p: number) => u - p * camLeft >= bw;
    const begin = (u: number, p: number) => (past(u, p) ? Infinity : u);
    const end = (u: number, p: number) => (past(u, p) ? Infinity : u);
    const place = (img: Drawable, p: number, u: number, bottom: number) => {
      const x = Math.round(u - p * camLeft);
      if (x + img.width > r.x0 && x < r.x1) ctx.drawImage(img, x, Math.round(bottom - img.height));
    };

    // The sky and the clouds are drawn on the screen canvas behind this buffer (drawFar); the buffer
    // starts transparent so they show through wherever nothing nearer covers them.
    if (clear) ctx.clearRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x0, r.y0, r.x1 - r.x0, F - r.y0);
    ctx.clip();

    // ── Hills: full saturation, plain tiling, ending at a tile boundary and scrolling off ──
    const hillsEnd = edgeAt(STACK.hills.p, SEQ.hillsEnd);
    drawTiled(ctx, a.hills, STACK.hills.p * camLeft, F + STACK.hills.bottom - a.hills.height, r, { to: end(hillsEnd, STACK.hills.p), phase: mod(hillsEnd, a.hills.width) });

    // ── The far city and the towers scroll in on the horizon, each at its own speed; the plain in
    //    front of them hides where their art ends ──
    // The opening in the near fronts, as the world x at which it is centred on screen; the other
    // layers' openings and the silhouette line up with it (all solved per device from the geometry).
    const nearBegin = edgeAt(STACK.cityNear.p, SEQ.nearBegin);
    const Xgap = sx + (nearBegin + (STACK.cityNear.gapFrom + STACK.cityNear.gapTo) / 2 - bw / 2) / STACK.cityNear.p;
    const centreAt = (p: number) => p * (Xgap - sx) + bw / 2;
    // ── Where the city ends: the side wall of a block in the near fronts — the last
    //    of their clean ends to have cleared the left of the screen by SEQ.cityClear, solved per device.
    //    The near fronts are a wall to the top of every viewport, so that wall is a curtain: everything
    //    between it and the far skyline is cut at it — the city to its left, the plaza to its right.
    const nearPhase = nearBegin - STACK.cityNear.leadColumn;
    const nearEnd = cityEndU(nearPhase, STACK.cityNear.p * (SEQ.cityClear - sx));
    const endShown = end(nearEnd, STACK.cityNear.p);
    const cityEndX = endShown === Infinity ? Infinity : Math.round(nearEnd - STACK.cityNear.p * camLeft);
    const cityOnly = (draw: () => void) => {
      if (cityEndX >= r.x1) return draw();
      if (cityEndX <= r.x0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x0, r.y0, cityEndX - r.x0, r.y1 - r.y0);
      ctx.clip();
      draw();
      ctx.restore();
    };
    if (c) {
      const farBegin = edgeAt(STACK.cityFar.p, SEQ.farBegin);
      const farImg = nt ? nt.far.at(stepOf(NIGHT.far, DAWN?.far)) : c.far;
      const farOpts = { mirror: true, from: begin(farBegin, STACK.cityFar.p), phase: farBegin };
      const farY = F + STACK.cityFar.bottom - c.far.height;
      drawTiled(ctx, farImg, STACK.cityFar.p * camLeft, farY, r, farOpts);
      const farLit = nt && lit(nt.lights.far, LIGHTS.far, LIGHTS_OUT.far);
      if (farLit) drawTiled(ctx, farLit, STACK.cityFar.p * camLeft, farY, r, farOpts);
      cityOnly(() => {
        place(nt ? nt.javits.at(stepOf(NIGHT.towers, DAWN?.towers)) : c.javits, STACK.javits.p, centreAt(STACK.javits.p) - c.javits.width / 2, F + STACK.cityFar.bottom);
        const towersBegin = edgeAt(STACK.towers.p, SEQ.towersBegin);
        const tw = alignOpening(STACK.towers.period, towersBegin, centreAt(STACK.towers.p), TOWER_GAPS, insideClear);
        const towersY = F + STACK.towers.bottom - c.towers.height;
        const towersImg = nt ? nt.towers.at(stepOf(NIGHT.towers, DAWN?.towers)) : c.towers;
        const towersLit = nt && lit(nt.lights.towers, LIGHTS.towers, LIGHTS_OUT.towers);
        for (const img of towersLit ? [towersImg, towersLit] : [towersImg]) {
          const tb = begin(towersBegin, STACK.towers.p);
          drawTiled(ctx, img, STACK.towers.p * camLeft, towersY, r, { from: tb, to: tw.gapL, phase: tw.phase });
          drawTiled(ctx, img, STACK.towers.p * camLeft, towersY, r, { from: Math.max(tb, tw.gapR), phase: tw.phase });
        }
      });
    }
    drawTiled(ctx, a.plain, STACK.plain.p * camLeft, F + STACK.plain.top, r);
    // The plaza: Javits beyond the city's last block, the far skyline behind its low wings.
    if (c) this.plaza.drawFacade(ctx, f, cityEndX, plazaLook);

    // ── Mid layer: bushes and trees at 0.45, ending as the mid buildings arrive ──
    const midHedgeEnd = edgeAt(STACK.midHedge.p, SEQ.midHedgeEnd);
    const midScroll = STACK.midHedge.p * camLeft;
    drawTiled(ctx, a.hedge, midScroll, F + STACK.midHedge.bottom - a.hedge.height, r, { to: end(midHedgeEnd, STACK.midHedge.p), phase: mod(midHedgeEnd, a.hedge.width) });
    for (const u of MID_TREES) if (u + a.treeField.width <= midHedgeEnd) place(a.treeField, STACK.midHedge.p, u, F + STACK.midHedge.treeBottom);

    if (c) {
      cityOnly(() => {
        const midBegin = edgeAt(STACK.cityMid.p, SEQ.cityMidBegin);
        const md = alignOpening(STACK.cityMid.period, midBegin, centreAt(STACK.cityMid.p), MID_GAPS, nearestEdge);
        const midY = F + STACK.cityMid.bottom - c.mid.height;
        const midImg = nt ? nt.mid.at(stepOf(NIGHT.mid, DAWN?.mid)) : c.mid;
        const midLit = nt && lit(nt.lights.mid, LIGHTS.mid, LIGHTS_OUT.mid);
        for (const img of midLit ? [midImg, midLit] : [midImg]) {
          const mb = begin(midBegin, STACK.cityMid.p);
          drawTiled(ctx, img, STACK.cityMid.p * camLeft, midY, r, { from: mb, to: md.gapL, phase: md.phase });
          drawTiled(ctx, img, STACK.cityMid.p * camLeft, midY, r, { from: Math.max(mb, md.gapR), phase: md.phase });
        }
      });
      const nearY = F + STACK.cityNear.bottom - c.near.height;
      const nearImg = nt ? nt.near.at(stepOf(NIGHT.near, DAWN?.near)) : c.near;
      const nearLit = nt && lit(nt.lights.near, LIGHTS.near, LIGHTS_OUT.near);
      for (const img of nearLit ? [nearImg, nearLit] : [nearImg]) {
        const nb = begin(nearBegin, STACK.cityNear.p);
        drawTiled(ctx, img, STACK.cityNear.p * camLeft, nearY, r, { from: nb, to: nearBegin + STACK.cityNear.gapFrom, phase: nearPhase });
        drawTiled(ctx, img, STACK.cityNear.p * camLeft, nearY, r, { from: nb === Infinity ? Infinity : nearBegin + STACK.cityNear.gapTo, to: endShown, phase: nearPhase });
      }
      place(nt ? nt.poster.at(streetStep) : c.poster, STACK.cityNear.p, nearBegin + POSTER_U, F - 30);
      const signs = this.signs ?? (this.signs = buildSigns(c));
      const neon = t >= NEON_AT && t < NEON_OFF;
      place(neon ? signs.billboard.neon : signs.billboard.day, STACK.cityNear.p, nearBegin + BILLBOARD.u, F + BILLBOARD.bottom);
    }
    ctx.restore();

    // ── Behind Sam (p 1): bushes rooted in the grass and the field trees, drawn before the ground
    //    so their buried bases vanish under it ──
    drawTiled(ctx, a.hedge, camLeft, F + STACK.near.hedgeBottom - a.hedge.height, r, { to: SEQ.hedgeEnd });
    for (const x of FIELD_TREES) place(a.treeField, 1, x, F + STACK.near.treeBottom);

    // ── Ground: three bands, three vertical seams 28 px apart, farthest-down last ──
    const g = STACK.ground;
    const seamEdge = SEQ.seam + g.seamStep;
    const seamFill = SEQ.seam + 2 * g.seamStep;
    const edgeX = Math.min(r.x1, Math.round(seamEdge - camLeft));
    if (edgeX > r.x0) {
      ctx.fillStyle = a.dirt;
      ctx.fillRect(r.x0, F + g.edgeTop, edgeX - r.x0, g.fillTop - g.edgeTop);
    }
    // The fill band, and below the viewport (the monitor's screen frame only) the same fill carrying on down.
    // The street's bands run on as the plaza's paving and stop at its three seams, where the daisy bed takes over.
    const plazaSurface = PLAZA.seam;
    const plazaEdge = PLAZA.seam + g.seamStep;
    const plazaFill = PLAZA.seam + 2 * g.seamStep;
    const road = c ? (nt ? nt.road.at(streetStep) : c.road) : null;
    for (let y = F + g.fillTop; y < Math.max(bh, r.y1); y += a.dirtFill.height) {
      drawTiled(ctx, a.dirtFill, camLeft, y, r, { to: seamFill, phase: g.daisyPhase });
      if (road) drawTiled(ctx, road, camLeft, y, r, { from: seamFill, to: plazaFill });
    }
    drawTiled(ctx, a.dirtRows, camLeft, F + g.edgeTop, r, { to: seamEdge, phase: g.daisyPhase });
    drawTiled(ctx, a.daisySurface, camLeft, F + g.daisyTop, r, { to: SEQ.seam, phase: g.daisyPhase });
    if (c) {
      const sw = nt ? nt.sidewalk.at(streetStep) : c.sidewalk;
      drawTiled(ctx, sw, camLeft, F, r, { from: SEQ.seam, to: plazaSurface });
      drawTiled(ctx, nt ? nt.kerb.at(streetStep) : c.kerb, camLeft, F + g.edgeTop, r, { from: seamEdge, to: plazaEdge });
      // The seam details: tufts on the first slabs, a lighter kerb end-stone, dirt pixels on kerb and road.
      place(nt ? nt.seam.at(streetStep) : c.seam, 1, SEQ.seam + g.seamTileLeft, F + g.seamTileTop + c.seam.height);
      this.plaza.drawGround(ctx, f, plazaLook);
    }

    if (c) {
      // Everything on the street stands on the surface like a field prop; the fence starts on the grass.
      const base = F + STACK.near.bottom;
      const fence = nt ? nt.fence.at(streetStep) : c.fence;
      for (let x = SEQ.fenceBegin; x < SEQ.fenceEnd; x += c.fence.width) place(fence, 1, x, base);
      place(nt ? nt.subway.at(streetStep) : c.subway, 1, SEQ.subway, base);
      const tree = nt ? nt.tree.at(streetStep) : a.tree;
      for (const x of STREET_TREES) place(tree, 1, x, base);
      const plant = nt ? nt.plant.at(streetStep) : c.plant;
      for (const x of PLANTS) place(plant, 1, x, base);
      const arcade = nt ? nt.arcade.at(streetStep) : c.arcade;
      for (const x of [...ARCADES, PARTY.x, PARTY.x + PARTY.arcadeGap]) place(arcade, 1, x, base);
      const party = this.signs ? (t >= NEON_AT && t < NEON_OFF ? this.signs.party.neon : this.signs.party.day) : null;
      if (party) place(party, 1, PARTY.x + (PARTY.arcadeGap + c.arcade.width) / 2 - party.width / 2, base - c.arcade.height - 6);
      // Characters live on their own clocks, independent of Sam: idle loops, and the dog patrolling.
      const npc = (st: Strip) => (nt ? stripOver(nt.strips.get(st)!.at(streetStep), st) : st);
      const feet = F - 60 + FOOT_SINK;
      npc(c.molePhone).draw(ctx, Math.floor(now / 500), NPCS.molePhone - camLeft, feet);
      npc(c.moleCoffee).draw(ctx, Math.floor(now / 125), NPCS.moleCoffee - camLeft, feet);
      npc(c.molesChess).draw(ctx, Math.floor(now / 400), NPCS.molesChess - camLeft, F - c.molesChess.fh + FOOT_SINK);
      npc(c.molesSofa).draw(ctx, Math.floor(now / 160), NPCS.molesSofa - camLeft, F - c.molesSofa.fh + FOOT_SINK);
      npc(c.molePizza).draw(ctx, Math.floor(now / 140), NPCS.molePizza - camLeft, feet);
      npc(c.dogBark).draw(ctx, Math.floor(now / 180), NPCS.dogBark - camLeft, feet, true);
      npc(c.molePhone).draw(ctx, Math.floor(now / 700) + 1, NPCS.molePhone2 - camLeft, feet, true);
      const span = DOG.to - DOG.from;
      const travelled = (now / 1000) * DOG.speed;
      const leg = travelled % (2 * span);
      const goingLeft = leg < span;
      const dogX = goingLeft ? DOG.to - leg : DOG.from + (leg - span);
      npc(c.dog).draw(ctx, Math.floor(travelled / DOG.stride), dogX - camLeft, feet, goingLeft);
      this.plaza.drawProps(ctx, f, plazaLook);
    }

    f.coins.draw(ctx, a.coin, camLeft, F, r, now);
    if (!f.hideSam) f.sam.draw(ctx, f.samX - camLeft, F);
    f.dust.draw(ctx, camLeft, F + FOOT_SINK, now);
  }
}
