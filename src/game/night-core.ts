/**
 * The night's heavy lifting, DOM-free so it runs in the night worker: index an
 * image's colours, map them to night tokens by role and luminance rank, build the fully mapped
 * night image, and find a layer's windows (glass-role components, panes merged, shuffled).
 */
export type ColorMap = Record<string, string>;
/** A night palette: explicit colours, or a luminance-rank split into targets with role overrides. */
/**
 * A layer's night colours: an explicit map; a rank by luminance into a few tokens (buildings, the street); or a
 * shade, every colour mixed `amount` of the way towards a night ink, so it keeps its own hue (characters: a
 * brown dog stays a dimmer brown, never a grey).
 */
export type NightSpec =
  { map: ColorMap } | { rank: { targets: string[]; weights?: number[]; roles?: ColorMap } } | { shade: { toward: string; amount: number; roles?: ColorMap } };

export const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const hexOf = (p: number) => `#${p.toString(16).padStart(6, '0').toUpperCase()}`;
const lum = (p: number) => 0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255);
export const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface Indexed {
  w: number;
  h: number;
  colors: number[];
  counts: number[];
  idx: Uint16Array;
  alpha: Uint8Array;
}

/** Each pixel's colour index into `colors`, plus alpha. */
export function indexImage(d: Uint8ClampedArray, w: number, h: number): Indexed {
  const n = w * h;
  const im: Indexed = { w, h, colors: [], counts: [], idx: new Uint16Array(n), alpha: new Uint8Array(n) };
  const lookup = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3]!;
    im.alpha[i] = a;
    if (a === 0) continue;
    const p = pack(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
    let c = lookup.get(p);
    if (c === undefined) {
      c = im.colors.length;
      lookup.set(p, c);
      im.colors.push(p);
      im.counts.push(0);
    }
    im.counts[c]!++;
    im.idx[i] = c;
  }
  return im;
}

/**
 * Map every colour to one of `targets` by luminance rank, splitting the colours by cumulative pixel
 * share (`weights`, default equal), then apply explicit `roles` on top.
 */
function rankMap(im: Indexed, targets: string[], weights?: number[], roles: ColorMap = {}): ColorMap {
  const order = im.colors.map((p, i) => ({ p, n: im.counts[i]! })).sort((a, b) => lum(a.p) - lum(b.p));
  const total = order.reduce((s, c) => s + c.n, 0);
  const w = weights ?? targets.map(() => 1);
  const wsum = w.reduce((s, v) => s + v, 0);
  const map: ColorMap = {};
  let acc = 0;
  for (const c of order) {
    const share = (acc + c.n / 2) / total;
    let cut = 0;
    let t = 0;
    for (; t < targets.length - 1; t++) {
      cut += w[t]! / wsum;
      if (share < cut) break;
    }
    map[hexOf(c.p)] = targets[t]!;
    acc += c.n;
  }
  for (const [from, to] of Object.entries(roles)) map[from.toUpperCase()] = to;
  return map;
}

export function mapOf(im: Indexed, spec: NightSpec): ColorMap {
  if ('map' in spec) return spec.map;
  if ('rank' in spec) return rankMap(im, spec.rank.targets, spec.rank.weights, spec.rank.roles);
  const [tr, tg, tb] = rgbOf(spec.shade.toward);
  const k = spec.shade.amount;
  const map: ColorMap = {};
  for (const p of im.colors) {
    const r = Math.round(((p >> 16) & 255) * (1 - k) + tr * k);
    const g = Math.round(((p >> 8) & 255) * (1 - k) + tg * k);
    const b = Math.round((p & 255) * (1 - k) + tb * k);
    map[hexOf(p)] = hexOf(pack(r, g, b));
  }
  for (const [from, to] of Object.entries(spec.shade.roles ?? {})) map[from.toUpperCase()] = to;
  return map;
}

/** The fully mapped night image (every colour at its night token, alpha kept), as RGBA. */
export function nightImage(im: Indexed, map: ColorMap): Uint8ClampedArray {
  const upper: ColorMap = {};
  for (const [k, v] of Object.entries(map)) upper[k.toUpperCase()] = v;
  const pal = im.colors.map((p) => {
    const to = upper[hexOf(p)];
    return to ? rgbOf(to) : ([(p >> 16) & 255, (p >> 8) & 255, p & 255] as [number, number, number]);
  });
  const out = new Uint8ClampedArray(im.w * im.h * 4);
  for (let i = 0, n = im.w * im.h; i < n; i++) {
    const a = im.alpha[i]!;
    if (a === 0) continue;
    const c = pal[im.idx[i]!]!;
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = a;
  }
  return out;
}

export interface Run {
  y: number;
  x0: number;
  x1: number;
}
interface LitWindow {
  runs: Run[];
}

/** A layer's windows: glass-colour connected components, panes merged, in a deterministic shuffled order. */
export function findWindows(im: Indexed, glass: string[], wrap: boolean): LitWindow[] {
  const glassIdx = new Set<number>();
  const wanted = new Set(glass.map((h) => pack(...rgbOf(h))));
  im.colors.forEach((p, i) => {
    if (wanted.has(p)) glassIdx.add(i);
  });
  const { w, h, idx, alpha } = im;
  const seen = new Uint8Array(w * h);
  const isGlass = (i: number) => alpha[i] !== 0 && glassIdx.has(idx[i]!);
  const comps: Run[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !isGlass(start)) continue;
    const runs: Run[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const y = (i / w) | 0;
      let x0 = i % w;
      let x1 = x0;
      while (x0 - 1 >= 0 && !seen[y * w + x0 - 1] && isGlass(y * w + x0 - 1)) {
        x0--;
        seen[y * w + x0] = 1;
      }
      while (x1 + 1 < w && !seen[y * w + x1 + 1] && isGlass(y * w + x1 + 1)) {
        x1++;
        seen[y * w + x1] = 1;
      }
      runs.push({ y, x0, x1 });
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        for (let x = x0; x <= x1; x++) {
          const j = ny * w + x;
          if (!seen[j] && isGlass(j)) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    comps.push(runs);
  }
  return shuffle(mergePanes(comps, wrap ? w : 0));
}

/**
 * Each window as its own small sprite: its bounding box, with its glass pixels in the lit colour and
 * everything else transparent (another window inside the box stays out). One draw per window.
 */
export function windowSprites(ws: LitWindow[], lit: [number, number, number]): { boxes: Int32Array; pixels: Uint8ClampedArray[] } {
  const boxes = new Int32Array(ws.length * 4);
  const pixels: Uint8ClampedArray[] = [];
  ws.forEach((win, i) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const r of win.runs) {
      if (r.x0 < x0) x0 = r.x0;
      if (r.x1 > x1) x1 = r.x1;
      if (r.y < y0) y0 = r.y;
      if (r.y > y1) y1 = r.y;
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    boxes.set([x0, y0, w, h], i * 4);
    const px = new Uint8ClampedArray(w * h * 4);
    for (const r of win.runs) {
      for (let x = r.x0; x <= r.x1; x++) {
        const j = ((r.y - y0) * w + (x - x0)) * 4;
        px[j] = lit[0];
        px[j + 1] = lit[1];
        px[j + 2] = lit[2];
        px[j + 3] = 255;
      }
    }
    pixels.push(px);
  });
  return { boxes, pixels };
}

/** Bounding box of a component. */
function box(runs: Run[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of runs) {
    if (r.x0 < x0) x0 = r.x0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.y < y0) y0 = r.y;
    if (r.y > y1) y1 = r.y;
  }
  return { x0, y0, x1, y1 };
}

/** Frames between panes of one window are up to this wide; walls between windows are wider. */
const MULLION = 6;

/**
 * Panes of one window are separate glass components split by a mullion: stacked panes share
 * their left and right edges, side-by-side panes share their top or their sill (a balcony door
 * whose glass runs on behind the railing stands beside the window panes under one lintel), and the
 * glass seen between a balcony's slats lies within the columns of the pane right above it (a
 * transom, within the window under it). Merge them so a window lights as one, on its glass pixels
 * only. What is still narrow and short after that, or a single row, in a layer whose windows are
 * big is a sliver by a drainpipe or a cut edge, not a window: it never lights.
 */
function mergePanes(comps: Run[][], wrapWidth = 0): LitWindow[] {
  const boxes = comps.map(box);
  const parent = comps.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  if (wrapWidth) {
    // The tile edge cuts through windows: the part ending on the last column and the part starting
    // on the first column of the next tile share their rows and are one window.
    const atRight = boxes.map((_, i) => i).filter((i) => boxes[i]!.x1 === wrapWidth - 1);
    const atLeft = boxes.map((_, i) => i).filter((i) => boxes[i]!.x0 === 0);
    for (const i of atRight) {
      for (const j of atLeft) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (Math.abs(a.y0 - b.y0) <= 1 && Math.abs(a.y1 - b.y1) <= 1) parent[root(i)] = root(j);
      }
    }
  }
  const byRow = boxes.map((_, i) => i).sort((a, b) => boxes[a]!.y0 - boxes[b]!.y0);
  for (let oi = 0; oi < byRow.length; oi++) {
    const i = byRow[oi]!;
    const a = boxes[i]!;
    for (let oj = oi + 1; oj < byRow.length; oj++) {
      const j = byRow[oj]!;
      const b = boxes[j]!;
      if (b.y0 - a.y1 - 1 > MULLION) break; // sorted by top row: nothing later starts close enough
      const vGap = b.y0 - a.y1 - 1;
      const hGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1;
      const aligned = Math.abs(a.y0 - b.y0) <= 1 || Math.abs(a.y1 - b.y1) <= 1;
      const sameCols = Math.abs(a.x0 - b.x0) <= 1 && Math.abs(a.x1 - b.x1) <= 1;
      const inside = (n: typeof a, wide: typeof a) => n.x0 >= wide.x0 - 1 && n.x1 <= wide.x1 + 1 && n.x1 - n.x0 < wide.x1 - wide.x0;
      if (aligned && hGap >= 0 && hGap <= MULLION) parent[root(i)] = root(j);
      else if (vGap >= 0 && vGap <= MULLION && (sameCols || inside(b, a) || inside(a, b))) parent[root(i)] = root(j);
    }
  }
  const groups = new Map<number, Run[]>();
  comps.forEach((runs, i) => {
    const r = root(i);
    const g = groups.get(r);
    if (g) g.push(...runs);
    else groups.set(r, [...runs]);
  });
  const windows = [...groups.values()].map((runs) => ({ runs, ...box(runs) }));
  const median = (vs: number[]) => vs.sort((a, b) => a - b)[vs.length >> 1] ?? 0;
  const typicalW = median(windows.map((w) => w.x1 - w.x0 + 1));
  const typicalH = median(windows.map((w) => w.y1 - w.y0 + 1));
  return windows
    .filter((w) => {
      const ww = w.x1 - w.x0 + 1;
      const hh = w.y1 - w.y0 + 1;
      const sliver = typicalW > 2 * MULLION && ww <= MULLION && hh < 4 * MULLION;
      const line = typicalH >= 8 && hh <= 2;
      return !sliver && !line;
    })
    .map(({ runs }) => ({ runs }));
}

/** A deterministic shuffle, so windows light across the facade rather than in scan order. */
function shuffle<T>(items: T[]): T[] {
  let seed = 1664525;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
