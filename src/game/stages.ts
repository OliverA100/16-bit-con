/**
 * Sky colour over the run: a flat fill interpolated continuously (RGB) between the keyframes in
 * src/data/layers.ts. Tokens are read from tokens.css once, so the canvas never
 * carries raw hex; the in-between colours exist only as the fill changes over time. The plaza's
 * horizon band runs on its own keyframes the same way.
 */
import { horizonKeyframes, skyKeyframes } from '../data/layers';
import { hexToRgb, readToken } from './palette';

type Key = { t: number; rgb: [number, number, number] };
const cache = new Map<readonly [number, string][], Key[]>();

function resolve(frames: readonly [number, string][]): Key[] {
  let k = cache.get(frames);
  if (!k) cache.set(frames, (k = frames.map(([t, token]) => ({ t, rgb: hexToRgb(readToken(token)) }))));
  return k;
}

function ramp(frames: readonly [number, string][], t: number): string {
  const k = resolve(frames);
  let a = k[0]!;
  let b = k[k.length - 1]!;
  for (let i = 0; i < k.length - 1; i++) {
    if (t >= k[i]!.t && t <= k[i + 1]!.t) {
      a = k[i]!;
      b = k[i + 1]!;
      break;
    }
  }
  const span = b.t - a.t;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  const c = a.rgb.map((v, i) => Math.round(v + (b.rgb[i]! - v) * u));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** The sky at timeline position t, as an rgb() string for the canvas. */
export function skyAt(t: number): string {
  return ramp(skyKeyframes, t);
}

/** The plaza's horizon band at t, or null before its first key (and at a night plaza, which has none). */
export function horizonAt(t: number): string | null {
  if (!horizonKeyframes.length || t <= horizonKeyframes[0]![0]) return null;
  return ramp(horizonKeyframes, t);
}
