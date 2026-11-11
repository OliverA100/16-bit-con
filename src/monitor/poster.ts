/**
 * The monitor posters, public/monitor/monitor-{off,on}.webp: renders of src/monitor at rest, square to
 * the world, with its controller, cable and shadow (the screen off, and on with the game's screen frame
 * at t = 0), shown until the 3D takes over and, screen on, wherever there is no 3D. Measured when they
 * were rendered (at 1440 × 900, device pixel ratio 2, straight from the 3D's transparent buffer), as
 * fractions of the slot — the box the monitor stands in at rest, which the 3D is framed on too.
 */
export const POSTER = {
  /** The image, px. */
  w: 724,
  h: 597,
  /** The slot's height ÷ width. */
  slotAspect: 0.8872,
  /** The image's box round the slot: left and width as fractions of the slot's width, top and height of its height. */
  left: -0.0161,
  top: -0.0124,
  width: 1.1427,
  height: 1.0621,
  /** The scanlines across the screen's height in the poster (PRESS START matches them where it is shown on it). */
  scanLines: 80.3534,
  /** The opening's corners (top left, top right, bottom right, bottom left), fractions of the slot. */
  screen: [
    [0.1128, 0.0866],
    [0.676, 0.0981],
    [0.6744, 0.6584],
    [0.1166, 0.6259],
  ],
} as const;
