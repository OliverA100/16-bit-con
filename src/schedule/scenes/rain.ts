/**
 * Talk: Cheat Codes and Other Security Holes — Vega's night-rain landscape: dead trees, dark hills,
 * wet ground and its puddles, with the rain falling and the puddles catching it.
 *
 * Built at load from Vega's "Threat Detected" picture, which is a 3600/509 upscale of a 508 × 266
 * pixel picture: it is sampled back to its own pixels (one sample per pixel centre), and only the
 * landscape under its window is kept. The sky round the hills is keyed out (the folder's Cloud White
 * is the sky, as in every scene), the rain is lifted out of the picture, and one of its own streaks
 * falls again as the animated rain. The logo and the window are not used.
 */
import { sprites } from '../../data/sprites.manifest';
import { img, layer, put, stateKey, wrap, type SceneModule } from '../kit';

const files = [sprites.threatScene.file];

/** The picture's pixel pitch and the centre of its first whole pixel (measured from its edges). */
const PITCH = 3600 / 509;
const ORIGIN = { x: 2.25 + PITCH / 2, y: 4.48 + PITCH / 2 };
const SIZE = { w: 507, h: 265 };
/** The landscape band (rows 149 to the bottom): the window covers its first 36 rows between x 77 and 432. */
const BAND = { top: 149, window: { x0: 77, x1: 432, rows: 36 }, ground: 76 };
/** A whole streak of rain, in the clear sky right of the window. */
const STREAK = { x: 449, y: 32, w: 7, h: 15 };
/** The sky the hills stand against, sampled away from the logo, the window and the trees. */
const SKY_AREAS: [number, number, number, number][] = [
  [69, 0, 438, 94],
  [439, 0, 68, 149],
];
const LOGO: [number, number, number, number] = [174, 24, 160, 65];
const TREES: [number, number, number, number] = [0, 154, 60, 70];

const RAIN_SPEED = 150; // art px / s down
const RAIN_SLANT = 0.43; // px left per px down (the streaks' own slope)

const pack = (d: Uint8ClampedArray, i: number) => (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
const isRain = (d: Uint8ClampedArray, i: number) => d[i + 2]! > d[i + 1]! + 12 && d[i + 2]! > 100;

function colours(d: Uint8ClampedArray, w: number, [x0, y0, cw, ch]: [number, number, number, number], skip?: [number, number, number, number]): Set<number> {
  const s = new Set<number>();
  for (let y = y0; y < y0 + ch; y++)
    for (let x = x0; x < x0 + cw; x++) {
      if (skip && x >= skip[0] && x < skip[0] + skip[2] && y >= skip[1] && y < skip[1] + skip[3]) continue;
      s.add(pack(d, (y * w + x) * 4));
    }
  return s;
}

/** The landscape with its sky keyed out and its rain lifted; the rain streak; the puddles' pixels. */
function build(src: HTMLImageElement) {
  const full = layer(SIZE.w, SIZE.h, (ctx) => ctx.drawImage(src, ORIGIN.x, ORIGIN.y, SIZE.w * PITCH, SIZE.h * PITCH, 0, 0, SIZE.w, SIZE.h));
  const fd = full.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, SIZE.w, SIZE.h).data;
  const sky = new Set<number>();
  for (const a of SKY_AREAS) for (const c of colours(fd, SIZE.w, a, LOGO)) sky.add(c);
  const trees = colours(fd, SIZE.w, TREES);
  for (const c of colours(fd, SIZE.w, [439, 0, 68, 119])) trees.delete(c);

  const W = SIZE.w;
  const H = SIZE.h - BAND.top;
  const band = layer(W, H, (ctx) => ctx.drawImage(full, 0, BAND.top, W, H, 0, 0, W, H));
  const bctx = band.getContext('2d', { willReadFrequently: true })!;
  const im = bctx.getImageData(0, 0, W, H);
  const d = im.data;
  const n = W * H;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const inWindow = (x: number, y: number) => y < BAND.window.rows && x >= BAND.window.x0 && x <= BAND.window.x1;

  const rain = new Uint8Array(n);
  const passable = new Uint8Array(n);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      const p = y * W + x;
      rain[p] = isRain(d, i) ? 1 : 0;
      const haze = g >= 78 && Math.abs(b - g) <= 4 && r < g - 18;
      const c = pack(d, i);
      const highSky = y < BAND.window.rows + 2 && sky.has(c) && !trees.has(c);
      passable[p] = haze || rain[p] || inWindow(x, y) || highSky ? 1 : 0;
    }

  // Flood the sky in from the top edge and the window, through sky pixels (and along rain streaks).
  const clear = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const p = y * W + x;
      if ((y === 0 || inWindow(x, y)) && passable[p]) {
        clear[p] = 1;
        stack.push(p);
      }
    }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % W;
    const y = (p / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (clear[q]) continue;
      if (dx && dy ? rain[q] : passable[q]) {
        clear[q] = 1;
        stack.push(q);
      }
    }
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const i = p * 4;
      // the corners beside the window: the right one is sky, the left keeps only the trees' dark trunks
      if (y < BAND.window.rows + 2 && !inWindow(x, y) && (x > BAND.window.x1 || (x < BAND.window.x0 && d[i + 1]! > 36))) clear[p] = 1;
      // above the ground every rain pixel goes; the falling rain is drawn again on top
      if (y < BAND.ground && d[i + 2]! > d[i + 1]! + 6) clear[p] = 1;
    }
  // Tidy the key: a pixel mostly surrounded by sky is sky.
  for (let pass = 0; pass < 2; pass++) {
    const next = clear.slice();
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!clear[p] && clear[p - 1]! + clear[p + 1]! + clear[p - W]! + clear[p + W]! >= 3) next[p] = 1;
      }
    clear.set(next);
  }
  // In the ground, a lone one-pixel streak becomes the ground beside it; puddles (wider) stay.
  const puddles: number[] = [];
  for (let y = BAND.ground; y < H; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!rain[p]) continue;
      if (!rain[p - 1] && !rain[p + 1]) d.copyWithin(p * 4, (p - 1) * 4, p * 4);
      else puddles.push(p);
    }
  for (let p = 0; p < n; p++) if (clear[p]) d[p * 4 + 3] = 0;
  bctx.putImageData(im, 0, 0);

  // The puddles' lightest blue: the glint.
  let glint = 0;
  let glintLum = -1;
  for (const p of puddles) {
    const i = p * 4;
    const lum = d[i]! + d[i + 1]! + d[i + 2]!;
    if (lum > glintLum) [glint, glintLum] = [pack(d, i), lum];
  }

  const streak = layer(STREAK.w, STREAK.h, (ctx) => {
    ctx.drawImage(full, STREAK.x, STREAK.y, STREAK.w, STREAK.h, 0, 0, STREAK.w, STREAK.h);
    const s = ctx.getImageData(0, 0, STREAK.w, STREAK.h);
    for (let i = 0; i < s.data.length; i += 4) if (!isRain(s.data, i)) s.data[i + 3] = 0;
    ctx.putImageData(s, 0, 0);
  });
  return { band, streak, puddles, glint: `rgb(${glint >> 16} ${(glint >> 8) & 255} ${glint & 255})` };
}

/** A fixed scatter: the same rain on every load. */
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const scene: SceneModule = {
  files,
  async load() {
    const { band, streak, puddles, glint } = build(await img(sprites.threatScene.file));
    const W = band.width;
    const bandY = (h: number) => h - band.height + 6;
    /** The band centred, mirrored copies either side on wide folders. */
    const bandX = (w: number) => Math.round((w - W) / 2);
    const drops = (v: { w: number; h: number }) => Math.round((v.w * v.h) / 900);
    const fall = (t: number) => Math.floor(t * RAIN_SPEED);

    return {
      start: 0,
      still: 0.4,
      key(t, v) {
        return stateKey(fall(t), Math.floor(t * 8), v.w, v.h);
      },
      draw(ctx, t, v) {
        const x0 = bandX(v.w);
        const y0 = bandY(v.h);
        for (let k = -2; k <= 2; k++) {
          const x = x0 + k * W;
          if (x + W > 0 && x < v.w) put(ctx, band, x, y0, k % 2 !== 0);
        }
        // Glints run along the puddles (centre copy, and its mirrors).
        ctx.fillStyle = glint;
        const phase = Math.floor(t * 8);
        for (const p of puddles) {
          const px = p % W;
          const py = (p / W) | 0;
          if ((px + py * 3 + phase) % 23 !== 0) continue;
          for (let k = -2; k <= 2; k++) {
            const x = x0 + k * W + (k % 2 !== 0 ? W - 1 - px : px);
            if (x >= 0 && x < v.w) ctx.fillRect(x, y0 + py, 1, 1);
          }
        }
        const span = v.h + streak.height * 2;
        const f = fall(t);
        for (let i = 0, n = drops(v); i < n; i++) {
          const y = wrap(rand(i) * span + f * (0.85 + rand(i + 99) * 0.3), span) - streak.height;
          const x = wrap(rand(i + 7) * (v.w + 40) - (y + streak.height) * RAIN_SLANT, v.w + 40) - 20;
          // the rain falls beside and below the text, never across it
          if (x < v.clear.x && y < v.clear.y) continue;
          put(ctx, streak, x, y);
        }
      },
    };
  },
};

export default scene;
