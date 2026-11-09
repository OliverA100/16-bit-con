/**
 * Sky stages: one flat colour per stage, read from tokens.css so the canvas
 * never carries raw hex. Day (dawn → afternoon) is Blue 300; later stages swap the colour at
 * their boundary and the world layers step their palettes far → near afterwards.
 */
import { skyColors, type SkyStage } from '../data/layers';
import { readToken } from './palette';

export function resolveSky(stage: SkyStage): string {
  return readToken(skyColors[stage]);
}

/** The stage at timeline position t. */
export function stageAt(t: number): SkyStage {
  if (t < 0.06) return 'dawn';
  if (t < 0.34) return 'morning';
  if (t < 0.58) return 'afternoon';
  if (t < 0.66) return 'golden';
  if (t < 0.74) return 'dusk';
  if (t < 0.94) return 'night';
  return 'real';
}
