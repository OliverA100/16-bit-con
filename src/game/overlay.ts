/** The game's own DOM inside the hero section: the canvas, the HUD and the overlays, looked up once. */
import { queryHero, type HeroDom } from './hero-dom';

export interface Overlay {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  hero: HeroDom | null;
  hud: HTMLElement | null;
  hudCoins: HTMLElement | null;
  hudClock: HTMLElement | null;
  hint: HTMLElement | null;
  skip: HTMLButtonElement | null;
  prompt: HTMLElement | null;
  promptTitle: HTMLElement | null;
  sam: HTMLElement | null;
  samTyped: HTMLElement | null;
  samSaid: HTMLElement | null;
  samPortrait: HTMLCanvasElement | null;
  dpadLeft: HTMLElement | null;
  dpadRight: HTMLElement | null;
  buttonA: HTMLElement | null;
  exit: HTMLButtonElement | null;
  status: HTMLElement | null;
}

export function queryOverlay(section: HTMLElement): Overlay {
  const q = <T extends HTMLElement>(sel: string) => section.querySelector<T>(sel);
  return {
    section,
    canvas: q<HTMLCanvasElement>('.world__canvas')!,
    hero: queryHero(section),
    hud: q('.world__hud'),
    hudCoins: q('[data-hud-coins]'),
    hudClock: q('[data-hud-clock]'),
    hint: q('.world__hint'),
    skip: q<HTMLButtonElement>('[data-skip]'),
    prompt: q('.world__prompt'),
    promptTitle: q('.world__prompt .window__title'),
    sam: q('.world__sam'),
    samTyped: q('[data-sam-typed]'),
    samSaid: q('[data-sam-said]'),
    samPortrait: q<HTMLCanvasElement>('[data-sam-portrait]'),
    dpadLeft: q('[data-dpad="left"]'),
    dpadRight: q('[data-dpad="right"]'),
    buttonA: q('[data-button="a"]'),
    exit: q<HTMLButtonElement>('[data-exit]'),
    status: q('[data-world-status]'),
  };
}
