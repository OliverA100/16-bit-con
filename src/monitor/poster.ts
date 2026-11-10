/**
 * The monitor posters, public/monitor/monitor-{off,on}.webp: renders of src/monitor at rest (the
 * screen off, and on with the game's screen frame at t = 0), shown until the 3D takes over and,
 * screen on, wherever there is no 3D. Measured when they were rendered (at
 * 1440 × 900, device pixel ratio 2), as fractions of the slot — the monitor's silhouette at rest,
 * which the 3D is framed on too.
 */
export const POSTER = {
  /** The image, px. */
  w: 1144,
  h: 591,
  /** The slot's height ÷ width: the silhouette at rest. */
  slotAspect: 0.8872,
  /** The image's box round the slot: left and width as fractions of the slot's width, top and height of its height (the shadow reaches far to the right). */
  left: -0.0035,
  top: -0.0034,
  width: 1.8056,
  height: 1.0514,
  /** The scanlines across the screen's height in the poster (PRESS START matches them where it is shown on it). */
  scanLines: 80.3642,
  /** The opening's corners (top left, top right, bottom right, bottom left), fractions of the slot. */
  screen: [
    [0.1128, 0.0866],
    [0.676, 0.0974],
    [0.6746, 0.6584],
    [0.1168, 0.6266],
  ],
} as const;
