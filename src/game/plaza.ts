/**
 * The Javits plaza, the game's last level. Where the city's near fronts end —
 * the side wall of a block — the plaza opens up: the Javits facade (NEW, p 0.25) with its entrance
 * (Vega's lobby doors under a canopy) where Sam stops at x 6000, the 16-Bit Con letters on its tall tower,
 * its end annex repeating outward and a row of clipped cypress along its base, the far skyline behind its
 * low wings. On the ground the sidewalk's paving carries on and takes the whole band where the kerb turns
 * away (world.ts); the plaza's trees, a plant and the con's promo cabinet stand on it, and the Booth 630
 * sign stands beside where Sam stops. World draws each part at its depth and gives each image its
 * palette step: the night images serve the night, and the dawn steps them back to day.
 */
import type { CityAssets, WorldAssets } from './assets';
import type { Drawable } from './sprites';
import { STACK, type Frame } from './world';
import { BOOTH_DEPTH, boothSign, boothSignStand, javitsLetters } from './signage';
import { Stepper, rank, type NightTokens } from './night';

export const PLAZA = {
  /**
   * The facade's depth, its base behind the ground band, its entrance column, and where that entrance
   * sits on screen when Sam stops (x 6000): right of centre on wide screens so the letters on the tower and
   * the Booth sign never share a column; centred on phones.
   */
  facade: { p: 0.25, bottom: 6, hallAt: 6000, entrance: 730, wide: 0.62, narrow: 0.5 },
  /**
   * The 16-Bit Con letters on the building: on the tall central tower (centred over the entrance too), their
   * bottom `lift` px above the front cube's face top — clear of the HUD above and of Sam's window below on
   * phones (on the front cube they sat behind it).
   */
  marquee: { faceTop: 206, lift: 24 },
  /** The horizon band: this many px above F, hidden behind the facade except over its lowest rooflines. */
  horizon: 260,
  /** Where the kerb turns away and the plaza's paving takes the whole ground band (world.ts plazaEdge). */
  seam: 5800,
  /**
   * The Booth 630 sign's near edge: its right edge just left of Sam on wide screens; on phones (the compact
   * sign) its left edge just right of him, in the gap Sam's bubble and the touch controls leave before the A button.
   */
  sign: { wide: 6012, narrow: 5988 },
  /** The sign board's bottom, px above F: clear of the plants and of Sam's head; on phones, beside him and under his bubble. */
  signClear: 64,
  signClearNarrow: 40,
  trees: [5680, 5760],
  plants: [5560],
  /** The con's promo cabinet on the plaza, between the plant and the first tree. */
  arcade: 5608,
} as const;
/** Cypress row along the facade base, facade x; the entrance stays open. */
const CYPRESS = { from: 140, to: 1270, step: 22, gap: [560, 910] } as const;
/**
 * The facade's glass (Blue 300/500/700 and its cloud reflections): dark at night, under its space frame
 * — the Booth sign is the plaza's light. (Lit cell by cell like the city's windows,
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
  tree: Stepper;
  plant: Stepper;
}

export class Plaza {
  /** The city set carries the plaza's art; until it is here there is no plaza to draw. */
  city: CityAssets | null = null;
  private sign: Drawable | null = null;
  private signCompact: Drawable | null = null;
  private stand: Drawable | null = null;
  private standCompact: Drawable | null = null;
  private marquee: { img: Drawable; x: number; bottom: number } | null = null;
  private night: PlazaNight | null = null;

  constructor(private readonly a: WorldAssets) {}

  /** Once the city set is here: build the two signs and touch the big images in idle time, so the plaza's first frame does no one-off work. */
  warm(c: CityAssets): void {
    this.city = c;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    (w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50)))(() => {
      this.boothSign(c, false);
      this.boothSign(c, true);
      this.marqueeFor();
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      const pctx = probe.getContext('2d', { willReadFrequently: true })!;
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
    const glass = Object.fromEntries(FACADE_GLASS.map((h) => [h, T.k]));
    const facadeSpec = rank([T.n9, T.g7], [2, 1], glass);
    this.night = {
      facade: new Stepper(c.facade, facadeSpec),
      bay: new Stepper(c.facadeBay, facadeSpec),
      cypress: new Stepper(c.cypress, rank([T.n9, T.n7], [2, 1])),
      tree,
      plant,
    };
    const n = this.night;
    for (const s of [n.facade, n.bay, n.cypress]) s.prepare();
  }

  /** The big sign: the 16-Bit Con wordmark in channel letters, centred over the entrance on the tall tower. */
  private marqueeFor(): { img: Drawable; x: number; bottom: number } {
    if (this.marquee) return this.marquee;
    const m = PLAZA.marquee;
    const img = javitsLetters();
    return (this.marquee = { img, x: Math.round(PLAZA.facade.entrance - img.width / 2), bottom: m.faceTop + m.lift });
  }

  /** The small sign: Vega's tiles and daisy over BOOTH 630 → on a Leaf Green board (signage.ts). */
  private boothSign(c: CityAssets, compact: boolean): Drawable {
    return compact ? (this.signCompact ??= boothSign(c, true)) : (this.sign ??= boothSign(c));
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
    const mq = this.marqueeFor();
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

  /** The plaza's trees, its plant and the promo cabinet, and the Booth 630 sign on its post beside where Sam stops. */
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
    const tree = n ? n.tree.at(s) : a.tree;
    for (const x of PLAZA.trees) place(tree, x, base);
    const plant = n ? n.plant.at(s) : c.plant;
    for (const x of PLAZA.plants) place(plant, x, base);
    place(c.arcade, PLAZA.arcade, base);
    const wide = bw >= 480;
    const sign = this.boothSign(c, !wide);
    const left = wide ? PLAZA.sign.wide - sign.width : PLAZA.sign.narrow;
    const clear = wide ? PLAZA.signClear : PLAZA.signClearNarrow;
    // one post under the board's middle, on its plinth
    const stand = wide ? (this.stand ??= boothSignStand(base - (F - clear))) : (this.standCompact ??= boothSignStand(base - (F - clear)));
    place(stand, left + Math.round((sign.width - BOOTH_DEPTH - stand.width) / 2), base);
    // the sign itself stays lit through the night
    place(sign, left, F - clear);
  }
}
