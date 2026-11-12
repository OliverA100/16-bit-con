/**
 * Workshop: Draw Your First 16-Bit Sprite — a class in Vega's careers office: attendees at their desks,
 * one with the laptop they brought, two drawing at monitors (the daisy on one is a sprite in the making),
 * and one at the instructor's desk of screens under the window, the cork board of pinned drawings beside
 * it. The inner wall is the folder's own white, only its brick motifs drawn (the tiles' base colour left
 * out), so the room fills the folder with nothing to cut; on phones its floor is deep enough for two rows.
 */
import { sprites } from '../../data/sprites.manifest';
import { backdrop, frameAt, img, layer, put, skyTop, standAnim, standStill, stateKey, strip, tileX, type Drawable, type SceneModule, type View } from '../kit';
import { mulberry32 } from '../../lib/math';

const files = [
  sprites.officeWall.file,
  sprites.officeWall2.file,
  sprites.officeFloor.file,
  sprites.officeWindow.file,
  sprites.officeScreens.file,
  sprites.officeDesk.file,
  sprites.officeDesk2.file,
  sprites.officeDesk3.file,
  sprites.officePlant.file,
  sprites.officeShelf.file,
  sprites.officeCork.file,
  sprites.moleTyping.file,
  sprites.moleLaptop.file,
];

/** The floor tile: yellow skirting (rows 0–19), planks (20–51), then the slab. */
const FLOOR = { skirt: 20, planks: [20, 32] as const };
/** Floor rows under the back row's feet line: one row on wide folders, two on phones. */
const GROUND = { wide: 30, narrow: 62 };
/** The desks' feet line, relative to the ground line. */
const DESK_FEET = 4;
/** Brick patches: one per `per` art px² of wall, at least `apart` from each other, none within `clear` of what hangs on the wall; motifs this close are one patch. */
const BRICKS = { per: 14000, apart: 56, clear: 8, seed: 630 };
const PATCH_GAP = 5;
/**
 * A desk's keyboard spans x 48–73 across it (the big desk has a second at 117–142); the typing mole's
 * chair has its middle at x 34 of its frame and its hand reaches forward at x 12. As Vega draws it: the
 * chair SEAT right of the keyboard's middle (the hand on the keys), its base RAISE below the desk's feet.
 */
const KEYBOARD = 61;
const CHAIR = 34;
const SEAT = 14;
const RAISE = 5;

const scene: SceneModule = {
  files,
  async load() {
    const [wall, wall2, floor, win, screens, desk1, desk2, desk3, plant, shelf, cork, typing, laptop] = await Promise.all([
      img(sprites.officeWall.file),
      img(sprites.officeWall2.file),
      img(sprites.officeFloor.file),
      img(sprites.officeWindow.file),
      strip(sprites.officeScreens.file, 196, 103),
      img(sprites.officeDesk.file),
      img(sprites.officeDesk2.file),
      img(sprites.officeDesk3.file),
      img(sprites.officePlant.file),
      img(sprites.officeShelf.file),
      img(sprites.officeCork.file),
      strip(sprites.moleTyping.file, 60, 60),
      strip(sprites.moleLaptop.file, 104, 62),
    ]);
    /** A wall tile with its base colour (its most common pixel) left out: the brick motifs alone. */
    const motifs = (src: Drawable) =>
      layer(src.width, src.height, (c) => {
        c.drawImage(src, 0, 0);
        const im = c.getImageData(0, 0, src.width, src.height);
        const d = im.data;
        const n = new Map<number, number>();
        for (let i = 0; i < d.length; i += 4) {
          const k = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
          n.set(k, (n.get(k) ?? 0) + 1);
        }
        const base = [...n].sort((a, b) => b[1] - a[1])[0]![0];
        for (let i = 0; i < d.length; i += 4) if (((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!) === base) d[i + 3] = 0;
        c.putImageData(im, 0, 0);
      });
    /** Each tile's brick patches: the motifs grouped (pixels within a few px of each other), as boxes. */
    const patches = (m: HTMLCanvasElement) => {
      const { width: w, height: h } = m;
      const a = m.getContext('2d')!.getImageData(0, 0, w, h).data;
      const seen = new Uint8Array(w * h);
      const out: [number, number, number, number][] = [];
      for (let start = 0; start < w * h; start++) {
        if (seen[start] || !a[start * 4 + 3]) continue;
        const stack = [start];
        seen[start] = 1;
        let [x0, y0, x1, y1] = [w, h, 0, 0];
        while (stack.length) {
          const i = stack.pop()!;
          const [x, y] = [i % w, (i / w) | 0];
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
          for (let dy = -PATCH_GAP; dy <= PATCH_GAP; dy++) {
            for (let dx = -PATCH_GAP; dx <= PATCH_GAP; dx++) {
              const [nx, ny] = [x + dx, y + dy];
              const j = ny * w + nx;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[j] && a[j * 4 + 3]) {
                seen[j] = 1;
                stack.push(j);
              }
            }
          }
        }
        out.push([x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
      }
      return out;
    };
    /** Every brick patch of both tiles (the slivers left out): [tile's motifs, its box]. */
    const patchPool = [wall, wall2].flatMap((t) => {
      const m = motifs(t);
      return patches(m)
        .filter(([, , w, h]) => w >= 12 && h >= 6)
        .map((box) => [m, box] as const);
    });
    const ground = (v: View) => v.h - (v.narrow ? GROUND.narrow : GROUND.wide);
    /** The top of the window, as high as the wall's two tiles reach above the skirting (under the text on phones). */
    const wallTop = (v: View) => Math.max(skyTop(v) + 8, ground(v) - FLOOR.skirt - wall.height * 2);
    /** On wide folders, the cork board stands just right of the text. */
    const side = (v: View) => (!v.narrow && v.clear.x > 0 ? v.clear.x + 12 : 0);

    const back = backdrop((ctx, v) => {
      const gy = ground(v);
      const top = wallTop(v);
      // a few brick patches where the plaster has worn, as on a real wall: single patches of Vega's
      // own, scattered (a seeded random, the same every time), apart from each other, more of them low
      // toward the skirting; none behind the text, and none on or round what hangs on the wall
      const foot = gy - FLOOR.skirt;
      const hung: [Drawable, number, number][] = [
        [win, v.w - win.width - (v.narrow ? 6 : 18), top + 8],
        v.narrow ? [shelf, 10, top + 28] : [cork, side(v) + 22, top + 26],
      ];
      const bare = (x: number, y: number, w: number, h: number) =>
        !(x < v.clear.x && y < v.clear.y) &&
        hung.every(
          ([d, hx, hy]) => x + w + BRICKS.clear <= hx || hx + d.width + BRICKS.clear <= x || y + h + BRICKS.clear <= hy || hy + d.height + BRICKS.clear <= y,
        );
      const rand = mulberry32(BRICKS.seed);
      const wallTopY = skyTop(v) + 6;
      const count = Math.round((v.w * (foot - wallTopY)) / BRICKS.per);
      const placed: [number, number][] = [];
      for (let tries = 0; tries < count * 40 && placed.length < count; tries++) {
        const [m, [px, py, pw, ph]] = patchPool[Math.floor(rand() * patchPool.length)]!;
        // lower is likelier: a square root of a uniform draw leans toward the skirting
        const x = Math.floor(rand() * (v.w - pw));
        const y = Math.floor(wallTopY + Math.sqrt(rand()) * (foot - 2 - ph - wallTopY));
        if (!bare(x, y, pw, ph) || placed.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < BRICKS.apart)) continue;
        placed.push([x, y]);
        ctx.drawImage(m, px, py, pw, ph, x, y, pw, ph);
      }
      // the floor: skirting and planks, the planks carried on down where the floor is deeper
      tileX(ctx, floor, 0, floor.height, gy - FLOOR.skirt, v.w);
      const [p0, ph] = FLOOR.planks;
      for (let y = gy - FLOOR.skirt + p0 + ph; y < v.h; y += ph) tileX(ctx, floor, p0, ph, y, v.w);
      for (const [d, x, y] of hung) put(ctx, d, x, y);
    });

    const things = {
      screens: standAnim(screens, 6),
      plant: standStill(plant),
      desk1: standStill(desk1),
      desk2: standStill(desk2),
      desk3: standStill(desk3),
      typing: standAnim(typing, 10),
      laptop: standAnim(laptop, 8),
    };
    type Room = [keyof typeof things, number, number, number?][];
    /**
     * The room: [thing, x, feet line relative to the ground line, time offset], back to front. Everyone at
     * a desk sits in front of it, their chair's back to us, their hand on the keyboard (KEYBOARD: a
     * keyboard's middle across its desk; the big desk has two, at 61 and 130).
     */
    const room = (v: View): Room => {
      const seat = (d: keyof typeof things, x: number, keyboard: number, dt: number): Room => [
        [d, x, DESK_FEET],
        ['typing', x + keyboard + SEAT - CHAIR, DESK_FEET + RAISE, dt],
      ];
      if (v.narrow) {
        return [
          ...seat('screens', v.w - 200, KEYBOARD, 0.8),
          ...seat('desk1', -14, KEYBOARD, 0),
          ['plant', v.w - plant.width + 4, DESK_FEET],
          ['laptop', 96, 34],
        ];
      }
      const x0 = side(v);
      return [
        ...seat('screens', v.w - 196 - 60, KEYBOARD, 0.8),
        ['plant', v.w - plant.width + 4, DESK_FEET],
        ['laptop', 16, DESK_FEET + 6],
        ...seat('desk1', Math.max(150, x0 - 470), KEYBOARD, 0),
        ...seat('desk2', Math.max(320, x0 - 300), KEYBOARD, 0.35),
        ...seat('desk3', Math.max(490, x0 - 130), KEYBOARD, 0.6),
      ];
    };
    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(
          frameAt(t, 6, screens.frames),
          ...[0, 0.35, 0.6, 0.8].map((dt) => frameAt(t + dt, 10, typing.frames)),
          frameAt(t, 8, laptop.frames),
          v.w,
          v.h,
        );
      },
      draw(ctx, t, v) {
        const gy = ground(v);
        ctx.drawImage(back(v), 0, 0);
        for (const [what, x, d, dt = 0] of room(v)) things[what](ctx, t + dt, x, gy + d);
      },
    };
  },
};

export default scene;
