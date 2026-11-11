/** The passes and how a ticket reads, shared by the page (server) and the ticket's script. */
export type PassId = 'sat' | 'sun' | 'mon' | 'all';

export interface Pass {
  /** The pass's name on the ticket. */
  label: string;
  /** Its dates as the ticket prints them. */
  dates: string;
  /** The first day and the day after the last (all-day calendar events end the next day), YYYYMMDD. */
  start: string;
  end: string;
}

export const PASSES: Record<PassId, Pass> = {
  sat: { label: 'Saturday', dates: 'Oct 3, 2026', start: '20261003', end: '20261004' },
  sun: { label: 'Sunday', dates: 'Oct 4, 2026', start: '20261004', end: '20261005' },
  mon: { label: 'Monday', dates: 'Oct 5, 2026', start: '20261005', end: '20261006' },
  all: { label: 'All 3 days', dates: 'Oct 3–5, 2026', start: '20261003', end: '20261006' },
};

export const PLACE = 'Javits Center, New York';

/** The ticket's one-line summary for screen readers. */
export function describeTicket(pass: PassId, player: string, code: string): string {
  const p = PASSES[pass];
  return `Your pass: ${p.label}, ${p.dates}, ${PLACE}. Player ${player}. Code ${code}. Hosted by Vega.`;
}

/** A fresh code: 16B- and four characters with no look-alikes (no 0/O, 1/I). */
export function makeCode(rand: () => number = Math.random): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(rand() * A.length)];
  return `16B-${s}`;
}
