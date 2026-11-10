/**
 * Integer pixel scale. 1 art px must map to a whole number of DEVICE pixels, so canvases are
 * sized in device pixels and given a CSS size of (device px / dpr).
 */

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
