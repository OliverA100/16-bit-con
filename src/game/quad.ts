/**
 * Laying a DOM element on a flat rectangle seen in perspective (PRESS START on the
 * monitor's screen). The projection of a plane is a homography, and a CSS matrix3d can hold one
 * exactly — the same maths the CSS3DRenderer relies on, without the addon.
 */
export type Point = [number, number];
/** Corners in order: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

interface Homography {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/** The unit square → `q` (Heckbert, "Fundamentals of Texture Mapping", 2.2.3). */
function squareTo(q: Quad): Homography {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let h = 0;
  if (dx3 !== 0 || dy3 !== 0) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h };
}

/** The point at (u, v) of the unit square, mapped into `q`. */
export function quadPoint(q: Quad, u: number, v: number): Point {
  const { a, b, c, d, e, f, g, h } = squareTo(q);
  const w = g * u + h * v + 1;
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
}

/** The sub-rectangle (u0, v0)–(u1, v1) of the unit square, mapped into `q`. */
export function subQuad(q: Quad, u0: number, v0: number, u1: number, v1: number): Quad {
  return [quadPoint(q, u0, v0), quadPoint(q, u1, v0), quadPoint(q, u1, v1), quadPoint(q, u0, v1)];
}

/**
 * The CSS transform that maps an element's box (0, 0)–(w, h) onto `q`, in px of its containing
 * block; the element needs `transform-origin: 0 0` at the block's top left.
 */
export function quadMatrix(w: number, h: number, q: Quad): string {
  const H = squareTo(q);
  // column-major: x' = (a·x/w + b·y/h + c) / (g·x/w + h·y/h + 1), and the same for y'
  const m = [H.a / w, H.d / w, 0, H.g / w, H.b / h, H.e / h, 0, H.h / h, 0, 0, 1, 0, H.c, H.f, 0, 1];
  return `matrix3d(${m.map((v) => Number(v.toPrecision(10))).join(',')})`;
}
