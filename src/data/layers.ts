/**
 * World geometry shared by the static stills (Phase 2) and the canvas engine (Phase 3).
 * Everything is in art pixels relative to the ground line F (Sam's feet).
 *
 * Anchors:
 *   bottom  → the layer's bottom edge sits at F + offset (hills, ground strips)
 *   top     → the layer's top edge sits at F − offset (the city layers)
 *
 * The city layers are anchored by their rooflines, descending toward the viewer, because
 * Vega drew them 510–1108 px tall for a vertically scrolling game: bottom-anchored they
 * would wall off the sky. Read it as Sam running along the High Line toward Javits, with
 * the upper floors beside him. Sky ramps are token names, top → horizon, six bands.
 */
import type { SpriteKey } from './sprites.manifest';

export type SkyStage = 'dawn' | 'morning' | 'afternoon' | 'golden' | 'dusk' | 'night' | 'real';

export const skyRamps: Record<SkyStage, readonly [string, string, string, string, string, string]> = {
  dawn: ['--color-blue-500', '--color-blue-300', '--color-blue-100', '--color-blue-100', '--color-daisy-white', '--color-daisy-white'],
  morning: ['--color-blue-300', '--color-blue-300', '--color-blue-300', '--color-blue-300', '--color-blue-100', '--color-blue-100'],
  afternoon: ['--color-blue-300', '--color-blue-300', '--color-blue-100', '--color-yellow-100', '--color-yellow-200', '--color-yellow-200'],
  golden: ['--color-blue-500', '--color-yellow-200', '--color-yellow-200', '--color-yellow-500', '--color-yellow-500', '--color-yellow-600'],
  dusk: ['--color-blue-900', '--color-blue-900', '--color-blue-900', '--color-blue-700', '--color-yellow-500', '--color-yellow-600'],
  night: ['--color-green-900', '--color-green-900', '--color-green-900', '--color-green-900', '--color-green-900', '--color-green-700'],
  real: ['--color-daisy-white', '--color-daisy-white', '--color-daisy-white', '--color-daisy-white', '--color-blue-100', '--color-blue-100'],
};

/** Sam's feet sit 2 px into the grass tile (its first two rows are grass tips). */
export const GROUND_BAND = 80; // F = H − 80
export const TILE_TOP_ABOVE_F = 2;

export interface LayerDef {
  key: SpriteKey;
  parallax: number;
  anchor: 'bottom' | 'top';
  offset: number;
  repeat: 'tile' | 'mirror' | 'none';
}

export const fieldLayers: LayerDef[] = [
  { key: 'cloudsStrip', parallax: 0.05, anchor: 'bottom', offset: -140, repeat: 'mirror' },
  { key: 'hills', parallax: 0.12, anchor: 'bottom', offset: 6, repeat: 'mirror' },
  { key: 'bushes', parallax: 1, anchor: 'bottom', offset: 2, repeat: 'tile' },
  { key: 'daisyRow', parallax: 1, anchor: 'bottom', offset: 16, repeat: 'tile' },
];

export const cityLayers: LayerDef[] = [
  { key: 'cityFar', parallax: 0.15, anchor: 'top', offset: 335, repeat: 'mirror' },
  { key: 'cityTowers', parallax: 0.3, anchor: 'top', offset: 300, repeat: 'mirror' },
  { key: 'cityMid', parallax: 0.5, anchor: 'top', offset: 260, repeat: 'tile' },
  { key: 'cityNear', parallax: 0.75, anchor: 'top', offset: 200, repeat: 'tile' },
  { key: 'sidewalk', parallax: 1, anchor: 'top', offset: 12, repeat: 'tile' },
];
