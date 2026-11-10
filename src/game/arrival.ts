/**
 * The real world: what the dissolve reveals and where the run ends.
 * A flat Blue 100 sky with Daisy White only at the horizon, behind the roofline; four clouds at
 * different heights, as drawn; the real Javits (NEW facade, p 0.25) — stepped glass cubes, the
 * tallest centre-back and taller than the viewport, its entrance centred on screen where Sam stops —
 * with a row of clipped cypress trees along its base; and at p 1 the plaza: the street's own three
 * bands run on as paving until the daisy bed takes over through the same three staggered seams,
 * then the Booth 630 sign at 2× on a post that clears the daisies. The ground band is the same 48 px
 * and Sam's feet never change height.
 */
import type { CityAssets, Level1Assets } from './assets';
import type { Drawable } from './sprites';
import { drawTiled, STACK, type Frame } from './world';
import { FOOT_SINK } from './sam';
import { readToken } from './palette';
import { board, ledBoard, letter } from './lettering';
import { REAL_SKY, REAL_HORIZON } from '../data/layers';

export const PLAZA = {
  /**
   * The facade's depth, its base behind the ground band, its entrance column, and where that entrance
   * sits on screen when Sam stops (x 6000): right of centre on wide screens so the big marquee and the
   * small Booth sign never share a column; centred on phones.
   */
  facade: { p: 0.25, bottom: 6, hallAt: 6000, entrance: 730, wide: 0.62, narrow: 0.5 },
  /** The 16-BIT CON LED board on the building: high on the front cube, its top `gap` px under the face top (just below the roof bevel), 4 px LED pitch. */
  marquee: { faceTop: 206, gap: 6, pitch: 4 },
  /** The Daisy White horizon band: this many px above F, hidden behind the facade except over its lowest rooflines. */
  horizon: 260,
  /** X1: paving → daisy bed at the surface; the edge at X1 + 28, the fill at X1 + 56 — farthest-down last. */
  seam: 5800,
  /** The Booth 630 sign's near edge: its right edge just left of Sam on wide screens, its left edge just right of him on phones. */
  sign: { wide: 6012, narrow: 6048 },
  /** Its two legs, inset from the panel's ends. */
  legInset: 18,
  /** The sign board's bottom, px above F: clear of the daisies and of Sam's head (a little lower on phones, under the marquee). */
  signClear: { wide: 64, narrow: 64 },
  trees: [5680, 5760],
  plants: [5560],
  daisies: [5890, 5960, 6150, 6270],
} as const;
/** Cypress row along the facade base, facade x; the entrance with its flags and kiosk stays open. */
const CYPRESS = { from: 140, to: 1270, step: 22, gap: [560, 910] } as const;
/** The plaza → daisy-bed seam tile puts X1 at its column 16. */
const SEAM_BACK_X1 = 16;
/** Four clouds at different heights (fractions of the sky above F), as drawn: [which, set, u, y, drift]. */
const CLOUDS: { set: 'small' | 'medium'; i: number; u: number; y: number; drift: number }[] = [
  { set: 'medium', i: 1, u: 40, y: 0.06, drift: 1 },
  { set: 'small', i: 1, u: 520, y: 0.18, drift: 0.8 },
  { set: 'medium', i: 0, u: 300, y: 0.3, drift: 1.2 },
  { set: 'small', i: 0, u: 760, y: 0.42, drift: 0.9 },
];
const mod = (v: number, m: number) => ((v % m) + m) % m;

export class Arrival {
  /** The city set carries the arrival's art; until it is here the plaza is a daisy field under the same sky. */
  city: CityAssets | null = null;
  private sky: { top: string; horizon: string } | null = null;
  private sign: Drawable | null = null;
  private marquee: { img: Drawable; x: number; bottom: number } | null = null;
  /**
   * The plaza as the game's last level and its mocks: the facade's depth, what is
   * drawn behind it (the far skyline, the towers), each image as drawn (a night palette), and the sky's
   * colours. Left alone they give the arrival as built.
   */
  facadeP: number = PLAZA.facade.p;
  behind: ((ctx: CanvasRenderingContext2D, f: Frame) => void) | null = null;
  look: ((img: Drawable) => Drawable) | null = null;
  skyColors: { top: string; horizon: string; clouds: boolean } | null = null;

  constructor(private readonly a: Level1Assets) {}

  /** Once the city set is here: build the Booth sign and touch the big arrival images in idle time, so the arrival's first frame does no one-off work. */
  warm(c: CityAssets): void {
    this.city = c;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50)))(() => {
      this.boothSign(c);
      this.marqueeFor(c);
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      const pctx = probe.getContext('2d')!;
      for (const img of [c.facade, c.facadeBay, c.cracks.image, c.cypress]) pctx.drawImage(img, 0, 0, 1, 1);
    });
  }

  /** The big sign: 16-BIT CON on an LED board, one line on wide screens, two on phones. */
  private marqueeFor(c: CityAssets): { img: Drawable; x: number; bottom: number } {
    if (this.marquee) return this.marquee;
    // The LED board alone, in its own black frame, high on the front cube just under its roof bevel,
    // centred over the entrance: one line on every screen.
    const m = PLAZA.marquee;
    const img = ledBoard(c.letters, ['16-BIT CON'], m.pitch, 1);
    return (this.marquee = { img, x: Math.round(PLAZA.facade.entrance - img.width / 2), bottom: m.faceTop - m.gap - img.height });
  }

  /** The small sign: Vega's own vega tiles over a BOOTH 630 plate (the letter set), at native size. */
  private boothSign(c: CityAssets): Drawable {
    if (this.sign) return this.sign;
    // One physical sign: a Grey 700 panel in an Outline Black frame, bevelled Grey 500 on its lit
    // edges, holding the vega tiles over the BOOTH 630 plate, with a bolt in each corner.
    const vega = c.vegaSignHorizontal;
    const [k, g7, g5] = ['--color-outline-black', '--color-grey-700', '--color-grey-500'].map(readToken) as [string, string, string];
    const plate = board([letter(c.letters, 'BOOTH 630', 'large')], { fill: k, outline: k, pad: 2 });
    const pad = 5;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(vega.width, plate.width) + 2 * pad;
    canvas.height = vega.height + 3 + plate.height + 2 * pad;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = k;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = g7;
    ctx.fillRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = g5;
    ctx.fillRect(1, 1, canvas.width - 2, 1);
    ctx.fillRect(1, 1, 1, canvas.height - 2);
    for (const [x, y] of [[3, 3], [canvas.width - 4, 3], [3, canvas.height - 4], [canvas.width - 4, canvas.height - 4]]) {
      ctx.fillStyle = k;
      ctx.fillRect(x!, y!, 1, 1);
    }
    ctx.drawImage(vega, Math.floor((canvas.width - vega.width) / 2), pad);
    ctx.drawImage(plate, Math.floor((canvas.width - plate.width) / 2), pad + vega.height + 3);
    return (this.sign = canvas);
  }

  /** The real sky and its clouds on the screen canvas at device resolution, as Level1.drawFar. */
  drawFar(sctx: CanvasRenderingContext2D, f: Frame, k: number, glide = true): void {
    sctx.save();
    sctx.scale(k, k);
    sctx.imageSmoothingEnabled = false;
    this.sky_(sctx, f, glide ? (v) => Math.round(v * k) / k : Math.round);
    sctx.restore();
  }

  private sky_(ctx: CanvasRenderingContext2D, f: Frame, snap: (v: number) => number): void {
    const { camLeft, F, now, range: r, span } = f;
    const a = this.a;
    const sky = this.skyColors ?? this.sky ?? (this.sky = { top: readToken(REAL_SKY), horizon: readToken(REAL_HORIZON) });
    ctx.fillStyle = sky.top;
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.fillStyle = sky.horizon;
    ctx.fillRect(r.x0, F - PLAZA.horizon, r.x1 - r.x0, r.y1 - F + PLAZA.horizon);
    if (this.skyColors && !this.skyColors.clouds) return;
    for (const s of CLOUDS) {
      const img = (s.set === 'small' ? a.small : a.medium)[s.i]!;
      // wrapped over the screen frame's span, as the game's far clouds
      const u = s.u + s.drift * (now / 1000) - STACK.small.p * camLeft;
      const x = span.x0 + mod(u - span.x0, span.x1 - span.x0 + img.width) - img.width;
      if (x < r.x1 && x + img.width > r.x0) ctx.drawImage(img, snap(x), Math.round((F - PLAZA.horizon) * s.y));
    }
  }

  /**
   * @param opaque true while the dissolve masks this frame (its own sky and clouds, at art pixels);
   *   false once it is the whole picture, when drawFar paints the sky behind a transparent buffer
   */
  draw(ctx: CanvasRenderingContext2D, f: Frame, opaque = true, clear = true): void {
    const { camLeft, sx, F, bw, bh, now, range: r } = f;
    const a = this.a;
    const c = this.city;
    const g = STACK.ground;
    const base = F + STACK.near.bottom;
    const L = this.look ?? ((img: Drawable) => img);
    const place = (img: Drawable, x: number, bottom: number) => {
      const px = Math.round(x - camLeft);
      if (px + img.width > r.x0 && px < r.x1) ctx.drawImage(L(img), px, Math.round(bottom - img.height));
    };

    // Sky: flat Blue 100, and Daisy White only at the horizon behind the roofline.
    if (opaque) this.sky_(ctx, f, Math.round);
    else if (clear) ctx.clearRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    this.behind?.(ctx, f);

    if (c) {
      // The real Javits at p 0.25, its entrance centred on screen where Sam stops; its end annex repeats outward.
      const p = this.facadeP;
      const wide = bw >= 480;
      const at = (wide ? PLAZA.facade.wide : PLAZA.facade.narrow) * bw;
      const fx = Math.round(at + p * (PLAZA.facade.hallAt - sx) - PLAZA.facade.entrance - p * camLeft);
      const fy = F + PLAZA.facade.bottom - c.facade.height;
      ctx.drawImage(L(c.facade), fx, fy);
      const mq = this.marqueeFor(c);
      ctx.drawImage(mq.img, fx + mq.x, F + PLAZA.facade.bottom - mq.bottom - mq.img.height);
      for (let x = fx - c.facadeBay.width; x + c.facadeBay.width > r.x0; x -= c.facadeBay.width) ctx.drawImage(L(c.facadeBay), x, fy);
      for (let x = fx + c.facade.width; x < r.x1; x += c.facadeBay.width) ctx.drawImage(L(c.facadeBay), x, fy);
      const treeY = F + PLAZA.facade.bottom - c.cypress.height;
      for (let x = CYPRESS.from; x < CYPRESS.to; x += CYPRESS.step) {
        if (x > CYPRESS.gap[0] && x < CYPRESS.gap[1]) continue;
        const tx = fx + x;
        if (tx + c.cypress.width > r.x0 && tx < r.x1) ctx.drawImage(L(c.cypress), tx, treeY);
      }
    }

    // Ground: the street's bands run on as the plaza paving, then the daisy bed through three
    // vertical seams 28 px apart, surface first, fill last; below the viewport (the monitor's screen
    // frame only) the fill carries on down.
    const X1 = PLAZA.seam;
    const X2 = X1 + g.seamStep;
    const X3 = X1 + 2 * g.seamStep;
    if (c) {
      drawTiled(ctx, L(c.sidewalk), camLeft, F, r, { to: X1 });
      drawTiled(ctx, L(c.kerb), camLeft, F + g.edgeTop, r, { to: X2 });
    }
    const edgeX = c ? Math.max(r.x0, Math.round(X2 - camLeft)) : r.x0;
    if (edgeX < r.x1) {
      ctx.fillStyle = a.dirt;
      ctx.fillRect(edgeX, F + g.edgeTop, r.x1 - edgeX, g.fillTop - g.edgeTop);
    }
    for (let y = F + g.fillTop; y < Math.max(bh, r.y1); y += a.dirtFill.height) {
      if (c) drawTiled(ctx, L(c.road), camLeft, y, r, { to: X3 });
      drawTiled(ctx, L(a.dirtFill), camLeft, y, r, { from: c ? X3 : -Infinity, phase: g.daisyPhase });
    }
    drawTiled(ctx, L(a.dirtRows), camLeft, F + g.edgeTop, r, { from: c ? X2 : -Infinity, phase: g.daisyPhase });
    drawTiled(ctx, L(a.daisySurface), camLeft, F + g.daisyTop, r, { from: c ? X1 : -Infinity, phase: g.daisyPhase });
    if (c) place(c.seamBack, X1 - SEAM_BACK_X1, F + g.seamTileTop + c.seamBack.height);

    for (const x of PLAZA.daisies) place(a.daisyTiny, x, F);
    if (c) {
      for (const x of PLAZA.trees) place(a.tree, x, base);
      for (const x of PLAZA.plants) place(c.plant, x, base);
      // Booth 630: the small sign beside where Sam stops — one panel standing on two legs over the
      // daisies, on the side away from the marquee.
      const sign = this.boothSign(c);
      const wide = bw >= 480;
      const left = wide ? PLAZA.sign.wide - sign.width : PLAZA.sign.narrow;
      for (const x of [left + PLAZA.legInset, left + sign.width - PLAZA.legInset - c.signPost.width]) place(c.signPost, x, base);
      place(sign, left, F - (wide ? PLAZA.signClear.wide : PLAZA.signClear.narrow));
    }

    f.sam.draw(ctx, f.samX - camLeft, F);
    f.dust.draw(ctx, camLeft, F + FOOT_SINK, now);
  }
}
