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
 *
 * The canvas engine's Level 1 depth stack (parallax, baselines, foreground) lives in
 * src/game/world.ts STACK; the recipes below feed the static stills.
 */
import type { SpriteKey } from './sprites.manifest';

export type SkyStage = 'dawn' | 'morning' | 'afternoon' | 'golden' | 'dusk' | 'night' | 'real';

/**
 * The sky is one flat colour that interpolates continuously between these keyframes over the
 * scroll range: no bands, no steps, no dither — a flat fill changing over time.
 * Morning Blue 300 holds through Level 1; the afternoon pales and warms through Level 2 into
 * golden, dusk and the Green 900 night, which the game frame keeps to its last pixel. The real
 * world behind the broken glass has its own flat sky, Daisy White (REAL_SKY), from its first.
 */
export const skyKeyframes: readonly [number, string][] = [
  [0, '--color-blue-300'],
  [0.34, '--color-blue-300'],
  [0.5, '--color-blue-100'],
  [0.58, '--color-yellow-200'],
  [0.63, '--color-yellow-500'],
  [0.68, '--color-yellow-600'],
  [0.72, '--color-blue-900'],
  [0.77, '--color-green-900'],
];

/** The real world's sky: flat Blue 100, with Daisy White only at the horizon behind the Javits roofline. */
export const REAL_SKY = '--color-blue-100';
export const REAL_HORIZON = '--color-daisy-white';

/**
 * The clouds and the far range change colour gradually with the sky. Each of their
 * few colours is a role; a role's colour interpolates (RGB) between these keyframes on the sky's
 * schedule, 'source' standing for the sprite's own colour, so the files show as drawn through the
 * morning. Bodies stay lighter than the sky, shades darker, until the night turns them to dark
 * shapes; the shade merges into the sky at the end of the day and at night.
 */
export type CloudRole = 'body' | 'shade' | 'deep' | 'range';
export const cloudKeyframes: Record<CloudRole, readonly [number, string][]> = {
  body: [
    [0.34, 'source'],
    [0.58, 'source'],
    [0.63, '--color-yellow-200'],
    [0.68, '--color-yellow-500'],
    [0.72, '--color-grey-500'],
    [0.77, '--color-grey-700'],
  ],
  shade: [
    [0.34, 'source'],
    [0.5, '--color-blue-300'],
    [0.58, '--color-yellow-500'],
    [0.63, '--color-yellow-500'],
    [0.68, '--color-yellow-600'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-900'],
  ],
  deep: [
    [0.34, 'source'],
    [0.5, '--color-blue-500'],
    [0.58, '--color-yellow-600'],
    [0.63, '--color-yellow-600'],
    [0.68, '--color-grey-700'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-900'],
  ],
  range: [
    [0.5, 'source'],
    [0.58, '--color-yellow-500'],
    [0.63, '--color-yellow-600'],
    [0.68, '--color-grey-500'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-700'],
  ],
};

/** Still-crop skies for the static page: one flat colour per scene. */
export const skyColors: Record<SkyStage, string> = {
  dawn: '--color-blue-300',
  morning: '--color-blue-300',
  afternoon: '--color-blue-100',
  golden: '--color-yellow-500',
  dusk: '--color-blue-900',
  night: '--color-green-900',
  real: '--color-daisy-white',
};

/** Ground band below Sam's feet: surface 8 px, edge 12 px, fill 28 px, identical in field and city. */
export const GROUND_BAND = 48; // F = H − 48

export interface LayerDef {
  key: SpriteKey;
  parallax: number;
  anchor: 'bottom' | 'top';
  offset: number;
  repeat: 'tile' | 'mirror' | 'none';
}

export const fieldLayers: LayerDef[] = [
  { key: 'hills', parallax: 0.1, anchor: 'bottom', offset: 6, repeat: 'tile' },
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
