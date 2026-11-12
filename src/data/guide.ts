/**
 * Sam's lines through the run: the story, told by Sam. He reads the flyer and learns about 16-Bit Con, wants
 * to go, has to find a way to New York, runs there day and night, arrives at the Javits Center, finds it is
 * made of pixels — he is still inside the game, the real con is out there — and decides to break out.
 *
 * Each line is said once, as Sam passes `at` (timeline t; 0 is after the flyer is closed). Lines queue: each
 * one is typed out in full and stays up long enough to read, however fast the run goes (src/game/index.ts).
 * `key` lines survive a short jump past them (Skip lands just before the twist, which still plays in full).
 * The run's end waits for the last line (`end`) to be read before the breakout can start: Sam's decision.
 */
export interface SamLine {
  at: number;
  text: string;
  /** Part of the story: still said when the run jumps a little past it. */
  key?: true;
  /** Sam's decision to break out: the breakout waits until it has been read. */
  end?: true;
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
  { at: 0.77, text: 'Running all night. Worth it.' },
  { at: 0.86, text: 'Morning. The Javits Center, finally. I made it.', key: true },
  // the twist and the decision
  { at: 0.92, text: 'Wait. Why is everything made of pixels?', key: true },
  { at: 0.95, text: 'This isn’t the real Javits. I’m still inside the game.', key: true },
  { at: 0.975, text: 'The real 16-Bit Con is out there. I’m breaking out. Help me.', key: true, end: true },
];

/** Sam's line on the Register window once someone has registered (the booth's number kept with it). */
export const GG_LINE = 'GG! Saved you a spot at Booth 630.';
