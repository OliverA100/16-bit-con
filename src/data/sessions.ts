/** The schedule. Copy from the brief, used as-is. */
export interface Session {
  level: 1 | 2 | 3;
  time: string;
  title: string;
  place: string;
  blurb: string;
  /** Which world still the session card shows. */
  scene: 'field' | 'city' | 'night';
}

export const sessions: Session[] = [
  {
    level: 1,
    time: '10:00 AM',
    title: 'Opening Keynote: The Future of Retro',
    place: 'Main stage',
    blurb: 'Why the next decade of play looks a lot like 1994, and why that is good news.',
    scene: 'field',
  },
  {
    level: 2,
    time: '2:00 PM',
    title: 'Panel: Pixel Art in the Age of AI',
    place: 'Panel room B',
    blurb: 'Four artists, one question: what is a pixel worth when anything can be generated?',
    scene: 'city',
  },
  {
    level: 3,
    time: '6:00 PM',
    title: 'Vega After Party — Booth 630',
    place: 'Booth 630',
    blurb: 'Arcade cabinets, a very good mole, and the only queue worth standing in.',
    scene: 'night',
  },
];
