/**
 * Speedrun Showcase: Any% Live — the canyon and the desert: Vega's red-rock canyon over its river,
 * the desert ground in front, and Sam running the length of the folder, again and again.
 */
import { sprites } from '../../data/sprites.manifest';
import { FOOT_SINK } from '../../game/sam';
import { backdrop, cloudsKey, drawClouds, img, layer, samStrip, stateKey, tileX, wrap, type Cloud, type Drawable, type SceneModule } from '../kit';

const files = [sprites.canyonRiver.file, sprites.desertGround.file, sprites.samRun.file, sprites.cloudMd.file, sprites.cloudSm.file, sprites.cloudXs.file];

/** bg-desert-ground: its drawn rows start at 210; the orange path Sam runs on is at row 262. */
const DESERT = { top: 210, path: 262 };
/** bg-canyon-river: drawn in its bottom 103 rows; where it starts across, when the folder is narrower than it. */
const CANYON = { top: 437, offset: 300 };
const GROUND = 38;
/**
 * Sam's feet this far above the ground line: on the grass back from the path, clear of the next folder's
 * tab (37 px) along the folder's foot.
 */
const TRACK = 20;
const RUN = 180; // art px / s: a speedrun, under 6 s across a wide folder
const STRIDE = 12; // px of travel per run frame (the game's)
const REST = 0.8; // seconds off screen between runs

/**
 * A band of `src` (rows sy..sy+sh) across [0, w) at row `dy`, every other copy mirrored, so its two
 * ends always meet themselves: art that does not tile still never shows a seam.
 */
function tileMirrored(ctx: CanvasRenderingContext2D, src: Drawable, sy: number, sh: number, dy: number, w: number, offset: number): void {
  const period = src.width;
  const flipped = layer(period, sh, (c) => {
    c.translate(period, 0);
    c.scale(-1, 1);
    c.drawImage(src, 0, sy, period, sh, 0, 0, period, sh);
  });
  const start = Math.floor(offset / period);
  for (let i = start, x = i * period - offset; x < w; i++, x += period) {
    if (i % 2 === 0) ctx.drawImage(src, 0, sy, period, sh, x, dy, period, sh);
    else ctx.drawImage(flipped, x, dy);
  }
}

const scene: SceneModule = {
  files,
  async load() {
    const [canyon, desert, run, md, sm, xs] = await Promise.all([
      img(sprites.canyonRiver.file),
      img(sprites.desertGround.file),
      samStrip(sprites.samRun.file),
      img(sprites.cloudMd.file),
      img(sprites.cloudSm.file),
      img(sprites.cloudXs.file),
    ]);
    const clouds: Cloud[] = [
      { src: md, x: 0.7, y: 4, speed: 4 },
      { src: sm, x: 0.3, y: 34, speed: 6 },
      { src: xs, x: 0.95, y: 50, speed: 5 },
    ];
    const ground = (h: number) => h - GROUND;
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      const desertY = gy - DESERT.path;
      const bottom = desertY + DESERT.top + 22;
      const canyonH = Math.min(canyon.height - CANYON.top, bottom - v.clear.y);
      const sy = canyon.height - canyonH;
      // within one copy of the canyon where it fits; mirrored copies where it does not
      if (v.w <= canyon.width) ctx.drawImage(canyon, Math.min(CANYON.offset, canyon.width - v.w), sy, v.w, canyonH, 0, bottom - canyonH, v.w, canyonH);
      else tileMirrored(ctx, canyon, sy, canyonH, bottom - canyonH, v.w, CANYON.offset);
      tileX(ctx, desert, DESERT.top, desert.height - DESERT.top, desertY + DESERT.top, v.w, 90);
    });
    /** Sam's x: from off the left edge to off the right, then a rest. */
    const samX = (t: number, w: number) => {
      const span = w + 60;
      const period = span / RUN + REST;
      const p = wrap(t, period);
      return p * RUN - 60;
    };

    return {
      start: 0.6,
      still: 3,
      key(t, v) {
        const x = Math.floor(samX(t, v.w));
        return stateKey(x, cloudsKey(clouds, t, v), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        drawClouds(ctx, clouds, t, v);
        ctx.drawImage(back(v), 0, 0);
        const x = Math.floor(samX(t, v.w));
        if (x < v.w) run.draw(ctx, Math.floor((x + 60) / STRIDE) % run.frames, x, gy - TRACK - 60 + FOOT_SINK);
      },
    };
  },
};

export default scene;
