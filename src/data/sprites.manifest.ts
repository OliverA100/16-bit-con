/**
 * Sprite manifest — every Vega file the site uses, with the facts the engine needs.
 * All numbers were measured from the PNGs (see public/sprites/SOURCES.md).
 *
 * scale:  'world' = careers-game scale, lives on the canvas at 1 art px = 1 buffer px
 *         'ui'    = touch controls / icons, DOM at CSS 1:1 or 2:1
 */
export type ScaleClass = 'world' | 'ui';

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
  samSide: { file: '/sprites/sam/anim-sam-side-strip_8f_60x60.png', w: 480, h: 60, frames: 8, fw: 60, fh: 60, scale: 'world' },
  samPortrait: { file: '/sprites/sam/portrait-sam.png', w: 46, h: 49, scale: 'ui', note: 'green goggles → swapped at load; Agent Sam dialogs' },

  // ── UI ──────────────────────────────────────────────────────────────────────
  coin: { file: '/sprites/ui/anim-vega-coin-3f_80x24.png', w: 80, h: 24, frames: 3, fw: 24, fh: 24, pitch: 28, scale: 'ui' },
  dpad: { file: '/sprites/ui/dpad.png', w: 52, h: 53, scale: 'ui' },
  buttonA: { file: '/sprites/ui/a-button.png', w: 44, h: 36, scale: 'ui' },
  daisyIcon: { file: '/sprites/ui/daisy-icon-yellow_17x17.png', w: 17, h: 17, scale: 'ui' },

  // ── Level 1: Vega's field ───────────────────────────────────────────────────
  cloudsStrip: { file: '/sprites/world/bg-clouds-strip_509x289.png', w: 509, h: 289, period: 509, mirrorTile: true, parallax: 0.05, scale: 'world', note: 'cloud band is rows 94–289; the horizon cumulus bank just above the hills' },
  bigCloud: { file: '/sprites/world/big-cloud.png', w: 1160, h: 729, parallax: 0.05, scale: 'world', note: 'cumulus bank, two colours; three whole lobes are cropped at load for the mid sky; the first two are also Sam\'s clouds on the 404 page' },
  hillsSilhouetteLight: { file: '/sprites/world/bg-hills-silhouette-light_480x320.png', w: 480, h: 320, period: 480, parallax: 0.04, scale: 'world', note: 'one pale colour on transparent; the far range behind the hills' },
  hills: { file: '/sprites/world/bg-green-hills_509x200.png', w: 509, h: 200, period: 509, parallax: 0.1, scale: 'world', note: 'edges differ in 10 rows → seam patched at load, tiled plainly; ends at a world x and scrolls off' },
  bushes: { file: '/sprites/world/ground-bushes-strip_509x53.png', w: 509, h: 53, period: 509, parallax: 1, scale: 'world' },
  tree: { file: '/sprites/props/tree-1.png', w: 58, h: 81, scale: 'world', note: 'rows 65–80 are a white planter: cropped at load in the field, kept for the street trees after the gate' },
  daisyRow: { file: '/sprites/world/ground-daisy-row-strip_898x63.png', w: 898, h: 63, period: 898, parallax: 1, scale: 'world', note: 'anti-aliased export → snapped to 8 colours at load' },
  daisyTinyA: { file: '/sprites/world/daisy-tiny-a.png', w: 18, h: 30, scale: 'world' },
  cloudA: { file: '/sprites/world/cloud-a_171x49.png', w: 171, h: 49, scale: 'world' },
  cloudB: { file: '/sprites/world/cloud-b_219x63.png', w: 219, h: 63, scale: 'world' },
  cloudD: { file: '/sprites/world/cloud-d_182x91.png', w: 182, h: 91, scale: 'world' },
  cloudE: { file: '/sprites/world/cloud-e_138x88.png', w: 138, h: 88, scale: 'world' },
  cloudF: { file: '/sprites/world/cloud-f_69x44.png', w: 69, h: 44, scale: 'world' },
  cloudG: { file: '/sprites/world/cloud-g_94x25.png', w: 94, h: 25, scale: 'world' },
  cloudH: { file: '/sprites/world/cloud-h_63x15.png', w: 63, h: 15, scale: 'world' },
  cloudFaint: { file: '/sprites/world/cloud-faint_54x27.png', w: 54, h: 27, scale: 'world' },

  // ── Levels 2–3: Vega's New York ─────────────────────────────────────────────
  cityFar: { file: '/sprites/world/city-far.png', w: 1152, h: 590, period: 1152, mirrorTile: true, parallax: 0.15, scale: 'world', note: 'edges do not loop' },
  cityTowers: { file: '/sprites/world/city-towers.png', w: 2304, h: 510, period: 2304, mirrorTile: true, parallax: 0.3, scale: 'world', note: 'edges do not loop' },
  cityMid: { file: '/sprites/world/city-mid.png', w: 1151, h: 650, period: 1151, parallax: 0.5, scale: 'world' },
  cityNear: { file: '/sprites/world/city-near.png', w: 2304, h: 1108, period: 1152, parallax: 0.75, scale: 'world', note: 'file holds two copies' },
  sidewalk: { file: '/sprites/props/sidewalk-tile.png', w: 256, h: 83, period: 256, parallax: 1, scale: 'world' },
  road: { file: '/sprites/props/road-tile.png', w: 256, h: 107, period: 256, parallax: 1, scale: 'world' },
  subwayFront: { file: '/sprites/props/subway-front.png', w: 215, h: 146, scale: 'world' },
  arcade: { file: '/sprites/props/arcade-machine.png', w: 53, h: 87, scale: 'world' },
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

  // ── Schedule scenes (src/schedule): Vega's files at their native size, composed per folder ─────────
  grassRocks: { file: '/sprites/world/ground-grass-rocks-strip_960x115.png', w: 960, h: 115, period: 960, scale: 'world', note: 'grass surface at row 44, grey rock under it' },
  daisySway: { file: '/sprites/world/daisy-clouds-sway_8f_500x364.png', w: 4000, h: 364, frames: 8, fw: 500, fh: 364, scale: 'world', note: 'the daisy is lifted out of its clouds at load (x 190–320, rows 10–327 of each frame)' },
  cloudLg: { file: '/sprites/world/cloud-lg_207x130.png', w: 207, h: 130, scale: 'world' },
  cloudMd: { file: '/sprites/world/cloud-md_128x64.png', w: 128, h: 64, scale: 'world' },
  cloudSm: { file: '/sprites/world/cloud-sm_110x40.png', w: 110, h: 40, scale: 'world' },
  cloudXs: { file: '/sprites/world/cloud-xs_54x33.png', w: 54, h: 33, scale: 'world' },
  hillsGolden: { file: '/sprites/world/bg-hills-golden_509x121.png', w: 509, h: 121, period: 509, scale: 'world', note: 'edges differ in 12 rows → seam patched at load' },
  meadow: { file: '/sprites/world/ground-desert-strip_509x51.png', w: 509, h: 51, period: 509, scale: 'world', note: 'the sand-and-daisy meadow; its surface at row 6' },
  lake: { file: '/sprites/world/bg-lake_480x320.png', w: 480, h: 320, period: 480, scale: 'world', note: 'drawn from row 147 (its islets\' treetops); the far shore at row 178' },
  desertGround: { file: '/sprites/world/bg-desert-ground_480x320.png', w: 480, h: 320, period: 480, scale: 'world', note: 'drawn in its bottom rows only' },
  canyonRiver: { file: '/sprites/world/bg-canyon-river_960x540.png', w: 960, h: 540, period: 960, scale: 'world', note: 'drawn in its bottom 103 rows only' },
  canyonBeanstalk: { file: '/sprites/world/bg-canyon-beanstalk_480x320.png', w: 480, h: 320, scale: 'world', note: 'its own stalk stands at x 222–248' },
  beanstalkSway: { file: '/sprites/world/beanstalk-sway_10f_175x258.png', w: 1750, h: 258, frames: 10, fw: 175, fh: 258, scale: 'world' },
  samClimb: { file: '/sprites/sam/sam-climb_6f_60x60.png', w: 360, h: 60, frames: 6, fw: 60, fh: 60, scale: 'world', note: 'brand palette already' },
  threatScene: { file: '/sprites/world/scene-threat-detected-night-rain_3600x1890.png', w: 3600, h: 1890, scale: 'world', note: 'a 3600/509 upscale of a 508 × 266 picture: sampled back to its own pixels at load; only the landscape under the window is used' },
  molesPingPong: { file: '/sprites/npc/moles-ping-pong.png', w: 8840, h: 90, frames: 34, fw: 260, fh: 90, scale: 'world' },
  officeWall: { file: '/sprites/office/inner-wall-tile-1.png', w: 256, h: 71, period: 256, scale: 'world' },
  officeWall2: { file: '/sprites/office/inner-wall-tile-2.png', w: 255, h: 71, period: 255, scale: 'world' },
  officeFloor: { file: '/sprites/office/floor-tile.png', w: 256, h: 71, period: 256, scale: 'world', note: 'yellow skirting, plank floor, then the floor slab' },
  officeWindow: { file: '/sprites/office/window.png', w: 205, h: 105, scale: 'world' },
  officeScreens: { file: '/sprites/office/computers-desk.png', w: 5292, h: 103, frames: 27, fw: 196, fh: 103, scale: 'world' },
  officeDesk: { file: '/sprites/office/desk-1.png', w: 105, h: 67, scale: 'world' },
  officePlant: { file: '/sprites/office/plant-2.png', w: 58, h: 54, scale: 'world' },
  officeCork: { file: '/sprites/office/cork-board.png', w: 77, h: 63, scale: 'world' },
  officeShelf: { file: '/sprites/office/shelf-plants.png', w: 72, h: 29, scale: 'world' },
  officeDesk2: { file: '/sprites/office/desk-2.png', w: 105, h: 67, scale: 'world' },
  officeDesk3: { file: '/sprites/office/desk-3.png', w: 105, h: 67, scale: 'world' },
  roofFloor: { file: '/sprites/office/floor-rooftop-tile.png', w: 128, h: 91, period: 128, scale: 'world', note: 'railing rows 0–24, parapet 28–38, checker floor 40–71 (feet at 64), base below' },
  roofLift: { file: '/sprites/office/elevator-rooftop.png', w: 137, h: 145, scale: 'world', note: 'the lift house; its own floor patch in rows 130–145' },
  moleLaptop: { file: '/sprites/npc/mole-laptop.png', w: 832, h: 62, frames: 8, fw: 104, fh: 62, scale: 'world', note: 'a mole at a café table with a laptop' },
  beachSet: { file: '/sprites/props/beach-set_98x61.png', w: 98, h: 61, scale: 'world' },
  molePinkDress: { file: '/sprites/npc/mole-pink-dress_42x56.png', w: 42, h: 56, scale: 'world', note: 'a single pose: background crowd only' },
  samSmoking: { file: '/sprites/sam/sam-smoking.png', w: 1680, h: 60, frames: 28, fw: 60, fh: 60, scale: 'world', note: 'green goggles → swapped at load' },
  moleBoard: { file: '/sprites/npc/mole-board.png', w: 26, h: 43, scale: 'world', note: 'a mole seen from behind' },
  moleFiling: { file: '/sprites/npc/mole-filing.png', w: 35, h: 46, scale: 'world', note: 'a mole with its arms out' },

  // ── New art ──────────────────────────────────────────────────────────────────
  dirtFill: { file: '/sprites/new/dirt-fill_256x28.png', w: 256, h: 28, period: 256, parallax: 1, scale: 'world', note: 'NEW: the 28 px dirt fill — deep dirt, a 1 px darker top line, a sparse scatter of the daisy row\'s dirt tones at the road\'s speck density' },
  javitsSilhouette: { file: '/sprites/new/javits-silhouette_300x100.png', w: 300, h: 100, parallax: 0.35, scale: 'world', note: 'NEW: Javits as a long low glass box (3:1) with a slightly raised central block and a space-frame grid every 8 px, in the towers\' own glass and frame colours so it sits in their depth; darkens with them at night' },
  seamFieldStreet: { file: '/sprites/new/seam-field-street_72x52.png', w: 72, h: 52, scale: 'world', note: 'NEW: the seam details only — tufts after X0, a lighter kerb end-stone at X0+28, dirt pixels after X0+56; F at row 4, X0 at x 8' },
  seamStreetField: { file: '/sprites/new/seam-street-field_72x52.png', w: 72, h: 52, scale: 'world', note: 'NEW: the plaza → daisy-bed seam details — tufts on the last slabs before X1, the kerb\'s lighter end-stone ending at X1+28, dirt pixels on the last road pixels before X1+56; F at row 4, X1 at x 16' },
  javitsFacade: { file: '/sprites/new/javits-facade_1408x680.png', w: 1408, h: 680, parallax: 0.25, scale: 'world', note: 'NEW: the real Javits — stepped glass cubes with peaked tops (the tallest centre-back, taller than any viewport), Blue 300/500/700 glass with cloud reflections, a 1 px Outline Black space frame every 8 px with Grey 700 diagonals every 16 px, Grey 500 mullions, Cloud White ridges; the entrance with its canopy, doors, the 16-BIT CON marquee, a glass pyramid kiosk and two flags; its first 128 px (a flat annex) repeats outward' },
  cypress: { file: '/sprites/new/cypress_12x40.png', w: 12, h: 40, parallax: 0.25, scale: 'world', note: 'NEW: a clipped columnar tree for the row along the Javits base' },
  letters: { file: '/sprites/new/pixel-letters_5x7.png', w: 532, h: 58, scale: 'world', note: 'NEW: the 5×7 letter set in the vega-sign yellow-tile style — rows: small day (9×11 tiles), large day (14×18, 2 px cells), small neon, large neon; A–Z, 0–9, hyphen, middle dot' },
  signPost: { file: '/sprites/new/sign-post_10x72.png', w: 10, h: 72, scale: 'world', note: 'NEW: Grey 700 post with Outline Black edges and a Grey 500 highlight for the 2× Booth 630 sign' },
} as const satisfies Record<string, SpriteEntry>;

export type SpriteKey = keyof typeof sprites;
