/**
 * Register over the game: in play mode the page below is behind the pin, so "Register now" opens the
 * one RegisterForm in a native modal <dialog> on top of the game instead (focus moves in and is
 * trapped, the page behind is inert). The form is never copied: its Window (#register — the form and
 * its success state, with whatever the player has typed) moves into the dialog and back again, and the
 * slot it leaves keeps its height so nothing below it moves. Esc closes the dialog only.
 */
export interface RegisterDialog {
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

  win.querySelector<HTMLButtonElement>('[data-window-close]')?.addEventListener('click', () => dialog.close());
  // a click on the backdrop (the dialog box itself, outside the Window) closes it too
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
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

/** Focus the form's first field, or its confirmation when the player has already registered. */
export function focusRegister(): void {
  const done = document.getElementById('register-done');
  const first = document.getElementById('reg-name');
  (done && !done.hidden ? done : first)?.focus({ preventScroll: true });
}
