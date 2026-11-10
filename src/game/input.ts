/**
 * Inputs: arrow keys / WASD, the on-screen d-pad, and the jump button (Space / ↑ / W, the A
 * button, a touch on the world). Jump reports press and hold separately so its height can follow
 * the hold. Touch controls are real buttons driven by pointer events with preventDefault, so a
 * hold never starts a scroll, a selection or the long-press menu. The world only listens while
 * it is on screen and never steals keys from form controls.
 */
export class Input {
  private keys = new Set<string>();
  private jumpKeys = new Set<string>();
  private pressQueued = false;
  private rightQueued = false;
  private pointerJumps = 0;
  dpadDir = 0;
  /** True while the world section is on screen. */
  active = false;
  /** True only in play mode (src/game/index.ts): until PRESS START the keys belong to the page, so Space scrolls it. */
  enabled = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKey, { passive: false });
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', () => this.reset());
    // A finger or pen on the world jumps (tap = hop, hold = full); the mouse is left to scroll.
    this.bindJumpSurface(canvas, (e) => e.pointerType !== 'mouse');
  }

  /** −1, 0 or 1. Keyboard wins over the d-pad when both are held. */
  get dir(): number {
    let d = 0;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) d += 1;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) d -= 1;
    return d || this.dpadDir;
  }

  /** True while any jump input is held. */
  get jumpHeld(): boolean {
    return this.jumpKeys.size > 0 || this.pointerJumps > 0;
  }

  /** True once per new press. */
  consumeJumpPress(): boolean {
    const j = this.pressQueued;
    this.pressQueued = false;
    return j;
  }

  /** True once per new press of → (or D): PRESS START at the monitor, however short the tap. */
  consumeRightPress(): boolean {
    const r = this.rightQueued;
    this.rightQueued = false;
    return r;
  }

  /** Let go of everything held or queued (leaving play mode, or a dialog opening over the game). */
  reset(): void {
    this.keys.clear();
    this.jumpKeys.clear();
    this.pointerJumps = 0;
    this.dpadDir = 0;
    this.pressQueued = false;
    this.rightQueued = false;
  }

  bindDpad(left: HTMLElement, right: HTMLElement, a: HTMLElement): void {
    const hold = (el: HTMLElement, dir: number) => {
      const on = (e: PointerEvent) => {
        if (!this.enabled) return;
        e.preventDefault();
        capture(el, e.pointerId);
        this.dpadDir = dir;
        el.classList.add('is-held');
      };
      const off = () => {
        if (this.dpadDir === dir) this.dpadDir = 0;
        el.classList.remove('is-held');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold(left, -1);
    hold(right, 1);
    this.bindJumpSurface(a);
  }

  private bindJumpSurface(el: HTMLElement, accept: (e: PointerEvent) => boolean = () => true): void {
    let held = false;
    const down = (e: PointerEvent) => {
      if (!this.enabled || !accept(e)) return;
      e.preventDefault();
      capture(el, e.pointerId);
      if (held) return;
      held = true;
      el.classList.add('is-held');
      this.pointerJumps++;
      this.pressQueued = true;
    };
    const up = () => {
      if (!held) return;
      held = false;
      el.classList.remove('is-held');
      this.pointerJumps = Math.max(0, this.pointerJumps - 1);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active || !this.enabled) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target?.isContentEditable) return;

    const move = e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD';
    const jump = e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    if (!move && !jump) return;
    // A focused button or link keeps Space / Enter for itself.
    if (jump && (tag === 'BUTTON' || tag === 'A')) return;

    e.preventDefault();
    if (e.type === 'keydown') {
      if (move && !e.repeat && (e.code === 'ArrowRight' || e.code === 'KeyD')) this.rightQueued = true;
      if (move) this.keys.add(e.code);
      if (jump && !this.jumpKeys.has(e.code)) {
        this.jumpKeys.add(e.code);
        this.pressQueued = true;
      }
    } else {
      this.keys.delete(e.code);
      this.jumpKeys.delete(e.code);
    }
  };
}

function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* a pointer that already left; nothing to capture */
  }
}
