/**
 * Assets. Level 1 (field + sky) loads before the first frame; the city set (Levels 2–3 layers,
 * street tiles, props, NPCs) loads right after and slots in — city-far first enters at world
 * x 300, seconds away. Everything derived — the brand goggles, the daisy-row snap, the cropped
 * tree, the cumulus lobes, the hills' seam patch, the street rows — is built here at load, in
 * memory, so Vega's files in public/sprites stay untouched and unaltered.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage, makeStrip, type Drawable, type Strip } from './sprites';
import { cropImage, dominantColor, patchTileSeam, snapToPalette } from './palette';
import { loadSamSheets, type SamSheets } from './sam';

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
  /** Snapped daisy row, rows 0–54: flowers, grass tips and the grass fill — the 8 px surface below F. */
  daisySurface: Drawable;
  /** Its rows 55–60: the grass's shade and outline and its four dirt rows, the top of the 12 px edge band. */
  dirtRows: Drawable;
  /** The edge band's flat tone under those rows (the strip's own darkest dirt row). */
  dirt: string;
  /** The 28 px fill below the edge band: NEW dirt-fill tile (deep dirt, a darker top line, a sparse scatter). */
  dirtFill: Drawable;
  daisyTiny: Drawable;
}

export interface CityAssets {
  /** city-far rows 0–322: the skyline and the low-rise city under it. */
  far: Drawable;
  towers: Drawable;
  mid: Drawable;
  near: Drawable;
  fence: Drawable;
  /** The same three bands as the field: sidewalk-tile rows 0–7 (surface), its kerb face rows 70–81 (edge), road-tile rows 12–39 with the lane marks (fill). */
  sidewalk: Drawable;
  kerb: Drawable;
  road: Drawable;
  /** NEW art: the seam details and the far-horizon Javits. */
  seam: Drawable;
  javits: Drawable;
  subway: Drawable;
  arcade: Drawable;
  plant: Drawable;
  poster: Drawable;
  molePhone: Strip;
  moleCoffee: Strip;
  moleTyping: Strip;
  dog: Strip;
  /** Level 3's crowd and signs. */
  molesChess: Strip;
  molesSofa: Strip;
  molePizza: Strip;
  dogBark: Strip;
  vegaSignHorizontal: Drawable;
  /** The plaza, all NEW art: the real Javits and its end annex, the cypress row, the sign post, the plaza → daisy-bed seam details. */
  facade: Drawable;
  facadeBay: Drawable;
  cypress: Drawable;
  signPost: Drawable;
  seamBack: Drawable;
  /** The NEW letter set, and the signage composed from it at load. */
  letters: Drawable;
}

/** Whole lobes of big-cloud.png (x, y, w, h), chosen where each lobe's own edges end. */
const CUMULUS_LOBES: [number, number, number, number][] = [
  [292, 0, 187, 67],
  [486, 20, 281, 61],
  [776, 80, 233, 39],
];
const TREE_PLANTER_TOP = 65;
const DAISY_SURFACE_ROWS = 55;
const DAISY_DIRT = { top: 55, rows: 6 } as const;
const DAISY_FILL_ROW = 60;
const CITY_FAR_ROWS = 323;
/** city-near: one 1152 px period, rows 434–1107 — all that a ≤ 720 px buffer can show with its base at F + 2. */
const CITY_NEAR = { period: 1152, top: 434 } as const;
const PLAIN_TOP = 100; // the hills' path ends at row 98
/** The facade's first bay (one door, one structure line) repeats either side of it on wide screens. */
const FACADE_BAY = 128; // the flat annex at the facade's left end
export const STREET = { sidewalkRows: 8, kerbTop: 70, kerbRows: 12, roadTop: 12, roadRows: 28 } as const;

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
    sprites.daisyRow,
    sprites.daisyTinyA,
    sprites.dirtFill,
  ];
  const total = files.length + 4;
  const [sam, imgs] = await Promise.all([
    loadSamSheets().then((s) => {
      onProgress?.(4, total);
      return s;
    }),
    loadAll(files, onProgress, 4),
  ]);
  const [coin, cloudF, cloudG, cloudH, cloudFaint, cloudA, cloudB, cloudD, bigCloud, cloudBank, silhouette, hills, bushes, tree, daisyRaw, daisyTiny, dirtFill] =
    imgs as [HTMLImageElement, ...HTMLImageElement[]];
  const snapped = snapToPalette(daisyRaw!, 16);
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
    daisySurface: cropImage(snapped, 0, 0, snapped.width, DAISY_SURFACE_ROWS),
    dirtRows: cropImage(snapped, 0, DAISY_DIRT.top, snapped.width, DAISY_DIRT.rows),
    dirt: dominantColor(snapped, 0, DAISY_FILL_ROW, snapped.width, 1),
    dirtFill: dirtFill!,
    daisyTiny: daisyTiny!,
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
    sprites.poster,
    sprites.molePhone,
    sprites.moleCoffee,
    sprites.moleTyping,
    sprites.dogWalk,
    sprites.seamFieldStreet,
    sprites.javitsSilhouette,
    sprites.molesChess,
    sprites.molesSofa,
    sprites.molePizza,
    sprites.dogBark,
    sprites.vegaSignHorizontal,
    sprites.javitsFacade,
    sprites.cypress,
    sprites.signPost,
    sprites.seamStreetField,
    sprites.letters,
  ];
  const [far, towers, mid, near, fence, sidewalk, road, subway, arcade, plant, poster, molePhone, moleCoffee, moleTyping, dog, seam, javits, chess, sofa, pizza, dogBark, vegaSignH, facade, cypress, signPost, seamBack, letters] =
    await loadAll(files);
  const strip = (img: HTMLImageElement | undefined, fw = 60, fh = 60) => makeStrip(img!, fw, fh);
  return {
    far: cropImage(far!, 0, 0, far!.width, CITY_FAR_ROWS),
    towers: towers!,
    mid: mid!,
    near: cropImage(near!, 0, CITY_NEAR.top, CITY_NEAR.period, near!.height - CITY_NEAR.top),
    fence: fence!,
    sidewalk: cropImage(sidewalk!, 0, 0, sidewalk!.width, STREET.sidewalkRows),
    kerb: cropImage(sidewalk!, 0, STREET.kerbTop, sidewalk!.width, STREET.kerbRows),
    road: cropImage(road!, 0, STREET.roadTop, road!.width, STREET.roadRows),
    seam: seam!,
    javits: javits!,
    subway: subway!,
    arcade: arcade!,
    plant: plant!,
    poster: poster!,
    molePhone: strip(molePhone),
    moleCoffee: strip(moleCoffee),
    moleTyping: strip(moleTyping),
    dog: strip(dog),
    molesChess: strip(chess, sprites.molesChess.fw, sprites.molesChess.fh),
    molesSofa: strip(sofa, sprites.molesSofa.fw, sprites.molesSofa.fh),
    molePizza: strip(pizza),
    dogBark: strip(dogBark),
    vegaSignHorizontal: withDaisy(vegaSignH!, await loadImage(sprites.daisyIcon.file), 'left'),
    facade: facade!,
    facadeBay: cropImage(facade!, 0, 0, FACADE_BAY, facade!.height),
    cypress: cypress!,
    signPost: signPost!,
    seamBack: seamBack!,
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
