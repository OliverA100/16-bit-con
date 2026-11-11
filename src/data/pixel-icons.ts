/**
 * The site's icons, drawn as the Register checkbox's tick is: 2 px pixel blocks on a 16 px grid (8 × 8 cells),
 * filled in the text's colour, rendered with crisp edges. Each icon is a grid of cells ('#' filled); pixelPath()
 * turns it into one SVG path of rectangles, a row's runs merged.
 */
export type PixelGrid = readonly string[];

export const PIXEL_ICONS = {
  /** the Levels rail: the morning keynote */
  sun: ['...##...', '.#....#.', '..####..', '#.#..#.#', '#.#..#.#', '..####..', '.#....#.', '...##...'],
  /** the afternoon panel, in the city */
  city: ['...###..', '...#.#..', '##.###..', '##.#.#.#', '##.###.#', '##.#.###', '##.#####', '########'],
  /** the evening party */
  moon: ['..####..', '.###....', '###.....', '##......', '##......', '###.....', '.###....', '..####..'],
  /** a monitor */
  crt: ['########', '#......#', '#......#', '#......#', '########', '...##...', '.######.', '........'],
  /** Booth 630: a sign on its post */
  booth: ['########', '#......#', '#.####.#', '########', '...##...', '...##...', '...##...', '.######.'],
  /** the HUD's sound: on (the speaker and its waves) and off (the speaker and an x) */
  soundOn: ['...#..#.', '..##...#', '####.#.#', '####.#.#', '####.#.#', '####.#.#', '..##...#', '...#..#.'],
  soundOff: ['...#....', '..##....', '####.#.#', '####..#.', '####..#.', '####.#.#', '..##....', '...#....'],
} as const satisfies Record<string, PixelGrid>;

export type PixelIconName = keyof typeof PIXEL_ICONS;

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
