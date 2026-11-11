/**
 * Opening Keynote — the morning field: Vega's green hills and mesa, the grass-and-rock strip, Sam
 * idling, Vega's daisy swaying by him and clouds drifting beside the title.
 */
import { sprites } from '../../data/sprites.manifest';
import { patchTileSeam } from '../../game/palette';
import { FOOT_SINK } from '../../game/sam';
import { backdrop, cloudsKey, daisyFrames, DAISY, drawClouds, frameAt, img, put, samStrip, skyTop, stateKey, SWAY_FPS, tileX, type Cloud, type SceneModule } from '../kit';

const files = [
  sprites.hills.file,
  sprites.grassRocks.file,
  sprites.samIdle.file,
  sprites.daisySway.file,
  sprites.cloudA.file,
  sprites.cloudG.file,
  sprites.cloudH.file,
];

/** Rows of the grass strip above the folder's edge: its grass and the top of the rock. */
const GROUND = 52;
const GRASS_TOP = 44; // the strip's grass surface row

const scene: SceneModule = {
  files,
  async load() {
    const [hillsImg, grass, idle, daisy, a, g, h] = await Promise.all([
      img(sprites.hills.file),
      img(sprites.grassRocks.file),
      samStrip(sprites.samIdle.file),
      daisyFrames(),
      img(sprites.cloudA.file),
      img(sprites.cloudG.file),
      img(sprites.cloudH.file),
    ]);
    const hills = patchTileSeam(hillsImg);
    const clouds: Cloud[] = [
      { src: a, x: 0.55, y: 14, speed: 3 },
      { src: g, x: 0.15, y: 42, speed: 5 },
      { src: h, x: 0.85, y: 6, speed: 4 },
    ];
    const ground = (vh: number) => vh - GROUND;
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      tileX(ctx, hills, 0, hills.height, gy - 70, v.w, 140);
    });
    const front = backdrop((ctx, v) => {
      tileX(ctx, grass, 0, grass.height, ground(v.h) - GRASS_TOP, v.w, 60);
    });
    const daisyX = (w: number) => w - DAISY.w - (w > 400 ? 40 : 6);
    /** Sam stands at the daisy's foot, just left of its stem (the stem at column 62 of the daisy frame). */
    const samX = (w: number) => daisyX(w) + 62 - 50;

    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(frameAt(t, 10, idle.frames), frameAt(t, SWAY_FPS, daisy.length), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        // The daisy's head stays in view, under the text on phones; its stem runs down behind the grass.
        put(ctx, daisy[frameAt(t, SWAY_FPS, daisy.length)]!, daisyX(v.w), Math.max(skyTop(v) + 4, gy + 30 - DAISY.h));
        ctx.drawImage(front(v), 0, 0);
        idle.draw(ctx, frameAt(t, 10, idle.frames), samX(v.w), gy - 60 + FOOT_SINK);
      },
    };
  },
};

export default scene;
