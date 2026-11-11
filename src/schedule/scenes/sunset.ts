/**
 * Closing Credits — golden hills at sunset: Vega's hills in warm light, the sand-and-daisy meadow,
 * Vega's daisies swaying out of it and clouds drifting home.
 */
import { sprites } from '../../data/sprites.manifest';
import { backdrop, cloudsKey, daisyFrames, DAISY, drawClouds, frameAt, img, put, stateKey, tileX, type Cloud, type SceneModule } from '../kit';

const MEADOW = '/sprites/world/ground-desert-strip_509x51.png';
const files = [sprites.hillsGolden.file, MEADOW, sprites.daisySway.file, sprites.cloudLg.file, sprites.cloudMd.file];

const GROUND = 36;
const MEADOW_TOP = 6; // the meadow's surface row

const scene: SceneModule = {
  files,
  async load() {
    const [hills, meadow, daisy, lg, md] = await Promise.all([img(sprites.hillsGolden.file), img(MEADOW), daisyFrames(), img(sprites.cloudLg.file), img(sprites.cloudMd.file)]);
    const clouds: Cloud[] = [
      { src: lg, x: 0.4, y: 0, speed: 2 },
      { src: md, x: 0.05, y: 40, speed: 3 },
    ];
    const ground = (h: number) => h - GROUND;
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      tileX(ctx, hills, 0, hills.height, gy - hills.height + 12, v.w, 200);
    });
    const front = backdrop((ctx, v) => {
      const gy = ground(v.h);
      tileX(ctx, meadow, 0, meadow.height, gy - MEADOW_TOP, v.w, 60);
    });
    /** Two daisies on wide folders, one on narrow, out of step with each other; heads in view. */
    const daisies = (w: number, gy: number) =>
      w < 400
        ? [{ x: w - DAISY.w - 4, y: Math.max(2, gy + 40 - DAISY.h), phase: 0 }]
        : [
            { x: w - DAISY.w - 30, y: Math.max(2, gy + 40 - DAISY.h), phase: 0 },
            { x: w - DAISY.w * 2 - 10, y: Math.max(40, gy + 60 - DAISY.h) + 34, phase: 3 },
          ];

    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(frameAt(t, 6, daisy.length), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        const f = frameAt(t, 6, daisy.length);
        for (const d of daisies(v.w, gy).reverse()) put(ctx, daisy[(f + d.phase) % daisy.length]!, d.x, d.y);
        ctx.drawImage(front(v), 0, 0);
      },
    };
  },
};

export default scene;
