/**
 * Integer pixel scale. 1 art px must map to a whole number of DEVICE pixels, so canvases are
 * sized in device pixels and given a CSS size of (device px / dpr).
 */
export interface PixelFit {
  /** Device pixels per art pixel. */
  k: number;
  ctx: CanvasRenderingContext2D;
}

/**
 * Size `canvas` to show `artW × artH` art pixels at roughly `cssScale` CSS px per art px,
 * rounded so that each art px is an integer number of device pixels (minimum 1).
 */
export function fitPixelCanvas(canvas: HTMLCanvasElement, artW: number, artH: number, cssScale = 2): PixelFit {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round(cssScale * dpr));
  canvas.width = artW * k;
  canvas.height = artH * k;
  canvas.style.width = `${(artW * k) / dpr}px`;
  canvas.style.height = `${(artH * k) / dpr}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return { k, ctx };
}

/**
 * The world buffer rule: k = clamp(round(viewportH_dev / 540), 2, 6), with a 240 px width floor
 * (round, not floor — Sam's cell ≈ 10–11 % of the viewport height, and the world
 * feels big through what is behind him, not by shrinking him).
 */
export function worldBuffer(viewportCssW: number, viewportCssH: number, dpr = window.devicePixelRatio || 1) {
  const devW = Math.round(viewportCssW * dpr);
  const devH = Math.round(viewportCssH * dpr);
  let k = Math.min(6, Math.max(2, Math.round(devH / 540)));
  if (Math.ceil(devW / k) < 240) k = Math.max(2, k - 1);
  return { k, bw: Math.ceil(devW / k), bh: Math.ceil(devH / k), devW, devH };
}
