/**
 * Sky colour over the run: a flat fill interpolated continuously (RGB) between the keyframes in
 * src/data/layers.ts. Tokens are read from tokens.css once, so the canvas never
 * carries raw hex; the in-between colours exist only as the fill changes over time. The plaza's
 * horizon band runs on its own keyframes the same way.
 */
import { horizonKeyframes, PLAZA_TIME, skyKeyframes } from '../data/layers';
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

/** The HUD's clock for run progress t: the journey's time of day, kept with the light. */
export function clockFor(t: number): string {
  // The journey's time, kept with the light: 07:00 as the run starts, the afternoon through the city,
  // 19:00 as the sky turns Yellow 600 (sunset), on through the night to 06:30 as the dawn sky warms
  // (sunrise), 07:30 in the Blue 100 morning, 08:00 at the plaza's end — or, at a night plaza, on to
  // midnight. Stepped to 10 minutes.
  const stops: [number, number][] = [
    [0, 7 * 60],
    [0.34, 13 * 60],
    [0.6, 17 * 60 + 30],
    [0.68, 19 * 60],
    [0.77, 22 * 60],
    ...(PLAZA_TIME === 'dawn'
      ? ([
          [0.84, 27 * 60],
          [0.88, 30 * 60 + 30],
          [0.92, 31 * 60 + 30],
          [1, 32 * 60],
        ] as [number, number][])
      : ([[1, 24 * 60]] as [number, number][])),
  ];
  let minutes = stops[stops.length - 1]![1];
  if (t <= 0) minutes = stops[0]![1];
  else {
    for (let i = 1; i < stops.length; i++) {
      const [t0, m0] = stops[i - 1]!;
      const [t1, m1] = stops[i]!;
      if (t < t1) {
        minutes = m0 + ((t - t0) / (t1 - t0)) * (m1 - m0);
        break;
      }
    }
  }
  minutes = Math.floor(minutes / 10) * 10;
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}
