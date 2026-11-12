/**
 * Vega After Party — Booth 630 at night, and a party: the skyline in the distance and the buildings along
 * the street in the game's night palette, their windows lighting one by one; the tall block at the end of
 * the street with the two VEGA cabinets at its foot, one being played; and moles all along the pavement —
 * at the ping-pong table, on the sofa, queueing for the cabinets with pizza, a phone and a party dress — a
 * dog barking at the ball, and Sam outside for a smoke. On phones the pavement is deeper and the party
 * stands in two rows.
 *
 * The night colours and the window finder are the game's (src/game/night-core.ts), with the token
 * targets and glass colours the game uses for these layers (src/game/world.ts).
 */
import { sprites } from '../../data/sprites.manifest';
import { hexToRgb } from '../../game/palette';
import { findWindows, indexImage, mapOf, nightImage, windowSprites, type NightSpec } from '../../game/night-core';
import { nightTokens, rank } from '../../game/night';
import {
  backdrop,
  frameAt,
  img,
  layer,
  put,
  samStrip,
  skyTop,
  standAnim,
  standStill,
  stateKey,
  strip,
  tileX,
  wrap,
  type Drawable,
  type SceneModule,
  type View,
} from '../kit';

const files = [
  sprites.cityFar.file,
  sprites.cityMid.file,
  sprites.cityNear.file,
  sprites.sidewalk.file,
  sprites.arcade.file,
  sprites.molesSofa.file,
  sprites.molesChess.file,
  sprites.molePizza.file,
  sprites.molePhone.file,
  sprites.molePinkDress.file,
  sprites.molesPingPong.file,
  sprites.moleBoard.file,
  sprites.moleFiling.file,
  sprites.dogBark.file,
  sprites.samSmoking.file,
];

/** Pavement rows under the ground line (the back row's feet): one row of people on wide folders, two on phones. */
const GROUND = { wide: 30, narrow: 70 };
/** The pavement's slabs start this far above the ground line. */
const PAVE = 8;
/** city-far: the skyline (its towers' tops within these rows). */
const FAR = { rows: 210, offset: 380 };
/** city-mid: the buildings along the street, roofs and windows (from row 40); on wide folders their tops LOW above the ground line. */
const MID = { rows: 150, facade: 40, LOW: 120 };
/** city-near: one block (the blue one with the solar roof) at the end of the street; its roof at row 100. */
const BLOCK = { x: 498, w: 164, rows: 330, roof: 100, facade: 140, side: 40 };
/** Seconds between two windows lighting, and the lit pause before the street goes dark and starts again. */
const LIGHT_EVERY = 0.1;
const HOLD = 3;

/** The game's glass colours and night ranks for these layers (src/game/world.ts). */
const GLASS = {
  far: ['#B9D6DF', '#B9C8E5'],
  mid: ['#3E81E8', '#2386F1', '#5E9AF9', '#5BABFF', '#EDC18B', '#DE914E', '#EACAAC'],
  near: ['#3A7DE7', '#5C98F9', '#386DD2', '#59A9FF', '#F2C185', '#E38E44', '#F2C6B6', '#F0CAA8', '#F2D2A1', '#DFA67C'],
};

interface Lit {
  x: number;
  y: number;
  c: HTMLCanvasElement;
}

/** A crop of a layer in the night palette, and its windows as lit sprites (shuffled, as in the game). */
function night(src: Drawable, sx: number, w: number, rows: number, glass: string[], spec: NightSpec, lit: string, wrap: boolean) {
  const crop = layer(w, rows, (ctx) => ctx.drawImage(src, sx, 0, w, rows, 0, 0, w, rows));
  const data = crop.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, rows);
  const im = indexImage(data.data, w, rows);
  const px = nightImage(im, mapOf(im, spec));
  const dark = layer(w, rows, (c) => c.putImageData(new ImageData(new Uint8ClampedArray(px), w, rows), 0, 0));
  const { boxes, pixels } = windowSprites(findWindows(im, glass, wrap), hexToRgb(lit));
  const lights: Lit[] = pixels.map((p, i) => {
    const [x, y, bw, bh] = [boxes[i * 4]!, boxes[i * 4 + 1]!, boxes[i * 4 + 2]!, boxes[i * 4 + 3]!];
    return { x, y, c: layer(bw, bh, (c) => c.putImageData(new ImageData(new Uint8ClampedArray(p), bw, bh), 0, 0)) };
  });
  return { dark, lights, data: data.data };
}

/**
 * One room, one light: a window on a block's side face (left of `side`) lights with the front window
 * nearest it on the same floor, as one.
 */
function rooms(lights: Lit[], side: number): Lit[] {
  const front = lights.filter((l) => l.x >= side);
  const used = new Set<Lit>();
  const out: Lit[] = [];
  for (const l of lights.filter((l) => l.x < side)) {
    const floor = front.filter((f) => !used.has(f) && f.y < l.y + l.c.height && l.y < f.y + f.c.height);
    const mate = floor.sort((a, b) => a.x - b.x)[0];
    if (!mate) {
      out.push(l);
      continue;
    }
    used.add(mate);
    const [x, y] = [Math.min(l.x, mate.x), Math.min(l.y, mate.y)];
    const w = Math.max(l.x + l.c.width, mate.x + mate.c.width) - x;
    const h = Math.max(l.y + l.c.height, mate.y + mate.c.height) - y;
    out.push({ x, y, c: layer(w, h, (ctx) => [l, mate].forEach((m) => ctx.drawImage(m.c, m.x - x, m.y - y))) });
  }
  return [...out, ...front.filter((f) => !used.has(f))];
}

/** Each column's height in a layer's crop (its alpha), for cutting it between buildings. */
function heights(data: Uint8ClampedArray, w: number, rows: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    let top = rows;
    for (let y = 0; y < rows; y++)
      if (data[(y * w + x) * 4 + 3]! > 0) {
        top = y;
        break;
      }
    out.push(rows - top);
  }
  return out;
}

/**
 * A tiling offset for a layer drawn in [from, to) and cut at x = cutAt: of the offsets that put a gap
 * between buildings (columns under `gap` high, `lead` of them before the cut) on the cut, the one
 * showing most of the buildings in that span.
 */
function cutAtGap(h: number[], gap: number, cutAt: number, from: number, to: number, lead = 0): number {
  let best = 0;
  let most = -1;
  for (let g = 0; g < h.length; g++) {
    let open = true;
    for (let j = 0; j <= lead && open; j++) open = h[wrap(g - j, h.length)]! < gap;
    if (!open) continue;
    const offset = g - cutAt;
    let shown = 0;
    for (let x = from; x < to; x++) shown += h[wrap(x + offset, h.length)]!;
    if (shown > most) [most, best] = [shown, offset];
  }
  return best;
}

const scene: SceneModule = {
  files,
  async load() {
    const [far, mid, near, sidewalk, arcade, sofa, chess, pizza, phone, dress, pong, board, filing, dog, sam] = await Promise.all([
      img(sprites.cityFar.file),
      img(sprites.cityMid.file),
      img(sprites.cityNear.file),
      img(sprites.sidewalk.file),
      img(sprites.arcade.file),
      strip(sprites.molesSofa.file, 140, 90),
      strip(sprites.molesChess.file, 140, 100),
      strip(sprites.molePizza.file, 60, 60),
      strip(sprites.molePhone.file, 60, 60),
      img(sprites.molePinkDress.file),
      strip(sprites.molesPingPong.file, 260, 90),
      img(sprites.moleBoard.file),
      img(sprites.moleFiling.file),
      strip(sprites.dogBark.file, 60, 60),
      samStrip(sprites.samSmoking.file),
    ]);
    const T = nightTokens();
    const to = (hexes: string[], token: string) => Object.fromEntries(hexes.map((h) => [h, token]));
    const farN = night(far, 0, far.width, FAR.rows, GLASS.far, rank([T.n9], [1], to(GLASS.far, T.k)), T.y1, true);
    const midN = night(mid, 0, mid.width, MID.rows, GLASS.mid, rank([T.n9, T.g7, T.g5], [2, 2, 1], to([...GLASS.mid, '#B3D0FF'], T.k)), T.y4, true);
    const blockN = night(
      near,
      BLOCK.x,
      BLOCK.w,
      BLOCK.rows,
      GLASS.near,
      rank([T.n9, T.g7, T.g5], [35, 40, 25], {
        ...to([...GLASS.near, '#7796DC', '#95ACDC', '#B5D1FF', '#ACC6F2', '#AAC2E0'], T.k),
        '#E06B4E': T.g7,
        '#2D4365': T.k,
      }),
      T.y4,
      false,
    );
    const pave = night(
      sidewalk,
      0,
      sidewalk.width,
      sidewalk.height,
      [],
      {
        map: {
          '#E8DECF': T.g5,
          '#CBC3C7': T.g7,
          '#CBBFBF': T.g7,
          '#ACA5A8': T.g7,
          '#ABA3A3': T.g7,
          '#BB9147': T.g5,
          '#767272': T.g7,
          '#55575B': T.k,
          '#353535': T.k,
          '#777B80': T.g7,
          '#84C5FF': T.g5,
        },
      },
      T.y4,
      false,
    ).dark;
    const blockRooms = rooms(blockN.lights, BLOCK.side);
    const farH = heights(farN.data, far.width, FAR.rows);
    const midH = heights(midN.data, mid.width, MID.rows);

    const ground = (v: View) => v.h - (v.narrow ? GROUND.narrow : GROUND.wide);
    /** Where the scene beside the text starts (wide folders); on phones everything is under the text. */
    const side = (v: View) => (v.narrow || v.clear.x <= 0 ? 0 : v.clear.x + 8);
    const blockX = (v: View) => v.w - (v.narrow ? 70 : BLOCK.w + 14);
    const blockY = (v: View) => (v.narrow ? Math.max(skyTop(v) + 2, ground(v) - 150) : 10) - BLOCK.roof;

    /**
     * The layers behind the street, each a band of a tiled crop: [from, to) across, its top row, its
     * tiling offset. The skyline runs the whole width (low under the text, full height beside it, the two
     * parts cut between towers); the street's buildings stand beside the text, or under it on phones.
     */
    let plan: { v: View; far: Band[]; mid: Band[] } | null = null;
    interface Band {
      from: number;
      to: number;
      top: number;
      offset: number;
    }
    const bands = (v: View) => {
      if (plan?.v === v) return plan;
      const gy = ground(v);
      const x0 = side(v);
      const bx = blockX(v);
      const farTop = Math.max(skyTop(v) + 4, gy - FAR.rows + 10);
      const farB: Band[] =
        x0 > 0
          ? [
              { from: 0, to: x0, top: Math.max(v.clear.y + 4, farTop), offset: cutAtGap(farH, 40, x0, 0, x0) },
              { from: x0, to: v.w, top: farTop, offset: cutAtGap(farH, 40, x0, x0, bx) },
            ]
          : [{ from: 0, to: v.w, top: farTop, offset: FAR.offset }];
      // the street's buildings low enough for the skyline's towers to rise over them: beside the text on
      // wide folders, on phones under it, below the skyline's towers, as far as the middle of the street
      const midB: Band[] = v.narrow
        ? [{ from: 0, to: Math.round(v.w * 0.6), top: v.clear.y + 36, offset: cutAtGap(midH, 20, 0, 0, Math.round(v.w * 0.6)) }]
        : [{ from: x0, to: v.w, top: gy - MID.LOW, offset: cutAtGap(midH, 20, x0, x0, bx) }];
      plan = { v, far: farB, mid: midB };
      return plan;
    };

    const actors = {
      pong: standAnim(pong, 12),
      sofa: standAnim(sofa, 8),
      chess: standAnim(chess, 3),
      dress: standStill(dress),
      phone: standAnim(phone, 2),
      // the mole with its arms out faces left as drawn: mirrored, it faces the cabinets in the queue
      filing: standStill(filing, true),
      pizza: standAnim(pizza, 10),
      dog: standAnim(dog, 8),
      sam: standAnim(sam, 8),
      arcade: standStill(arcade),
      player: standStill(board),
    };
    type Cast = [keyof typeof actors, number, number][];
    /**
     * Who stands where: [actor, x, feet line relative to the ground line], drawn back to front. Sam smoking
     * at the end of the street, the ping-pong table with the dog barking at the ball, the sofa and a mole in
     * a party dress by it, two at a game of chess; then, beside the text, the only queue worth standing in
     * (a mole with its arms out, one on the phone, the one with pizza at its head) up to the two cabinets,
     * both being played, and one more mole beside them watching.
     */
    let cast: { v: View; list: Cast } | null = null;
    const castOf = (v: View): Cast => {
      if (cast?.v === v) return cast.list;
      const booth = v.narrow ? v.w - 60 : blockX(v) + 14;
      const list: Cast = v.narrow
        ? [
            ['pong', -14, 4],
            ['arcade', booth, 6],
            ['player', booth + 20, 18],
            ['filing', booth - 172, 26],
            ['dress', booth - 136, 30],
            ['phone', booth - 104, 36],
            ['sam', -8, 42],
            ['pizza', booth - 62, 44],
            ['dog', 54, 50],
          ]
        : [
            ['pong', 46, 2],
            ['dress', side(v) - 166, 4],
            ['sofa', side(v) - 300, 8],
            ['arcade', booth, 10],
            ['arcade', booth + 56, 10],
            ['chess', side(v) - 118, 6],
            ['filing', side(v) + 34, 13],
            ['phone', side(v) + 74, 14],
            ['dog', 156, 16],
            ['sam', -4, 20],
            ['player', booth + 20, 22],
            ['player', booth + 76, 22],
            ['player', booth + 118, 26],
            ['pizza', booth - 44, 24],
          ];
      list.sort((a, b) => a[2] - b[2]);
      cast = { v, list };
      return list;
    };

    /**
     * The pixels the party covers (as it moves: frames across a few seconds) and the pavement: a window
     * lights only where none of its pixels is hidden.
     */
    const covered = (v: View) => {
      const mask = layer(v.w, v.h, (ctx) => {
        for (let t = 0; t < 3; t += 0.125) for (const [who, x, d] of castOf(v)) actors[who](ctx, t, x, ground(v) + d);
        ctx.fillRect(0, ground(v) - PAVE, v.w, v.h);
      });
      const alpha = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, v.w, v.h).data;
      return (x: number, y: number) => x < 0 || y < 0 || x >= v.w || y >= v.h || alpha[(y * v.w + x) * 4 + 3]! > 0;
    };
    /** Every window that shows in this view and nobody stands in front of, in one lighting order. */
    let cached: { v: View; list: (Lit & { depth: number; order: number })[] } | null = null;
    const lights = (v: View) => {
      if (cached?.v === v) return cached.list;
      const out: (Lit & { depth: number; order: number })[] = [];
      const b = bands(v);
      const hidden = covered(v);
      const clear = (x: number, y: number, c: HTMLCanvasElement) => {
        for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (hidden(x + i, y + j)) return false;
        return true;
      };
      const add = (src: Lit[], width: number, band: Band, depth: number, keep: (l: Lit) => boolean, mix: number) =>
        src.forEach((l, i) => {
          if (!keep(l)) return;
          for (let x = l.x - wrap(band.offset, width); x < band.to; x += width) {
            if (x >= band.from && clear(x, band.top + l.y, l.c)) out.push({ x, y: band.top + l.y, c: l.c, depth, order: (i * mix + x) % 97 });
          }
        });
      for (const band of b.far) add(farN.lights, far.width, band, 0, () => true, 13);
      for (const band of b.mid) add(midN.lights, mid.width, band, 1, (l) => l.y >= MID.facade, 7);
      const bx = blockX(v);
      const by = blockY(v);
      blockRooms.forEach((l, i) => {
        // windows only: the solar panels on the roof share the glass colours
        if (l.y >= BLOCK.facade && clear(bx + l.x, by + l.y, l.c)) out.push({ x: bx + l.x, y: by + l.y, c: l.c, depth: 2, order: (i * 11) % 97 });
      });
      out.sort((a, b) => a.order - b.order);
      cached = { v, list: out };
      return out;
    };
    const lit = (t: number, n: number) => {
      const cycle = n * LIGHT_EVERY + HOLD;
      return Math.min(n, Math.floor((t % cycle) / LIGHT_EVERY));
    };
    const tiled = (src: Drawable, rows: number, list: (v: View) => Band[]) =>
      backdrop((ctx, v) => {
        for (const band of list(v)) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(band.from, 0, band.to - band.from, v.h);
          ctx.clip();
          tileX(ctx, src, 0, rows, band.top, v.w, band.offset);
          ctx.restore();
        }
      });
    const layers = [
      tiled(farN.dark, FAR.rows, (v) => bands(v).far),
      tiled(midN.dark, MID.rows, (v) => bands(v).mid),
      backdrop((ctx, v) => put(ctx, blockN.dark, blockX(v), blockY(v))),
    ];
    const street = backdrop((ctx, v) => tileX(ctx, pave, 0, pave.height, ground(v) - PAVE, v.w));

    return {
      start: 2,
      still: 30 * LIGHT_EVERY,
      key(t, v) {
        return stateKey(
          lit(t, lights(v).length),
          frameAt(t, 8, sofa.frames),
          frameAt(t, 3, chess.frames),
          frameAt(t, 10, pizza.frames),
          frameAt(t, 2, phone.frames),
          frameAt(t, 12, pong.frames),
          frameAt(t, 8, dog.frames),
          frameAt(t, 8, sam.frames),
          v.w,
          v.h,
        );
      },
      draw(ctx, t, v) {
        const gy = ground(v);
        const list = lights(v);
        const n = lit(t, list.length);
        // far to near: the skyline, the street's buildings, the block, each with its windows; then the street
        layers.forEach((layer, depth) => {
          ctx.drawImage(layer(v), 0, 0);
          for (let i = 0; i < n; i++) if (list[i]!.depth === depth) put(ctx, list[i]!.c, list[i]!.x, list[i]!.y);
        });
        ctx.drawImage(street(v), 0, 0);
        for (const [who, x, d] of castOf(v)) actors[who](ctx, t, x, gy + d);
      },
    };
  },
};

export default scene;
