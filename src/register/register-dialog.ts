/**
 * Register over the game: in play mode the page below is behind the pin, so "Register now" opens the
 * one RegisterForm in a native modal <dialog> on top of the game instead (focus moves in and is
 * trapped, the page behind is inert). The form is never copied: its Window (#register — the form and
 * its success state, with whatever the player has typed) moves into the dialog and back again, and the
 * slot it leaves keeps its height so nothing below it moves. Esc closes the dialog only.
 */
import { reducedMotion } from '../lib/reduced-motion';
import { STEP_OUT_FALLBACK_MS } from '../lib/motion';
interface RegisterDialog {
  readonly open: boolean;
  /** Open over the game; focus goes back to `opener` when it closes. */
  show(opener: HTMLElement | null): void;
}

export function createRegisterDialog(hooks: { onOpen(): void; onClose(): void }): RegisterDialog | null {
  const dialog = document.querySelector<HTMLDialogElement>('[data-register-dialog]');
  const win = document.getElementById('register');
  const home = win?.parentElement ?? null;
  if (!dialog || !win || !home || typeof dialog.showModal !== 'function') return null;
  // where the Window sits in its slot, so it goes back exactly there
  let marker: Comment | null = null;
  let opener: HTMLElement | null = null;

  /** Close with its 150 ms step out (at once with reduced motion); Esc, the close square and a click outside all come here. */
  let closing = false;
  let timer = 0;
  /** The step out has played (or its time is up): close for real. */
  const finish = () => {
    if (!closing) return;
    closing = false;
    window.clearTimeout(timer);
    dialog.classList.remove('is-closing');
    dialog.close();
  };
  // the dialog's own step out, not an animation ending inside it (the form's)
  dialog.addEventListener('animationend', (e) => {
    if (e.target === dialog) finish();
  });
  const close = () => {
    if (!dialog.open || closing) return;
    if (reducedMotion.matches) {
      dialog.close();
      return;
    }
    closing = true;
    dialog.classList.add('is-closing');
    timer = window.setTimeout(finish, STEP_OUT_FALLBACK_MS);
  };
  win.querySelector<HTMLButtonElement>('[data-window-close]')?.addEventListener('click', close);
  // Esc: the same step out (a second Esc while it runs closes it at once, as the browser decides)
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // a click outside the Window (on the dialog box or its clear backdrop) closes it too
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  dialog.addEventListener('close', () => {
    closing = false;
    window.clearTimeout(timer);
    dialog.classList.remove('is-closing');
    if (marker) {
      marker.replaceWith(win);
      marker = null;
    }
    home.style.minHeight = '';
    document.documentElement.classList.remove('is-paused');
    hooks.onClose();
    opener?.focus({ preventScroll: true });
    opener = null;
  });

  return {
    get open() {
      return dialog.open;
    },
    show(from) {
      if (dialog.open) return;
      opener = from;
      home.style.minHeight = `${home.offsetHeight}px`;
      marker = document.createComment('register');
      win.replaceWith(marker);
      dialog.append(win);
      document.documentElement.classList.add('is-paused');
      hooks.onOpen();
      dialog.showModal();
      focusRegister();
    },
  };
}

/** Focus the form's first field, or its "GG" heading when the player has already registered. */
export function focusRegister(): void {
  const done = document.getElementById('register-done');
  const target = done && !done.hidden ? document.getElementById('register-gg') : document.getElementById('reg-name');
  target?.focus({ preventScroll: true });
}
