/**
 * Sam's lines through the run, by timeline t. Sam is short, first person and casual; each line shows
 * while t is inside its window (and never during the flyer's opening, which index.ts holds back).
 * The story: a flyer lands at his feet, he heads for New York, runs day and night, and finds the
 * Javits Center there is made of pixels.
 */
export interface SamLine {
  from: number;
  to: number;
  text: string;
}

export const samLines: SamLine[] = [
  { from: 0, to: 0.09, text: 'New York by Oct 3? I need a way to get there.' },
  { from: 0.15, to: 0.21, text: 'Long way to New York. Grab coins, the high ones need a jump.' },
  { from: 0.29, to: 0.34, text: 'Leaving the field. New York, act normal.' },
  { from: 0.53, to: 0.58, text: 'Glass box down the avenue? That’s Javits.' },
  { from: 0.64, to: 0.7, text: 'Sun’s going down. Not stopping now.' },
  { from: 0.77, to: 0.82, text: 'Running all night. Worth it.' },
  { from: 0.86, to: 0.91, text: 'Morning already. Javits, finally.' },
  { from: 0.95, to: 0.98, text: 'Wait. This Javits is made of pixels.' },
  { from: 0.98, to: 1.01, text: 'I’m still in the game. Help me break out.' },
];

/** Sam's line on the Register window once someone has registered (the booth's number kept with it). */
export const GG_LINE = 'GG! Saved you a spot at Booth 630.';
