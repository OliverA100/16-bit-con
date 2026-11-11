/**
 * Palette work, all done once at asset-load time on offscreen canvases:
 *  - exact colour remaps (the Sam goggle/body swap),
 *  - later: the daisy-row snap and the day→night stage palettes.
 * Nothing here runs per frame and no derived file is ever written to disk.
 */
export type ColorMap = Record<string, string>; // '#RRGGBB' → '#RRGGBB'

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/**
 * Sam's careers-game sheets (run / jump / idle / smoking / portrait) use GREEN goggles and a slightly
 * different body palette from the brand sheets (propeller / side / climb). One pass maps
 * every careers colour to its brand counterpart, measured in sam-propeller-idle_8f_60x60.png.
 * The climb sheet (brand already) goes through it too: only its pure-black outline and nose change.
 * Single pass on the original pixel values: no chaining (#2E5700 → #1A0505 directly).
 */
export const SAM_BRAND_MAP: ColorMap = {
  // goggles
  '#D5FB19': '#0BECFF', // Green 100 lens rim      → cyan rim
  '#75A70D': '#097FCA', // Green 300 lens fill     → lens blue
  '#457D07': '#097FCA', // Green 500 strap         → lens blue
  '#2E5700': '#1A0505', // dark goggle frame       → brand outline (brand goggles are outlined)
  // body
  '#AE6228': '#BE6627', // fur
  '#834622': '#944F1E', // fur shade
  '#BD8A51': '#C09564', // hands (run / jump)
  '#C58F53': '#C09564', // hands (idle)
  '#000000': '#1A0505', // outline
  // the two odd ones out, measured 2026-11-11, so all five page sheets (idle, run, jump, smoking, climb) match
  '#77A50E': '#097FCA', // smoking: four lens pixels left green → lens blue
  '#FF4646': '#E34D56', // climb: its brighter nose → the nose pink of the other four
};

/** Returns a new canvas with `map` applied to every opaque pixel of `image` (exact RGB match). */
export function remap(image: HTMLImageElement | HTMLCanvasElement, map: ColorMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);

  const lut = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(map)) lut.set(pack(...hexToRgb(from)), hexToRgb(to));

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = lut.get(pack(d[i]!, d[i + 1]!, d[i + 2]!));
    if (to) {
      d[i] = to[0];
      d[i + 1] = to[1];
      d[i + 2] = to[2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Read a colour token from tokens.css so the canvas never carries raw hex. */
export function readToken(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`Token ${name} is not a 6-digit hex colour: "${v}"`);
  return v.toUpperCase();
}

/**
 * Snap an anti-aliased export to a hard palette. Vega's ground-daisy-row-strip is noisy
 * everywhere (4,099 colours, no two neighbours alike), so neither exact-colour frequency nor
 * "interior pixel" heuristics find its palette. This is real colour quantization: a 5-bit
 * histogram, weighted k-means with farthest-point seeding (so small but distinct colours such
 * as the yellow daisy centres survive), nearest-colour mapping, hard alpha. The palette is
 * ≤ `maxColors`, under the brief's ~16 per scene. Drawing untouched, no file written.
 */
export function snapToPalette(image: HTMLImageElement | HTMLCanvasElement, maxColors = 16, alphaThreshold = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  // 1) 5-bit histogram with colour sums, so each bucket carries its mean colour.
  interface Bucket { n: number; r: number; g: number; b: number }
  const hist = new Map<number, Bucket>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < alphaThreshold) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bk = hist.get(key);
    if (bk) {
      bk.n++;
      bk.r += r;
      bk.g += g;
      bk.b += b;
    } else hist.set(key, { n: 1, r, g, b });
  }
  const cands = [...hist.values()].map((bk) => ({ n: bk.n, r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n }));
  if (cands.length === 0) return canvas;
  const dist2 = (a: { r: number; g: number; b: number }, c: { r: number; g: number; b: number }) =>
    (a.r - c.r) ** 2 + (a.g - c.g) ** 2 + (a.b - c.b) ** 2;

  // 2) Farthest-point seeding weighted by population, then a few Lloyd iterations.
  const k = Math.min(maxColors, cands.length);
  const centers: { r: number; g: number; b: number }[] = [];
  let seed = cands[0]!;
  for (const c of cands) if (c.n > seed.n) seed = c;
  centers.push({ r: seed.r, g: seed.g, b: seed.b });
  while (centers.length < k) {
    let best = cands[0]!;
    let bestScore = -1;
    for (const c of cands) {
      let dmin = Infinity;
      for (const ce of centers) dmin = Math.min(dmin, dist2(c, ce));
      const score = c.n * dmin;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    centers.push({ r: best.r, g: best.g, b: best.b });
  }
  const assign = new Int32Array(cands.length);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < cands.length; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const dd = dist2(cands[i]!, centers[j]!);
        if (dd < bd) {
          bd = dd;
          bi = j;
        }
      }
      assign[i] = bi;
    }
    const acc = centers.map(() => ({ n: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < cands.length; i++) {
      const a = acc[assign[i]!]!;
      const c = cands[i]!;
      a.n += c.n;
      a.r += c.r * c.n;
      a.g += c.g * c.n;
      a.b += c.b * c.n;
    }
    acc.forEach((a, j) => {
      if (a.n > 0) centers[j] = { r: a.r / a.n, g: a.g / a.n, b: a.b / a.n };
    });
  }
  const palette = centers.map((c) => [Math.round(c.r), Math.round(c.g), Math.round(c.b)] as const);

  // 3) Map every pixel to its nearest palette colour; threshold alpha.
  const cache = new Map<number, readonly [number, number, number]>();
  const nearest = (r: number, g: number, b: number) => {
    const key = pack(r, g, b);
    let hit = cache.get(key);
    if (hit) return hit;
    let best = palette[0]!;
    let bestD = Infinity;
    for (const p of palette) {
      const dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    hit = best;
    cache.set(key, hit);
    return hit;
  };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < alphaThreshold) {
      d[i + 3] = 0;
      continue;
    }
    const p = nearest(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ── Load-time image helpers for the depth stack ────────────────────────────────────────

function toCanvas(image: HTMLImageElement | HTMLCanvasElement, w = image.width, h = image.height): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** A rectangular crop, 1:1, no resampling (planter off a tree, lobes out of the cumulus bank, tufts out of the daisy row). */
export function cropImage(image: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = toCanvas(image, w, h);
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/** The most frequent opaque colour in a region, as '#RRGGBB' (the daisy row's dirt, read from the art rather than typed). */
export function dominantColor(image: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): string {
  const { ctx } = toCanvas(image);
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(x, y, w, h).data;
  const counts = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = pack(d[i]!, d[i + 1]!, d[i + 2]!);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = -1;
  let bestN = 0;
  for (const [key, n] of counts) if (n > bestN) [best, bestN] = [key, n];
  if (best < 0) return readToken('--color-outline-black'); // an empty region: never for the daisy row, but no raw hex here either
  return `#${best.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Make a non-looping layer tile plainly by patching its seam. Where the right edge and the left
 * edge disagree over a run of rows in two similar colours (a shading band that ends at a
 * different height on each side), the right edge's colour is stepped into the first columns of
 * the copy as a small staircase, so the band meets diagonally instead of in a vertical wall.
 * Silhouette edges (a transparent pixel on either side) and unlike colours are left alone.
 */
export function patchTileSeam(image: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = toCanvas(image);
  ctx.drawImage(image, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const left = ctx.getImageData(0, 0, 1, h).data;
  const right = ctx.getImageData(w - 1, 0, 1, h).data;
  const similar = (y: number) => {
    const i = y * 4;
    if (left[i + 3] === 0 || right[i + 3] === 0) return false;
    const dr = left[i]! - right[i]!;
    const dg = left[i + 1]! - right[i + 1]!;
    const db = left[i + 2]! - right[i + 2]!;
    const d2 = dr * dr + dg * dg + db * db;
    return d2 > 0 && d2 <= 48 * 48;
  };
  let y = 0;
  while (y < h) {
    if (!similar(y)) {
      y++;
      continue;
    }
    let end = y;
    while (end + 1 < h && similar(end + 1)) end++;
    if (end - y + 1 >= 2) {
      for (let r = y; r <= end; r++) {
        const i = r * 4;
        ctx.fillStyle = `rgb(${right[i]} ${right[i + 1]} ${right[i + 2]})`;
        ctx.fillRect(0, r, Math.min(5, r - y + 1), 1);
      }
    }
    y = end + 1;
  }
  return canvas;
}
