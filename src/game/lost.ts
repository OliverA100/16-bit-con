/**
 * The 404 page's sky. The page opens on empty sky; Sam rides in from the left on one of Vega's clouds,
 * standing on its right ledge, rests a while swaying with it, then drifts off to the right, toward the empty
 * sky he is looking at, and comes back on another cloud, resting somewhere else each time: near, middling or
 * far, high or low. On every second cloud he smokes. Small clouds drift above the text, middle clouds between
 * the buttons and the cloud bank, and the bank along the window's bottom.
 *
 * One canvas at the page's Sam scale (--sam-px, whole device px per art px); a further ride is the same art at
 * a smaller whole scale. Nothing is resampled, and positions round to device pixels, as the home page's clouds
 * do, so slow drifts glide. Only Vega's art, never redrawn: the clouds cropped to their art, the bank's seam
 * patched, Sam's sheets in the brand colours.
 *
 * Clouds only ever move sideways inside their bands (above the text, under the buttons), so none crosses the
 * text or the buttons; Sam is drawn last, at his cloud's offset, so nothing passes in front of him and he
 * never leaves it. It moves only while the tab is visible; with reduced motion it is one still.
 */
import { sprites, CUMULUS_LOBES } from '../data/sprites.manifest';
import { frameAt, img, samStrip, stateKey, tileX, wrap, type Drawable, type Strip } from '../schedule/kit';
import { samK } from './footer';
import { cropImage, patchTileSeam } from './palette';
import { FOOT_SINK, IDLE_FPS, SAM_CELL } from './sam';
import { reducedMotion } from '../lib/reduced-motion';
import { around, snap } from '../lib/drift';

/** Art rows of the cloud bank over the window's bottom (its first cloud row there), as in the mock. */
const BANK_SHOW = 105;
/** Sam's cloud floats this many rows over the bank's highest bump, so it never reads as part of the bank. */
const CLOUD_GAP = 8;
/** At rest, Sam's cloud sways ±14 art px over 8 s; it bobs ±2 over 4 s all the time. */
const SWAY = { x: 14, xs: 8, y: 2, ys: 4 } as const;
/** Leaving and arriving: the sway's own speed at the anchor, gaining (or losing) this much a second. */
const DRIFT_ACCEL = 3;
/** Empty sky between one cloud leaving and the next arriving, s. */
const PAUSE = 1.5;
/** The bank's drift, art px / s. */
const BANK_SPEED = 4;
/** Opaque enough to stand on: the art, not its faint halo. */
const SOLID = 200;
/** A ledge: at least this many columns whose solid top varies by a row at most, this far under the peak. */
const LEDGE = { cols: 10, below: 8 } as const;
/** Below this CSS width Sam's cloud rests round the middle under the buttons, with fewer middle clouds. */
const NARROW = 700;
/** The smoking sheet's pace (as on the footer's ground). */
const SMOKE_FPS = 8;
/** Depths for Sam's rides: their scale against the page's, rounded to whole device px per art px (at least 1). */
const NEAR = 1;
const MID = 0.7;
const FAR = 0.45;
const scaleAt = (k: number, depth: number) => Math.max(1, Math.round(k * depth));

interface CloudDef {
  src: Drawable;
  /** Left edge at t = 0 as a fraction of the width; row as a fraction of the band's spare height. */
  x: number;
  y: number;
  /** Art px / s, to the right. */
  speed: number;
}

interface Placed extends CloudDef {
  row: number;
}

/** A cloud Sam rides: cropped to its art, his cell's place on it and the parts that must stay in view. */
interface Ride {
  src: HTMLCanvasElement;
  /** His cell on the cloud, idling and smoking (each sheet's own soles over the ledge). */
  sam: { x: number; y: number };
  smoke: { x: number; y: number };
  ledgeL: number;
  ledgeR: number;
  solidMid: number;
  /** The highest row of the cloud or of Sam on it, and the cloud's lowest solid row. */
  top: number;
  bottom: number;
}

/** A ride's turn, in device px: its scale, where it rests, how long it takes to leave and to arrive, its row. */
interface Leg {
  s: number;
  anchor: number;
  y: number;
  out: number;
  in: number;
}

interface Layout {
  w: number;
  h: number;
  k: number;
  bankTop: number;
  legs: Leg[];
  period: number;
  clouds: Placed[];
}

function pixels(image: Drawable): { d: Uint8ClampedArray; w: number; h: number } {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return { d: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}

/** The box of pixels with alpha over `min`. */
function alphaBox(image: Drawable, min: number): { x: number; y: number; r: number; b: number } {
  const { d, w, h } = pixels(image);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]! > min) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x: x0, y: y0, r: x1, b: y1 };
}

/** Each column's first solid row (−1 where there is none). */
function solidTops(image: Drawable): Int16Array {
  const { d, w, h } = pixels(image);
  const tops = new Int16Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (d[(y * w + x) * 4 + 3]! > SOLID) {
        tops[x] = y;
        break;
      }
    }
  }
  return tops;
}

/** The columns of Sam's soles in a sheet: the opaque run on his cell's last row (the same in every frame). */
function soles(sheet: Strip): { l: number; r: number } {
  const c = document.createElement('canvas');
  c.width = sheet.fw;
  c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet.image, 0, sheet.fh - 1, sheet.fw, 1, 0, 0, sheet.fw, 1);
  const d = ctx.getImageData(0, 0, sheet.fw, 1).data;
  let l = -1;
  let r = -1;
  for (let x = 0; x < sheet.fw; x++) {
    if (d[x * 4 + 3]! > 0) {
      if (l < 0) l = x;
      r = x;
    }
  }
  return { l, r };
}

/**
 * Sam on a cloud (already cropped to its art). The ledge is the rightmost flat run of its solid top
 * (`LEDGE.cols` wide, a row of play) well under its peak; his feet on that run's highest row, his soles
 * ending where the surface still reaches them once sunk (FOOT_SINK), so his toes never hang over air.
 */
function ride(src: HTMLCanvasElement, feet: { l: number; r: number }, smokeFeet: { l: number; r: number }): Ride {
  const tops = solidTops(src);
  const solid = alphaBox(src, SOLID);
  const peak = solid.y;
  let run: { s: number; e: number; row: number } | null = null;
  for (let s = 0; s < tops.length;) {
    if (tops[s]! < 0) {
      s++;
      continue;
    }
    let e = s;
    let lo = tops[s]!;
    let hi = lo;
    while (e + 1 < tops.length && tops[e + 1]! >= 0 && Math.max(hi, tops[e + 1]!) - Math.min(lo, tops[e + 1]!) <= 1) {
      e++;
      lo = Math.min(lo, tops[e]!);
      hi = Math.max(hi, tops[e]!);
    }
    if (e - s + 1 >= LEDGE.cols && lo >= peak + LEDGE.below) run = { s, e, row: lo };
    s = e + 1;
  }
  run ??= { s: solid.r - (feet.r - feet.l), e: solid.r, row: tops[solid.r]! };
  let right = run.e;
  while (right + 1 < tops.length && tops[right + 1]! >= 0 && tops[right + 1]! <= run.row + FOOT_SINK - 1) right++;
  const solesLeft = right - (feet.r - feet.l);
  const y = run.row - SAM_CELL + FOOT_SINK;
  const sam = { x: solesLeft - feet.l, y };
  const smoke = { x: right - smokeFeet.r, y };
  return {
    src,
    sam,
    smoke,
    ledgeL: Math.min(run.s, solesLeft),
    ledgeR: solid.r,
    solidMid: (solid.x + solid.r) / 2,
    top: Math.min(solid.y, sam.y + 16), // both sheets' first opaque row is 16
    bottom: solid.b,
  };
}

/** Seconds to cover `dist` px starting at `v0` px/s and gaining `a` px/s². */
const timeFor = (dist: number, v0: number, a: number) => (-v0 + Math.sqrt(v0 * v0 + 2 * a * Math.max(0, dist))) / a;

export async function startLost(): Promise<void> {
  const scene = document.querySelector<HTMLElement>('[data-lost-scene]');
  const canvas = scene?.querySelector<HTMLCanvasElement>('[data-lost-canvas]');
  const text = document.querySelector<HTMLElement>('[data-lost-text]');
  const actions = document.querySelector<HTMLElement>('[data-lost-actions]');
  if (!scene || !canvas || !text || !actions) return;

  const [big, bankImg, idle, smoking, a, b, d, e, f, g, h] = await Promise.all([
    img(sprites.bigCloud.file),
    img(sprites.cloudsStrip.file),
    samStrip(sprites.samIdle.file),
    samStrip(sprites.samSmoking.file),
    img(sprites.cloudA.file),
    img(sprites.cloudB.file),
    img(sprites.cloudD.file),
    img(sprites.cloudE.file),
    img(sprites.cloudF.file),
    img(sprites.cloudG.file),
    img(sprites.cloudH.file),
  ]);

  const toArt = (image: Drawable) => {
    const box = alphaBox(image, 0);
    return cropImage(image as HTMLImageElement | HTMLCanvasElement, box.x, box.y, box.r - box.x + 1, box.b - box.y + 1);
  };
  const feet = soles(idle);
  const smokeFeet = soles(smoking);
  // The clouds Sam stands on: the home page's two big cumulus lobes and Vega's two white puffs
  const [lobe0, lobe1] = CUMULUS_LOBES;
  const perches = [cropImage(big, ...lobe0!), d, cropImage(big, ...lobe1!), e].map((c) => ride(toArt(c), feet, smokeFeet));
  /**
   * Sam's rides in turn: which cloud, how deep, where it rests (its solid centre across the width, wide and
   * narrow) and how high over the bank, from just over it (0) to just under the buttons (1). The first is
   * the mock's. Every second ride he smokes.
   */
  const rests = [
    { cloud: 0, depth: NEAR, wide: 0.44, narrow: 0.5, lift: 0 },
    { cloud: 1, depth: FAR, wide: 0.7, narrow: 0.36, lift: 1 },
    { cloud: 2, depth: MID, wide: 0.28, narrow: 0.56, lift: 0.5 },
    { cloud: 3, depth: NEAR, wide: 0.6, narrow: 0.62, lift: 0.15 },
    { cloud: 0, depth: FAR, wide: 0.2, narrow: 0.42, lift: 0.95 },
    { cloud: 1, depth: MID, wide: 0.66, narrow: 0.5, lift: 0.55 },
  ];
  const rides = rests.map((r) => perches[r.cloud]!);
  const smokes = (i: number) => i % 2 === 1;
  const SAM_SPEED = (2 * Math.PI * SWAY.x) / SWAY.xs; // the sway's speed through its rest point

  // The bank: its seam patched so it tiles plainly; its first cloud row read from the art.
  const bank = patchTileSeam(bankImg);
  const bankRow = alphaBox(bank, 0).y;

  // Far clouds over the text; middle clouds between the buttons and the bank (fewer on phones), low in their
  // band, so they seldom drift by a far ride (which sits high, and never behind them: nothing passes Sam).
  const far: CloudDef[] = [
    { src: f, x: -0.03, y: 0.1, speed: 2.5 },
    { src: h, x: 0.27, y: 0.75, speed: 2 },
    { src: g, x: 0.46, y: 0.3, speed: 3 },
  ];
  const middle: CloudDef[] = [
    { src: g, x: -0.02, y: 0.95, speed: 6 },
    { src: a, x: 0.2, y: 0.75, speed: 4.5 },
    { src: f, x: 0.5, y: 0.55, speed: 5.5 },
    { src: b, x: 0.74, y: 0.85, speed: 5 },
  ];
  const middleNarrow: CloudDef[] = [
    { src: g, x: 0.05, y: 0.9, speed: 5 },
    { src: f, x: 0.62, y: 0.6, speed: 4 },
  ];

  let layout: Layout | null = null;
  let t = 0;
  let lastKey = NaN;
  let raf = 0;
  let last = 0;

  /** Fit the canvas to the section in whole art px, bottom-left, and lay the scene out round the text. */
  const measure = () => {
    const r = scene.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const k = samK();
    const w = Math.ceil((r.width * dpr) / k);
    const hh = Math.ceil((r.height * dpr) / k);
    if (canvas.width !== w * k || canvas.height !== hh * k) {
      canvas.width = w * k;
      canvas.height = hh * k;
      canvas.style.width = `${(w * k) / dpr}px`;
      canvas.style.height = `${(hh * k) / dpr}px`;
    }
    // CSS px from the section's top → art rows from the canvas's top (the canvas hangs from the bottom)
    const canvasTop = r.height - (hh * k) / dpr;
    const row = (cssY: number) => ((cssY - canvasTop) * dpr) / k;
    const pageTop = r.top + window.scrollY;
    const nav = document.querySelector('.nav-slot')?.getBoundingClientRect();
    const firstLine = (text.firstElementChild ?? text).getBoundingClientRect();
    const actionsR = actions.getBoundingClientRect();
    const farTop = Math.ceil(row((nav ? nav.bottom : 0) - pageTop)) + 2;
    const farBottom = Math.floor(row(firstLine.top + window.scrollY - pageTop)) - 2;
    const midTop = Math.ceil(row(actionsR.bottom + window.scrollY - pageTop)) + 4;

    const bankTop = hh - BANK_SHOW;
    const narrow = r.width < NARROW;
    // Sam's rides in device px, each at its own scale (k near, smaller further off)
    const W = w * k;
    const legs = rides.map((c, i): Leg => {
      const rest = rests[i]!;
      const s = scaleAt(k, rest.depth);
      // at rest: its own spot, Sam and his whole ledge on screen through the sway
      const wanted = (narrow ? rest.narrow : rest.wide) * W - c.solidMid * s;
      const lo = 2 * k + (SWAY.x - c.ledgeL) * s;
      const hi = W - 2 * k - (SWAY.x + c.ledgeR + 1) * s;
      const anchor = Math.round(Math.min(hi, Math.max(lo, wanted)));
      // floating over the bank at its height, never up into the buttons (then it may sink behind the bank instead)
      const low = (bankTop - CLOUD_GAP) * k - (c.bottom + 1) * s;
      const high = midTop * k + (SWAY.y - c.top) * s;
      const y = high > low ? high : Math.round(low + (high - low) * rest.lift);
      return {
        s,
        anchor,
        y,
        out: timeFor(W - anchor + 1, SAM_SPEED * s, DRIFT_ACCEL * s),
        in: timeFor(anchor + c.src.width * s + 1, SAM_SPEED * s, DRIFT_ACCEL * s),
      };
    });
    const period = legs.reduce((s, l) => s + SWAY.xs + l.out + PAUSE + l.in, 0);

    const place = (defs: CloudDef[], top: number, bottom: number): Placed[] =>
      defs.filter((c) => bottom - top >= c.src.height).map((c) => ({ ...c, row: top + Math.round(c.y * (bottom - top - c.src.height)) }));
    // (middle clouds may tuck a few rows behind the bank)
    const clouds = [...place(far, farTop, farBottom), ...place(narrow ? middleNarrow : middle, midTop, bankTop + 8)];

    layout = { w, h: hh, k, bankTop, legs, period, clouds };
    lastKey = NaN;
  };

  /**
   * Sam's cloud at time t (its left edge in device px), as a pure function of t. The page opens on an empty
   * sky with his first ride just off the left edge; each ride arrives from the left, slowing to the sway's
   * speed just as it reaches its anchor, rests one sway there (leaving it at that speed), gathers speed off to
   * the right, and the sky stays empty a moment before the next. Speeds and the sway scale with the ride, so a
   * far one moves less across the screen.
   */
  const samCloud = (L: Layout, time: number): { i: number; x: number } | null => {
    let s = wrap(time, L.period);
    for (let i = 0; i < L.legs.length; i++) {
      const leg = L.legs[i]!;
      if (s < leg.in) {
        const left = leg.in - s;
        return { i, x: leg.anchor - (SAM_SPEED * left + (DRIFT_ACCEL * left * left) / 2) * leg.s };
      }
      s -= leg.in;
      if (s < SWAY.xs) return { i, x: leg.anchor + SWAY.x * leg.s * Math.sin((2 * Math.PI * s) / SWAY.xs) };
      s -= SWAY.xs;
      if (s < leg.out) return { i, x: leg.anchor + (SAM_SPEED * s + (DRIFT_ACCEL * s * s) / 2) * leg.s };
      s -= leg.out;
      if (s < PAUSE) return null;
      s -= PAUSE;
    }
    return null;
  };

  const draw = () => {
    const L = layout;
    if (!L) return;
    const bankOff = BANK_SPEED * t;
    const xs = L.clouds.map((c) => snap(around(c.x * L.w + c.src.width + c.speed * t, 0, c.src.width, L.w + c.src.width), L.k));
    // Sam's ride, in device px: its left edge and its row with the bob, both whole device px
    const sc = samCloud(L, t);
    const leg = sc ? L.legs[sc.i]! : null;
    const sx = sc ? Math.round(sc.x) : 0;
    const sy = leg ? leg.y + Math.round(SWAY.y * leg.s * Math.sin((2 * Math.PI * t) / SWAY.ys)) : 0;
    const smoke = !!sc && smokes(sc.i);
    const sheet = smoke ? smoking : idle;
    const frame = frameAt(t, smoke ? SMOKE_FPS : IDLE_FPS, sheet.frames);
    const key = stateKey(
      L.w,
      L.h,
      L.k,
      L.bankTop,
      frame,
      snap(bankOff, L.k) * L.k,
      sc ? sc.i : -1,
      sx,
      sy,
      ...xs.map((x) => x * L.k),
      ...L.clouds.map((c) => c.row),
    );
    if (key === lastKey) return;
    lastKey = key;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, L.w, L.h);
    L.clouds.forEach((c, i) => ctx.drawImage(c.src, xs[i]!, c.row));
    // the bank drifts right (tileX shifts left with a growing offset), between Sam's cloud and Sam
    const bankY = L.bankTop - bankRow;
    if (sc && leg) {
      const r = rides[sc.i]!;
      // the ride at its own scale, from its own device px corner: Sam at the same corner, so he never slides
      ctx.setTransform(leg.s, 0, 0, leg.s, sx, sy);
      ctx.drawImage(r.src, 0, 0);
      ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
      tileX(ctx, bank, 0, bank.height, bankY, L.w, -bankOff, L.k);
      const at = smoke ? r.smoke : r.sam;
      ctx.setTransform(leg.s, 0, 0, leg.s, sx, sy);
      sheet.draw(ctx, frame, at.x, at.y);
    } else tileX(ctx, bank, 0, bank.height, bankY, L.w, -bankOff, L.k);
    if (!('drawn' in scene.dataset)) scene.dataset.drawn = '';
  };

  const moving = () => !reducedMotion.matches && document.visibilityState === 'visible';

  const tick = (now: number) => {
    raf = 0;
    if (!moving()) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    draw();
    raf = requestAnimationFrame(tick);
  };

  const update = () => {
    // the still: Sam on his first cloud at rest, where the motion would bring him
    if (reducedMotion.matches) t = layout ? layout.legs[0]!.in : 0;
    draw();
    if (moving() && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };

  const relayout = () => {
    measure();
    update();
  };

  const ro = new ResizeObserver(relayout);
  ro.observe(scene);
  ro.observe(text);
  window.addEventListener('resize', relayout, { passive: true }); // a new --sam-px can come without a size change
  document.addEventListener('visibilitychange', update);
  reducedMotion.addEventListener('change', update);
  relayout();
}
