/** The small maths every part of the site shares. No imports, so any bundle can take it. */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** v into 0 ≤ … < m, for negative v too. */
export const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** A small seeded random (mulberry32): the same seed always gives the same run of numbers in 0 ≤ … < 1. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
