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

export interface Frame {
  X: number;
  camLeft: number;
  /** Sam's screen x (the camera's left margin), buffer px. */
  sx: number;
  F: number;
  bw: number;
  bh: number;
  now: number;
  /** The stage's flat sky colour. */
  sky: string;
  sam: Sam;
  samX: number;
  coins: Coins;
  dust: Dust;
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
  fenceEnd: 3700,
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
  towers: { p: 0.35, bottom: -1 }, // standing on the ground; the plain hides their feet
  plain: { p: 0.38, top: -100 }, // the hills' flat field in front of the far city and the towers, covering where their art ends
  cityMid: { p: 0.5, bottom: -1 },
  /** Both hedges sit 20 px into the ground so their dark base is under the grass; only the bushes show. */
  midHedge: { p: 0.45, bottom: 20, treeBottom: 1 },
  cityNear: { p: 0.75, bottom: 2, leadColumn: 294 },
  cityMidLead: 104,
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
const TINY_DAISIES = [560, 760, 1100, 1420, 1700];
/** The street, world x. */
const STREET_TREES = [2330, 2630, 2930, 3230, 3530];
const PLANTS = [2400, 2950, 3350];
const ARCADES = [2620, 3420];
const NPCS = { molePhone: 2380, moleCoffee: 2680, moleTyping: 3230 } as const;
/** The dog patrols the sidewalk on its own clock, independent of Sam: world px and px/s. */
const DOG = { from: 2700, to: 3100, speed: 28, stride: 8 } as const;
const POSTER_U = 420; // on the near fronts, in that layer's space

function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  scroll: number,
  y: number,
  bw: number,
  opts: { mirror?: boolean; from?: number; to?: number; phase?: number } = {},
): void {
  const w = img.width;
  const { mirror = false, from = -Infinity, to = Infinity, phase = 0 } = opts;
  const bounded = Number.isFinite(from) || Number.isFinite(to);
  if (bounded) {
    const x0 = Number.isFinite(from) ? Math.round(from - scroll) : -1e6;
    const x1 = Number.isFinite(to) ? Math.round(to - scroll) : 1e6;
    if (x1 <= 0 || x0 >= bw) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, -1e6, x1 - x0, 2e6);
    ctx.clip();
  }
  const first = Math.floor((scroll - phase) / w);
  const last = Math.floor((scroll - phase + bw) / w);
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

  constructor(private readonly a: Level1Assets) {}

  draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const { X, camLeft, sx, F, bw, bh, now } = f;
    const a = this.a;
    const c = this.city;
    /** Layer-space u of the right edge of the screen when Sam is at world x — where a layer begins or ends. */
    const edgeAt = (p: number, x: number) => p * (x - sx) + bw;
    const place = (img: Drawable, p: number, u: number, bottom: number) => {
      const x = Math.round(u - p * camLeft);
      if (x > -img.width && x < bw) ctx.drawImage(img, x, Math.round(bottom - img.height));
    };

    // ── Sky: one flat colour ──────────────────────────────────────────────
    ctx.fillStyle = f.sky;
    ctx.fillRect(0, 0, bw, bh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, bw, F);
    ctx.clip();

    // ── Clouds at every height: small and high, medium, the bank above the hills, big lobes mid sky ──
    const skyTop = Math.max(40, F - 300);
    for (const s of SMALL) {
      const img = a.small[s.i]!;
      const span = bw + img.width;
      const u = s.u + s.drift * (now / 1000) - STACK.small.p * camLeft;
      ctx.drawImage(img, Math.round(mod(u, span) - img.width), Math.round(skyTop * s.yFrac));
    }
    for (const s of MEDIUM) {
      const img = a.medium[s.i]!;
      const span = bw + img.width;
      const u = s.u + s.drift * (now / 1000) - STACK.medium.p * camLeft;
      ctx.drawImage(img, Math.round(mod(u, span) - img.width), Math.round(skyTop * s.yFrac));
    }
    drawTiled(ctx, a.silhouette, STACK.silhouette.p * camLeft, F + STACK.silhouette.bottom - a.silhouette.height, bw);
    drawTiled(ctx, a.cloudBank, STACK.cloudBank.p * camLeft, F + STACK.cloudBank.bottom - a.cloudBank.height, bw, { mirror: true });
    const period = Math.max(STACK.cumulus.period, bw + 400);
    for (const s of CUMULUS) {
      const img = a.cumulus[s.i]!;
      const u = s.u + s.drift * (now / 1000) - STACK.cumulus.p * camLeft;
      const x = Math.round(mod(u, period) - img.width);
      if (x < bw) ctx.drawImage(img, x, Math.round(skyTop * s.yFrac));
    }

    // ── Hills: full saturation, plain tiling, ending at a tile boundary and scrolling off ──
    const hillsEnd = edgeAt(STACK.hills.p, SEQ.hillsEnd);
    drawTiled(ctx, a.hills, STACK.hills.p * camLeft, F + STACK.hills.bottom - a.hills.height, bw, { to: hillsEnd, phase: mod(hillsEnd, a.hills.width) });

    // ── The far city and the towers scroll in on the horizon, each at its own speed; the plain in
    //    front of them hides where their art ends ──
    if (c) {
      const farBegin = edgeAt(STACK.cityFar.p, SEQ.farBegin);
      drawTiled(ctx, c.far, STACK.cityFar.p * camLeft, F + STACK.cityFar.bottom - c.far.height, bw, { mirror: true, from: farBegin, phase: farBegin });
      const towersBegin = edgeAt(STACK.towers.p, SEQ.towersBegin);
      drawTiled(ctx, c.towers, STACK.towers.p * camLeft, F + STACK.towers.bottom - c.towers.height, bw, { mirror: true, from: towersBegin, phase: towersBegin });
    }
    drawTiled(ctx, a.plain, STACK.plain.p * camLeft, F + STACK.plain.top, bw);

    // ── Mid layer: bushes and trees at 0.45, ending as the mid buildings arrive ──
    const midHedgeEnd = edgeAt(STACK.midHedge.p, SEQ.midHedgeEnd);
    const midScroll = STACK.midHedge.p * camLeft;
    drawTiled(ctx, a.hedge, midScroll, F + STACK.midHedge.bottom - a.hedge.height, bw, { to: midHedgeEnd, phase: mod(midHedgeEnd, a.hedge.width) });
    for (const u of MID_TREES) if (u + a.treeField.width <= midHedgeEnd) place(a.treeField, STACK.midHedge.p, u, F + STACK.midHedge.treeBottom);

    if (c) {
      const midBegin = edgeAt(STACK.cityMid.p, SEQ.cityMidBegin);
      drawTiled(ctx, c.mid, STACK.cityMid.p * camLeft, F + STACK.cityMid.bottom - c.mid.height, bw, { from: midBegin, phase: midBegin - STACK.cityMidLead });
      const nearBegin = edgeAt(STACK.cityNear.p, SEQ.nearBegin);
      drawTiled(ctx, c.near, STACK.cityNear.p * camLeft, F + STACK.cityNear.bottom - c.near.height, bw, { from: nearBegin, phase: nearBegin - STACK.cityNear.leadColumn });
      place(c.poster, STACK.cityNear.p, nearBegin + POSTER_U, F - 30);
    }
    ctx.restore();

    // ── Behind Sam (p 1): bushes rooted in the grass and the field trees, drawn before the ground
    //    so their buried bases vanish under it ──
    drawTiled(ctx, a.hedge, camLeft, F + STACK.near.hedgeBottom - a.hedge.height, bw, { to: SEQ.hedgeEnd });
    for (const x of FIELD_TREES) place(a.treeField, 1, x, F + STACK.near.treeBottom);

    // ── Ground: three bands, three vertical seams 28 px apart, farthest-down last ──
    const g = STACK.ground;
    const seamEdge = SEQ.seam + g.seamStep;
    const seamFill = SEQ.seam + 2 * g.seamStep;
    const edgeX = Math.min(bw, Math.round(seamEdge - camLeft));
    const fillX = Math.min(bw, Math.round(seamFill - camLeft));
    if (edgeX > 0) {
      ctx.fillStyle = a.dirt;
      ctx.fillRect(0, F + g.edgeTop, edgeX, g.fillTop - g.edgeTop);
    }
    if (fillX > 0) {
      ctx.fillStyle = a.dirtDeep;
      ctx.fillRect(0, F + g.fillTop, fillX, bh - F - g.fillTop);
    }
    drawTiled(ctx, a.dirtRows, camLeft, F + g.edgeTop, bw, { to: seamEdge, phase: g.daisyPhase });
    drawTiled(ctx, a.daisySurface, camLeft, F + g.daisyTop, bw, { to: SEQ.seam, phase: g.daisyPhase });
    if (c) {
      drawTiled(ctx, c.sidewalk, camLeft, F, bw, { from: SEQ.seam });
      drawTiled(ctx, c.kerb, camLeft, F + g.edgeTop, bw, { from: seamEdge });
      drawTiled(ctx, c.road, camLeft, F + g.fillTop, bw, { from: seamFill });
      // The seam details: tufts on the first slabs, a lighter kerb end-stone, dirt pixels on kerb and road.
      place(c.seam, 1, SEQ.seam + g.seamTileLeft, F + g.seamTileTop + c.seam.height);
    }

    for (const x of TINY_DAISIES) place(a.daisyTiny, 1, x, F);
    if (c) {
      // Everything on the street stands on the surface like a field prop; the fence starts on the grass.
      const base = F + STACK.near.bottom;
      for (let x = SEQ.fenceBegin; x < SEQ.fenceEnd; x += c.fence.width) place(c.fence, 1, x, base);
      place(c.subway, 1, SEQ.subway, base);
      for (const x of STREET_TREES) place(a.tree, 1, x, base);
      for (const x of PLANTS) place(c.plant, 1, x, base);
      for (const x of ARCADES) place(c.arcade, 1, x, base);
      // Characters live on their own clocks, independent of Sam: idle loops, and the dog patrolling.
      const feet = F - 60 + FOOT_SINK;
      c.molePhone.draw(ctx, Math.floor(now / 500), NPCS.molePhone - camLeft, feet);
      c.moleCoffee.draw(ctx, Math.floor(now / 125), NPCS.moleCoffee - camLeft, feet);
      c.moleTyping.draw(ctx, Math.floor(now / 160), NPCS.moleTyping - camLeft, feet);
      const span = DOG.to - DOG.from;
      const travelled = (now / 1000) * DOG.speed;
      const leg = travelled % (2 * span);
      const goingLeft = leg < span;
      const dogX = goingLeft ? DOG.to - leg : DOG.from + (leg - span);
      c.dog.draw(ctx, Math.floor(travelled / DOG.stride), dogX - camLeft, feet, goingLeft);
    }

    f.coins.draw(ctx, a.coin, camLeft, F, bw, now);
    f.sam.draw(ctx, f.samX - camLeft, F);
    f.dust.draw(ctx, camLeft, F + FOOT_SINK, now);
  }
}
