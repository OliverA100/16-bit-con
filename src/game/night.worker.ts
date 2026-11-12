/**
 * The night worker: builds each layer's fully mapped night image and its window list
 * off the main thread, one job at a time in the order the main thread queues them (the order the
 * night reaches them). Images arrive and leave as transferred ImageBitmaps.
 */
import { findWindows, indexImage, mapOf, nightImage, rgbOf, windowSprites, type NightSpec } from './night-core';

type Job =
  | { id: number; kind: 'night'; bitmap: ImageBitmap; spec: NightSpec }
  | { id: number; kind: 'lights'; bitmap: ImageBitmap; glass: string[]; wrap: boolean; lit: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = async (e) => {
  const job = e.data;
  const { width: w, height: h } = job.bitmap;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(job.bitmap, 0, 0);
  job.bitmap.close();
  const im = indexImage(ctx.getImageData(0, 0, w, h).data, w, h);
  if (job.kind === 'night') {
    const data = nightImage(im, mapOf(im, job.spec));
    const bitmap = await createImageBitmap(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h));
    scope.postMessage({ id: job.id, bitmap }, [bitmap]);
  } else {
    const { boxes, pixels } = windowSprites(findWindows(im, job.glass, job.wrap), rgbOf(job.lit));
    const sprites = await Promise.all(
      pixels.map((px, i) => createImageBitmap(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, boxes[i * 4 + 2]!, boxes[i * 4 + 3]!))),
    );
    scope.postMessage({ id: job.id, boxes, sprites }, [boxes.buffer, ...sprites]);
  }
};
