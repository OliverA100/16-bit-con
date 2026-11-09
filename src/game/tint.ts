/**
 * Continuous recolouring of a few-colour sprite: the clouds and the far range
 * change colour gradually with the sky instead of in steps. Each of the sprite's colours is a
 * role (body, shade, deep, range) whose colour at t comes from cloudKeyframes; the sprite is
 * split once into one mask per role, and whenever a role's colour moves the masks are refilled
 * into a scratch canvas with the GPU (source-in). Shapes and alpha are untouched, and while every
 * role is still at its source colour the original file is drawn as is.
 */
import type { Drawable } from './sprites';
import { hexToRgb, readToken } from './palette';
import { cloudKeyframes, type CloudRole } from '../data/layers';

type Rgb = [number, number, number];
interface Mask {
  role: CloudRole;
  /** The sprite's own colour for this role (its most frequent colour of that role). */
  source: Rgb;
  canvas: HTMLCanvasElement;
}

const tokens = new Map<string, Rgb>();
function rgbOf(token: string): Rgb {
  let c = tokens.get(token);
  if (!c) tokens.set(token, (c = hexToRgb(readToken(token))));
  return c;
}

/** A role's colour at timeline position t, 'source' resolving to the sprite's own colour. */
export function roleAt(t: number, role: CloudRole, source: Rgb): Rgb {
  const keys = cloudKeyframes[role];
  let a = keys[0]!;
  let b = keys[0]!;
  for (let i = 0; i < keys.length; i++) {
    if (t >= keys[i]![0]) {
      a = keys[i]!;
      b = keys[Math.min(i + 1, keys.length - 1)]!;
    }
  }
  const span = b[0] - a[0];
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0;
  const ca = a[1] === 'source' ? source : rgbOf(a[1]);
  const cb = b[1] === 'source' ? source : rgbOf(b[1]);
  return [Math.round(ca[0] + (cb[0] - ca[0]) * u), Math.round(ca[1] + (cb[1] - ca[1]) * u), Math.round(ca[2] + (cb[2] - ca[2]) * u)];
}

let temp: HTMLCanvasElement | null = null;
function scratchFor(w: number, h: number): CanvasRenderingContext2D {
  if (!temp) temp = document.createElement('canvas');
  if (temp.width < w) temp.width = w;
  if (temp.height < h) temp.height = h;
  return temp.getContext('2d')!;
}

export class Tinted {
  private readonly masks: Mask[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private key = '';
  private current: Drawable;

  /**
   * @param roles the sprite's colours by role; every other colour in it (anti-aliased edges) takes
   *   the role of the nearest listed colour
   */
  constructor(
    readonly src: Drawable,
    roles: Record<string, CloudRole>,
  ) {
    const w = src.width;
    const h = src.height;
    const read = document.createElement('canvas');
    read.width = w;
    read.height = h;
    const rctx = read.getContext('2d')!;
    rctx.drawImage(src, 0, 0);
    const data = rctx.getImageData(0, 0, w, h).data;
    const listed = Object.entries(roles).map(([hex, role]) => ({ rgb: hexToRgb(hex), role }));
    const roleOf = new Map<number, CloudRole>();
    const perRole = new Map<CloudRole, { pixels: Uint8ClampedArray; counts: Map<number, number> }>();
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]!;
      if (alpha === 0) continue;
      const packed = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      let role = roleOf.get(packed);
      if (!role) {
        let best = Infinity;
        role = listed[0]!.role;
        for (const l of listed) {
          const d = (l.rgb[0] - data[i]!) ** 2 + (l.rgb[1] - data[i + 1]!) ** 2 + (l.rgb[2] - data[i + 2]!) ** 2;
          if (d < best) {
            best = d;
            role = l.role;
          }
        }
        roleOf.set(packed, role);
      }
      let m = perRole.get(role);
      if (!m) perRole.set(role, (m = { pixels: new Uint8ClampedArray(data.length), counts: new Map() }));
      m.pixels[i] = m.pixels[i + 1] = m.pixels[i + 2] = 255;
      m.pixels[i + 3] = alpha;
      m.counts.set(packed, (m.counts.get(packed) ?? 0) + 1);
    }
    for (const [role, m] of perRole) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const mctx = canvas.getContext('2d')!;
      const id = mctx.createImageData(w, h);
      id.data.set(m.pixels);
      mctx.putImageData(id, 0, 0);
      const packed = [...m.counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      this.masks.push({ role, source: [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255], canvas });
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.current = src;
  }

  get width(): number {
    return this.src.width;
  }

  get height(): number {
    return this.src.height;
  }

  /** The sprite as it looks at timeline position t. */
  at(t: number): Drawable {
    const colours = this.masks.map((m) => roleAt(t, m.role, m.source));
    const key = colours.map((c) => c.join(',')).join('|');
    if (key === this.key) return this.current;
    this.key = key;
    if (colours.every((c, i) => c[0] === this.masks[i]!.source[0] && c[1] === this.masks[i]!.source[1] && c[2] === this.masks[i]!.source[2])) {
      return (this.current = this.src);
    }
    const w = this.src.width;
    const h = this.src.height;
    const s = scratchFor(w, h);
    this.ctx.clearRect(0, 0, w, h);
    this.masks.forEach((m, i) => {
      const c = colours[i]!;
      s.globalCompositeOperation = 'source-over';
      s.clearRect(0, 0, w, h);
      s.drawImage(m.canvas, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = `rgb(${c[0]} ${c[1]} ${c[2]})`;
      s.fillRect(0, 0, w, h);
      this.ctx.drawImage(temp!, 0, 0, w, h, 0, 0, w, h);
    });
    s.globalCompositeOperation = 'source-over';
    return (this.current = this.canvas);
  }
}

/** The clouds' colours across Vega's cloud files, by role. */
export const CLOUD_ROLES: Record<string, CloudRole> = {
  '#FFFAEB': 'body',
  '#F9F9F9': 'body',
  '#FAF7E8': 'body',
  '#EBECDC': 'body',
  '#C8E2F2': 'shade',
  '#EDEDED': 'shade',
  '#B9DEF1': 'shade',
  '#C3D5C7': 'shade',
  '#B6C8DD': 'deep',
  '#66CEFF': 'deep',
};
/** bg-hills-silhouette-light is one colour: the far range. */
export const RANGE_ROLES: Record<string, CloudRole> = { '#C3D5C7': 'range' };
