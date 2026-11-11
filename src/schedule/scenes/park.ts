/**
 * Final Boss Tournament — the final, played out by the water: Vega's lake with its tree-covered islets,
 * the grass-and-rocks ground in front, and the moles at the ping-pong table with everyone
 * else turned to watch them, clouds drifting over. The match stands clear of the next folder's tab
 * along the folder's foot.
 */
import { sprites } from '../../data/sprites.manifest';
import { backdrop, cloudsKey, drawClouds, frameAt, img, standAnim, standStill, stateKey, strip, tileX, type Cloud, type SceneModule, type View } from '../kit';

const files = [
  sprites.lake.file,
  sprites.grassRocks.file,
  sprites.molesPingPong.file,
  sprites.moleBoard.file,
  sprites.moleFiling.file,
  sprites.molePizza.file,
  sprites.dogBark.file,
  sprites.cloudLg.file,
  sprites.cloudG.file,
];

/**
 * ground-grass-rocks: its grass surface at row 44, then grass to about row 82 and rock under it. The grass
 * is carried on down the folder (its rows 52–80 repeated) so everyone stands on grass, never the rock.
 */
const FLOOR = { surface: 44, feet: 4, band: [52, 28] as const };
/** Rows under the grass's front line: enough for the next folder's tab (37 px) to cover only ground, never the match. */
const GROUND = { wide: 62, narrow: 100 };
/**
 * The ping-pong sheet is drawn in perspective: its front legs reach its bottom row, its back legs end 24
 * rows higher. The table stands this far onto the grass, so its back legs land on it too.
 */
const TABLE = 30;
/** bg-lake: drawn from row 147 (the islets' treetops), that row just under the text. */
const LAKE = { top: 147, underText: 6 };

const scene: SceneModule = {
  files,
  async load() {
    const [lake, floor, pong, board, cheer, pizza, dog, lg, g] = await Promise.all([
      img(sprites.lake.file),
      img(sprites.grassRocks.file),
      strip(sprites.molesPingPong.file, 260, 90),
      img(sprites.moleBoard.file),
      img(sprites.moleFiling.file),
      strip(sprites.molePizza.file, 60, 60),
      strip(sprites.dogBark.file, 60, 60),
      img(sprites.cloudLg.file),
      img(sprites.cloudG.file),
    ]);
    const clouds: Cloud[] = [
      { src: lg, x: 0.75, y: 2, speed: 2 },
      { src: g, x: 0.2, y: 40, speed: 4 },
    ];
    const ground = (v: View) => v.h - (v.narrow ? GROUND.narrow : GROUND.wide);
    const back = backdrop((ctx, v) => {
      const gy = ground(v);
      tileX(ctx, lake, LAKE.top, lake.height - LAKE.top, v.clear.y + LAKE.underText, v.w, 140);
      const fy = gy - FLOOR.surface - FLOOR.feet;
      const [b0, bh] = FLOOR.band;
      tileX(ctx, floor, 0, b0, fy, v.w, 200);
      for (let y = fy + b0, i = 0; y < v.h; y += bh, i++) tileX(ctx, floor, b0, bh, y, v.w, 200 + i * 137);
    });

    // every spectator turned to the table: as drawn, the pizza mole and the dog (left of it) face right,
    // the cheering mole (right of it) faces left; the mole seen from behind is turned a little to its
    // left, so in the front row it stands as drawn right of the table's middle and mirrored left of it,
    // each looking in at the match, a step in front of the table rather than against it.
    const things = {
      pong: standAnim(pong, 10),
      back: standStill(board),
      backM: standStill(board, true),
      cheer: standStill(cheer),
      pizza: standAnim(pizza, 10),
      dog: standAnim(dog, 8),
    };
    type Cast = [keyof typeof things, number, number][];
    /** [who, x, feet line relative to the ground line], back to front: the table and its watchers. */
    const cast = (v: View): Cast => {
      if (v.narrow) {
        return [
          ['pong', -4, TABLE],
          ['cheer', 262, 34],
          ['back', 298, 46],
          ['backM', 82, 56],
          ['back', 140, 58],
        ];
      }
      const table = Math.round(v.w * 0.32);
      return [
        ['cheer', table + 266, 26],
        ['pong', table, TABLE],
        ['pizza', table - 62, 32],
        ['dog', table - 158, 36],
        ['back', table + 300, 44],
        ['backM', table - 100, 46],
        ['backM', table + 92, 54],
        ['back', table + 150, 56],
      ];
    };

    return {
      start: 0,
      still: 1,
      key(t, v) {
        return stateKey(frameAt(t, 10, pong.frames), frameAt(t, 10, pizza.frames), frameAt(t, 8, dog.frames), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        for (const [who, x, d] of cast(v)) things[who](ctx, t, x, gy + d);
      },
    };
  },
};

export default scene;
