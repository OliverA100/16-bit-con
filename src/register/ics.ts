/**
 * "Add to calendar": a real .ics for the dates of the player's pass — all-day, at the Javits Center, Booth
 * 630. One event: a single day, or Oct 3 to 5 for all three (an all-day event's end is the day after).
 */
import { PASSES, type PassId } from './ticket-data';

/** Escape a TEXT value (RFC 5545 §3.3.11). */
const text = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/** Fold a content line at 75 octets (UTF-8), continuing with a space (RFC 5545 §3.1). */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

function icsFor(pass: PassId, player: string, code: string, now = new Date()): string {
  const p = PASSES[pass];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vega//16-Bit Con//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${code.toLowerCase()}-${pass}@16-bit-con.vega.io`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${p.start}`,
    `DTEND;VALUE=DATE:${p.end}`,
    `SUMMARY:${text(`16-Bit Con · ${p.label}`)}`,
    `LOCATION:${text('Javits Center, New York · Booth 630')}`,
    `DESCRIPTION:${text(`Your free pass: ${p.label}, ${p.dates}. Player ${player}. Code ${code}. Come say hi at Booth 630. Hosted by Vega · vega.io/16-bit-con`)}`,
    'URL:https://vega.io/16-bit-con',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Hand the player the file. */
export function downloadIcs(pass: PassId, player: string, code: string): void {
  const blob = new Blob([icsFor(pass, player, code)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `16-bit-con-${PASSES[pass].label.toLowerCase().replace(/\s+/g, '-')}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
