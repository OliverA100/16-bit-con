/**
 * Small geometry helpers shared by the monitor and its controller.
 */
import { BufferGeometry, Float32BufferAttribute, Path, Shape, Vector2 } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Split a mesh's triangles along their longest edge until no edge is longer than `maxLen`, so a flat cap
 * (long thin triangles from its outline) has points inside it to bend; returns it indexed, positions only.
 * Neighbours may split differently, but the seams this leaves are far below a pixel for the gentle bends
 * it is used for.
 */
export function subdivide(geo: BufferGeometry, maxLen: number): BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const p = src.getAttribute('position');
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < p.count; i += 3) stack.push([p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1), p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)]);
  const len = (t: number[], a: number, b: number) => Math.hypot(t[a * 3]! - t[b * 3]!, t[a * 3 + 1]! - t[b * 3 + 1]!, t[a * 3 + 2]! - t[b * 3 + 2]!);
  const v = (t: number[], a: number) => t.slice(a * 3, a * 3 + 3);
  const mid = (t: number[], a: number, b: number) => [0, 1, 2].map((k) => (t[a * 3 + k]! + t[b * 3 + k]!) / 2);
  while (stack.length) {
    const t = stack.pop()!;
    const l = [len(t, 0, 1), len(t, 1, 2), len(t, 2, 0)];
    const e = l.indexOf(Math.max(...l));
    if (l[e]! <= maxLen) {
      out.push(...t);
      continue;
    }
    // split the longest edge at its middle, keeping the winding
    if (e === 0) {
      const m = mid(t, 0, 1);
      stack.push([...v(t, 0), ...m, ...v(t, 2)], [...m, ...v(t, 1), ...v(t, 2)]);
    } else if (e === 1) {
      const m = mid(t, 1, 2);
      stack.push([...v(t, 0), ...v(t, 1), ...m], [...v(t, 0), ...m, ...v(t, 2)]);
    } else {
      const m = mid(t, 2, 0);
      stack.push([...v(t, 0), ...v(t, 1), ...m], [...m, ...v(t, 1), ...v(t, 2)]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  if (src !== geo) src.dispose();
  return mergeVertices(g, 1e-6);
}

/**
 * The controller port's outline, w × h, centred: flat along the bottom with small rounded corners, its
 * top fully rounded — so the plug goes in only one way up. The port and the plug share it.
 */
export function portShape(w: number, h: number): Shape {
  const hw = w / 2;
  const hh = h / 2;
  const r = h * 0.14;
  const t = Math.min(hw, h * 0.5);
  const s = new Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - t);
  s.absarc(hw - t, hh - t, t, 0, Math.PI / 2, false);
  s.lineTo(-hw + t, hh);
  s.absarc(-hw + t, hh - t, t, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/**
 * An SVG's filled shapes (public/sprites/ui/: Vega's daisy and wordmark), holes and all, centred on its
 * viewBox, y up, `height` tall; uniform scale, so they are never distorted. Empty if it does not parse.
 */
export function svgShapes(svg: string, height: number): Shape[] {
  try {
    const data = new SVGLoader().parse(svg);
    const box = (data.xml as unknown as Element).getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4) return [];
    const k = height / box[3]!;
    const cx = box[0]! + box[2]! / 2;
    const cy = box[1]! + box[3]! / 2;
    const at = (p: Vector2) => new Vector2((p.x - cx) * k, (cy - p.y) * k);
    const out: Shape[] = [];
    for (const path of data.paths)
      for (const sh of path.toShapes()) {
        const pts = sh.extractPoints(10);
        const shape = new Shape(pts.shape.map(at));
        for (const h of pts.holes) shape.holes.push(new Path(h.map(at)));
        out.push(shape);
      }
    return out;
  } catch {
    return [];
  }
}
