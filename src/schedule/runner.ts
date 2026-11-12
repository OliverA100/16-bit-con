/**
 * Draws every folder's scene on its own canvas, crisp at a whole number of device pixels per art pixel
 * (as the game does, src/game/scale.ts): each canvas buffer is in art pixels and its CSS size is
 * buffer × k / dpr, its bottom on its scene box's bottom (by a transform), and the box clips it.
 *
 * Every folder holds a frame of its scene (below the strip a closed folder shows, so it is out of sight
 * until the folder opens). Only the open folder's scene plays: one rAF loop, running only while that scene is on screen
 * (IntersectionObserver) and motion is allowed, redrawing only when the scene's state key changes. A
 * folder that closes keeps the frame it stopped on; one never opened shows its still. With reduced
 * motion every scene shows its still.
 */
import type { SceneId } from '../data/sessions';
import { preloadFiles, type Scene, type SceneModule, type View } from './kit';
import { sceneModules } from './scenes';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 53.6875rem)'); // the drawer's own break (ScheduleDrawer.astro)

/** CSS px per art px: k = max(1, round(this × dpr)), whole device pixels per art pixel (the mock's scale). */
const CSS_PER_ART = 1;
/** Art px kept clear round the text block: scenes stay right of it or below it. */
const CLEAR = { x: 16, y: 8 };

/** When the page is idle (a short timeout where requestIdleCallback is missing). */
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => fn(), { timeout: 2000 }) : setTimeout(fn, 60));

const modules = new Map<SceneId, Promise<SceneModule>>();
const scenes = new Map<SceneId, Promise<Scene>>();

function moduleFor(id: SceneId): Promise<SceneModule> {
  let m = modules.get(id);
  if (!m) {
    m = sceneModules[id]();
    modules.set(id, m);
  }
  return m;
}

function sceneFor(id: SceneId): Promise<Scene> {
  let s = scenes.get(id);
  if (!s) {
    s = moduleFor(id).then((m) => m.load());
    scenes.set(id, s);
    s.catch(() => scenes.delete(id));
  }
  return s;
}

/** One folder's canvas and what is on it. */
interface Slot {
  id: SceneId;
  canvas: HTMLCanvasElement;
  box: HTMLElement;
  scene: Scene | null;
  view: View | null;
  /** Scene time in seconds: advances only while it plays, so a reopened scene carries on. */
  t: number;
  lastKey: number;
  dirty: boolean;
  /** Called once a frame is on the canvas. */
  waiters: (() => void)[];
}

export class SceneRunner {
  private readonly slots = new Map<HTMLCanvasElement, Slot>();
  private active: Slot | null = null;
  private visible = false;
  private raf = 0;
  private last = 0;
  private readonly io: IntersectionObserver;
  private readonly ro: ResizeObserver;
  private queue: SceneId[] = [];
  private building = false;

  constructor() {
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) if (this.active && e.target === this.active.box) this.visible = e.isIntersecting;
      this.update();
    });
    this.ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const slot = [...this.slots.values()].find((s) => s.box === e.target);
        if (!slot) continue;
        this.size(slot);
        if (slot !== this.active) this.draw(slot);
      }
      this.update();
    });
    reduced.addEventListener('change', () => {
      for (const slot of this.slots.values()) this.still(slot);
      this.update();
    });
  }

  /** A folder's canvas: it shows its scene's still as soon as the scene is built. */
  attach(id: SceneId, canvas: HTMLCanvasElement): void {
    if (this.slots.has(canvas)) return;
    const box = canvas.parentElement as HTMLElement;
    const slot: Slot = { id, canvas, box, scene: null, view: null, t: 0, lastKey: NaN, dirty: true, waiters: [] };
    this.slots.set(canvas, slot);
    this.ro.observe(box);
    // Already built (or being built): its still follows. Otherwise prepare() builds it in turn.
    scenes.get(id)?.then((scene) => this.adopt(slot, scene));
  }

  /**
   * Build scenes ahead of time, one at a time when the page is idle: fetch the files, then run the
   * scene's load (its crops, recolours and keys) in an idle callback, so that work never lands on a
   * frame of a folder moving. `first` puts these ahead of the rest (a hovered or focused tab).
   */
  prepare(ids: SceneId[], first = false): void {
    const todo = ids.filter((id) => !scenes.has(id));
    this.queue = first ? [...todo, ...this.queue.filter((id) => !todo.includes(id))] : [...this.queue, ...todo.filter((id) => !this.queue.includes(id))];
    this.pump();
  }

  private pump(): void {
    if (this.building) return;
    const id = this.queue.shift();
    if (!id) return;
    if (scenes.has(id)) return this.pump();
    this.building = true;
    moduleFor(id)
      .then((m) => preloadFiles(m.files))
      .then(() => new Promise<void>((resolve) => idle(resolve)))
      .then(() => this.build(id))
      .catch(() => {})
      .finally(() => {
        this.building = false;
        this.pump();
      });
  }

  /** Build `id` and put its still on every canvas waiting for it. */
  private build(id: SceneId): Promise<Scene> {
    const s = sceneFor(id);
    s.then((scene) => {
      for (const slot of this.slots.values()) if (slot.id === id) this.adopt(slot, scene);
    }, () => {});
    return s;
  }

  private adopt(slot: Slot, scene: Scene): void {
    if (slot.scene) return;
    slot.scene = scene;
    slot.t = scene.still ?? scene.start ?? 0;
    slot.dirty = true;
    this.size(slot);
    if (slot === this.active) {
      slot.t = scene.start ?? slot.t;
      this.update();
    } else this.draw(slot);
  }

  /**
   * Play `canvas`'s scene from now on (the one playing stops on its current frame). Resolves once a frame
   * of it is on the canvas: at once when its still is already there.
   */
  show(id: SceneId, canvas: HTMLCanvasElement): Promise<void> {
    this.attach(id, canvas);
    const slot = this.slots.get(canvas)!;
    this.stop();
    this.active = slot;
    this.visible = false;
    this.io.observe(slot.box);
    // Size now, before the folder moves: the open folder's text changes the scene's clear zone.
    this.size(slot);
    const first = new Promise<void>((resolve) => slot.waiters.push(resolve));
    if (slot.scene) {
      this.draw(slot);
      this.update();
    } else this.build(id).catch((err) => console.error(err));
    return first;
  }

  /** Stop playing; the scene keeps the frame it is on. */
  stop(): void {
    if (this.active) this.io.unobserve(this.active.box);
    this.active = null;
    this.visible = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Fit a canvas to its box in whole art pixels, anchored bottom-left. */
  private size(slot: Slot): void {
    const r = slot.box.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(CSS_PER_ART * dpr));
    const w = Math.ceil((r.width * dpr) / k);
    const h = Math.ceil((r.height * dpr) / k);
    // The text block over the scene, in art px from the canvas's top-left (the canvas is anchored
    // bottom-left), from layout offsets in the folder's body (they ignore the folder's lift). A closed
    // folder's text is hidden but still measured, laid out for this one read and hidden again before any
    // paint: its still keeps the same clear zone it will have open, so nothing shifts as it opens.
    const region = slot.box.parentElement?.querySelector<HTMLElement>('[data-region]');
    const text = region?.querySelector<HTMLElement>('.folder__text');
    const top = slot.box.offsetTop + r.height - (h * k) / dpr;
    const toArt = (css: number) => Math.max(0, Math.ceil((css * dpr) / k));
    let clear = { x: 0, y: 0 };
    if (region && text) {
      const hidden = region.getAttribute('hidden');
      if (hidden !== null) region.removeAttribute('hidden');
      const textBottom = region.offsetTop + text.offsetTop + text.offsetHeight;
      const textRight = region.offsetLeft + text.offsetLeft + text.offsetWidth;
      if (hidden !== null) region.setAttribute('hidden', hidden);
      if (textBottom > top) clear = { x: toArt(textRight - slot.box.offsetLeft) + CLEAR.x, y: toArt(textBottom - top) + CLEAR.y };
    }
    const v = slot.view;
    if (v && v.w === w && v.h === h && v.k === k && v.clear.x === clear.x && v.clear.y === clear.y) return;
    // Write only what changed: a canvas rewritten as it starts to move relayouts mid-flight (a layout shift).
    const css = { width: `${(w * k) / dpr}px`, height: `${(h * k) / dpr}px`, transform: `translateY(${r.height - (h * k) / dpr}px)` };
    // The buffer is in device pixels; scenes draw in art pixels under a scale of k (see draw).
    if (slot.canvas.width !== w * k) slot.canvas.width = w * k;
    if (slot.canvas.height !== h * k) slot.canvas.height = h * k;
    for (const [prop, value] of Object.entries(css) as [keyof typeof css, string][]) if (slot.canvas.style[prop] !== value) slot.canvas.style[prop] = value;
    slot.view = { w, h, narrow: phone.matches, clear, k };
    slot.dirty = true;
  }

  /** With reduced motion, every scene at its still. */
  private still(slot: Slot): void {
    if (!slot.scene || !reduced.matches) return;
    slot.t = slot.scene.still ?? slot.scene.start ?? 0;
    slot.dirty = true;
    this.draw(slot);
  }

  private update(): void {
    const a = this.active;
    if (!a || !a.scene) return;
    if (!a.view) this.size(a);
    if (!a.view) return;
    if (reduced.matches) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.still(a);
      return;
    }
    if (!this.visible) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.draw(a); // a resize while off screen still leaves a right frame
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    const a = this.active;
    this.raf = 0;
    if (!a || !a.scene || !this.visible || reduced.matches) return;
    a.t += Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.draw(a);
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(slot: Slot): void {
    if (!slot.scene || !slot.view) return;
    const key = slot.scene.key(slot.t, slot.view);
    if (slot.dirty || key !== slot.lastKey) {
      const ctx = slot.canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(slot.view.k, 0, 0, slot.view.k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, slot.view.w, slot.view.h);
      // On phones the text sits over the scene's top: nothing is drawn behind it, unless the scene says so.
      const under = slot.view.narrow && slot.view.clear.y > 0 && !slot.scene.overText;
      if (under) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, slot.view.clear.y, slot.view.w, slot.view.h - slot.view.clear.y);
        ctx.clip();
      }
      slot.scene.draw(ctx, slot.t, slot.view);
      if (under) ctx.restore();
      slot.lastKey = key;
      slot.dirty = false;
      // A canvas shows once it has a frame, fading in the first time (the page's first stills).
      slot.canvas.dataset.drawn ??= 'fade';
    }
    for (const done of slot.waiters.splice(0)) done();
  }
}
