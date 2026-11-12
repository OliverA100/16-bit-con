/**
 * The ticket's cast, drawn with the schedule kit (its cached loader, its pacing, whole art pixels): Vega's
 * mole eating pizza, the mole on his phone and the dog, standing on the ticket's bottom line, no scenery and
 * no ground. Only Vega's art, never redrawn: the sheets' soft shadow under the feet is dropped in memory at
 * load, so each figure's lowest solid row (its feet) goes on the box's last row, right on the line.
 */
import { sprites } from '../data/sprites.manifest';
import { frameAt, img, stateKey, wrap } from '../schedule/kit';
import { makeStrip, type Strip } from '../game/sprites';

interface CastView {
  /** Box size in art px. */
  w: number;
  h: number;
}

export interface CastScene {
  draw(ctx: CanvasRenderingContext2D, t: number, v: CastView): void;
  /** Changes whenever the picture would. */
  key(t: number, v: CastView): number;
  /** The reduced-motion frame's time. */
  still: number;
}

/** A sprite standing: its strip without the soft shadow, the columns its art spans and its lowest solid row. */
interface Figure {
  strip: Strip;
  /** The first column with art and the art's width, over all frames. */
  x0: number;
  w: number;
  /** The lowest row with a solid pixel (the feet), over all frames. */
  foot: number;
}

/**
 * Vega's NPC sheets carry two rows of 40 % black shadow under the feet. On the ticket the figures stand on
 * a line instead, so every pixel that isn't solid goes, and the feet are the lowest solid row.
 */
async function figure(url: string, fw: number, fh: number, pitch = fw): Promise<Figure> {
  const im = await img(url);
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  let foot = 0;
  let minX = fw;
  let maxX = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4 + 3;
      if (d[i]! < 255) {
        d[i] = 0;
        continue;
      }
      const fx = x % pitch;
      if (fx >= fw) continue;
      if (y > foot) foot = y;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
    }
  ctx.putImageData(data, 0, 0);
  return { strip: makeStrip(c, fw, fh, pitch), x0: minX, w: maxX - minX + 1, foot };
}

/** The pizza mole's loop and the phone mole's fidget, at the kit's pace (as the party folder draws them). */
const PIZZA_FPS = 8;
const PHONE_FPS = 2;
/** The dog: still on its first frame, then a short bark (four frames at 8 fps) every ~3 s. */
const BARK_FPS = 8;
const BARK_EVERY = 3;
const BARK_FRAMES = [1, 2, 3, 4];
const barkFrame = (t: number) => {
  const i = Math.floor(wrap(t - 1.2, BARK_EVERY) * BARK_FPS);
  return i < BARK_FRAMES.length ? BARK_FRAMES[i]! : 0;
};
/** Art px between the figures. */
const GAP = 16;

export async function loadCast(): Promise<CastScene> {
  const [pizza, phone, dog] = await Promise.all([
    figure(sprites.molePizza.file, 60, 60),
    figure(sprites.molePhone.file, 60, 60),
    figure(sprites.dogBark.file, 60, 60),
  ]);
  const frames = (t: number) => [frameAt(t, PIZZA_FPS, pizza.strip.frames), frameAt(t, PHONE_FPS, phone.strip.frames), barkFrame(t)] as const;
  const figures = [pizza, phone, dog];
  const width = figures.reduce((s, f) => s + f.w, 0) + GAP * (figures.length - 1);
  return {
    still: 0,
    key: (t, v) => stateKey(...frames(t), v.w, v.h),
    draw(ctx, t, v) {
      const f = frames(t);
      // the three together, centred along the line
      let x = Math.round((v.w - width) / 2);
      figures.forEach((fig, i) => {
        fig.strip.draw(ctx, f[i]!, x - fig.x0, v.h - 1 - fig.foot);
        x += fig.w + GAP;
      });
    },
  };
}
