/**
 * The Schedule drawer: a day at a time, and always one folder open.
 *
 * One state — the selected day and the open folder — and one render that gives every panel, card and
 * tab its target from it. The motion is CSS transitions on transforms (and the room's height), so a
 * new target set mid-flight retargets from wherever things are: a click or Esc at any moment
 * supersedes what is pending, nothing queues, nothing snaps, and exactly one folder is open.
 *
 * Every folder holds a frame of its scene, below the strip a closed folder shows: a folder that closes
 * keeps the frame it was on, out of sight, so nothing appears or disappears as folders move. A move shows
 * the folder's text, starts its scene and waits for a frame (at most 150 ms; the still is normally
 * there already); a scene still being built fades in when drawn. A folder that closes keeps its frame
 * and its text is hidden again (hidden="until-found", so find-in-page reaches it and opens the folder,
 * in whichever day) once it has settled. Days not shown wait faded out in the same place.
 */
import type { SceneId } from '../data/sessions';
import { SceneRunner } from './runner';

interface Timed {
  /** A pending hide once the element has settled out of the picture. */
  timer?: number;
}

interface Day {
  id: string;
  tab: HTMLButtonElement;
  panel: HTMLElement;
  folders: Folder[];
}

interface Folder extends Timed {
  id: string;
  index: number;
  scene: SceneId;
  day: Day;
  card: HTMLElement;
  tab: HTMLButtonElement;
  region: HTMLElement;
  title: HTMLElement;
  canvas: HTMLCanvasElement;
}

interface Move {
  /** Move focus to the opened folder's title. */
  focus?: boolean;
  /** Bring the opened folder into view if it ends up off screen. */
  reveal?: boolean;
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
/** The longest a folder waits for its scene's first frame before rising without it. */
const FIRST_FRAME_WAIT = 150;
/** Focus resting this long on a day tab warms that day's first scene. */
const WARM_AFTER = 150;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A CSS time custom property of the drawer's, in ms (`fallback` when it is missing). */
function msOf(drawer: HTMLElement, name: string, fallback: number): number {
  const v = getComputedStyle(drawer).getPropertyValue(name).trim();
  const ms = v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
  return Number.isFinite(ms) ? ms : fallback;
}

/** How long until a move has settled: the longer of a folder's move and a day change. */
function settleMs(drawer: HTMLElement): number {
  if (reduced.matches) return 0;
  return Math.max(msOf(drawer, '--dur-folder', 450), msOf(drawer, '--dur-base', 200)) + 60;
}

export function bootDrawer(drawer: HTMLElement): void {
  const runner = new SceneRunner();
  const days: Day[] = [...drawer.querySelectorAll<HTMLElement>('[data-panel]')].map((panel) => {
    const id = panel.dataset.panel!;
    const d: Day = { id, panel, tab: drawer.querySelector<HTMLButtonElement>(`[data-daytab="${id}"]`)!, folders: [] };
    d.folders = [...panel.querySelectorAll<HTMLElement>('[data-folder]')].map((card) => ({
      id: card.dataset.folder!,
      index: Number(card.dataset.index),
      scene: card.dataset.scene as SceneId,
      day: d,
      card,
      tab: card.querySelector<HTMLButtonElement>('[data-tab]')!,
      region: card.querySelector<HTMLElement>('[data-region]')!,
      title: card.querySelector<HTMLElement>('.folder__title')!,
      canvas: card.querySelector<HTMLCanvasElement>('[data-canvas]')!,
    }));
    return d;
  });
  const folders = days.flatMap((d) => d.folders);
  let day = days.find((d) => d.tab.getAttribute('aria-selected') === 'true') ?? days[0]!;
  let open: Folder = folders.find((f) => f.card.classList.contains('is-open')) ?? day.folders[0]!;
  /** The latest move: an older one still waiting for its scene gives way. */
  let token = 0;
  let revealTimer = 0;

  const cancel = (el: Timed) => {
    window.clearTimeout(el.timer);
    el.timer = undefined;
  };
  /** Hide `el` once it has settled after the latest change, unless by then it is part of the picture again. */
  const later = (el: Timed, hide: () => void) => {
    cancel(el);
    const ms = settleMs(drawer);
    if (ms === 0) hide();
    else
      el.timer = window.setTimeout(() => {
        el.timer = undefined;
        hide();
      }, ms);
  };

  /** Give everything its target from (day, open). Transitions run from wherever things are now. */
  const render = () => {
    for (const d of days) {
      const selected = d === day;
      d.panel.dataset.state = selected ? 'in' : 'out';
      d.panel.style.setProperty('--open', String(open.day === d ? open.index : -1));
      d.tab.setAttribute('aria-selected', String(selected));
      d.tab.tabIndex = selected ? 0 : -1;
      // A day not shown fades out of sight: out of the accessibility tree and the tab order.
      if (selected) d.panel.removeAttribute('aria-hidden');
      else d.panel.setAttribute('aria-hidden', 'true');
      for (const f of d.folders) f.tab.tabIndex = selected ? 0 : -1;
    }
    for (const f of folders) {
      const isOpen = f === open;
      f.card.classList.toggle('is-open', isOpen);
      f.tab.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) cancel(f);
      else if (!f.region.hasAttribute('hidden'))
        later(f, () => f !== open && f.region.setAttribute('hidden', 'until-found'));
    }
    drawer.dataset.open = open.id;
    drawer.dataset.day = day.id;
  };

  /** After the rise: if the open folder is not wholly on screen, bring it in, as little as needed. */
  const bringIntoView = (f: Folder) => {
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(() => {
      if (open !== f) return;
      const r = f.region.getBoundingClientRect();
      const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0;
      if (r.top - f.tab.offsetHeight < nav || r.bottom > innerHeight) f.region.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'instant' : 'smooth' });
    }, settleMs(drawer));
  };

  /** Move to `nextDay` with `nextOpen` open: the one way anything changes. */
  const go = (nextDay: Day, nextOpen: Folder, how: Move = {}) => {
    const t = ++token;
    day = nextDay;
    open = nextOpen;
    // What the new picture needs is shown now, where it stands; nothing moves yet.
    cancel(nextOpen);
    nextOpen.region.removeAttribute('hidden');
    const f = nextOpen;
    // Its still is usually on the canvas already, so this resolves at once.
    const first = runner.show(f.scene, f.canvas);
    const ready = reduced.matches ? Promise.resolve() : Promise.race([first, wait(FIRST_FRAME_WAIT)]);
    if (how.focus) f.title.focus({ preventScroll: true });
    ready.then(() => {
      if (t !== token) return; // a newer move took over
      render();
      if (how.reveal) bringIntoView(f);
    });
  };

  // ── Folders ──
  for (const f of folders) {
    // One folder is always open: its own tab leaves it so.
    f.tab.addEventListener('click', () => open !== f && go(f.day, f, { focus: true, reveal: true }));
    // Build the scene before it is asked for (in idle time), ahead of the others.
    const warm = () => runner.prepare([f.scene], true);
    f.tab.addEventListener('pointerenter', warm);
    f.tab.addEventListener('focus', warm);
    // Find-in-page reached a closed folder's text: open it there (the browser scrolls to the match).
    f.region.addEventListener('beforematch', () => open !== f && go(f.day, f));
  }

  // ── Days: a tablist with manual activation (arrows move focus; Enter, Space or a click selects) ──
  const tablist = drawer.querySelector<HTMLElement>('[data-days]')!;
  let warmTimer = 0;
  for (const d of days) {
    d.tab.addEventListener('click', () => {
      if (d !== day) go(d, d.folders[0]!, { reveal: true });
    });
    const warm = () => {
      window.clearTimeout(warmTimer);
      warmTimer = window.setTimeout(() => runner.prepare([d.folders[0]!.scene], true), WARM_AFTER);
    };
    d.tab.addEventListener('focus', warm);
    d.tab.addEventListener('pointerenter', warm);
    d.tab.addEventListener('blur', () => window.clearTimeout(warmTimer));
  }
  tablist.addEventListener('keydown', (e) => {
    const i = days.findIndex((d) => d.tab === document.activeElement);
    if (i < 0) return;
    const n = days.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    days[to]!.tab.focus();
  });

  // Near the screen, every scene is built in idle time, the shown day's first, so no folder's first
  // build lands on a frame of motion.
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      runner.prepare([...day.folders, ...folders.filter((f) => f.day !== day)].map((f) => f.scene));
    },
    { rootMargin: '400px 0px' },
  );
  near.observe(drawer);

  // Whole device pixels: the drawer can land at a fractional page position (the page above it has
  // fractional heights), and the tabs' clip-path outlines are drawn where they fall, so their top lines
  // would straddle two pixel rows. A sub-pixel relative offset (top/left, not a transform: Safari
  // misplaces animated layers inside an ancestor with a fractional transform) puts the drawer on the
  // pixel grid without moving anything else, measured again whenever the page above it changes size.
  const snap = () => {
    const dpr = window.devicePixelRatio || 1;
    drawer.style.top = drawer.style.left = '';
    const r = drawer.getBoundingClientRect();
    const off = (v: number) => (Math.round(v * dpr) - v * dpr) / dpr;
    const x = off(r.left + scrollX);
    const y = off(r.top + scrollY);
    if (x) drawer.style.left = `${x}px`;
    if (y) drawer.style.top = `${y}px`;
  };
  snap();
  new ResizeObserver(snap).observe(document.body);
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', snap);

  // Every folder holds a frame of its scene (out of sight while it is closed, below its clear strip); the
  // open one plays. The server drew the opening state; the scenes fade in as they are drawn.
  for (const f of folders) runner.attach(f.scene, f.canvas);
  runner.show(open.scene, open.canvas);
}
