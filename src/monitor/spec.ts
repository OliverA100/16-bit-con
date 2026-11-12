/**
 * The monitor's measurements and camera poses, free of three.js: the page lays itself
 * out around the monitor and the game sizes the screen frame from these before the 3D chunk loads.
 *
 * Units: the screen opening is 0.7 wide. x right, y up from the bottom of the front frame, z toward
 * the viewer; the front face sits at z = 0 and the back at z = −DEPTH. A vintage all-in-one: a
 * front frame a touch taller than it is wide, standing just proud of a deep body whose top and
 * sides slope in toward a smaller back (a trapezoid from the side), on four small feet.
 */
export const DIMS = {
  /** The front frame's face: a touch taller than wide, the screen taking most of it. */
  W: 0.9,
  H: 0.96,
  DEPTH: 0.98,
  /**
   * The front frame: its depth, the radius of its vertical corners, the soft lip round its front
   * edge, the small round of its back edge, and how far it stands proud of the body all round (just:
   * the body's sides run on from it, as one machine).
   */
  frame: { depth: 0.09, r: 0.075, lip: 0.03, back: 0.008, step: 0.008 },
  /** The body's back is this much smaller than its front (x, and y about its bottom), the frame untouched. */
  TAPER: 0.2,
  /** The body's back edge. */
  R: 0.06,
  /** Screen opening: 78 % of the frame's width, 59 % of its height, top bezel 10 % → chin 31 %. */
  opening: { w: 0.7, h: 0.57, top: 0.095, r: 0.055 },
  /** The bezel: the face rounds down into the opening over this much (a soft funnel), before the recess walls. */
  lip: 0.035,
  /** The screen's edge sits this far behind the face. */
  recess: 0.055,
  /** The tube's cap bulges 3 % of the screen width at its centre. */
  bulge: 0.021,
  glassGap: 0.004,
  /**
   * The chin, laid out on two rows. Top row (at `top` of the chin's height): the 3.5" floppy drive on
   * the left — the slot (a real pocket `deep`, its dark flap `flap` inside) in a soft raised lip, the
   * activity LED and the eject button under it — and the power button on the right. Bottom row (at
   * `bottom`): Vega's raised wordmark under the drive's left edge, the controller's port under the
   * power button.
   */
  chin: { top: 0.62, bottom: 0.25 },
  slot: {
    x: -0.13,
    w: 0.27,
    h: 0.026,
    dy: 0.008,
    lip: 0.011,
    lipDepth: 0.005,
    deep: 0.03,
    flap: 0.008,
    eject: { w: 0.034, h: 0.012 },
    led: { w: 0.018, h: 0.006 },
  },
  /** The power button: its x, radius and height. */
  button: { x: 0.27, r: 0.024, h: 0.01 },
  /** The controller's port, under the power button: its opening, a pocket `deep`. */
  port: { w: 0.048, h: 0.024, r: 0.006, lip: 0.006, deep: 0.03 },
  /** Vega's wordmark, raised on the chin: its height (its left edge lines up with the drive's). */
  logo: { h: 0.048 },
  /** The face is a cushion, not a plane: it rises this much where it is furthest from its edges (the chin's middle), over `reach` from them. */
  cushion: { rise: 0.009, reach: 0.09 },
  /** Feet: the front pair under the frame, the back pair under the body's back corners (taller by frame.step). */
  feet: { r: 0.028, h: 0.01, x: 0.32, zFront: 0.05, zBack: 0.84 },
  /** Vega's daisy on the right side, flush and glossy: its height, its centre along the side and its height (from the bottom). */
  daisy: { size: 0.4, z: -0.5, y: 0.47 },
  /** Vents: grooves pressed into the left side near the back, at these depths, between these heights (as at the body's front), this deep. */
  vents: { z: [0.68, 0.73, 0.78, 0.83], half: 0.009, y0: 0.36, y1: 0.72, depth: 0.0045, wall: 0.0035 },
} as const;

/** The body tapers toward the back: x, and y about the body's bottom, scale by this at depth z (z ≤ 0); 1 within the frame. */
export const scaleAt = (z: number) => {
  const f = DIMS.frame.depth;
  return 1 - DIMS.TAPER * Math.min(1, Math.max(0, (-z - f) / (DIMS.DEPTH - f)));
};

export const OPENING_Y = DIMS.H - DIMS.opening.top - DIMS.opening.h / 2; // 0.58
export const CHIN = DIMS.H - DIMS.opening.top - DIMS.opening.h; // 0.295
/** The chin's two rows: the drive and the power button, then the wordmark and the port. */
export const SLOT_Y = DIMS.frame.lip + (CHIN - DIMS.lip - DIMS.frame.lip) * DIMS.chin.top;
export const ROW2_Y = DIMS.frame.lip + (CHIN - DIMS.lip - DIMS.frame.lip) * DIMS.chin.bottom;

/** Signed distance from (x, y) to a rounded rectangle centred on (cx, cy), half-size hw × hh, corner r (negative inside). */
function sdRoundRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * How far the face stands out at (x, y): a cushion, nothing at its outer edge (where the frame's lip rolls
 * away) or at the screen's bezel (where it rolls into the opening), rising to cushion.rise between them —
 * the chin swells, the narrow bands round the screen barely do.
 */
export function faceRise(x: number, y: number): number {
  const F = DIMS.frame;
  const O = DIMS.opening;
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const outer = -sdRoundRect(x, y, 0, DIMS.H / 2, DIMS.W / 2 - F.lip, DIMS.H / 2 - F.lip, F.r - F.lip);
  const inner = sdRoundRect(x, y, 0, OPENING_Y, O.w / 2 + DIMS.lip, O.h / 2 + DIMS.lip, O.r + DIMS.lip);
  return DIMS.cushion.rise * smooth(outer / DIMS.cushion.reach) * smooth(inner / DIMS.cushion.reach);
}
/** Screen aspect (width / height of the opening). */
export const SCREEN_ASPECT = DIMS.opening.w / DIMS.opening.h;
/** The visual centre of the monitor, the pivot for the parallax turn. */
export const CENTRE = { x: 0, y: DIMS.H / 2, z: -DIMS.DEPTH / 2 } as const;

/**
 * Where the screen sits in the layout slot at rest: its projected width as a share of the slot's
 * width, and its centre's offset from the slot's centre in slot widths. Measured from the monitor
 * this slot was first drawn round (its silhouette at rest), so the screen keeps its size and place
 * on the page, and the dive its start, whatever the casing round it.
 */
export const SCREEN_AT_REST = { w: 0.563172, dx: -0.105593, dy: -0.113122 } as const;

/** A layout slot in CSS px of the canvas: the box the monitor stands in, centred on (cx, cy) and `w` wide (the screen sits in it by SCREEN_AT_REST). */
export interface Slot {
  cx: number;
  cy: number;
  w: number;
}

export interface View {
  yaw: number;
  pitch: number;
  /** What is fitted to the slot: the screen at its rest place (SCREEN_AT_REST), or the screen filling the slot's width. */
  fit: 'rest' | 'screen';
}

/** The rest pose: a 3/4 view from the front right, 20° yaw, 6° above. */
export const REST: View = { yaw: 20, pitch: 6, fit: 'rest' };
export const FOV = 30;

/**
 * The renderer's context (transparent, antialiased, no stencil). The page creates it before loading
 * three.js and hands it over, so a browser without WebGL 2 never downloads the 3D.
 */
export const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

/** The layout slot at rest is 22 % of the viewport width, never under 220 CSS px. */
export function restWidth(viewportW: number): number {
  return Math.max(0.22 * viewportW, 220);
}
