/**
 * Panel: Pixel Art in the Age of AI — "four artists, one question" on a roof terrace over the city:
 * four moles (one drawing at a laptop, two at a table with the question marks over their heads, one on
 * their phone, where anything can be generated), Vega's rooftop floor and railing and lift house, plants
 * and an umbrella, staged at depths across the terrace, the skyline beyond and clouds drifting over it.
 * Phones keep three of the four beside the lift house.
 */
import { sprites } from '../../data/sprites.manifest';
import { backdrop, cloudsKey, drawClouds, frameAt, img, put, stateKey, strip, tileX, type Cloud, type SceneModule, type View } from '../kit';

const files = [
  sprites.cityFar.file,
  sprites.cityTowers.file,
  sprites.cityMid.file,
  sprites.roofFloor.file,
  sprites.roofLift.file,
  sprites.moleLaptop.file,
  sprites.molesChess.file,
  sprites.molePhone.file,
  sprites.officePlant.file,
  sprites.plantFlowers.file,
  sprites.beachSet.file,
  sprites.cloudB.file,
  sprites.cloudF.file,
];

/** The rooftop floor tile: its row 64 on the ground line gy; rows below it show down to the folder's edge. */
const FEET = 64;
const GROUND = 27;
/** Depths across the checker floor (rows 40–71): feet lines relative to gy, back by the parapet to front. */
const DEPTH = { back: -18, midBack: -10, mid: -4, front: 5 };
/** The lift house stands on its own floor patch: its row 140 on the feet line. */
const LIFT_FOOT = 140;

const scene: SceneModule = {
  files,
  async load() {
    const [far, towers, mid, floor, lift, laptop, chess, phone, plant, flowers, beach, cb, cf] = await Promise.all([
      img(sprites.cityFar.file),
      img(sprites.cityTowers.file),
      img(sprites.cityMid.file),
      img(sprites.roofFloor.file),
      img(sprites.roofLift.file),
      strip(sprites.moleLaptop.file, 104, 62),
      strip(sprites.molesChess.file, 140, 100),
      strip(sprites.molePhone.file, 60, 60),
      img(sprites.officePlant.file),
      img(sprites.plantFlowers.file),
      img(sprites.beachSet.file),
      img(sprites.cloudB.file),
      img(sprites.cloudF.file),
    ]);
    const clouds: Cloud[] = [
      { src: cb, x: 0.6, y: 6, speed: 3 },
      { src: cf, x: 0.1, y: 30, speed: 5 },
    ];
    const ground = (h: number) => h - GROUND;
    /** Where things stand on the terrace (x), wide and on phones; -1 leaves a thing out. */
    const at = (v: View) => {
      if (v.narrow) return { beach: -1, phone: -1, chess: -8, laptop: 140, plant: -1, flowers: -1, lift: v.w - 100 };
      const c = Math.round(v.w * 0.22);
      return { beach: Math.round(v.w * 0.02), phone: Math.round(v.w * 0.02) + 96, chess: c, laptop: c + 176, plant: v.w - 137 - 20 - 50, flowers: c + 300, lift: v.w - 137 - 20 };
    };
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      // The city beyond the railing: rooflines step down toward the terrace, under the text where it reaches.
      const top = (depth: number, under: number) => Math.min(gy - 70, Math.max(gy - depth, v.clear.y + under));
      tileX(ctx, far, 0, 220, top(170, -20), v.w, 380);
      tileX(ctx, towers, 0, 220, top(150, 0), v.w, 1500);
      tileX(ctx, mid, 0, 220, top(118, 10), v.w, 520);
      tileX(ctx, floor, 0, floor.height, gy - FEET, v.w);
      // back to front: the lift house and plant by the parapet, the umbrella a step forward
      const p = at(v);
      put(ctx, lift, p.lift, gy + DEPTH.back - LIFT_FOOT);
      if (p.plant >= 0) put(ctx, plant, p.plant, gy + DEPTH.back - plant.height + 1);
      if (p.beach >= 0) put(ctx, beach, p.beach, gy + DEPTH.midBack - beach.height + 1);
    });
    const front = backdrop((ctx, v) => {
      const p = at(v);
      if (p.flowers >= 0) put(ctx, flowers, p.flowers, ground(v.h) + DEPTH.front - flowers.height + 1);
    });

    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(frameAt(t, 8, laptop.frames), frameAt(t, 3, chess.frames), frameAt(t, 1.5, phone.frames), cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        const p = at(v);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        // back to front: the one on their phone by the umbrella, the two puzzling over the question in the
        // middle of the terrace, the artist drawing at the front
        if (p.phone >= 0) phone.draw(ctx, frameAt(t, 1.5, phone.frames), p.phone, gy + DEPTH.midBack - phone.fh + 1);
        chess.draw(ctx, frameAt(t, 3, chess.frames), p.chess, gy + DEPTH.mid - chess.fh + 1);
        laptop.draw(ctx, frameAt(t, 8, laptop.frames), p.laptop, gy + DEPTH.front - laptop.fh + 1);
        ctx.drawImage(front(v), 0, 0);
      },
    };
  },
};

export default scene;
