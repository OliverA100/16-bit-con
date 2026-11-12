/** When to do work that must not get in the way: after the opening has painted, when the main thread is idle, between steps. */

export type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Once the page has loaded and the main thread has gone idle. */
export function whenIdleAfterLoad(cb: () => void): void {
  const w = window as IdleWindow;
  const idle = () => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

/**
 * Once the opening has painted: a largest-contentful-paint entry for an element in it where the
 * browser reports one (its text: the wordmark is inline SVG paths, which are never an LCP
 * candidate), else the fonts in and two frames painted with them — and never later than 1.5 s.
 */
export function afterOpeningPaint(opening: Element | null): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    window.setTimeout(finish, 1500);
    if (opening && PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
      const po = new PerformanceObserver((list) => {
        const inOpening = (e: PerformanceEntry) => {
          const el = (e as LargestContentfulPaint).element;
          return !!el && opening.contains(el);
        };
        if (!list.getEntries().some(inOpening)) return;
        po.disconnect();
        requestAnimationFrame(finish);
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } else {
      void document.fonts?.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(finish)));
    }
  });
}

/** Yield the main thread between the 3D's setup steps, so each runs as its own short task. */
export function pauseTask(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 100 });
    else window.setTimeout(resolve, 16);
  });
}
