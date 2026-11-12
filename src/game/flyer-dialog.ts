/**
 * The flyer, opened over the game (FlyerDialog.astro): a native modal <dialog> like the Register one —
 * focus moves in and is trapped, the page behind is inert, no backdrop. "Let's go" and Esc close it, with the Register dialog's 150 ms step out (at once with reduced motion).
 * It opens out of the little flyer in the world: from its rect on screen, it grows to its place.
 */
export interface FlyerDialog {
  readonly open: boolean;
  /** Open, growing from `from` (the little flyer's box on screen, CSS px), if given. */
  show(from: DOMRect | null): void;
}

export function createFlyerDialog(hooks: { onOpen(): void; onClose(): void; /** "Let's go" or Esc: the step out begins. */ onClosing?(): void }): FlyerDialog | null {
  const dialog = document.querySelector<HTMLDialogElement>('[data-flyer-dialog]');
  const stack = dialog?.querySelector<HTMLElement>('[data-flyer-stack]');
  const go = dialog?.querySelector<HTMLButtonElement>('[data-flyer-go]');
  if (!dialog || !stack || !go || typeof dialog.showModal !== 'function') return null;

  let closing = false;
  let shown = false;
  let timer = 0;
  /**
   * Everything after it has closed, once. Called right after close() as well as from the close event: Chrome
   * can close a modal without firing that event (seen after focus had left it and come back), and the game
   * must never stay paused under a closed flyer.
   */
  const closed = () => {
    if (!shown) return;
    shown = false;
    closing = false;
    window.clearTimeout(timer);
    dialog.classList.remove('is-closing');
    document.documentElement.classList.remove('is-reading');
    hooks.onClose();
  };
  /** The step out has played (or its time is up): close for real. */
  const finish = () => {
    if (!closing) return;
    closing = false;
    dialog.classList.remove('is-closing');
    dialog.close();
    closed();
  };
  stack.addEventListener('animationend', (e) => {
    if (e.target === stack) finish();
  });
  const close = () => {
    if (!dialog.open || closing) return;
    hooks.onClosing?.();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      closed();
      return;
    }
    closing = true;
    dialog.classList.add('is-closing');
    timer = window.setTimeout(finish, 400);
  };
  go.addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('close', closed);

  return {
    get open() {
      return dialog.open;
    },
    show(from) {
      if (dialog.open) return;
      shown = true;
      // (no page lock as the Register dialog has: the opening already holds the wheel, touch and keys, and an
      // overflow lock here moved the pinned page back into the dive on review)
      document.documentElement.classList.add('is-reading');
      hooks.onOpen();
      dialog.showModal();
      // grow out of the little flyer: from its centre and size to the stack's own
      const to = stack.getBoundingClientRect();
      if (from && to.width > 0) {
        stack.style.setProperty('--from-x', `${from.left + from.width / 2 - (to.left + to.width / 2)}px`);
        stack.style.setProperty('--from-y', `${from.top + from.height / 2 - (to.top + to.height / 2)}px`);
        stack.style.setProperty('--from-s', String(Math.max(0.04, from.width / to.width)));
      }
      go.focus({ preventScroll: true });
    },
  };
}
