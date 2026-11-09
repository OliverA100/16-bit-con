/**
 * Palette work, all done once at asset-load time on offscreen canvases:
 *  - exact colour remaps (the Sam goggle/body swap),
 *  - later: the daisy-row snap and the day→night stage palettes.
 * Nothing here runs per frame and no derived file is ever written to disk.
 */
export type ColorMap = Record<string, string>; // '#RRGGBB' → '#RRGGBB'

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/**
 * Sam's careers-game sheets (run / jump / idle / portrait) use GREEN goggles and a slightly
 * different body palette from the brand sheets (propeller / side / climb). One pass maps
 * every careers colour to its brand counterpart, measured in sam-propeller-idle_8f_60x60.png.
 * Single pass on the original pixel values: no chaining (#2E5700 → #1A0505 directly).
 */
export const SAM_BRAND_MAP: ColorMap = {
  // goggles
  '#D5FB19': '#0BECFF', // Green 100 lens rim      → cyan rim
  '#75A70D': '#097FCA', // Green 300 lens fill     → lens blue
  '#457D07': '#097FCA', // Green 500 strap         → lens blue
  '#2E5700': '#1A0505', // dark goggle frame       → brand outline (brand goggles are outlined)
  // body
  '#AE6228': '#BE6627', // fur
  '#834622': '#944F1E', // fur shade
  '#BD8A51': '#C09564', // hands (run / jump)
  '#C58F53': '#C09564', // hands (idle)
  '#000000': '#1A0505', // outline
};

/** Returns a new canvas with `map` applied to every opaque pixel of `image` (exact RGB match). */
export function remap(image: HTMLImageElement | HTMLCanvasElement, map: ColorMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);

  const lut = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(map)) lut.set(pack(...hexToRgb(from)), hexToRgb(to));

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = lut.get(pack(d[i]!, d[i + 1]!, d[i + 2]!));
    if (to) {
      d[i] = to[0];
      d[i + 1] = to[1];
      d[i + 2] = to[2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Count opaque pixels whose colour is in `hexes`. Used by the dev page to prove a remap left nothing behind. */
export function countColors(image: HTMLImageElement | HTMLCanvasElement, hexes: string[]): number {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return -1;
  ctx.drawImage(image, 0, 0);
  const wanted = new Set(hexes.map((h) => pack(...hexToRgb(h))));
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] !== 0 && wanted.has(pack(d[i]!, d[i + 1]!, d[i + 2]!))) n++;
  }
  return n;
}
