/**
 * The monitor's measurements and camera poses, free of three.js: the page lays itself
 * out around the monitor and the game sizes the screen frame from these before the 3D chunk loads.
 *
 * Units: the front face is 1 wide (W = 1). x right, y up from the bottom of the casing, z toward the
 * viewer; the front face sits at z = 0 and the back at z = −DEPTH.
 */
export const DIMS = {
  W: 1,
  H: 1,
  DEPTH: 1.05,
  /** The back is this much smaller than the front (x and y, about the bottom centre). */
  TAPER: 0.06,
  /** Every casing edge: the vertical corners and the front and back edges. */
  R: 0.06,
  /** Screen opening: 70 % of the width, 57 % of the height, top bezel 9 % → chin 34 %. */
  opening: { w: 0.7, h: 0.57, top: 0.09, r: 0.035 },
  /** The rounded inner edge of the opening, before the recess walls. */
  lip: 0.015,
  /** The screen's edge sits this far behind the bezel. */
  recess: 0.04,
  /** The tube's cap bulges 3 % of the screen width at its centre. */
  bulge: 0.021,
  glassGap: 0.004,
  seam: { z: 0.22, depth: 0.0028, half: 0.0028 },
  vents: { z: [0.74, 0.79, 0.84, 0.89], half: 0.009, y0: 0.44, y1: 0.8, depth: 0.0045, wall: 0.0035 },
  /** Floppy slot: 45 % of the width, centred 60 % of the chin height above the base. */
  slot: { w: 0.45, h: 0.022, at: 0.6, lip: 0.011, lipDepth: 0.004 },
  button: { r: 0.0225, x: 0.36, h: 0.009 },
  led: { r: 0.0055, x: 0.316 },
  feet: { r: 0.034, h: 0.022, x: 0.38, z: [0.12, 0.93] },
} as const;

export const OPENING_Y = DIMS.H - DIMS.opening.top - DIMS.opening.h / 2; // 0.625
export const CHIN = DIMS.H - DIMS.opening.top - DIMS.opening.h; // 0.34
export const SLOT_Y = CHIN * DIMS.slot.at;
/** Screen aspect (width / height of the opening). */
export const SCREEN_ASPECT = DIMS.opening.w / DIMS.opening.h;
/** The visual centre of the monitor, the pivot for the parallax turn. */
export const CENTRE = { x: 0, y: DIMS.H / 2, z: -DIMS.DEPTH / 2 } as const;

/** A layout slot in CSS px of the canvas: the monitor's projected silhouette is centred on (cx, cy) and `w` wide. */
export interface Slot {
  cx: number;
  cy: number;
  w: number;
}

export interface View {
  yaw: number;
  pitch: number;
  /** What the camera looks at, and what is fitted to the slot width. */
  fit: 'casing' | 'screen';
}

/** The rest pose: a 3/4 view from the front right, 20° yaw, 6° above. */
export const REST: View = { yaw: 20, pitch: 6, fit: 'casing' };
export const VIEWS: Record<string, View> = {
  front34: REST,
  side: { yaw: 78, pitch: 6, fit: 'casing' },
  closeup: { yaw: 13, pitch: 4, fit: 'screen' },
};
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

/** At rest the monitor is 22 % of the viewport width, never under 220 CSS px. */
export function restWidth(viewportW: number): number {
  return Math.max(0.22 * viewportW, 220);
}
