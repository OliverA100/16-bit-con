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
import { board, letter } from './lettering';
import { REAL_SKY, REAL_HORIZON } from '../data/layers';

export const PLAZA = {
  /** The facade's depth, its base behind the ground band, and the world x at which its entrance is centred on screen. */
  facade: { p: 0.25, bottom: 6, hallAt: 6000, entrance: 730 },
  /** The Daisy White horizon band: this many px above F, hidden behind the facade except over its lowest rooflines. */
  horizon: 260,
  /** X1: paving → daisy bed at the surface; the edge at X1 + 28, the fill at X1 + 56 — farthest-down last. */
  seam: 5800,
  /** The Booth 630 sign's post, its left edge. Sam stops at 6000 with the post just past his right hand. */
  sign: 6054,
  /** The sign board's bottom, px above F: clear of the daisies and of Sam's head. */
  signClear: 64,
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

  constructor(private readonly a: Level1Assets) {}

  /** VEGA (Vega's own tiles, 2×) over BOOTH 630 (the letter set, large), on one Outline Black board. */
  private boothSign(c: CityAssets): Drawable {
    if (this.sign) return this.sign;
    const vega = document.createElement('canvas');
    vega.width = c.vegaSignHorizontal.width * 2;
    vega.height = c.vegaSignHorizontal.height * 2;
    const vctx = vega.getContext('2d')!;
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(c.vegaSignHorizontal, 0, 0, vega.width, vega.height);
    const k = readToken('--color-outline-black');
    const plate = board([letter(c.letters, '· BOOTH 630 ·', 'large')], { fill: k, outline: k, pad: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(vega.width, plate.width);
    canvas.height = vega.height + 2 + plate.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(vega, Math.floor((canvas.width - vega.width) / 2), 0);
    ctx.drawImage(plate, Math.floor((canvas.width - plate.width) / 2), vega.height + 2);
    return (this.sign = canvas);
  }

  draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const { camLeft, sx, F, bw, bh, now } = f;
    const a = this.a;
    const c = this.city;
    const g = STACK.ground;
    const base = F + STACK.near.bottom;
    const place = (img: Drawable, x: number, bottom: number) => {
      const px = Math.round(x - camLeft);
      if (px > -img.width && px < bw) ctx.drawImage(img, px, Math.round(bottom - img.height));
    };

    // Sky: flat Blue 100, and Daisy White only at the horizon behind the roofline.
    const sky = this.sky ?? (this.sky = { top: readToken(REAL_SKY), horizon: readToken(REAL_HORIZON) });
    ctx.fillStyle = sky.top;
    ctx.fillRect(0, 0, bw, bh);
    ctx.fillStyle = sky.horizon;
    ctx.fillRect(0, F - PLAZA.horizon, bw, bh - F + PLAZA.horizon);
    for (const s of CLOUDS) {
      const img = (s.set === 'small' ? a.small : a.medium)[s.i]!;
      const span = bw + img.width;
      const u = s.u + s.drift * (now / 1000) - STACK.small.p * camLeft;
      ctx.drawImage(img, Math.round(mod(u, span) - img.width), Math.round((F - PLAZA.horizon) * s.y));
    }

    if (c) {
      // The real Javits at p 0.25, its entrance centred on screen where Sam stops; its end annex repeats outward.
      const p = PLAZA.facade.p;
      const fx = Math.round(bw / 2 + p * (PLAZA.facade.hallAt - sx) - PLAZA.facade.entrance - p * camLeft);
      const fy = F + PLAZA.facade.bottom - c.facade.height;
      ctx.drawImage(c.facade, fx, fy);
      for (let x = fx - c.facadeBay.width; x > -c.facadeBay.width; x -= c.facadeBay.width) ctx.drawImage(c.facadeBay, x, fy);
      for (let x = fx + c.facade.width; x < bw; x += c.facadeBay.width) ctx.drawImage(c.facadeBay, x, fy);
      const treeY = F + PLAZA.facade.bottom - c.cypress.height;
      for (let x = CYPRESS.from; x < CYPRESS.to; x += CYPRESS.step) {
        if (x > CYPRESS.gap[0] && x < CYPRESS.gap[1]) continue;
        const tx = fx + x;
        if (tx > -c.cypress.width && tx < bw) ctx.drawImage(c.cypress, tx, treeY);
      }
    }

    // Ground: the street's bands run on as the plaza paving, then the daisy bed through three
    // vertical seams 28 px apart, surface first, fill last.
    const X1 = PLAZA.seam;
    const X2 = X1 + g.seamStep;
    const X3 = X1 + 2 * g.seamStep;
    if (c) {
      drawTiled(ctx, c.sidewalk, camLeft, F, bw, { to: X1 });
      drawTiled(ctx, c.kerb, camLeft, F + g.edgeTop, bw, { to: X2 });
      drawTiled(ctx, c.road, camLeft, F + g.fillTop, bw, { to: X3 });
    }
    const edgeX = c ? Math.max(0, Math.round(X2 - camLeft)) : 0;
    if (edgeX < bw) {
      ctx.fillStyle = a.dirt;
      ctx.fillRect(edgeX, F + g.edgeTop, bw - edgeX, g.fillTop - g.edgeTop);
    }
    drawTiled(ctx, a.dirtFill, camLeft, F + g.fillTop, bw, { from: c ? X3 : -Infinity, phase: g.daisyPhase });
    drawTiled(ctx, a.dirtRows, camLeft, F + g.edgeTop, bw, { from: c ? X2 : -Infinity, phase: g.daisyPhase });
    drawTiled(ctx, a.daisySurface, camLeft, F + g.daisyTop, bw, { from: c ? X1 : -Infinity, phase: g.daisyPhase });
    if (c) place(c.seamBack, X1 - SEAM_BACK_X1, F + g.seamTileTop + c.seamBack.height);

    for (const x of PLAZA.daisies) place(a.daisyTiny, x, F);
    if (c) {
      for (const x of PLAZA.trees) place(a.tree, x, base);
      for (const x of PLAZA.plants) place(c.plant, x, base);
      // Booth 630: the board over the daisies on its post, Sam beside the post.
      const sign = this.boothSign(c);
      place(c.signPost, PLAZA.sign, base);
      place(sign, PLAZA.sign + c.signPost.width / 2 - sign.width / 2, F - PLAZA.signClear);
    }

    f.sam.draw(ctx, f.samX - camLeft, F);
    f.dust.draw(ctx, camLeft, F + FOOT_SINK, now);
  }
}
