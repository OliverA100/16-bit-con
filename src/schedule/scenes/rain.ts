/**
 * Talk: Cheat Codes and Other Security Holes — Vega's night-rain landscape: dead trees, dark hills,
 * wet ground and its puddles, Vega's pale far range behind them under sage rain clouds, a mole out in
 * it reading their phone, and the rain (in a day cloud's pale blue) falling over the whole folder, the
 * text too, the puddles catching it. The landscape repeats as it is, never mirrored.
 *
 * Built at load from Vega's "Threat Detected" picture, which is a 3600/509 upscale of a 508 × 266
 * pixel picture: it is sampled back to its own pixels (one sample per pixel centre), and only the
 * landscape under its window is kept. The sky round the hills is keyed out (the folder's Cloud White
 * is the sky, as in every scene), the rain is lifted out of the picture, and one of its own streaks
 * falls again as the animated rain. The logo and the window are not used.
 */
import { sprites } from '../../data/sprites.manifest';
import { cloudsKey, drawClouds, frameAt, img, layer, put, stateKey, strip, wrap, type Cloud, type SceneModule, type View } from '../kit';

const files = [
  sprites.threatScene.file,
  sprites.hillsSilhouetteLight.file,
  sprites.cloudLg.file,
  sprites.cloudMd.file,
  sprites.cloudSm.file,
  sprites.cloudXs.file,
  sprites.cloudA.file,
  sprites.molePhone.file,
];

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

/** bg-hills-silhouette-light: the range's box in its file. */
const RANGE = { x: 85, y: 111, w: 316, h: 110 };
/**
 * Where the far range stands: [x as a fraction of the folder, how far its foot sinks below the ground's
 * line], wide and on phones. Under the text a copy sinks further, its peaks below the text.
 */
const RANGES = {
  wide: [
    [0.02, 0],
    [0.33, 0],
    [0.67, 0],
    [0.88, 24],
  ],
  narrow: [
    [-0.25, 12],
    [0.42, 0],
  ],
} as const;

/** A mole out in the rain, reading their phone: x as a fraction of the folder, feet in band rows. */
const MOLE = { wide: 0.74, narrow: 0.56, feet: 92 };

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
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
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
    const [threat, rangeSheet, lg, md, sm, xs, dayCloud, phone] = await Promise.all([
      img(sprites.threatScene.file),
      img(sprites.hillsSilhouetteLight.file),
      img(sprites.cloudLg.file),
      img(sprites.cloudMd.file),
      img(sprites.cloudSm.file),
      img(sprites.cloudXs.file),
      img(sprites.cloudA.file),
      strip(sprites.molePhone.file, 60, 60),
    ]);
    // the rain's clouds: Vega's sage set, the far range's own colours, drifting over it
    const clouds: Cloud[] = [
      { src: lg, x: 0.1, y: 0, speed: 2 },
      { src: md, x: 0.8, y: 22, speed: 3 },
      { src: sm, x: 0.5, y: 64, speed: 4 },
      { src: xs, x: 0.95, y: 6, speed: 3 },
    ];
    const { band, streak, puddles, glint } = build(threat);
    /**
     * The rain, everywhere, in the blue of a day cloud's shading (Vega's cloud-a: its darkest blue): light
     * enough for the text to read through, blue enough to show against the sage range.
     */
    const rain = (() => {
      const d = layer(dayCloud.width, dayCloud.height, (c) => c.drawImage(dayCloud, 0, 0))
        .getContext('2d')!
        .getImageData(0, 0, dayCloud.width, dayCloud.height).data;
      let [k, lum] = [0, Infinity];
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
        if (d[i + 3] && b > r + 20 && r + g + b < lum) [k, lum] = [(r << 16) | (g << 8) | b, r + g + b];
      }
      return layer(streak.width, streak.height, (c) => {
        c.drawImage(streak, 0, 0);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = `rgb(${k >> 16} ${(k >> 8) & 255} ${k & 255})`;
        c.fillRect(0, 0, streak.width, streak.height);
      });
    })();
    const range = layer(RANGE.w, RANGE.h, (c) => c.drawImage(rangeSheet, RANGE.x, RANGE.y, RANGE.w, RANGE.h, 0, 0, RANGE.w, RANGE.h));
    const W = band.width;
    const bandY = (h: number) => h - band.height + 6;
    /** The band's copies, right-aligned and repeating leftward as they are (its two ends meet well). */
    const bandXs = (w: number) => {
      const xs: number[] = [];
      for (let x = w - W; x + W > 0; x -= W) xs.push(x);
      return xs;
    };
    /** The far range's copies: their x and top, out of the text. */
    const ranges = (v: View) =>
      (v.narrow ? RANGES.narrow : RANGES.wide).map(([f, sink]) => {
        // its foot behind the ground's line: hidden whatever the hills do above it
        const x = Math.round(f * v.w);
        const top = bandY(v.h) + BAND.ground + sink - RANGE.h;
        return { x, top: !v.narrow && x < v.clear.x ? Math.max(top, v.clear.y + 4) : top };
      });
    const drops = (v: { w: number; h: number }) => Math.round((v.w * v.h) / 900);
    const fall = (t: number) => Math.floor(t * RAIN_SPEED);

    return {
      overText: true,
      start: 0,
      still: 0.4,
      key(t, v) {
        return stateKey(fall(t), Math.floor(t * 8), frameAt(t, 1.5, phone.frames), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const y0 = bandY(v.h);
        drawClouds(ctx, clouds, t, v);
        for (const r of ranges(v)) put(ctx, range, r.x, r.top);
        const xs = bandXs(v.w);
        for (const x of xs) put(ctx, band, x, y0);
        phone.draw(ctx, frameAt(t, 1.5, phone.frames), Math.round((v.narrow ? MOLE.narrow : MOLE.wide) * v.w), y0 + MOLE.feet - phone.fh + 1);
        // Glints run along the puddles, in every copy.
        ctx.fillStyle = glint;
        const phase = Math.floor(t * 8);
        for (const p of puddles) {
          const px = p % W;
          const py = (p / W) | 0;
          if ((px + py * 3 + phase) % 23 !== 0) continue;
          for (const bx of xs) {
            const x = bx + px;
            if (x >= 0 && x < v.w) ctx.fillRect(x, y0 + py, 1, 1);
          }
        }
        const span = v.h + streak.height * 2;
        const f = fall(t);
        for (let i = 0, n = drops(v); i < n; i++) {
          const y = wrap(rand(i) * span + f * (0.85 + rand(i + 99) * 0.3), span) - streak.height;
          const x = wrap(rand(i + 7) * (v.w + 40) - (y + streak.height) * RAIN_SLANT, v.w + 40) - 20;
          // over the text, half the drops
          if (x < v.clear.x && y < v.clear.y && i % 2) continue;
          put(ctx, rain, x, y);
        }
      },
    };
  },
};

export default scene;
