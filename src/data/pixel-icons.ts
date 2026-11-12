/**
 * The site's icons, all drawn one way: pixel blocks, filled in the text's colour, rendered with crisp edges.
 * Each icon is a grid of cells ('#' filled); pixelPath() turns it into one SVG path of rectangles, a row's
 * runs merged.
 */
type PixelGrid = readonly string[];

export const PIXEL_ICONS = {
  /** The checkbox's tick: 2 px blocks on 8 × 8 cells, drawn 1 px in from the left (16 × 16). */
  tick: ['........', '........', '.....#..', '....#...', '.#.#....', '..#.....', '........', '........'],
  /** A form error's "!": a 2 px bar and its dot, on the 14 px square's own pixels (1 px cells). */
  bang: [
    '..............',
    '..............',
    '..............',
    '......##......',
    '......##......',
    '......##......',
    '......##......',
    '......##......',
    '..............',
    '..............',
    '......##......',
    '......##......',
    '..............',
    '..............',
  ],
  /*
   * The game's HUD, in the pixel line of vega.io's game buttons: drawn on 16 × 16 cells, then drawn with
   * 1.5 px lines (halfThick: on half-pixel cells, every line a half pixel thicker): 16.5 × 16.5.
   */
  /** Exit game: an arrow back, a solid head and a short shaft, as on vega.io */
  back: [
    '................',
    '................',
    '................',
    '................',
    '.......#........',
    '......##........',
    '.....###........',
    '....####........',
    '...##########...',
    '....####........',
    '.....###........',
    '......##........',
    '.......#........',
    '................',
    '................',
    '................',
  ],
  /** Skip: fast-forward to the end of the run */
  skip: [
    '................',
    '................',
    '................',
    '.#.....#.....#..',
    '.##....##....#..',
    '.#.#...#.#...#..',
    '.#..#..#..#..#..',
    '.#...#.#...#.#..',
    '.#..#..#..#..#..',
    '.#.#...#.#...#..',
    '.##....##....#..',
    '.#.....#.....#..',
    '................',
    '................',
    '................',
    '................',
  ],
  /** Sound on: a speaker and two curved waves */
  soundOn: [
    '................',
    '................',
    '......#.........',
    '.....##.........',
    '....#.#......#..',
    '####..#..#....#.',
    '#.....#...#...#.',
    '#.....#...#....#',
    '#.....#...#....#',
    '#.....#...#...#.',
    '####..#..#....#.',
    '....#.#......#..',
    '.....##.........',
    '......#.........',
    '................',
    '................',
  ],
  /** Sound off: the speaker and a small x beside it */
  soundOff: [
    '................',
    '................',
    '......#.........',
    '.....##.........',
    '....#.#.........',
    '####..#..#....#.',
    '#.....#...#..#..',
    '#.....#....##...',
    '#.....#....##...',
    '#.....#...#..#..',
    '####..#..#....#.',
    '....#.#.........',
    '.....##.........',
    '......#.........',
    '................',
    '................',
  ],
} as const satisfies Record<string, PixelGrid>;

/**
 * A grid drawn with lines twice as thick: every filled cell also fills the cells right of it and below it, so a
 * 1-cell line becomes 2 (the grid grows by one row and column). The HUD's icons use it on their 16 × 16 grids.
 */
function thicken(grid: PixelGrid): PixelGrid {
  const n = grid.length;
  const on = (x: number, y: number) => y >= 0 && y < n && x >= 0 && x < grid[y]!.length && grid[y]![x] === '#';
  return Array.from({ length: n + 1 }, (_, y) =>
    Array.from({ length: n + 1 }, (_, x) => (on(x, y) || on(x - 1, y) || on(x, y - 1) || on(x - 1, y - 1) ? '#' : '.')).join(''),
  );
}

/**
 * A grid ready to draw with 1.5 px lines at half a pixel a cell (pixelPath cell 0.5): each cell becomes 2 × 2,
 * then thickened by one (3 half pixels). Crisp on 2× screens (3 device px), a touch soft on 1× ones.
 */
export function halfThick(grid: PixelGrid): PixelGrid {
  const doubled = grid.flatMap((row) => {
    const r = [...row].map((ch) => ch + ch).join('');
    return [r, r];
  });
  return thicken(doubled);
}

/** One path of `cell`-px rectangles for a grid's filled cells, offset by (x, y). */
export function pixelPath(grid: PixelGrid, cell = 2, x = 0, y = 0): string {
  let d = '';
  grid.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') {
        c++;
        continue;
      }
      const start = c;
      while (row[c] === '#') c++;
      d += `M${x + start * cell} ${y + r * cell}h${(c - start) * cell}v${cell}h${-(c - start) * cell}z`;
    }
  });
  return d;
}
