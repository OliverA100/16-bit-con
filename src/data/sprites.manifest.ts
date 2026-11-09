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
  cloudsStrip: { file: '/sprites/world/bg-clouds-strip_509x289.png', w: 509, h: 289, period: 509, mirrorTile: true, parallax: 0.05, scale: 'world', note: 'cloud band is rows 94–289; the horizon cumulus bank just above the hills' },
  bigCloud: { file: '/sprites/world/big-cloud.png', w: 1160, h: 729, parallax: 0.05, scale: 'world', note: 'cumulus bank, two colours; three whole lobes are cropped at load for the mid sky' },
  hillsSilhouetteLight: { file: '/sprites/world/bg-hills-silhouette-light_480x320.png', w: 480, h: 320, period: 480, parallax: 0.04, scale: 'world', note: 'one pale colour on transparent; the far range behind the hills' },
  hills: { file: '/sprites/world/bg-green-hills_509x200.png', w: 509, h: 200, period: 509, parallax: 0.1, scale: 'world', note: 'edges differ in 10 rows → seam patched at load, tiled plainly; ends at a world x and scrolls off' },
  bushes: { file: '/sprites/world/ground-bushes-strip_509x53.png', w: 509, h: 53, period: 509, parallax: 1, scale: 'world' },
  tree: { file: '/sprites/props/tree-1.png', w: 58, h: 81, scale: 'world', note: 'rows 65–80 are a white planter: cropped at load in the field, kept for the street trees after the gate' },
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

  // ── Levels 2–3: Vega's New York ─────────────────────────────────────────────
  cityFar: { file: '/sprites/world/city-far.png', w: 1152, h: 590, period: 1152, mirrorTile: true, parallax: 0.15, scale: 'world', note: 'edges do not loop' },
  cityTowers: { file: '/sprites/world/city-towers.png', w: 2304, h: 510, period: 2304, mirrorTile: true, parallax: 0.3, scale: 'world', note: 'edges do not loop' },
  cityMid: { file: '/sprites/world/city-mid.png', w: 1151, h: 650, period: 1151, parallax: 0.5, scale: 'world' },
  cityNear: { file: '/sprites/world/city-near.png', w: 2304, h: 1108, period: 1152, parallax: 0.75, scale: 'world', note: 'file holds two copies' },
  cityNearFill: { file: '/sprites/world/city-near-fill.png', w: 2304, h: 144, period: 1152, parallax: 0.75, scale: 'world' },
  sidewalk: { file: '/sprites/props/sidewalk-tile.png', w: 256, h: 83, period: 256, parallax: 1, scale: 'world' },
  road: { file: '/sprites/props/road-tile.png', w: 256, h: 107, period: 256, parallax: 1, scale: 'world' },
  subwayFront: { file: '/sprites/props/subway-front.png', w: 215, h: 146, scale: 'world' },
  arcade: { file: '/sprites/props/arcade-machine.png', w: 53, h: 87, scale: 'world' },
  vegaSign: { file: '/sprites/props/vega-sign.png', w: 30, h: 122, scale: 'world' },
  vegaSignHorizontal: { file: '/sprites/props/vega-sign-horizontal.png', w: 138, h: 29, scale: 'world' },
  streetFence: { file: '/sprites/props/street-fence.png', w: 144, h: 75, scale: 'world' },
  poster: { file: '/sprites/props/poster-i-want-you.png', w: 74, h: 112, scale: 'world' },
  plantFlowers: { file: '/sprites/props/plant-flowers.png', w: 35, h: 56, scale: 'world' },
  moleCoffee: { file: '/sprites/npc/mole-coffee.png', w: 1800, h: 60, frames: 30, fw: 60, fh: 60, scale: 'world' },
  moleTyping: { file: '/sprites/npc/mole-typing.png', w: 540, h: 60, frames: 9, fw: 60, fh: 60, scale: 'world' },
  molePizza: { file: '/sprites/npc/mole-pizza.png', w: 1260, h: 60, frames: 21, fw: 60, fh: 60, scale: 'world' },
  molePhone: { file: '/sprites/npc/mole-phone.png', w: 120, h: 60, frames: 2, fw: 60, fh: 60, scale: 'world' },
  molesChess: { file: '/sprites/npc/moles-chess.png', w: 840, h: 100, frames: 6, fw: 140, fh: 100, scale: 'world' },
  molesSofa: { file: '/sprites/npc/moles-sofa.png', w: 3360, h: 90, frames: 24, fw: 140, fh: 90, scale: 'world' },
  dogWalk: { file: '/sprites/npc/dog-walk.png', w: 240, h: 60, frames: 4, fw: 60, fh: 60, scale: 'world' },
  dogBark: { file: '/sprites/npc/dog-bark.png', w: 300, h: 60, frames: 5, fw: 60, fh: 60, scale: 'world' },

  // ── New art ──────────────────────────────────────────────────────────────────
  seamFieldStreet: { file: '/sprites/new/seam-field-street_72x52.png', w: 72, h: 52, scale: 'world', note: 'NEW: the seam details only — tufts after X0, a lighter kerb end-stone at X0+28, dirt pixels after X0+56; F at row 4, X0 at x 8' },

  // ── CMS illustrations: DOM only ─────────────────────────────────────────────
  handClipboard: { file: '/sprites/props/hand-clipboard.png', w: 295, h: 245, scale: 'cms' },
  handMegaphone: { file: '/sprites/props/hand-megaphone.png', w: 312, h: 264, scale: 'cms' },
} as const satisfies Record<string, SpriteEntry>;

export type SpriteKey = keyof typeof sprites;
