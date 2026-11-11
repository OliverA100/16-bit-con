/**
 * The beanstalk on the page: Vega's swaying stalk (beanstalk-sway, 10 frames of 175 × 258), grown from the
 * footer's field up past the top of the page once Sam has broken out and landed.
 *
 * How it is as tall as the page without new art: the sheet tiles vertically (its row 0 equals its row 257
 * in every frame), so the stalk is copies of the one 258-row period stacked from the ground up. The stem is
 * the same in every frame — only the leaves sway — and every copy draws the same frame at the same moment,
 * so the sway runs as one plant along the whole height and no join ever shows. The copies are the sheet
 * mirrored in place (as the canyon copies are), so its longer leaves reach out over the page's left edge.
 *
 * Only the copies on or near the screen are canvases: a small pool, moved into place before they show,
 * page-anchored so they scroll with the page on the compositor. Each is drawn at whole device px per art
 * px (Sam's scale, --sam-px), redrawn only when its frame changes (Vega's sway pace, SWAY_FPS).
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage } from './sprites';
import { samK } from './footer';
import { stemTable, SWAY_FPS } from '../schedule/kit';

const FW = sprites.beanstalkSway.fw;
const FH = sprites.beanstalkSway.fh;
const FRAMES = sprites.beanstalkSway.frames;
/** The stalk's foot sinks this many rows under the ground line, behind the footer's grass. */
const SINK = 8;
/** Growing: the tip crosses the screen, bottom edge to top, in this long. */
const GROW_MS = 1200;
/** Under the tip, each row shows this much more either side of the stem: the stem comes to a point and the leaves unfurl outward. */
const UNFURL = 0.6;
const V_ROWS = 110;

export interface StalkArt {
  /** The ten frames, each mirrored in place, side by side. */
  sheet: HTMLCanvasElement;
  /** The stem's centre column (smoothed) on each of the period's 258 rows, in the mirrored frame. */
  stem: Float32Array;
  /** The extremes: the stem's centre range and the leaves' reach to the right, columns of the frame. */
  stemMin: number;
  stemMax: number;
  leafRight: number;
}

let art: Promise<StalkArt> | null = null;

export function loadStalkArt(): Promise<StalkArt> {
  art ??= loadImage(sprites.beanstalkSway.file).then((img) => {
    const sheet = document.createElement('canvas');
    sheet.width = img.width;
    sheet.height = img.height;
    const ctx = sheet.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    for (let f = 0; f < FRAMES; f++) {
      ctx.save();
      ctx.translate(f * FW + FW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f * FW, 0, FW, FH, 0, 0, FW, FH);
      ctx.restore();
    }
    const data = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
    const opaque = (x: number, y: number) => data[(y * sheet.width + x) * 4 + 3]! > 0;
    const stem = stemTable(data, sheet.width, FW, FH);
    let leafRight = 0;
    for (let f = 0; f < FRAMES; f++)
      for (let y = 0; y < FH; y++)
        for (let x = FW - 1; x > leafRight; x--)
          if (opaque(f * FW + x, y)) {
            leafRight = x;
            break;
          }
    let stemMin = Infinity;
    let stemMax = -Infinity;
    for (const c of stem) {
      stemMin = Math.min(stemMin, c);
      stemMax = Math.max(stemMax, c);
    }
    return { sheet, stem, stemMin, stemMax, leafRight };
  });
  return art;
}

/** The stalk on the page, from the ground line up past the top. */
export class Stalk {
  readonly root: HTMLDivElement;
  private pool: { canvas: HTMLCanvasElement; index: number; frame: number; tip: number }[] = [];
  /** Device px per art px, CSS px per art px. */
  private k = 2;
  private a = 1;
  private left = 0;
  private height = 0;
  /** The tip's page y while growing; -Infinity once grown. */
  private tipY = Infinity;
  private growAt = -1;
  private onGrown: (() => void) | null = null;
  private timer = 0;
  private raf = 0;
  private paused = () => false;

  constructor(private readonly art: StalkArt) {
    this.root = document.createElement('div');
    this.root.className = 'page-stalk';
    this.root.setAttribute('aria-hidden', 'true');
  }

  get grown(): boolean {
    return this.tipY === -Infinity;
  }

  /** CSS px per art px. */
  get scale(): number {
    return this.a;
  }

  /** The page x (CSS px) where the stem's centre column is, at its column c. */
  colX(c: number): number {
    return this.left + c * this.a;
  }

  /** The stem's centre at page y (CSS px): it follows the stem's curve through the period. */
  stemX(y: number): number {
    return this.colX(this.art.stem[this.rowAt(y)]! + 0.5);
  }

  /** The period's row at page y. */
  rowAt(y: number): number {
    const P = FH * this.a;
    const off = (((this.height - y) % P) + P) % P;
    return Math.min(FH - 1, Math.max(0, FH - 1 - Math.floor(off / this.a)));
  }

  /**
   * Place it: its foot on the ground line `groundY`, its stem's leftmost centre column at page x `stemLeft`.
   * Called again whenever the page's height or scale changes.
   */
  layout(groundY: number, stemLeft: number, paused: () => boolean): void {
    this.paused = paused;
    const dpr = window.devicePixelRatio || 1;
    this.k = samK();
    this.a = this.k / dpr;
    this.left = Math.round((stemLeft - this.art.stemMin * this.a) * dpr) / dpr;
    this.height = Math.round((groundY + SINK * this.a) * dpr) / dpr;
    const s = this.root.style;
    s.left = `${this.left}px`;
    s.width = `${FW * this.a}px`;
    s.height = `${this.height}px`;
    for (const p of this.pool) {
      p.index = -1;
      p.canvas.width = FW * this.k;
      p.canvas.height = FH * this.k;
      p.canvas.style.width = `${FW * this.a}px`;
      p.canvas.style.height = `${FH * this.a}px`;
    }
    this.update();
  }

  /** Grow from the ground: the tip rises through the screen, bottom edge to top, then the stalk sways. */
  grow(done: () => void): void {
    this.onGrown = done;
    this.growAt = performance.now();
    this.tipY = window.scrollY + window.innerHeight;
    this.update();
  }

  /** Grown at once (a resize or a jump mid-growth). */
  finishGrowth(): void {
    if (this.grown) return;
    this.tipY = -Infinity;
    this.growAt = -1;
    const done = this.onGrown;
    this.onGrown = null;
    this.update();
    done?.();
  }

  /** Redraw what is on screen now (scrolling moves the pool along; the frame follows the clock). */
  update = (): void => {
    if (!this.root.isConnected) return;
    const now = performance.now();
    if (this.growAt >= 0) {
      const u = Math.min(1, (now - this.growAt) / GROW_MS);
      const e = u * u * (3 - 2 * u);
      // the tip keeps to the screen while it grows, whatever the page does meanwhile
      this.tipY = window.scrollY + window.innerHeight * (1 - e) - (u >= 1 ? V_ROWS * this.a : 0);
      if (u >= 1) this.finishGrowth();
    }
    const P = FH * this.a;
    const vh = window.innerHeight;
    const top = window.scrollY - P * 0.5;
    const bottom = window.scrollY + vh + P * 0.5;
    // copies counted from the foot up: copy i spans [height − (i+1)P, height − iP]
    const first = Math.max(0, Math.floor((this.height - bottom) / P));
    const last = Math.max(first, Math.floor((this.height - top) / P));
    const want = last - first + 1;
    while (this.pool.length < want) {
      const canvas = document.createElement('canvas');
      canvas.width = FW * this.k;
      canvas.height = FH * this.k;
      canvas.style.width = `${FW * this.a}px`;
      canvas.style.height = `${FH * this.a}px`;
      canvas.style.visibility = 'hidden';
      this.root.append(canvas);
      this.pool.push({ canvas, index: -1, frame: -1, tip: NaN });
    }
    const frame = this.paused() ? Math.max(0, this.pool[0]?.frame ?? 0) : Math.floor((now * SWAY_FPS) / 1000) % FRAMES;
    const free = this.pool.filter((p) => p.index < first || p.index > last);
    for (let i = first; i <= last; i++) {
      let p = this.pool.find((q) => q.index === i);
      if (!p) {
        p = free.shift();
        if (!p) break;
        p.index = i;
        p.frame = -1;
        // moved by a transform, never `top`: a copy taking its new place is not a layout shift
        p.canvas.style.transform = `translateY(${this.height - (i + 1) * P}px)`;
        p.canvas.style.visibility = '';
      }
      // the tip in this copy's rows (all of it grown: −∞; none: ≥ FH)
      const segTop = this.height - (i + 1) * P;
      const tipRow = this.grown ? -Infinity : Math.floor((this.tipY - segTop) / this.a);
      const tipKey = tipRow <= -V_ROWS ? -Infinity : tipRow;
      if (p.frame !== frame || p.tip !== tipKey) {
        p.frame = frame;
        p.tip = tipKey;
        this.paint(p.canvas, frame, tipKey);
      }
    }
    for (const p of free) {
      p.index = -1;
      p.canvas.style.visibility = 'hidden';
    }
    this.schedule();
  };

  private paint(canvas: HTMLCanvasElement, frame: number, tipRow: number): void {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, FW, FH);
    const sx = frame * FW;
    if (tipRow === -Infinity) {
      ctx.drawImage(this.art.sheet, sx, 0, FW, FH, 0, 0, FW, FH);
      return;
    }
    if (tipRow >= FH) return;
    // under the tip: a widening slice round the stem's centre, row by row, whole art px; then all of it
    const from = Math.max(0, tipRow);
    const full = Math.max(from, Math.min(FH, tipRow + V_ROWS));
    for (let y = from; y < full; y++) {
      const half = Math.floor((y - tipRow) * UNFURL);
      const c = Math.round(this.art.stem[y]!);
      const x0 = Math.max(0, c - half);
      const x1 = Math.min(FW, c + half + 1);
      if (x1 > x0) ctx.drawImage(this.art.sheet, sx + x0, y, x1 - x0, 1, x0, y, x1 - x0, 1);
    }
    if (full < FH) ctx.drawImage(this.art.sheet, sx, full, FW, FH - full, 0, full, FW, FH - full);
  }

  /** Growing: every frame. Grown: the next sway frame, only while the page is shown and not paused. */
  private schedule(): void {
    if (this.growAt >= 0) {
      if (!this.raf) this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.update();
      });
      return;
    }
    if (this.timer || document.hidden || this.paused()) return;
    const ms = 1000 / SWAY_FPS;
    const wait = ms - (performance.now() % ms) + 1;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.update();
    }, wait);
  }

  /** Wake the sway after a pause or a hidden tab. */
  resume(): void {
    this.update();
  }

  destroy(): void {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = 0;
    this.raf = 0;
    this.root.remove();
    this.pool = [];
  }
}
