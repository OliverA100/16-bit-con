/**
 * Sam's typewriter: a line typed out in a layout that never moves. The whole line is always laid
 * out — the part still to come is there but hidden (`.type-rest`, global.css) — so a half-typed word never
 * wraps differently from the finished one. The cursor is drawn over the next character (`.type-caret`), a
 * half block in the text's colour, rather than added as a glyph: it takes no room of its own, and no
 * fallback font's glyph hangs below the line and leaves a mark behind when it moves on.
 */
interface Parts {
  shown: Text;
  caret: HTMLSpanElement;
  rest: HTMLSpanElement;
}

const parts = new WeakMap<HTMLElement, Parts>();

/** Show the first `n` characters of `text` in `el`, the cursor on the next one; all of it once `n` reaches the end. */
export function typeOut(el: HTMLElement, text: string, n: number): void {
  let p = parts.get(el);
  if (!p) {
    const shown = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'type-caret';
    const rest = document.createElement('span');
    rest.className = 'type-rest';
    el.replaceChildren(shown, caret, rest);
    p = { shown, caret, rest };
    parts.set(el, p);
  }
  const m = Math.max(0, Math.min(text.length, n));
  p.shown.data = text.slice(0, m);
  p.caret.textContent = m < text.length ? text.charAt(m) : '';
  p.rest.textContent = m < text.length ? text.slice(m + 1) : '';
}
