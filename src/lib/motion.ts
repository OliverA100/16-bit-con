/** The motion numbers script needs, kept beside the tokens they mirror (src/styles/tokens.css). */

/** One step of anything that appears: the site's 16-bit beat (--beat). */
export const BEAT_MS = 50;

/**
 * A dialog's step out is three beats (--steps-3). If its animation never reports its end, the dialog still
 * closes after this long.
 */
export const STEP_OUT_FALLBACK_MS = 400;
