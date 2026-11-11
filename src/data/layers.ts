/**
 * World timing and geometry for the canvas engine: the sky, horizon and cloud keyframes, the
 * plaza's time of day, and the ground band. Everything is in art pixels relative to the ground
 * line F (Sam's feet). The Level 1 depth stack (parallax, baselines, foreground) lives in
 * src/game/world.ts STACK.
 */

/**
 * The game's last level, the Javits plaza, at dawn — the night turning to
 * morning over t 0.84–0.92 — or, the fallback, still at night: the plaza's night images serve both,
 * and the dawn ramps (sky, horizon, clouds, palettes stepping back, windows going dark) sit on top.
 */
export const PLAZA_TIME = 'dawn' as 'dawn' | 'night';
const DAWN = PLAZA_TIME === 'dawn';

/**
 * The sky is one flat colour that interpolates continuously between these keyframes over the
 * scroll range: no bands, no steps, no dither — a flat fill changing over time.
 * Morning Blue 300 holds through Level 1; the afternoon pales and warms through Level 2 into
 * golden, dusk and the Green 900 night; at the plaza the night turns to a Blue 100 morning.
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
  ...(DAWN
    ? ([
        [0.84, '--color-green-900'],
        [0.86, '--color-blue-900'],
        [0.88, '--color-yellow-600'],
        [0.9, '--color-yellow-200'],
        [0.92, '--color-blue-100'],
      ] as [number, string][])
    : []),
];

/**
 * The horizon band behind the plaza's rooflines, 260 px above F, drawn from the first key on: the
 * night sky's own colour there, so it starts unseen, then the sunrise glowing on the horizon ahead
 * of the sky, Daisy White from 0.9. None at a night plaza.
 */
export const horizonKeyframes: readonly [number, string][] = DAWN
  ? [
      [0.84, '--color-green-900'],
      [0.86, '--color-yellow-600'],
      [0.88, '--color-yellow-200'],
      [0.9, '--color-daisy-white'],
    ]
  : [];

/**
 * The clouds and the far range change colour gradually with the sky. Each of their
 * few colours is a role; a role's colour interpolates (RGB) between these keyframes on the sky's
 * schedule, 'source' standing for the sprite's own colour, so the files show as drawn through the
 * morning. Bodies stay lighter than the sky, shades darker, until the night turns them to dark
 * shapes; the shade merges into the sky at the end of the day and at night. The dawn runs the
 * evening backwards on the dawn sky's schedule, into the Blue 100 morning's shading (as at 0.5).
 */
export type CloudRole = 'body' | 'shade' | 'deep' | 'range';
const dawnKeys = (keys: [number, string][]): [number, string][] => (DAWN ? keys : []);
export const cloudKeyframes: Record<CloudRole, readonly [number, string][]> = {
  body: [
    [0.34, 'source'],
    [0.58, 'source'],
    [0.63, '--color-yellow-200'],
    [0.68, '--color-yellow-500'],
    [0.72, '--color-grey-500'],
    [0.77, '--color-grey-700'],
    ...dawnKeys([
      [0.84, '--color-grey-700'],
      [0.86, '--color-grey-500'],
      [0.88, '--color-yellow-500'],
      [0.9, 'source'],
    ]),
  ],
  shade: [
    [0.34, 'source'],
    [0.5, '--color-blue-300'],
    [0.58, '--color-yellow-500'],
    [0.63, '--color-yellow-500'],
    [0.68, '--color-yellow-600'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-900'],
    ...dawnKeys([
      [0.84, '--color-green-900'],
      [0.86, '--color-grey-700'],
      [0.88, '--color-yellow-600'],
      [0.9, '--color-yellow-500'],
      [0.92, '--color-blue-300'],
    ]),
  ],
  deep: [
    [0.34, 'source'],
    [0.5, '--color-blue-500'],
    [0.58, '--color-yellow-600'],
    [0.63, '--color-yellow-600'],
    [0.68, '--color-grey-700'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-900'],
    ...dawnKeys([
      [0.84, '--color-green-900'],
      [0.86, '--color-grey-700'],
      [0.88, '--color-grey-700'],
      [0.9, '--color-yellow-600'],
      [0.92, '--color-blue-500'],
    ]),
  ],
  range: [
    [0.5, 'source'],
    [0.58, '--color-yellow-500'],
    [0.63, '--color-yellow-600'],
    [0.68, '--color-grey-500'],
    [0.72, '--color-grey-700'],
    [0.77, '--color-green-700'],
    ...dawnKeys([
      [0.84, '--color-green-700'],
      [0.86, '--color-grey-700'],
      [0.88, '--color-grey-500'],
      [0.9, '--color-yellow-600'],
      [0.92, 'source'],
    ]),
  ],
};

/** Ground band below Sam's feet: surface 8 px, edge 12 px, fill 28 px, identical in field and city. */
export const GROUND_BAND = 48; // F = H − 48
