/**
 * Sam's lines through the run: the story, told by Sam. He reads the flyer and learns about 16-Bit Con, wants
 * to go, has to find a way to New York, runs there day and night, arrives at the Javits Center, finds it is
 * made of pixels — he is still inside the game, the real con is out there — and decides to break out.
 *
 * Each line is said as Sam passes `at` (timeline t; 0 is after the flyer is closed), and again if he runs back
 * before it and passes it once more. Lines queue: each
 * one is typed out in full and stays up long enough to read, however fast the run goes (src/game/index.ts).
 * `key` lines survive a short jump past them (Skip lands just before the twist, which still plays in full).
 * Lines keep up with Sam: one he has run well past while it waited is dropped, so a fast scroll never leaves
 * the bubble behind him. The twist (`twist`) is never dropped and clears what is older as it comes; the run's
 * end holds only until its last line (`end`) has been typed out, if it has not been already — a few seconds
 * at most. The breakout's start ends the lines.
 */
export interface SamLine {
  at: number;
  text: string;
  /** The twist: never dropped, and nothing older waits in front of it. */
  twist?: true;
  /** Sam's decision to break out: the run's end holds until it has been typed out. */
  end?: true;
  /** Part of the story: still said when the run jumps a little past it. */
  key?: true;
}

export const samLines: SamLine[] = [
  // the flyer: he learns about the con, wants to go, needs a way there
  { at: 0, text: '16-Bit Con, in New York? I have to be there.', key: true },
  { at: 0, text: 'No car, no ticket. I need to find a way to get there.', key: true },
  { at: 0.06, text: 'Guess I’m running. New York, here I come.', key: true },
  // the journey
  { at: 0.17, text: 'Coins on the way. The high ones need a jump.' },
  { at: 0.3, text: 'There’s the city. Leaving the field.' },
  { at: 0.52, text: 'Glass box down the avenue? That’s the Javits Center.', key: true },
  { at: 0.65, text: 'Sun’s going down. I’m not stopping now.' },
  { at: 0.74, text: 'Running all night. Worth it.' },
  // the arrival, the twist and the decision: short, and early enough that all three are typed out before the
  // run's end even at full speed (≈ 5 s from 0.8), since nothing waits for them there
  { at: 0.8, text: 'The Javits Center, just ahead. I made it.', key: true },
  { at: 0.87, text: 'Wait. It’s all pixels. I’m still in the game.', key: true, twist: true },
  { at: 0.93, text: 'The real 16-Bit Con is out there. Time to break out.', key: true, twist: true, end: true },
];

/** Sam's line on the Register window once someone has registered (the booth's number kept with it). */
export const GG_LINE = 'GG! Saved you a spot at Booth\u00A0630.';
