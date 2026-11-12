/**
 * The Register window's success state: "GG, {first name}." where the form's first label was, the line under
 * it, the player's ticket, and the calendar and "Register another player" buttons, on the form's own rhythm.
 *
 * Things that appear step: the form steps out (2 steps), the window's height steps to its new size (4), the
 * success content and the ticket step in (4); then `register:done` goes out on the window, so Sam jumps and
 * Sam types his new line (src/game/index.ts, src/game/journey.ts). With reduced motion it simply swaps.
 * Back to the form runs the same way round.
 */
import type { Registration, RegisterFormApi } from './form';
import { downloadIcs } from './ics';
import { mountTicket, type MountedTicket, type TicketData } from './ticket';
import { makeCode, type PassId } from './ticket-data';
import { GG_LINE } from '../data/guide';
import { reducedMotion } from '../lib/reduced-motion';

/** The site's beat: a step every 50 ms. */
const BEAT = 50;

/** First word of the name, as the heading greets them. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name.trim();

function step(el: Element, keyframes: Keyframe[], steps: number): Promise<unknown> {
  return el.animate(keyframes, { duration: steps * BEAT, easing: `steps(${steps}, end)`, fill: 'both' }).finished;
}

export function initSuccess(formApi: RegisterFormApi | null): { show(r: Registration): Promise<void> } | null {
  const win = document.getElementById('register');
  const form = document.getElementById('register-form') as HTMLFormElement | null;
  const done = document.getElementById('register-done');
  const body = win?.querySelector<HTMLElement>('.window__body');
  const title = document.getElementById('register-title');
  const heading = document.getElementById('register-gg');
  const ticketEl = done?.querySelector<HTMLElement>('[data-ticket]');
  if (!win || !form || !done || !body || !heading || !ticketEl) return null;

  let ticket: MountedTicket | null = null;
  let current: TicketData | null = null;

  /** Swap one state for the other, stepping out, the height, then stepping in. */
  const swap = async (from: HTMLElement, to: HTMLElement, before: () => void) => {
    if (reducedMotion.matches) {
      before();
      from.hidden = true;
      to.hidden = false;
      return;
    }
    const h0 = body.getBoundingClientRect().height;
    await step(from, [{ opacity: 1 }, { opacity: 0 }], 2);
    before();
    from.hidden = true;
    to.hidden = false;
    from.getAnimations().forEach((a) => a.cancel());
    to.style.opacity = '0';
    const h1 = body.getBoundingClientRect().height;
    body.style.overflow = 'hidden';
    await step(body, [{ height: `${h0}px` }, { height: `${h1}px` }], 4);
    body.getAnimations().forEach((a) => a.cancel());
    body.style.overflow = '';
    to.style.opacity = '';
    await step(to, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], 4);
    to.getAnimations().forEach((a) => a.cancel());
  };

  done.querySelector('[data-register-ics]')?.addEventListener('click', () => {
    if (current) downloadIcs(current.pass, current.player, current.code);
  });

  done.querySelector('[data-register-again]')?.addEventListener('click', async () => {
    await swap(done, form, () => {
      formApi?.reset();
      if (title) title.textContent = 'Register';
    });
    formApi?.focusFirst();
  });

  return {
    async show(r) {
      const first = firstName(r.name);
      current = { pass: r.pass as PassId, player: r.name, code: makeCode() };
      await swap(form, done, () => {
        heading.textContent = `GG, ${first}.`;
        if (title) title.textContent = 'Registered · GG';
        if (ticket) ticket.update(current!);
        else ticket = mountTicket(ticketEl, current!);
      });
      heading.focus({ preventScroll: true });
      win.dispatchEvent(new CustomEvent('register:done', { detail: { name: first } }));
      // Without the game (the static page), Sam's bubble just says it.
      if (!document.documentElement.classList.contains('has-game')) {
        const typed = document.querySelector<HTMLElement>('[data-landing-typed]');
        if (typed) {
          typed.textContent = GG_LINE;
          const spoken = typed.parentElement?.querySelector('.sr-only');
          if (spoken) spoken.textContent = GG_LINE;
        }
      }
    },
  };
}
