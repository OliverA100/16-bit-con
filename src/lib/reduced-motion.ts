/**
 * The visitor's reduced-motion preference, read one way everywhere: `.matches` for now, a `change` listener
 * for later. (The opening's inline script in World.astro reads it itself: it runs before any module.)
 */
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
