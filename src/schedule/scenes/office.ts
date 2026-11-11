/**
 * Workshop: Draw Your First 16-Bit Sprite — a cut-away of Vega's careers office: the brick inner wall
 * under its ceiling ducts with a window, the desk of screens running, a mole typing at a desk on the
 * plank floor. On wide folders the wall stands right of the text; on narrow ones it fills the band.
 */
import { sprites } from '../../data/sprites.manifest';
import { FOOT_SINK } from '../../game/sam';
import { backdrop, frameAt, img, put, stateKey, strip, tileX, type SceneModule, type View } from '../kit';

const PIPES = '/sprites/office/pipes-tile.png';
const files = [
  sprites.officeWall.file,
  sprites.officeWall2.file,
  sprites.officeFloor.file,
  sprites.officeWindow.file,
  sprites.officeScreens.file,
  sprites.officeDesk.file,
  sprites.officeChair.file,
  sprites.officePlant.file,
  sprites.officeShelf.file,
  sprites.moleTyping.file,
  PIPES,
];

/** The floor tile: yellow skirting (rows 0–19), planks to the folder's edge. */
const SKIRT = 20;
const GROUND = 30; // plank rows showing under the feet line
const DUCTS = 40; // pipes-tile rows: the ducts, not the spotlights hanging under them

const scene: SceneModule = {
  files,
  async load() {
    const [wall, wall2, floor, win, screens, desk, chair, plant, shelf, typing, pipes] = await Promise.all([
      img(sprites.officeWall.file),
      img(sprites.officeWall2.file),
      img(sprites.officeFloor.file),
      img(sprites.officeWindow.file),
      strip(sprites.officeScreens.file, 196, 103),
      img(sprites.officeDesk.file),
      img(sprites.officeChair.file),
      img(sprites.officePlant.file),
      img(sprites.officeShelf.file),
      strip(sprites.moleTyping.file, 60, 60),
      img(PIPES),
    ]);
    const ground = (h: number) => h - GROUND;
    /** The wall: from just right of the text to the edge (whole width under the text on narrow). */
    const wallX = (v: View) => (v.clear.x > 0 ? v.clear.x + 12 : 0);
    const wallTop = (v: View) => Math.max(DUCTS, ground(v.h) - SKIRT - wall.height * 2);
    const back = backdrop((ctx, v) => {
      const gy = ground(v.h);
      const x0 = wallX(v);
      const top = wallTop(v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, v.w - x0, v.h);
      ctx.clip();
      tileX(ctx, wall, 0, wall.height, top, v.w, -x0);
      tileX(ctx, wall2, 0, Math.min(wall2.height, gy - SKIRT - top - wall.height), top + wall.height, v.w, 90 - x0);
      tileX(ctx, pipes, 0, DUCTS, top - DUCTS + 4, v.w, 30 - x0);
      ctx.restore();
      tileX(ctx, floor, 0, floor.height, gy - SKIRT, v.w);
      put(ctx, win, v.w - win.width - (v.narrow ? 6 : 18), top + 8);
      if (v.narrow) put(ctx, shelf, 10, top + 28);
      put(ctx, plant, v.w - plant.width + 4, gy - plant.height + 4);
    });
    const screensX = (v: View) => v.w - 196 - (v.narrow ? 46 : 60);
    const deskX = (v: View) => (v.narrow ? 6 : Math.max(16, wallX(v) - desk.width - 70));

    return {
      start: 0,
      still: 0,
      key(t, v) {
        return stateKey(frameAt(t, 6, screens.frames), frameAt(t, 10, typing.frames), v.w, v.h);
      },
      draw(ctx, t, v) {
        const gy = ground(v.h);
        ctx.drawImage(back(v), 0, 0);
        screens.draw(ctx, frameAt(t, 6, screens.frames), screensX(v), gy - 103 + 4);
        const dx = deskX(v);
        put(ctx, desk, dx, gy - desk.height + 4);
        put(ctx, chair, dx + desk.width + 4, gy - chair.height + 4);
        typing.draw(ctx, frameAt(t, 10, typing.frames), dx + desk.width - 18, gy - 60 + FOOT_SINK);
      },
    };
  },
};

export default scene;
