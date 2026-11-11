/**
 * Final Boss Tournament — the park: Vega's lake in its hills, the hedge, a tree, the daisy-row lawn,
 * and the moles playing ping-pong on it.
 */
import { sprites } from '../../data/sprites.manifest';
import { cropImage, snapToPalette } from '../../game/palette';
import { backdrop, cloudsKey, drawClouds, frameAt, img, put, stateKey, strip, tileX, type Cloud, type SceneModule } from '../kit';

const files = [sprites.lakeHills.file, sprites.bushes.file, sprites.daisyRow.file, sprites.tree.file, sprites.molesPingPong.file, sprites.cloudLg.file, sprites.cloudG.file];

/** bg-lake-hills: hills and lake drawn from row 220. */
const LAKE = { top: 220 };
/** The daisy row: the feet line at its row 47 (the game's F: its bottom sits 16 px below). */
const LAWN = 47;
const GROUND = 16; // the strip ends 16 px under the feet line

const scene: SceneModule = {
  files,
  async load() {
    const [lake, hedge, daisyRowImg, treeImg, pong, lg, g] = await Promise.all([
      img(sprites.lakeHills.file),
      img(sprites.bushes.file),
      img(sprites.daisyRow.file),
      img(sprites.tree.file),
      strip(sprites.molesPingPong.file, 260, 90),
      img(sprites.cloudLg.file),
      img(sprites.cloudG.file),
    ]);
    // As the game does: the daisy row snapped to its own colours, the tree without its planter.
    const lawn = snapToPalette(daisyRowImg, 16);
    const tree = cropImage(treeImg, 0, 0, treeImg.width, 65);
    const clouds: Cloud[] = [
      { src: lg, x: 0.75, y: 2, speed: 2 },
      { src: g, x: 0.2, y: 40, speed: 4 },
    ];
    const ground = (h: number) => h - GROUND;
    const pongX = (w: number) => (w < 400 ? w - 260 + 10 : w - 260 - 40);
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      const lakeRows = lake.height - LAKE.top;
      tileX(ctx, lake, LAKE.top, lakeRows, gy - 30 - lakeRows + 40, v.w, 120);
      tileX(ctx, hedge, 0, hedge.height, gy - hedge.height + 6, v.w, 200);
      put(ctx, tree, Math.max(4, pongX(v.w) - tree.width - 28), gy - tree.height + 6);
      tileX(ctx, lawn, 0, lawn.height, gy - LAWN, v.w, 300);
    });

    return {
      start: 0,
      still: 1,
      key(t, v) {
        return stateKey(frameAt(t, 10, pong.frames), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        pong.draw(ctx, frameAt(t, 10, pong.frames), pongX(v.w), gy - 90 + 4);
      },
    };
  },
};

export default scene;
