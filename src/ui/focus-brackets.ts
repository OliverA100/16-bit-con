/**
 * The site's one focus state: four pixel corner brackets in the ink round whatever has keyboard focus, like a
 * game's selection cursor. One element draws them (global.css .focus-brackets), placed over the focused thing
 * rather than drawn on it, so no container's overflow ever clips it and every shape — a trapezoid tab, a pass
 * card, the checkbox's box, the close square — gets the same brackets 2 px off its box.
 *
 * Only keyboard focus (:focus-visible) shows it. Text fields keep their own 2 px border instead, and focus that
 * only lands somewhere for screen readers (the Register window, the GG heading, <main>) shows nothing. Inside
 * the Register dialog the brackets move into the dialog (the top layer) so they draw over it. While something
 * has them they follow it every frame, so a lifting card, a scrolling page or the game's moving HUD never
 * leave them behind. Without JS the page keeps a plain ink outline (global.css).
 */
/** How far the brackets stand off the focused box: a 2 px gap, then their 2 px line (room even in the nav's 9 px). */
const INFLATE = 4;

/** Focus that is for screen readers only: no brackets. */
const QUIET = '#register, #register-gg, main, [data-focus-quiet]';

/** What the brackets go round: a radio's card, a checkbox's box, the close button's square, otherwise the element itself. */
function targetOf(el: Element): HTMLElement | null {
  if (!(el instanceof HTMLElement) || el.matches(QUIET)) return null;
  if (el.matches('.field__input, input[type="text"], input[type="email"], textarea')) return null;
  if (el.matches('input[type="radio"]')) return el.closest<HTMLElement>('.ui-button, label') ?? el;
  if (el.matches('input[type="checkbox"]')) return (el.nextElementSibling as HTMLElement | null) ?? el;
  // the dialog's close: round the red square itself, not its larger hit area (which reaches the window's edge)
  if (el.matches('.window__close')) return el.querySelector<HTMLElement>('svg') ?? el;
  return el;
}

/** Whether `el` sits in something fixed (the nav, the pinned game, a dialog): then the brackets go fixed too. */
function inFixed(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    if (n instanceof HTMLDialogElement && n.open) return true;
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

export function startFocusBrackets(): void {
  const box = document.createElement('div');
  box.className = 'focus-brackets';
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  document.documentElement.classList.add('has-focus-brackets');

  let target: HTMLElement | null = null;
  let fixed = false;
  let raf = 0;
  let last = '';

  const place = () => {
    raf = 0;
    if (!target || !target.isConnected) return hide();
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      box.classList.remove('is-on');
    } else {
      const x = Math.round(r.left - INFLATE + (fixed ? 0 : window.scrollX));
      const y = Math.round(r.top - INFLATE + (fixed ? 0 : window.scrollY));
      const key = `${x} ${y} ${Math.round(r.width)} ${Math.round(r.height)}`;
      if (key !== last) {
        last = key;
        box.style.transform = `translate(${x}px, ${y}px)`;
        box.style.width = `${Math.round(r.width) + 2 * INFLATE}px`;
        box.style.height = `${Math.round(r.height) + 2 * INFLATE}px`;
      }
      box.classList.add('is-on');
    }
    raf = requestAnimationFrame(place);
  };

  const hide = () => {
    target = null;
    last = '';
    box.classList.remove('is-on');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const show = (el: Element) => {
    const t = el.matches(':focus-visible') ? targetOf(el) : null;
    if (!t) return hide();
    target = t;
    fixed = inFixed(t);
    box.classList.toggle('is-fixed', fixed);
    // in an open dialog the brackets have to be in it (the top layer) to draw over it
    const host = t.closest('dialog[open]') ?? document.body;
    if (box.parentElement !== host) host.append(box);
    last = '';
    if (!raf) raf = requestAnimationFrame(place);
  };

  document.addEventListener('focusin', (e) => show(e.target as Element));
  document.addEventListener('focusout', () => {
    // the next focusin (if any) comes right after; hide only if nothing takes focus
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body) hide();
    });
  });
  // a dialog closing takes the brackets' host away: they go back to the page
  document.addEventListener(
    'close',
    () => {
      if (box.parentElement !== document.body) document.body.append(box);
    },
    true,
  );
  // a mouse click after keyboard use: no brackets until the keyboard is back
  document.addEventListener('pointerdown', hide, true);
}
