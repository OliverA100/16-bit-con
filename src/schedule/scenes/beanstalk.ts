/**
 * Repair Bench: Bring Your Broken Cartridges — Vega's canyon with its beanstalk: the stalk sways
 * (Vega's sway sheet, standing where the canyon's own stalk stood) up into clouds, as in Vega's canyon
 * picture (the sheet's stem ends in a flat cut, which the clouds cover), and Sam climbs it, up to just
 * under the clouds and back down, again and again.
 */
import { sprites } from '../../data/sprites.manifest';
import {
  backdrop,
  CLIMB_HANDS,
  img,
  layer,
  put,
  samStrip,
  skyTop,
  stateKey,
  stemTable,
  strip,
  SWAY_FPS,
  frameAt,
  wrap,
  type SceneModule,
  type View,
} from '../kit';

const files = [sprites.canyonBeanstalk.file, sprites.beanstalkSway.file, sprites.samClimb.file, sprites.cloudB.file, sprites.cloudG.file, sprites.cloudH.file];

/** bg-canyon-beanstalk: the band used (hills from row 105) and its ground line at row 176. */
const CANYON = { top: 105, ground: 176, stalk: { x0: 216, x1: 254, mid: 235 } };
/** The sway sheet's stem foot: column 89, bottom row. */
const STEM_X = 89;
const GROUND = 30;
const CLIMB = 18; // art px / s
const CLIMB_STEP = 6; // px climbed per frame of the climb cycle
/** The stalk's top this far under the scene's sky top, and the cloud over it: cloud-b's solid middle (its column 90 on the stem) with the stem's cut at its row 35. */
const TOP = 38;
const CLOUD = { x: 90, y: 35 };
const CROWN = 34; // how far under the stalk's top his climb turns back: just under the cloud

/** The canyon band without its own stalk: above the hills its pixels become sky, in them the hills close over it. */
function withoutStalk(src: HTMLImageElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height - CANYON.top;
  return layer(w, h, (ctx) => {
    ctx.drawImage(src, 0, CANYON.top, w, h, 0, 0, w, h);
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    const key = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return d[i + 3] === 0 ? -1 : (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
    };
    for (let y = 0; y < h; y++) {
      // the colours either side of the stalk in this row: anything else in the stalk's columns is stalk
      const beside = new Set<number>();
      for (let x = CANYON.stalk.x0 - 16; x < CANYON.stalk.x0; x++) beside.add(key(x, y));
      for (let x = CANYON.stalk.x1 + 1; x <= CANYON.stalk.x1 + 16; x++) beside.add(key(x, y));
      for (let x = CANYON.stalk.x0; x <= CANYON.stalk.x1; x++) {
        if (beside.has(key(x, y))) continue;
        const from = x < CANYON.stalk.mid ? CANYON.stalk.x0 - 1 : CANYON.stalk.x1 + 1;
        d.copyWithin((y * w + x) * 4, (y * w + from) * 4, (y * w + from) * 4 + 4);
      }
    }
    ctx.putImageData(im, 0, 0);
  });
}

const scene: SceneModule = {
  files,
  async load() {
    const [canyonImg, stalk, climb, cloudB, cloudG, cloudH] = await Promise.all([
      img(sprites.canyonBeanstalk.file),
      strip(sprites.beanstalkSway.file, 175, 258),
      samStrip(sprites.samClimb.file),
      img(sprites.cloudB.file),
      img(sprites.cloudG.file),
      img(sprites.cloudH.file),
    ]);
    const canyon = withoutStalk(canyonImg);
    // the stem's centre on each row, so his hands stay round it as it curves (as on the page)
    const stemFrame = layer(stalk.fw, stalk.fh, (ctx) => ctx.drawImage(stalk.image, 0, 0, stalk.fw, stalk.fh, 0, 0, stalk.fw, stalk.fh));
    const stem = stemTable(stemFrame.getContext('2d')!.getImageData(0, 0, stalk.fw, stalk.fh).data, stalk.fw, stalk.fw, stalk.fh);
    /** His hands' row in his climb cell (its rows 22–29): where he holds the stem. */
    const HANDS_ROW = 25;
    const ground = (h: number) => h - GROUND;
    const stalkX = (w: number) => Math.round(w < 400 ? w * 0.62 : w * 0.76);
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      const x0 = stalkX(v.w) - CANYON.stalk.mid;
      const y = gy - (CANYON.ground - CANYON.top);
      // the canyon centred on the stalk, mirrored copies out to both edges
      for (let k = -3; k <= 3; k++) {
        const x = x0 + k * canyon.width;
        if (x + canyon.width > 0 && x < v.w) put(ctx, canyon, x, y, k % 2 !== 0);
      }
    });
    /** Where the stalk's foot stands: sunk so its top is TOP under the sky's top, in the clouds. */
    const footOf = (v: View) => Math.max(ground(v.h) + 6, skyTop(v) + TOP + stalk.fh);
    /**
     * Sam's height above his start: up the stalk to just under the crown and back down, again and again
     * (the climb's frames follow the distance, so they run backwards on the way down). He stays on the
     * stalk, inside the folder's scene.
     */
    const climbed = (t: number, v: View) => {
      // up to just under the crown, and never above the scene's top edge
      const top = Math.max(0, Math.min(ground(v.h) - 54 - skyTop(v), ground(v.h) - 54 - (footOf(v) - stalk.fh + CROWN)));
      if (top === 0) return 0;
      const d = wrap(t * CLIMB, 2 * top);
      return d <= top ? d : 2 * top - d;
    };

    return {
      start: 2,
      still: 4,
      key(t, v) {
        return stateKey(frameAt(t, SWAY_FPS, stalk.frames), Math.floor(climbed(t, v)), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        ctx.drawImage(back(v), 0, 0);
        const sx = stalkX(v.w);
        const top = footOf(v) - stalk.fh;
        stalk.draw(ctx, frameAt(t, SWAY_FPS, stalk.frames), sx - STEM_X, top);
        const up = Math.floor(climbed(t, v));
        const y = gy - 54 - up;
        // his hands round the stem's centre at his height, his body beside it
        const row = Math.min(stalk.fh - 1, Math.max(0, Math.round(y + HANDS_ROW - top)));
        climb.draw(ctx, Math.floor(up / CLIMB_STEP) % climb.frames, Math.round(sx - STEM_X + stem[row]! + 0.5 - CLIMB_HANDS), y);
        // the clouds the stalk grows into: the big one over its top, two small ones either side
        put(ctx, cloudB, sx - CLOUD.x, top - CLOUD.y);
        put(ctx, cloudG, sx - CLOUD.x - cloudG.width + 30, top - CLOUD.y + 34);
        put(ctx, cloudH, sx + cloudB.width - CLOUD.x - 26, top - CLOUD.y + 22);
      },
    };
  },
};

export default scene;
