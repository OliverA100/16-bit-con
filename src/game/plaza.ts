/**
 * The Javits plaza, the game's last level. Where the city's near fronts end —
 * the side wall of a block — the plaza opens up: the Javits facade (NEW, p 0.25) with its entrance
 * where Sam stops at x 6000, the 16-BIT CON LED board high on its front, its end annex repeating
 * outward and a row of clipped cypress along its base, the far skyline behind its low wings. On the
 * ground the street's three bands run on as paving until the daisy bed takes over through the same
 * three staggered seams; the plaza's trees, plants and daisies stand on it, and the Booth 630 sign
 * stands beside where Sam stops. Level1 draws each part at its depth and gives each image its
 * palette step: the night images serve the night, and the dawn steps them back to day.
 */
import type { CityAssets, Level1Assets } from './assets';
import type { Drawable } from './sprites';
import { drawTiled, STACK, type Frame } from './world';
import { hexToRgb, readToken } from './palette';
import { board, ledBoard, letter } from './lettering';
import { NIGHT_STEPS, Stepper, rank, type NightTokens } from './night';

export const PLAZA = {
  /**
   * The facade's depth, its base behind the ground band, its entrance column, and where that entrance
   * sits on screen when Sam stops (x 6000): right of centre on wide screens so the big marquee and the
   * small Booth sign never share a column; centred on phones.
   */
  facade: { p: 0.25, bottom: 6, hallAt: 6000, entrance: 730, wide: 0.62, narrow: 0.5 },
  /** The 16-BIT CON LED board on the building: high on the front cube, its top `gap` px under the face top (just below the roof bevel), 4 px LED pitch. */
  marquee: { faceTop: 206, gap: 6, pitch: 4 },
  /** The horizon band: this many px above F, hidden behind the facade except over its lowest rooflines. */
  horizon: 260,
  /** X1: paving → daisy bed at the surface; the edge at X1 + 28, the fill at X1 + 56 — farthest-down last. */
  seam: 5800,
  /** The Booth 630 sign's near edge: its right edge just left of Sam on wide screens, its left edge just right of him on phones. */
  sign: { wide: 6012, narrow: 6048 },
  /** Its two legs, inset from the panel's ends. */
  legInset: 18,
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
/**
 * The facade's glass (Blue 300/500/700 and its cloud reflections): dark at night, under its space frame
 * — the LED board and the Booth sign are the plaza's lights. (Lit cell by cell like the city's windows,
 * the glass joins into a few large panes and the whole hall glows.)
 */
const FACADE_GLASS = ['#5DB3FF', '#8DCAFF', '#CAE6FF', '#2189E5'];

/** The night/dawn step of each part: 0 = day … NIGHT_STEPS = night. */
export interface PlazaLook {
  facade: number;
  street: number;
}

interface PlazaNight {
  facade: Stepper;
  bay: Stepper;
  cypress: Stepper;
  post: Stepper;
  seamBack: Stepper;
  daisySurface: Stepper;
  dirtRows: Stepper;
  dirtFill: Stepper;
  daisyTiny: Stepper;
  tree: Stepper;
  plant: Stepper;
  dirt: [number, number, number];
  dark: [number, number, number];
}

export class Plaza {
  /** The city set carries the plaza's art; until it is here there is no plaza to draw. */
  city: CityAssets | null = null;
  private sign: Drawable | null = null;
  private marquee: { img: Drawable; x: number; bottom: number } | null = null;
  private night: PlazaNight | null = null;

  constructor(private readonly a: Level1Assets) {}

  /** Once the city set is here: build the two signs and touch the big images in idle time, so the plaza's first frame does no one-off work. */
  warm(c: CityAssets): void {
    this.city = c;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50)))(() => {
      this.boothSign(c);
      this.marqueeFor(c);
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      const pctx = probe.getContext('2d')!;
      for (const img of [c.facade, c.facadeBay, c.cypress]) pctx.drawImage(img, 0, 0, 1, 1);
    });
  }

  /**
   * The plaza's night images, queued after the city's (the night reaches the plaza last). Both plaza
   * times need them: a night plaza shows them, a dawn one steps out of them.
   */
  prepareNight(T: NightTokens, tree: Stepper, plant: Stepper): void {
    const c = this.city;
    if (!c || this.night) return;
    const a = this.a;
    const glass = Object.fromEntries(FACADE_GLASS.map((h) => [h, T.k]));
    const facadeSpec = rank([T.n9, T.g7], [2, 1], glass);
    const pave = rank([T.k, T.g7, T.g5], [1, 1, 1]);
    this.night = {
      facade: new Stepper(c.facade, facadeSpec),
      bay: new Stepper(c.facadeBay, facadeSpec),
      cypress: new Stepper(c.cypress, rank([T.n9, T.n7], [2, 1])),
      post: new Stepper(c.signPost, pave),
      seamBack: new Stepper(c.seamBack, pave),
      daisySurface: new Stepper(a.daisySurface, rank([T.n9, T.n7, T.g7], [2, 1, 1])),
      dirtRows: new Stepper(a.dirtRows, rank([T.k, T.n9], [1, 1])),
      dirtFill: new Stepper(a.dirtFill, rank([T.k, T.n9], [1, 1])),
      daisyTiny: new Stepper(a.daisyTiny, rank([T.n9, T.n7], [2, 1])),
      tree,
      plant,
      dirt: hexToRgb(a.dirt),
      dark: hexToRgb(T.k),
    };
    const n = this.night;
    for (const s of [n.facade, n.bay, n.cypress, n.post, n.seamBack, n.daisySurface, n.dirtRows, n.dirtFill, n.daisyTiny]) s.prepare();
  }

  /** The big sign: 16-BIT CON on an LED board, centred over the entrance high on the front cube. */
  private marqueeFor(c: CityAssets): { img: Drawable; x: number; bottom: number } {
    if (this.marquee) return this.marquee;
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

  /** The facade's left edge on screen: its entrance lands where Sam stops at hallAt. */
  facadeX(f: Frame): number {
    const p = PLAZA.facade.p;
    const at = (f.bw >= 480 ? PLAZA.facade.wide : PLAZA.facade.narrow) * f.bw;
    return Math.round(at + p * (PLAZA.facade.hallAt - f.sx) - PLAZA.facade.entrance - p * f.camLeft);
  }

  /**
   * The facade, its LED board, its annex repeating outward and the cypress row along its base — only
   * right of `clipX`, the city's end on screen: behind the city's last block it is not there.
   */
  drawFacade(ctx: CanvasRenderingContext2D, f: Frame, clipX: number, look: PlazaLook): void {
    const c = this.city;
    const r = f.range;
    if (!c || clipX >= r.x1) return;
    const n = this.night;
    const x0 = Math.max(r.x0, clipX);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, r.y0, r.x1 - x0, r.y1 - r.y0);
    ctx.clip();
    const fx = this.facadeX(f);
    const fy = f.F + PLAZA.facade.bottom - c.facade.height;
    const facade = n ? n.facade.at(look.facade) : c.facade;
    const bay = n ? n.bay.at(look.facade) : c.facadeBay;
    const bw = c.facadeBay.width;
    const bays: number[] = [];
    for (let x = fx - bw; x + bw > x0; x -= bw) bays.push(x);
    for (let x = fx + c.facade.width; x < r.x1; x += bw) bays.push(x);
    if (fx + c.facade.width > x0 && fx < r.x1) ctx.drawImage(facade, fx, fy);
    for (const x of bays) ctx.drawImage(bay, x, fy);
    const mq = this.marqueeFor(c);
    ctx.drawImage(mq.img, fx + mq.x, f.F + PLAZA.facade.bottom - mq.bottom - mq.img.height);
    const cypress = n ? n.cypress.at(look.facade) : c.cypress;
    const treeY = f.F + PLAZA.facade.bottom - c.cypress.height;
    for (let x = CYPRESS.from; x < CYPRESS.to; x += CYPRESS.step) {
      if (x > CYPRESS.gap[0] && x < CYPRESS.gap[1]) continue;
      const tx = fx + x;
      if (tx + c.cypress.width > x0 && tx < r.x1) ctx.drawImage(cypress, tx, treeY);
    }
    ctx.restore();
  }

  /**
   * The daisy bed beyond the plaza's seams — the street's bands stop at them (Level1 draws those) —
   * and the seam tile's details; below the viewport (the monitor's screen frame) the fill carries on down.
   */
  drawGround(ctx: CanvasRenderingContext2D, f: Frame, look: PlazaLook): void {
    const c = this.city;
    if (!c) return;
    const { camLeft, F, bh, range: r } = f;
    const a = this.a;
    const n = this.night;
    const g = STACK.ground;
    const s = look.street;
    const X1 = PLAZA.seam;
    const X2 = X1 + g.seamStep;
    const X3 = X1 + 2 * g.seamStep;
    const edgeX = Math.max(r.x0, Math.round(X2 - camLeft));
    if (edgeX < r.x1) {
      ctx.fillStyle = n && s > 0 ? mix(n.dirt, n.dark, s / NIGHT_STEPS) : a.dirt;
      ctx.fillRect(edgeX, F + g.edgeTop, r.x1 - edgeX, g.fillTop - g.edgeTop);
    }
    const fill = n ? n.dirtFill.at(s) : a.dirtFill;
    for (let y = F + g.fillTop; y < Math.max(bh, r.y1); y += a.dirtFill.height) drawTiled(ctx, fill, camLeft, y, r, { from: X3, phase: g.daisyPhase });
    drawTiled(ctx, n ? n.dirtRows.at(s) : a.dirtRows, camLeft, F + g.edgeTop, r, { from: X2, phase: g.daisyPhase });
    drawTiled(ctx, n ? n.daisySurface.at(s) : a.daisySurface, camLeft, F + g.daisyTop, r, { from: X1, phase: g.daisyPhase });
    const seam = n ? n.seamBack.at(s) : c.seamBack;
    const sx = Math.round(X1 - SEAM_BACK_X1 - camLeft);
    if (sx + seam.width > r.x0 && sx < r.x1) ctx.drawImage(seam, sx, F + g.seamTileTop);
  }

  /** The plaza's trees, plants and daisies, and the Booth 630 sign on its two posts beside where Sam stops. */
  drawProps(ctx: CanvasRenderingContext2D, f: Frame, look: PlazaLook): void {
    const c = this.city;
    if (!c) return;
    const { camLeft, F, bw, range: r } = f;
    const a = this.a;
    const n = this.night;
    const s = look.street;
    const base = F + STACK.near.bottom;
    const place = (img: Drawable, x: number, bottom: number) => {
      const px = Math.round(x - camLeft);
      if (px + img.width > r.x0 && px < r.x1) ctx.drawImage(img, px, Math.round(bottom - img.height));
    };
    const daisy = n ? n.daisyTiny.at(s) : a.daisyTiny;
    for (const x of PLAZA.daisies) place(daisy, x, F);
    const tree = n ? n.tree.at(s) : a.tree;
    for (const x of PLAZA.trees) place(tree, x, base);
    const plant = n ? n.plant.at(s) : c.plant;
    for (const x of PLAZA.plants) place(plant, x, base);
    const sign = this.boothSign(c);
    const left = bw >= 480 ? PLAZA.sign.wide - sign.width : PLAZA.sign.narrow;
    const post = n ? n.post.at(s) : c.signPost;
    for (const x of [left + PLAZA.legInset, left + sign.width - PLAZA.legInset - c.signPost.width]) place(post, x, base);
    // the sign itself stays lit through the night
    place(sign, left, F - PLAZA.signClear);
  }
}

/** a → b by u, as an rgb() string (the edge band's flat tone between its day and night colours). */
function mix(a: [number, number, number], b: [number, number, number], u: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * Math.min(1, Math.max(0, u))));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}
