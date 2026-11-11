/**
 * Vega After Party — Booth 630 at night: the city in the game's own night palette, its windows
 * lighting one by one, a tall block behind the booth, the two VEGA arcade cabinets under the sign,
 * and the moles on the sofa. The night colours and the window finder are the game's
 * (src/game/night-core.ts), with the same token targets and glass colours the game uses for these
 * layers (src/game/world.ts).
 */
import { sprites } from '../../data/sprites.manifest';
import { hexToRgb } from '../../game/palette';
import { findWindows, indexImage, mapOf, nightImage, windowSprites, type NightSpec } from '../../game/night-core';
import { nightTokens, rank } from '../../game/night';
import { FOOT_SINK } from '../../game/sam';
import { backdrop, frameAt, img, layer, put, stateKey, strip, tileX, type Drawable, type SceneModule, type View } from '../kit';

const files = [sprites.cityMid.file, sprites.cityNear.file, sprites.sidewalk.file, sprites.arcade.file, sprites.vegaSignHorizontal.file, sprites.molesSofa.file];

const GROUND = 30;
const PAVE = 8;
/** city-mid: the rooftops and two floors of windows, along the whole street. */
const MID = { rows: 120, offset: 300, facade: 40 };
/** city-near: one block (the blue one with the solar roof) standing behind the booth; its roof at row 100. */
const BLOCK = { x: 498, w: 164, rows: 330, roof: 100, facade: 140 };
/** Seconds between two windows lighting, and the lit pause before the street goes dark and starts again. */
const LIGHT_EVERY = 0.12;
const HOLD = 3;

/** The game's glass colours and night ranks for these layers (src/game/world.ts). */
const GLASS = {
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
  return { dark, lights };
}

const scene: SceneModule = {
  files,
  async load() {
    const [mid, near, sidewalk, arcade, sign, sofa] = await Promise.all([
      img(sprites.cityMid.file),
      img(sprites.cityNear.file),
      img(sprites.sidewalk.file),
      img(sprites.arcade.file),
      img(sprites.vegaSignHorizontal.file),
      strip(sprites.molesSofa.file, 140, 90),
    ]);
    const T = nightTokens();
    const to = (hexes: string[], token: string) => Object.fromEntries(hexes.map((h) => [h, token]));
    const midN = night(mid, 0, mid.width, MID.rows, GLASS.mid, rank([T.n9, T.g7, T.g5], [2, 2, 1], to([...GLASS.mid, '#B3D0FF'], T.k)), T.y4, true);
    const blockN = night(
      near,
      BLOCK.x,
      BLOCK.w,
      BLOCK.rows,
      GLASS.near,
      rank([T.n9, T.g7, T.g5], [35, 40, 25], { ...to([...GLASS.near, '#7796DC', '#95ACDC', '#B5D1FF', '#ACC6F2', '#AAC2E0'], T.k), '#E06B4E': T.g7, '#2D4365': T.k }),
      T.y4,
      false,
    );
    const pave = night(sidewalk, 0, sidewalk.width, sidewalk.height, [], { map: { '#E8DECF': T.g5, '#CBC3C7': T.g7, '#CBBFBF': T.g7, '#ACA5A8': T.g7, '#ABA3A3': T.g7, '#BB9147': T.g5, '#767272': T.g7, '#55575B': T.k, '#353535': T.k, '#777B80': T.g7, '#84C5FF': T.g5 } }, T.y4, false).dark;

    const ground = (h: number) => h - GROUND;
    /** The mid rooftops: low, and under the text where it reaches over the scene. */
    const midTop = (v: View) => Math.min(ground(v.h) - 40, Math.max(ground(v.h) - MID.rows, v.clear.y + 6));
    const blockX = (w: number) => w - BLOCK.w - (w < 400 ? 2 : 14);
    // Right of the text the block can stand tall: its roof near the top of the folder, every floor lit in turn.
    const blockY = (v: View) => (v.narrow ? Math.max(2, ground(v.h) - 150) : 10) - BLOCK.roof;
    const boothX = (w: number) => blockX(w) + (w < 400 ? 22 : 30);

    /** Every window that shows in this view, mid ones first in depth, in one lighting order. */
    let cached: { v: View; list: (Lit & { block: boolean; order: number })[] } | null = null;
    const lights = (v: View) => {
      if (cached?.v === v) return cached.list;
      const out: (Lit & { block: boolean; order: number })[] = [];
      const top = midTop(v);
      midN.lights.forEach((l, i) => {
        if (l.y < MID.facade) return; // windows only: the roofs' skylights and panels share the glass colours
        for (let x = l.x - MID.offset; x < v.w; x += midN.dark.width) if (x + l.c.width > 0) out.push({ x, y: top + l.y, c: l.c, block: false, order: (i * 7 + x) % 97 });
      });
      const bx = blockX(v.w);
      const by = blockY(v);
      blockN.lights.forEach((l, i) => {
        // windows only: the solar panels on the roof share the glass colours
        if (l.y >= BLOCK.facade && by + l.y < ground(v.h) - 4) out.push({ x: bx + l.x, y: by + l.y, c: l.c, block: true, order: (i * 11) % 97 });
      });
      out.sort((a, b) => a.order - b.order);
      cached = { v, list: out };
      return out;
    };
    const lit = (t: number, n: number) => {
      const cycle = n * LIGHT_EVERY + HOLD;
      return Math.min(n, Math.floor((t % cycle) / LIGHT_EVERY));
    };
    const midBack = backdrop((ctx, v) => tileX(ctx, midN.dark, 0, MID.rows, midTop(v), v.w, MID.offset));
    const blockBack = backdrop((ctx, v) => put(ctx, blockN.dark, blockX(v.w), blockY(v)));
    const front = backdrop((ctx, v) => {
      const gy = ground(v.h);
      tileX(ctx, pave, 0, pave.height, gy - PAVE, v.w);
      const x = boothX(v.w);
      put(ctx, arcade, x, gy - arcade.height + PAVE - 2);
      put(ctx, arcade, x + 56, gy - arcade.height + PAVE - 2);
      put(ctx, sign, x + (56 + arcade.width) / 2 - sign.width / 2, gy - arcade.height - sign.height - 4);
    });

    return {
      start: 2,
      still: 40 * LIGHT_EVERY,
      key(t, v) {
        return stateKey(lit(t, lights(v).length), frameAt(t, 8, sofa.frames), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        const list = lights(v);
        const n = lit(t, list.length);
        // Far to near: the mid street and its lit windows, then the block over them and its own.
        ctx.drawImage(midBack(v), 0, 0);
        for (let i = 0; i < n; i++) if (!list[i]!.block) put(ctx, list[i]!.c, list[i]!.x, list[i]!.y);
        ctx.drawImage(blockBack(v), 0, 0);
        for (let i = 0; i < n; i++) if (list[i]!.block) put(ctx, list[i]!.c, list[i]!.x, list[i]!.y);
        ctx.drawImage(front(v), 0, 0);
        sofa.draw(ctx, frameAt(t, 8, sofa.frames), v.w < 400 ? -10 : boothX(v.w) - 160, gy - 90 + FOOT_SINK);
      },
    };
  },
};

export default scene;
