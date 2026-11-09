/**
 * Sprite manifest — every Vega file the site uses, with the facts the engine needs.
 * All numbers were measured from the PNGs (see public/sprites/SOURCES.md).
 *
 * scale:  'world' = careers-game scale, lives on the canvas at 1 art px = 1 buffer px
 *         'ui'    = touch controls / icons, DOM at CSS 1:1 or 2:1
 *         'cms'   = large CMS illustrations, DOM only, 1:1 or 2:1, never on the canvas
 */
export type ScaleClass = 'world' | 'ui' | 'cms';

export interface SpriteEntry {
  file: string;
  w: number;
  h: number;
  scale: ScaleClass;
  /** Animation strips: frame size and count. `pitch` when frames are spaced wider than `fw`. */
  frames?: number;
  fw?: number;
  fh?: number;
  pitch?: number;
  /** Tiling layers: repeat period in px; mirrorTile for layers whose edges do not loop. */
  period?: number;
  mirrorTile?: boolean;
  /** Parallax factor relative to the ground (1.0). */
  parallax?: number;
  note?: string;
}

export const sprites = {
  // ── Sam ─────────────────────────────────────────────────────────────────────
  samRun: { file: '/sprites/sam/run.png', w: 240, h: 60, frames: 4, fw: 60, fh: 60, scale: 'world', note: 'green goggles → swapped at load' },
  samJump: { file: '/sprites/sam/sam-jump.png', w: 60, h: 60, frames: 1, fw: 60, fh: 60, scale: 'world', note: 'green goggles → swapped at load' },
  samIdle: { file: '/sprites/sam/idle.png', w: 1980, h: 60, frames: 33, fw: 60, fh: 60, scale: 'world', note: 'green goggles → swapped at load' },
  samPropeller: { file: '/sprites/sam/sam-propeller-idle_8f_60x60.png', w: 480, h: 60, frames: 8, fw: 60, fh: 60, scale: 'world' },
  samSide: { file: '/sprites/sam/anim-sam-side-strip_8f_60x60.png', w: 480, h: 60, frames: 8, fw: 60, fh: 60, scale: 'world' },
  samPortrait: { file: '/sprites/sam/portrait-sam.png', w: 46, h: 49, scale: 'ui', note: 'green goggles → swapped at load; Agent Sam dialogs' },

  // ── UI ──────────────────────────────────────────────────────────────────────
  coin: { file: '/sprites/ui/anim-vega-coin-3f_80x24.png', w: 80, h: 24, frames: 3, fw: 24, fh: 24, pitch: 28, scale: 'ui' },
  dpad: { file: '/sprites/ui/dpad.png', w: 52, h: 53, scale: 'ui' },
  buttonA: { file: '/sprites/ui/a-button.png', w: 44, h: 36, scale: 'ui' },
  buttonB: { file: '/sprites/ui/b-button.png', w: 44, h: 36, scale: 'ui' },
  daisyIcon: { file: '/sprites/ui/daisy-icon-yellow_17x17.png', w: 17, h: 17, scale: 'ui' },
  arrowDown: { file: '/sprites/ui/arrow-down.png', w: 40, h: 40, scale: 'ui' },

  // ── Level 1: Vega's field ───────────────────────────────────────────────────
  cloudsStrip: { file: '/sprites/world/bg-clouds-strip_509x289.png', w: 509, h: 289, period: 509, mirrorTile: true, parallax: 0.05, scale: 'world', note: 'cloud band is rows 94–289' },
  hills: { file: '/sprites/world/bg-green-hills_509x200.png', w: 509, h: 200, period: 509, mirrorTile: true, parallax: 0.12, scale: 'world' },
  bushes: { file: '/sprites/world/ground-bushes-strip_509x53.png', w: 509, h: 53, period: 509, parallax: 1, scale: 'world' },
  tree: { file: '/sprites/props/tree-1.png', w: 58, h: 81, scale: 'world' },
  grassTile: { file: '/sprites/world/tile-grass-dirt_24x9.png', w: 24, h: 9, period: 24, parallax: 1, scale: 'world' },
  daisyRow: { file: '/sprites/world/ground-daisy-row-strip_898x63.png', w: 898, h: 63, period: 898, parallax: 1, scale: 'world', note: 'anti-aliased export → snapped to 8 colours at load' },
  daisyTinyA: { file: '/sprites/world/daisy-tiny-a.png', w: 18, h: 30, scale: 'world' },
  cloudA: { file: '/sprites/world/cloud-a_171x49.png', w: 171, h: 49, scale: 'world' },
  cloudB: { file: '/sprites/world/cloud-b_219x63.png', w: 219, h: 63, scale: 'world' },
  cloudD: { file: '/sprites/world/cloud-d_182x91.png', w: 182, h: 91, scale: 'world' },
  cloudF: { file: '/sprites/world/cloud-f_69x44.png', w: 69, h: 44, scale: 'world' },
  cloudG: { file: '/sprites/world/cloud-g_94x25.png', w: 94, h: 25, scale: 'world' },
  cloudH: { file: '/sprites/world/cloud-h_63x15.png', w: 63, h: 15, scale: 'world' },
  cloudFaint: { file: '/sprites/world/cloud-faint_54x27.png', w: 54, h: 27, scale: 'world' },
} as const satisfies Record<string, SpriteEntry>;

export type SpriteKey = keyof typeof sprites;
