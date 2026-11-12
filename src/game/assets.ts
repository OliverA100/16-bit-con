/**
 * Assets. Level 1 (field + sky) loads before the first frame; the city set (Levels 2–3 layers,
 * street tiles, props, NPCs) loads right after and slots in — city-far first enters at world
 * x 300, seconds away. Everything derived — the brand goggles, the grass strip back on its own pixel
 * grid, the cropped tree, the cumulus lobes, the hills' seam patch, the street rows — is built here at load, in
 * memory, so Vega's files in public/sprites stay untouched and unaltered.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage, makeStrip, type Drawable, type Strip } from './sprites';
import { cropImage, patchTileSeam } from './palette';
import { loadSamSheets, type SamSheets } from './sam';
import { facadeWithDepth, facadeWithoutSigns } from './signage';

export interface Level1Assets {
  sam: SamSheets;
  coin: Strip;
  /** High and small: cloud-f, g, h, faint. */
  small: Drawable[];
  /** Upper-mid sky: cloud-a, b, d. */
  medium: Drawable[];
  /** Three whole lobes cropped out of big-cloud.png for the mid sky. */
  cumulus: Drawable[];
  /** bg-clouds-strip: the horizon cumulus bank just above the hills. */
  cloudBank: Drawable;
  /** bg-hills-silhouette-light: Vega's own pale far range. */
  silhouette: Drawable;
  /** bg-green-hills, seam patched so it tiles plainly, full saturation. */
  hills: Drawable;
  /** The hills' flat field (rows 100–199, below its path): the plain in front of the far city. */
  plain: Drawable;
  hedge: Drawable;
  /** tree-1 without its planter, for the field. */
  treeField: Drawable;
  /** tree-1 as drawn, planter included: the street tree. */
  tree: Drawable;
  /**
   * The field's ground: Vega's grass over grey rock (ground-grass-rocks-strip) on its own pixel grid, its little
   * flowers and all — the blades above F (FIELD.above rows), then the 48 px band: the grass's top 18 rows, its
   * lower edge and the rock.
   */
  field: Drawable;
  /**
   * The rock below the band (the monitor's screen frame, and a phone's screen under Safari's bar): its last row,
   * every column running straight on down. Tiling its rows instead showed as a repeat once this much was on screen.
   */
  fieldFill: Drawable;
  /** Small grass tufts cut from the same strip: the first slabs of the sidewalk after the field. */
  tufts: Drawable[];
}

export interface CityAssets {
  /** city-far rows 0–322: the skyline and the low-rise city under it. */
  far: Drawable;
  towers: Drawable;
  mid: Drawable;
  near: Drawable;
  fence: Drawable;
  /** The street's three bands: sidewalk-tile rows 0–7 (surface), its kerb face rows 70–81 (edge), road-tile rows 12–39 with the lane marks (fill). */
  sidewalk: Drawable;
  kerb: Drawable;
  road: Drawable;
  /** The plaza: the sidewalk's own paving, its slab face rows 0–47, the whole band deep (no kerb, no road). */
  plazaFloor: Drawable;
  /** The kerb turning towards the viewer where the road ends at the plaza: drawn from the kerb's own greys. */
  kerbReturn: Drawable;
  /** The same where the road starts at the park's corner (its face to the right, towards the road). */
  kerbReturnLeft: Drawable;

  /** NEW art: the far-horizon Javits. */
  javits: Drawable;
  subway: Drawable;
  arcade: Drawable;
  plant: Drawable;
  molePhone: Strip;
  dog: Strip;
  molesChess: Strip;
  molesPingPong: Strip;
  moleWatering: Drawable;
  subwayClosed: Drawable;
  molePizza: Strip;
  dogBark: Strip;
  vegaSignHorizontal: Drawable;
  /** The plaza, all NEW art: the real Javits and its end annex, the cypress row, the sign post. */
  facade: Drawable;
  facadeBay: Drawable;
  cypress: Drawable;
  /** The NEW letter set, and the signage composed from it at load. */
  letters: Drawable;
}

/** Whole lobes of big-cloud.png (x, y, w, h), chosen where each lobe's own edges end. */
export const CUMULUS_LOBES: [number, number, number, number][] = [
  [292, 0, 187, 67],
  [486, 20, 281, 61],
  [776, 80, 233, 39],
];
const TREE_PLANTER_TOP = 65;
/**
 * Vega's grass-over-rock strip is a 17/13 nearest-neighbour enlargement (four doubled rows and columns in every
 * 17): sampled back to its own 734 × 88 pixels at load, so its pixels are Sam's size. On that grid: the blades
 * stand above row 34 (the grass's top line), the grass runs to row ~66, its lower edge and the rock to 88.
 */
const GRASS_SCALE = 17 / 13;
export const FIELD = {
  /** Rows of blades above the grass's top line, drawn above F. */
  above: 34,
  /** The band below F: the grass's top rows, then from `lowerFrom` its lower edge and the rock, 48 in all. */
  grassRows: 18,
  lowerFrom: 58,
} as const;
/** Small tufts on its top line, native (x, y, w, h): cut for the sidewalk's first slabs. */
const GRASS_TUFTS: [number, number, number, number][] = [
  [88, 27, 14, 8],
  [136, 28, 14, 7],
  [178, 27, 20, 8],
];
const CITY_FAR_ROWS = 323;
/** city-near: one 1152 px period, rows 434–1107 — all that a ≤ 720 px buffer can show with its base at F + 2. */
const CITY_NEAR = { period: 1152, top: 434 } as const;
const PLAIN_TOP = 100; // the hills' path ends at row 98
/** The facade's first bay (one door, one structure line) repeats either side of it on wide screens. */
const FACADE_BAY = 128; // the flat annex at the facade's left end
export const STREET = { sidewalkRows: 8, kerbTop: 70, kerbRows: 12, roadTop: 12, roadRows: 28, plazaRows: 48 } as const;
/** The sidewalk's slab joints run at 45°: a kerb turning towards the viewer, or a path's edge, follows them. */
export const JOINT_SLOPE = 1;

async function loadAll(files: { file: string }[], onProgress?: (done: number, total: number) => void, extra = 0): Promise<HTMLImageElement[]> {
  let done = 0;
  return Promise.all(
    files.map((f) =>
      loadImage(f.file).then((img) => {
        onProgress?.(++done + extra, files.length + extra);
        return img;
      }),
    ),
  );
}

export async function loadLevel1(onProgress?: (done: number, total: number) => void): Promise<Level1Assets> {
  const files = [
    sprites.coin,
    sprites.cloudF,
    sprites.cloudG,
    sprites.cloudH,
    sprites.cloudFaint,
    sprites.cloudA,
    sprites.cloudB,
    sprites.cloudD,
    sprites.bigCloud,
    sprites.cloudsStrip,
    sprites.hillsSilhouetteLight,
    sprites.hills,
    sprites.bushes,
    sprites.tree,
    sprites.grassRocks,
  ];
  const total = files.length + 4;
  const [sam, imgs] = await Promise.all([
    loadSamSheets().then((s) => {
      onProgress?.(4, total);
      return s;
    }),
    loadAll(files, onProgress, 4),
  ]);
  const [coin, cloudF, cloudG, cloudH, cloudFaint, cloudA, cloudB, cloudD, bigCloud, cloudBank, silhouette, hills, bushes, tree, grassRaw] =
    imgs as [HTMLImageElement, ...HTMLImageElement[]];
  const grass = nativeGrid(grassRaw!, GRASS_SCALE);
  // the rock's last row, stretched over a tile's worth of rows: every row the same, so the tiling never shows
  const fieldFill = document.createElement('canvas');
  fieldFill.width = grass.width;
  fieldFill.height = 16;
  const fillCtx = fieldFill.getContext('2d')!;
  fillCtx.imageSmoothingEnabled = false;
  fillCtx.drawImage(grass, 0, grass.height - 1, grass.width, 1, 0, 0, grass.width, fieldFill.height);
  const hillsPatched = patchTileSeam(hills!);
  const small = [cloudF!, cloudG!, cloudH!, cloudFaint!];
  const medium = [cloudA!, cloudB!, cloudD!];
  const cumulus = CUMULUS_LOBES.map(([x, y, w, h]) => cropImage(bigCloud!, x, y, w, h));
  return {
    sam,
    coin: makeStrip(coin, sprites.coin.fw, sprites.coin.fh, sprites.coin.pitch),
    small,
    medium,
    cumulus,
    cloudBank: cloudBank!,
    silhouette: silhouette!,
    hills: hillsPatched,
    plain: cropImage(hillsPatched, 0, PLAIN_TOP, hillsPatched.width, hillsPatched.height - PLAIN_TOP),
    hedge: bushes!,
    treeField: cropImage(tree!, 0, 0, tree!.width, TREE_PLANTER_TOP),
    tree: tree!,
    field: fieldGround(grass),
    fieldFill,
    tufts: GRASS_TUFTS.map(([x, y, w, h]) => cropImage(grass, x, y, w, h)),
  };
}

export async function loadCity(): Promise<CityAssets> {
  const files = [
    sprites.cityFar,
    sprites.cityTowers,
    sprites.cityMid,
    sprites.cityNear,
    sprites.streetFence,
    sprites.sidewalk,
    sprites.road,
    sprites.subwayFront,
    sprites.arcade,
    sprites.plantFlowers,
    sprites.molePhone,
    sprites.dogWalk,
    sprites.javitsSilhouette,
    sprites.molesChess,
    sprites.molesPingPong,
    sprites.moleWatering,
    sprites.subwayClosed,
    sprites.molePizza,
    sprites.dogBark,
    sprites.vegaSignHorizontal,
    sprites.javitsFacade,
    sprites.cypress,
    sprites.letters,
    sprites.entranceDoors,
  ];
  const [far, towers, mid, near, fence, sidewalk, road, subway, arcade, plant, molePhone, dog, javits, chess, pingPong, watering, subwayClosed, pizza, dogBark, vegaSignH, facade, cypress, letters, doors] =
    await loadAll(files);
  const strip = (img: HTMLImageElement | undefined, fw = 60, fh = 60) => makeStrip(img!, fw, fh);
  // the facade without its little "16" plaque and its flag on a pole (the new signage takes their place)
  const facadeClean = facadeWithDepth(facadeWithoutSigns(facade!), doors!);
  return {
    far: cropImage(far!, 0, 0, far!.width, CITY_FAR_ROWS),
    towers: towers!,
    mid: mid!,
    near: cropImage(near!, 0, CITY_NEAR.top, CITY_NEAR.period, near!.height - CITY_NEAR.top),
    fence: fence!,
    sidewalk: cropImage(sidewalk!, 0, 0, sidewalk!.width, STREET.sidewalkRows),
    kerb: cropImage(sidewalk!, 0, STREET.kerbTop, sidewalk!.width, STREET.kerbRows),
    road: cropImage(road!, 0, STREET.roadTop, road!.width, STREET.roadRows),
    plazaFloor: cropImage(sidewalk!, 0, 0, sidewalk!.width, STREET.plazaRows),
    kerbReturn: kerbReturn(sidewalk!, 'left'),
    kerbReturnLeft: kerbReturn(sidewalk!, 'right'),
    javits: javits!,
    subway: subway!,
    arcade: arcade!,
    plant: plant!,
    molePhone: strip(molePhone),
    dog: strip(dog),
    molesChess: strip(chess, sprites.molesChess.fw, sprites.molesChess.fh),
    molesPingPong: strip(pingPong, sprites.molesPingPong.fw, sprites.molesPingPong.fh),
    moleWatering: watering!,
    subwayClosed: subwayClosed!,
    molePizza: strip(pizza),
    dogBark: strip(dogBark),
    vegaSignHorizontal: withDaisy(vegaSignH!, await loadImage(sprites.daisyIcon.file), 'left'),
    facade: facadeClean,
    facadeBay: cropImage(facadeClean, 0, 0, FACADE_BAY, facadeClean.height),
    cypress: cypress!,
    letters: letters!,
  };
}

/**
 * Vega's wordmark is never shown on its own (brand rule): wherever the vega tiles appear,
 * the Vega daisy stands beside them — composed at load, Vega's files untouched.
 */
function withDaisy(sign: Drawable, daisy: Drawable, at: 'left' | 'above'): HTMLCanvasElement {
  const gap = 3;
  const c = document.createElement('canvas');
  c.width = at === 'left' ? daisy.width + gap + sign.width : Math.max(sign.width, daisy.width);
  c.height = at === 'left' ? Math.max(sign.height, daisy.height) : daisy.height + gap + sign.height;
  const ctx = c.getContext('2d')!;
  if (at === 'left') {
    ctx.drawImage(daisy, 0, Math.round((c.height - daisy.height) / 2));
    ctx.drawImage(sign, daisy.width + gap, Math.round((c.height - sign.height) / 2));
  } else {
    ctx.drawImage(daisy, Math.round((c.width - daisy.width) / 2), 0);
    ctx.drawImage(sign, Math.round((c.width - sign.width) / 2), daisy.height + gap);
  }
  return c;
}

/** A nearest-neighbour enlargement by `scale`, sampled back to its own pixel grid (each pixel's centre). */
function nativeGrid(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const W = Math.round(img.width / scale);
  const H = Math.round(img.height / scale);
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const from = sctx.getImageData(0, 0, img.width, img.height).data;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * scale));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * scale));
      const i = (sy * img.width + sx) * 4;
      const o = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = from[i + k]!;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** The field's ground from the strip: the blades, the grass's top rows, then its lower edge and the rock. */
function fieldGround(grass: HTMLCanvasElement): HTMLCanvasElement {
  const top = FIELD.above + FIELD.grassRows;
  const lower = grass.height - FIELD.lowerFrom;
  const c = document.createElement('canvas');
  c.width = grass.width;
  c.height = top + lower;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(grass, 0, 0, grass.width, top, 0, 0, grass.width, top);
  ctx.drawImage(grass, 0, FIELD.lowerFrom, grass.width, lower, 0, top, grass.width, lower);
  return c;
}

/**
 * The kerb turning towards the viewer where the road ends at the plaza: a diagonal down the band along the
 * slab joints (JOINT_SLOPE), the kerb's light top, its face and its dark foot, in the sidewalk tile's own
 * greys. Its top-left is the corner where the kerb meets the sidewalk's surface band (F + 8).
 */
function kerbReturn(sidewalk: HTMLImageElement, road: 'left' | 'right'): HTMLCanvasElement {
  const rows = STREET.plazaRows - STREET.sidewalkRows;
  const c = document.createElement('canvas');
  c.width = Math.round(rows * JOINT_SLOPE) + 4;
  c.height = rows;
  const ctx = c.getContext('2d')!;
  // the kerb's own colours: its lit face, its shaded face and its dark foot (sidewalk-tile rows 66, 70, 73)
  const src = document.createElement('canvas');
  src.width = 1;
  src.height = sidewalk.height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(sidewalk, 4, 0, 1, sidewalk.height, 0, 0, 1, sidewalk.height);
  const col = (row: number) => {
    const p = sctx.getImageData(0, row, 1, 1).data;
    return `rgb(${p[0]},${p[1]},${p[2]})`;
  };
  const [lit, face, foot] = [col(66), col(70), col(73)];
  // the dark foot on the road's side, the lit top on the paving's
  const across = road === 'left' ? [foot, face, face, lit] : [lit, face, face, foot];
  for (let y = 0; y < rows; y++) {
    const x = Math.round(y * JOINT_SLOPE);
    across.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(x + i, y, 1, 1);
    });
  }
  return c;
}

