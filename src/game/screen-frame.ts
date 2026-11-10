/**
 * The monitor's screen: the game drawn at one art px per texel into a frame that is the
 * viewport frame plus margins. The margins give it the opening's aspect, and keep the opening's
 * rounded corners outside the viewport when the zoom ends with the viewport frame filling
 * the screen at k device px per texel. The world composes itself on the viewport (bw, F, sx) as
 * always, so the centre of this frame is the 2D canvas's frame exactly; the margins show what lies
 * past its edges, and the ground's fill carries on below the band.
 *
 * Redrawn only when something it shows has moved — the camera, Sam, a far cloud by a whole pixel, a
 * coin's spin, a dust puff — so at rest it changes about ten times a second, not sixty.
 */
import { DIMS, SCREEN_ASPECT } from '../monitor/spec';
import { Coins } from './coins';
import type { Dust } from './dust';
import type { Frame, Level1, Rect } from './world';

/** The viewport frame never comes closer than this to the opening's edges, texels. */
const MIN_MARGIN = 8;
/** … nor its corners closer than this to the opening's rounded corners. */
const CORNER_CLEAR = 2;

export interface ScreenGeom {
  /** The frame, texels (art px). */
  W: number;
  H: number;
  /** The margins round the viewport frame, whole texels: left and right, top, bottom. */
  mx: number;
  mt: number;
  mb: number;
}

/**
 * The screen frame for a viewport frame of bw × bh art px. Side margins are equal; of the margin
 * above and below, the bottom keeps only what clears the opening's rounded corners (a little dirt
 * under the ground band) and the rest goes to the sky, so the screen at rest reads as a title screen.
 */
export function screenGeom(bw: number, bh: number): ScreenGeom {
  const rFrac = DIMS.opening.r / DIMS.opening.w;
  for (let m = MIN_MARGIN; ; m += 2) {
    let W = Math.max(bw + 2 * m, Math.ceil((bh + 2 * m) * SCREEN_ASPECT));
    if ((W - bw) % 2) W += 1;
    const H = Math.max(bh + 2 * m, Math.round(W / SCREEN_ASPECT));
    const mx = (W - bw) / 2;
    // The opening's corner radius in texels; a viewport corner sits (mx, margin) in from the opening's.
    const r = rFrac * W;
    const clears = (mv: number) => mx >= r || mv >= r || Math.hypot(r - mx, r - mv) <= r - CORNER_CLEAR;
    let mb = m;
    while (mb < H - bh - m && !clears(mb)) mb++;
    const mt = H - bh - mb;
    if (mt >= m && clears(mb) && clears(mt)) return { W, H, mx, mt, mb };
  }
}

export class ScreenFrame {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  geom: ScreenGeom = { W: 1, H: 1, mx: 0, mt: 0, mb: 0 };
  /** Bumped on every redraw and resize: the monitor uploads the texture when it changes. */
  version = 0;
  /** Bumped on resize: the monitor reallocates the texture. */
  size = 0;
  private bw = 0;
  private bh = 0;
  private key = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    // Opaque: the sky covers every texel, and an opaque canvas uploads without premultiplying.
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  fit(bw: number, bh: number): void {
    this.bw = bw;
    this.bh = bh;
    this.geom = screenGeom(bw, bh);
    this.canvas.width = this.geom.W;
    this.canvas.height = this.geom.H;
    this.ctx.imageSmoothingEnabled = false;
    this.key = '';
    this.size++;
    this.version++;
  }

  /** The screen frame in viewport art px: every Frame's span, and the range when drawing this. */
  get rect(): Rect {
    const { mx, mt, mb } = this.geom;
    return { x0: -mx, y0: -mt, x1: this.bw + mx, y1: this.bh + mb };
  }

  /**
   * Redraw the game into the frame if anything it shows has moved since the last draw.
   * @returns true when it redrew
   */
  update(f: Frame, level: Level1, dust: Dust, now: number): boolean {
    const g: Frame = { ...f, range: this.rect };
    const s = f.sam;
    const key = [
      Math.round(g.camLeft),
      g.t.toFixed(4),
      level.farKey(g),
      s.mode,
      s.frame,
      s.facing,
      s.lift,
      g.samX,
      g.hideSam ? 1 : 0,
      f.coins.showing(g.camLeft, g.range) ? Coins.frameAt(now, 3) : 0,
      dust.alive(now) ? now : 0,
      // the street's characters run their own loops; past the field the frame follows the clock
      g.X > 1500 ? Math.floor(now / 40) : 0,
    ].join('|');
    if (key === this.key) return false;
    this.key = key;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, this.geom.mx, this.geom.mt);
    level.drawFar(ctx, g, 1);
    level.draw(ctx, g, false);
    this.version++;
    return true;
  }
}
