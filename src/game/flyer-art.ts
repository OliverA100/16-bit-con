/**
 * The tiny flyer that falls into the world: new art drawn in code, a 14 × 18 px copy of the flyer
 * the dialog shows (FlyerDialog.astro) — cream paper in an orange band and a green rule, the wordmark
 * band with its daisy, the arcade machine, the date and the venue. No tape and no Free entry burst at this
 * size. Its back is the plain paper in the same border.
 *
 * Frames are rasterised at load, never resampled at draw: for a tilt (degrees, in the screen plane) and a
 * width (cos of the paper's turn about its vertical axis), each pixel of a small cell asks which part of the
 * flyer it falls on. That keeps every frame on the palette and crisp at any angle, so the fall can use
 * fine steps of tilt and turn (floating, not ticking).
 *
 * Self-contained (no imports), so the same code can render the flyer outside the browser.
 */
export type Rgb = readonly [number, number, number];

export interface FlyerInk {
  paper: Rgb;
  band: Rgb; // the orange outer band (Yellow 600)
  rule: Rgb; // the green inner rule (Green 500)
  ink: Rgb; // type (Green 900)
  mark: Rgb; // the wordmark (Yellow 600)
  daisy: Rgb; // the wordmark's daisy (Yellow 400)
  edge: Rgb; // the paper seen edge-on: a shade darker than the paper
}

const FLYER_W = 14;
const FLYER_H = 18;
/** Every frame's cell: room for the flyer at any tilt up to ±40°. */
export const FLYER_CELL = 24;

/** The print at a point inside the flyer's rule, (u, v) in its own px (0 ≤ u < 14, 0 ≤ v < 18); null is paper. */
function print(u: number, v: number, k: FlyerInk): Rgb | null {
  const row = Math.floor(v);
  const col = Math.floor(u);
  if ((row === 3 || row === 4) && col >= 3 && col < 10) return k.mark; // the wordmark
  if (row === 3 && col === 10) return k.daisy; // its daisy
  if (row === 5 && col >= 3 && col < 11) return k.ink; // the wordmark's outline
  if (row >= 7 && row < 12 && col >= 6 && col < 9) return row === 8 || row === 9 ? k.ink : k.mark; // the arcade, its screen
  if (row === 13 && col >= 3 && col < 11) return k.ink; // the date
  if (row === 15 && col >= 4 && col < 10) return k.ink; // the venue
  return null;
}

/**
 * One frame, FLYER_CELL square, RGBA. `width` in [-1, 1]: the paper's turn, cos of its angle (negative
 * shows the back); near 0 it is a 1 px sliver, the sheet seen edge-on. `lie` in (0, 1]: its height, 1
 * standing up to the camera, smaller as it lies down flat on the ground. The band and the rule are the
 * shape's own outline (its edge pixels, then the next ring in), so they stay unbroken at any tilt; the
 * print inside is sampled from the paper's frame.
 */
export function flyerFrame(tiltDeg: number, width: number, k: FlyerInk, lie = 1): Uint8ClampedArray {
  const S = FLYER_CELL;
  const out = new Uint8ClampedArray(S * S * 4);
  const th = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const front = width >= 0;
  const edgeOn = Math.abs(width) < 0.12;
  const hw = Math.max((FLYER_W * Math.abs(width)) / 2, 0.55);
  const hh = Math.max((FLYER_H * lie) / 2, 0.55);
  // Where each cell pixel lands on the paper: (u, v), or nothing.
  const uv: ([number, number] | null)[] = new Array(S * S).fill(null);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      const a = dx * cos + dy * sin; // into the paper's own frame: undo the tilt
      const b = -dx * sin + dy * cos;
      if (Math.abs(b) > hh || Math.abs(a) > hw) continue;
      const v = Math.min(FLYER_H - 1e-6, Math.max(0, (b / hh) * (FLYER_H / 2) + FLYER_H / 2));
      const u = Math.min(FLYER_W - 1e-6, Math.max(0, (a / hw) * (FLYER_W / 2) + FLYER_W / 2));
      uv[y * S + x] = [front ? u : FLYER_W - u, v];
    }
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && uv[y * S + x] !== null;
  // Rings from the outside in: 0 on the shape's edge, 1 the next ring, 2 the rest.
  const ring = new Uint8Array(S * S).fill(2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) ring[y * S + x] = 0;
  const onEdge = (x: number, y: number) => inside(x, y) && ring[y * S + x] === 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (inside(x, y) && ring[y * S + x] === 2 && (onEdge(x - 1, y) || onEdge(x + 1, y) || onEdge(x, y - 1) || onEdge(x, y + 1))) ring[y * S + x] = 1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = uv[y * S + x];
      if (!p) continue;
      const [u, v] = p;
      const r = ring[y * S + x]!;
      let c: Rgb;
      if (edgeOn) c = v < 1 || v >= FLYER_H - 1 ? k.band : k.edge;
      else if (r === 0) c = k.band;
      else if (r === 1) c = k.rule;
      else c = (front && print(u, v, k)) || k.paper;
      const i = (y * S + x) * 4;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }
  return out;
}

/** The flyer flat on the ground, seen a little from above: 16 × 3. */
export const GROUND_W = 16;
export const GROUND_H = 3;
export function flyerGround(k: FlyerInk): Uint8ClampedArray {
  const rows = ['.BBBBBBBBBBBBBB.', 'BRPMMMPPAPKKPPRB', '.BBBBBBBBBBBBBB.'];
  const pick: Record<string, Rgb> = { B: k.band, R: k.rule, P: k.paper, M: k.mark, A: k.mark, K: k.ink };
  const out = new Uint8ClampedArray(GROUND_W * GROUND_H * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = pick[ch];
      if (!c) return;
      const i = (y * GROUND_W + x) * 4;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }),
  );
  return out;
}
