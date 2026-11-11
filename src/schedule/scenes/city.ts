/**
 * Panel: Pixel Art in the Age of AI — the afternoon city: Vega's New York layers kept low under the
 * text, the subway entrance on the pavement, a mole with a coffee, a dog walking past and clouds.
 */
import { sprites } from '../../data/sprites.manifest';
import { FOOT_SINK } from '../../game/sam';
import { backdrop, cloudsKey, drawClouds, frameAt, img, put, stateKey, strip, tileX, wrap, type Cloud, type SceneModule } from '../kit';

const files = [
  sprites.cityFar.file,
  sprites.cityTowers.file,
  sprites.cityMid.file,
  sprites.cityNear.file,
  sprites.sidewalk.file,
  sprites.subwayFront.file,
  sprites.moleCoffee.file,
  sprites.dogWalk.file,
  sprites.cloudB.file,
  sprites.cloudF.file,
];

/** Pavement rows in front of the feet line (the sidewalk tile's paving, kerb hidden by the edge). */
const GROUND = 30;
const PAVE = 8; // feet stand this far into the paving, as in the game
const DOG_SPEED = 26; // art px / s
const DOG_STRIDE = 8; // px of travel per walk frame

const scene: SceneModule = {
  files,
  async load() {
    const [far, towers, mid, near, sidewalk, subway, coffee, dog, cb, cf] = await Promise.all([
      img(sprites.cityFar.file),
      img(sprites.cityTowers.file),
      img(sprites.cityMid.file),
      img(sprites.cityNear.file),
      img(sprites.sidewalk.file),
      img(sprites.subwayFront.file),
      strip(sprites.moleCoffee.file, 60, 60),
      strip(sprites.dogWalk.file, 60, 60),
      img(sprites.cloudB.file),
      img(sprites.cloudF.file),
    ]);
    const clouds: Cloud[] = [
      { src: cb, x: 0.6, y: 6, speed: 3 },
      { src: cf, x: 0.1, y: 30, speed: 5 },
    ];
    const ground = (h: number) => h - GROUND;
    // Each layer shows only its top rows: far skyline highest, the near blocks lowest.
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      // Rooflines step down toward the viewer, and stay under the text where it overlaps the scene.
      const top = (depth: number, under: number) => Math.min(gy - 30, Math.max(gy - depth, v.clear.y + under));
      tileX(ctx, far, 0, 200, top(132, -30), v.w, 380);
      tileX(ctx, towers, 0, 200, top(112, -10), v.w, 1500);
      tileX(ctx, mid, 0, 200, top(88, 6), v.w, 520);
      tileX(ctx, near, 0, 200, top(62, 24), v.w, 760);
      tileX(ctx, sidewalk, 0, sidewalk.height, gy - PAVE, v.w);
      put(ctx, subway, v.w - subway.width + (v.narrow ? 96 : -24), gy - subway.height + PAVE);
    });
    const dogX = (t: number, w: number) => wrap(t * DOG_SPEED, w + 120) - 60;
    const moleX = (w: number) => (w < 400 ? 2 : Math.round(w * 0.52));

    return {
      start: 4,
      still: 4,
      key(t, v) {
        const x = Math.floor(dogX(t, v.w));
        return stateKey(x, Math.floor(x / DOG_STRIDE) % dog.frames, frameAt(t, 8, coffee.frames), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        coffee.draw(ctx, frameAt(t, 8, coffee.frames), moleX(v.w), gy - 60 + FOOT_SINK);
        const x = Math.floor(dogX(t, v.w));
        dog.draw(ctx, Math.floor(x / DOG_STRIDE) % dog.frames, x, gy - 60 + FOOT_SINK);
      },
    };
  },
};

export default scene;
