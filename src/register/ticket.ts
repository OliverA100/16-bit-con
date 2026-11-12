/**
 * The ticket's moving parts (src/components/Ticket.astro): its text and summary, the barcode drawn from its
 * code, and Vega's cast standing on its line (src/register/ticket-cast.ts).
 *
 * The scene is drawn as the schedule's folders are (src/schedule/runner.ts): a canvas buffer in art pixels,
 * k = max(1, round(dpr)) device px per art px, so 1 CSS px per art px on any whole-number screen. It plays
 * at the kit's pace only while the ticket is on screen (IntersectionObserver), redrawing only when its picture
 * changes; with reduced motion it shows one still frame.
 */
import { describeTicket, PASSES, PLACE, type PassId } from './ticket-data';
import { loadCast, type CastScene } from './ticket-cast';
import { mulberry32 } from '../lib/math';
import { reducedMotion } from '../lib/reduced-motion';

/** The scene's tick: the kit's ~8 fps. */
const TICK_MS = 125;

export interface TicketData {
  pass: PassId;
  player: string;
  code: string;
}

/** FNV-1a: the code's 32-bit hash, the barcode's seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Bars of 1–3 px with 1–3 px gaps between guard bars (1 px, gap, 1 px at each end), filling `width`. */
function barcodeBars(code: string, width = 96): [number, number][] {
  const rand = mulberry32(hash(code));
  const bars: [number, number][] = [
    [0, 1],
    [2, 1],
  ];
  let x = 4;
  const end = width - 4;
  while (true) {
    const w = 1 + Math.floor(rand() * 3);
    if (x + w > end - 1) break;
    bars.push([x, w]);
    x += w + 1 + Math.floor(rand() * 2);
  }
  bars.push([width - 3, 1], [width - 1, 1]);
  return bars;
}

function drawBarcode(svg: SVGSVGElement, code: string): void {
  const w = svg.viewBox.baseVal.width || 96;
  const h = svg.viewBox.baseVal.height || 32;
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren(
    ...barcodeBars(code, w).map(([x, bw]) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('width', String(bw));
      r.setAttribute('height', String(h));
      return r;
    }),
  );
}

export interface MountedTicket {
  update(data: TicketData): void;
  destroy(): void;
}

/** Fill a ticket and start its scene. */
export function mountTicket(el: HTMLElement, data?: TicketData): MountedTicket {
  const set = (d: TicketData) => {
    const p = PASSES[d.pass];
    el.dataset.pass = d.pass;
    el.dataset.player = d.player;
    el.dataset.code = d.code;
    const text = (sel: string, v: string) => {
      const n = el.querySelector<HTMLElement>(sel);
      if (n) n.textContent = v;
    };
    text('[data-ticket-pass]', p.label);
    text('[data-ticket-when]', `${p.dates} · ${PLACE}`);
    text('[data-ticket-player]', d.player);
    text('[data-ticket-code]', d.code);
    el.setAttribute('aria-label', describeTicket(d.pass, d.player, d.code));
    const svg = el.querySelector<SVGSVGElement>('[data-ticket-barcode]');
    if (svg) drawBarcode(svg, d.code);
  };
  set(data ?? { pass: (el.dataset.pass as PassId) ?? 'all', player: el.dataset.player ?? '', code: el.dataset.code ?? '' });

  const box = el.querySelector<HTMLElement>('[data-ticket-scene]');
  const canvas = box?.querySelector('canvas');
  let scene: CastScene | null = null;
  let visible = false;
  let timer = 0;
  let lastKey = NaN;
  let view = { w: 0, h: 0, k: 1 };
  const t0 = performance.now();

  const size = () => {
    if (!box || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(dpr));
    const w = Math.max(1, Math.floor((box.clientWidth * dpr) / k));
    const h = Math.max(1, Math.floor((box.clientHeight * dpr) / k));
    if (w === view.w && h === view.h && k === view.k) return;
    view = { w, h, k };
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${(w * k) / dpr}px`;
    canvas.style.height = `${(h * k) / dpr}px`;
    lastKey = NaN;
  };

  const draw = (t: number) => {
    if (!scene || !canvas || !view.w) return;
    const key = scene.key(t, view);
    if (key === lastKey) return;
    lastKey = key;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.w, view.h);
    scene.draw(ctx, t, view);
  };

  const tick = () => {
    timer = 0;
    if (!visible || reducedMotion.matches || !scene) return;
    draw((performance.now() - t0) / 1000);
    timer = window.setTimeout(tick, TICK_MS);
  };
  const still = () => draw(scene?.still ?? 0);
  const restart = () => {
    if (reducedMotion.matches) {
      still();
      return;
    }
    if (visible && !timer) tick();
  };

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    el.dataset.playing = String(visible && !reducedMotion.matches);
    if (visible) restart();
  });
  const ro = new ResizeObserver(() => {
    size();
    if (reducedMotion.matches || !visible) still();
    else draw((performance.now() - t0) / 1000);
  });
  if (box && canvas) {
    loadCast()
      .then((s) => {
        scene = s;
        size();
        still();
        io.observe(el);
        ro.observe(box);
      })
      .catch((err) => console.error('[ticket] the scene did not load', err));
  }
  reducedMotion.addEventListener('change', restart);

  return {
    update: set,
    destroy() {
      io.disconnect();
      ro.disconnect();
      reducedMotion.removeEventListener('change', restart);
      if (timer) clearTimeout(timer);
      timer = 0;
    },
  };
}
