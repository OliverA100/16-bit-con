/**
 * Sprite-strip loader. Every Sam animation sheet is a horizontal strip of 60×60 frames;
 * other strips pass their own frame size (and a `pitch` when frames are spaced apart).
 * Drawing always uses integer coordinates and never resamples.
 */
export type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface Strip {
  image: Drawable;
  frames: number;
  fw: number;
  fh: number;
  pitch: number;
  /** Draw frame `frame` with its top-left at (x, y). `flip` mirrors horizontally in place. */
  draw(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number, flip?: boolean): void;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    // Decode off the main thread before first use, so cropping and the first draw never decode on a frame.
    img.onload = () =>
      img.decode().then(
        () => resolve(img),
        () => resolve(img),
      );
    img.onerror = () => reject(new Error(`Could not load sprite ${url}`));
    img.src = url;
  });
}

export function makeStrip(image: Drawable, fw = 60, fh = 60, pitch = fw): Strip {
  const frames = Math.max(1, Math.floor((image.width + (pitch - fw)) / pitch));
  return {
    image,
    frames,
    fw,
    fh,
    pitch,
    draw(ctx, frame, x, y, flip = false) {
      const i = ((Math.trunc(frame) % frames) + frames) % frames;
      const sx = i * pitch;
      const dx = Math.round(x);
      const dy = Math.round(y);
      if (flip) {
        ctx.save();
        ctx.translate(dx + fw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(image, sx, 0, fw, fh, 0, 0, fw, fh);
        ctx.restore();
      } else {
        ctx.drawImage(image, sx, 0, fw, fh, dx, dy, fw, fh);
      }
    },
  };
}

export async function loadStrip(url: string, fw = 60, fh = 60, pitch = fw): Promise<Strip> {
  return makeStrip(await loadImage(url), fw, fh, pitch);
}
