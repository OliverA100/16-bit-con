/**
 * The schedule. The brief's three sessions are Oct 3, copy used as-is (`brief: true`); the Oct 4–5
 * sessions were added for the drawer. Kept in time order, the brief's three first, so the game's
 * Levels (World.astro) still read sessions[0..2].
 */
export type Day = 'Oct 3' | 'Oct 4' | 'Oct 5';

/** Which animated scene a session's folder shows (src/schedule/scenes). */
export type SceneId = 'field' | 'city' | 'party' | 'office' | 'desert' | 'rain' | 'beanstalk' | 'park' | 'sunset';

export interface Session {
  /** Slug for element ids. */
  id: string;
  day: Day;
  time: string;
  title: string;
  /** Short label on the folder's tab, after the time. */
  tab: string;
  place: string;
  blurb: string;
  scene: SceneId;
  /** One of the brief's three sessions (the game's Levels 1–3). */
  brief?: true;
  level?: 1 | 2 | 3;
}

export const sessions: Session[] = [
  {
    id: 'opening-keynote',
    day: 'Oct 3',
    level: 1,
    brief: true,
    time: '10:00 AM',
    title: 'Opening Keynote: The Future of Retro',
    tab: 'Opening Keynote',
    place: 'Main stage',
    blurb: 'Why the next decade of play looks a lot like 1994, and why that is good news.',
    scene: 'field',
  },
  {
    id: 'pixel-art-ai',
    day: 'Oct 3',
    level: 2,
    brief: true,
    time: '2:00 PM',
    title: 'Panel: Pixel Art in the Age of AI',
    tab: 'Pixel Art & AI',
    place: 'Panel room B',
    blurb: 'Four artists, one question: what is a pixel worth when anything can be generated?',
    scene: 'city',
  },
  {
    id: 'after-party',
    day: 'Oct 3',
    level: 3,
    brief: true,
    time: '6:00 PM',
    title: 'Vega After Party — Booth 630',
    tab: 'After Party',
    place: 'Booth 630',
    blurb: 'Arcade cabinets, a very good mole, and the only queue worth standing in.',
    scene: 'party',
  },
  {
    id: 'sprite-workshop',
    day: 'Oct 4',
    time: '10:00 AM',
    title: 'Workshop: Draw Your First 16-Bit Sprite',
    tab: 'Sprite Workshop',
    place: 'Pixel lab',
    blurb: 'Bring a laptop and leave with a walking, blinking character you drew yourself.',
    scene: 'office',
  },
  {
    id: 'speedrun-showcase',
    day: 'Oct 4',
    time: '1:00 PM',
    title: 'Speedrun Showcase: Any% Live',
    tab: 'Speedrun Showcase',
    place: 'Main stage',
    blurb: 'World-record runners, a live crowd, and no pause button.',
    scene: 'desert',
  },
  {
    id: 'cheat-codes',
    day: 'Oct 4',
    time: '4:00 PM',
    title: 'Talk: Cheat Codes and Other Security Holes',
    tab: 'Cheat Codes',
    place: 'Panel room B',
    blurb: 'What thirty years of game exploits teach us about keeping real systems safe.',
    scene: 'rain',
  },
  {
    id: 'repair-bench',
    day: 'Oct 5',
    time: '11:00 AM',
    title: 'Repair Bench: Bring Your Broken Cartridges',
    tab: 'Repair Bench',
    place: 'Workshop hall',
    blurb: 'Dead batteries, dusty pins, lost saves. Our techs will try to bring them back.',
    scene: 'beanstalk',
  },
  {
    id: 'final-boss',
    day: 'Oct 5',
    time: '2:00 PM',
    title: 'Final Boss Tournament',
    tab: 'Final Boss',
    place: 'Main stage',
    blurb: 'Sixty-four players, one bracket, one very heavy trophy.',
    scene: 'park',
  },
  {
    id: 'closing-credits',
    day: 'Oct 5',
    time: '5:00 PM',
    title: 'Closing Credits',
    tab: 'Closing Credits',
    place: 'Booth 630',
    blurb: 'One last song, one last high score, and see you next year.',
    scene: 'sunset',
  },
];

/** The sessions grouped by day, in order: one divider and its folders per group. */
export const days: { day: Day; sessions: Session[] }[] = (['Oct 3', 'Oct 4', 'Oct 5'] as const).map((day) => ({
  day,
  sessions: sessions.filter((s) => s.day === day),
}));
