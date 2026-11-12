/**
 * Closing Credits — golden hills at sunset: Vega's hills in warm light, the sand-and-daisy meadow,
 * Vega's daisies swaying out of it and clouds drifting home.
 */
import { sprites } from '../../data/sprites.manifest';
import {
  backdrop,
  cloudsKey,
  daisyFrames,
  drawClouds,
  frameAt,
  img,
  paintGoldenHills,
  paintMeadow,
  put,
  skyTop,
  stateKey,
  sunsetArt,
  sunsetDaisies,
  SWAY_FPS,
  type Cloud,
  type SceneModule,
} from '../kit';

const files = [sprites.hillsGolden.file, sprites.meadow.file, sprites.daisySway.file, sprites.cloudLg.file, sprites.cloudMd.file];

const GROUND = 36;

const scene: SceneModule = {
  files,
  async load() {
    const [art, daisy, lg, md] = await Promise.all([sunsetArt(), daisyFrames(), img(sprites.cloudLg.file), img(sprites.cloudMd.file)]);
    const clouds: Cloud[] = [
      { src: lg, x: 0.4, y: 0, speed: 2 },
      { src: md, x: 0.05, y: 40, speed: 3 },
    ];
    const ground = (h: number) => h - GROUND;
    const back = backdrop((ctx, v) => paintGoldenHills(ctx, art, ground(v.h), v.w));
    const front = backdrop((ctx, v) => paintMeadow(ctx, art, ground(v.h), v.w));

    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(frameAt(t, SWAY_FPS, daisy.length), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        const f = frameAt(t, SWAY_FPS, daisy.length);
        for (const d of sunsetDaisies(v.w, gy, skyTop(v)).reverse()) put(ctx, daisy[(f + d.phase) % daisy.length]!, d.x, d.y);
        ctx.drawImage(front(v), 0, 0);
      },
    };
  },
};

export default scene;
