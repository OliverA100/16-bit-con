/**
 * The progress rail's stops and Agent Sam's lines. Positions are timeline t.
 * Agent Sam is casual and short (brand rule: "Speech bubbles from Sam are windows titled
 * 'Agent Sam' with typewriter mono text"); each line shows while t is inside its window.
 */
export type RailIcon = 'sun' | 'city' | 'moon' | 'crt' | 'booth' | 'ticket';

export interface RailStop {
  id: string;
  label: string;
  /** Where a click lands: a timeline position, or 'register' for the section below the world. */
  jump: number | 'register';
  /** The stop is current while t is in [from, to). */
  from: number;
  to: number;
  icon: RailIcon;
}

export const railStops: RailStop[] = [
  { id: 'keynote', label: '10:00 Keynote', jump: 0.08, from: 0, to: 0.34, icon: 'sun' },
  { id: 'panel', label: '2:00 Panel', jump: 0.36, from: 0.34, to: 0.62, icon: 'city' },
  { id: 'party', label: '6:00 Party', jump: 0.62, from: 0.62, to: 0.84, icon: 'moon' },
  { id: 'booth', label: 'Booth 630', jump: 1, from: 0.84, to: 1.01, icon: 'booth' },
  { id: 'register', label: 'Register', jump: 'register', from: 2, to: 2, icon: 'ticket' },
];

/** The level shown in the HUD on phones, where the rail is hidden. */
export function levelLabel(t: number): string {
  if (t < 0.34) return 'LVL 1';
  if (t < 0.62) return 'LVL 2';
  if (t < 0.84) return 'LVL 3';
  return 'LVL 4';
}

export interface SamLine {
  from: number;
  to: number;
  text: string;
}

export const samLines: SamLine[] = [
  { from: 0.15, to: 0.21, text: 'Keynote’s at 10. Grab coins on the way, the high ones need a jump.' },
  { from: 0.29, to: 0.34, text: 'Leaving the field. New York, act normal.' },
  { from: 0.53, to: 0.58, text: 'Glass box down the avenue? That’s Javits. Booth 630 is inside.' },
  { from: 0.66, to: 0.72, text: 'Sun’s down, lights on. After party’s at 6. Follow the neon.' },
  { from: 0.97, to: 1.01, text: 'Wait. This is just the game. The real one’s out there.' },
];
