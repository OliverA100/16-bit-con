/**
 * Sam's dog, on the footer's field after the breakout. It keeps him company like a real dog: when Sam settles
 * in the field to smoke, it trots in from the right, greets him with a couple of barks and stays by him, now
 * and then a single bark; the moment he goes (back to the stalk, or off the screen on a phone), it gets up and
 * trots off too — turning round if it was still on its way in. On the same ground line and at the same scale as
 * Sam (FOOT_SINK, --sam-px). Nothing moves while the field is off screen or under the Register dialog.
 */
import { sprites } from '../data/sprites.manifest';
import { drawCell } from './landing';
import { FOOT_SINK, SAM_CELL } from './sam';
import { loadStrip } from './sprites';
import { footerGroundY, queryFooterScene, samK } from './footer';

/** Art px a second trotting; art px of trot per frame of the walk's cycle. */
const TROT = 96;
const STRIDE = 12;
/** The bark sheet: its frames' pace; the greeting is twice through it, and the bark now and then once. */
const BARK_MS = 110;
const GREET = 2;
/** While it stays: a single bark every so often (ms, between these). */
const NOW_AND_THEN = [6000, 11000] as const;
/** While it stays it potters about by Sam: short trots (art px, either side of its place) with pauses between (ms). */
const POTTER = { back: 8, out: 34, rest: [1200, 2600] as const };
/** It sets off this long after Sam has settled (ms), and leaves this long after he has gone: a dog's reaction. */
const COME_MS = 500;
const GO_MS = 250;
/** Art px between Sam's cell and the dog's where it stays. */
const NEAR = 58;

type Phase = 'away' | 'in' | 'greet' | 'stay' | 'bark' | 'out';

export interface DogOptions {
  paused: () => boolean;
  /** Where Sam stops in the field (his cell's left, page px). */
  samStop: () => number;
  /** Sam is in the field, settled there (smoking). */
  samSettled: () => boolean;
}

export async function startDog(o: DogOptions): Promise<{ wake(): void } | null> {
  const scene = queryFooterScene();
  if (!scene) return null;
  const [walk, bark] = await Promise.all([loadStrip(sprites.dogWalk.file), loadStrip(sprites.dogBark.file)]);

  const el = document.createElement('div');
  el.className = 'page-dog';
  el.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.width = SAM_CELL;
  canvas.height = SAM_CELL;
  el.append(canvas);
  // A band as wide as the page that clips what it holds, like the page's sky: the dog trots in from past the
  // right edge, and a box out there on its own would make the page wider than the screen.
  Object.assign(el.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    overflow: 'hidden',
    zIndex: '6',
    pointerEvents: 'none',
    display: 'none',
  });
  Object.assign(canvas.style, { display: 'block', imageRendering: 'pixelated' });
  document.body.append(el);

  let phase: Phase = 'away';
  let at = performance.now();
  let next = 0;
  let x = 0;
  let odo = 0;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let drawn = '';
  /** When Sam's state last changed (settled or gone), for the dog's reaction time. */
  let samSince = performance.now();
  let samWas = false;
  let barks = 0;
  /** Pottering about while it stays: where it is heading (art px from its place), and when it sets off. */
  let wander = 0;
  let restUntil = 0;
  let moves = 0;

  const a = () => samK() / (window.devicePixelRatio || 1);
  const edge = () => document.documentElement.clientWidth + 4;
  const stayX = () => o.samStop() + NEAR * a();
  const nowAndThen = () => NOW_AND_THEN[0] + ((++barks * 3709) % (NOW_AND_THEN[1] - NOW_AND_THEN[0]));

  /** One frame; false once there is nothing left to move (away, or sitting still waiting for a bark). */
  const step = (now: number): boolean => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = a();
    const pace = TROT * s * dt;
    const settled = o.samSettled();
    if (settled !== samWas) {
      samWas = settled;
      samSince = now;
    }
    const comes = settled && now - samSince >= COME_MS;
    const goes = !settled && now - samSince >= GO_MS;
    let sheet = walk;
    let frame = Math.floor(odo);
    let flip = true; // the sheets face right: trotting in, and by Sam, it faces him (left)

    if (phase === 'away') {
      el.style.display = 'none';
      drawn = '';
      if (!comes) return settled; // waiting for him to settle
      phase = 'in';
      x = edge();
    }
    if (goes && phase !== 'out') phase = 'out'; // he has gone: so does the dog, from wherever it is
    switch (phase) {
      case 'in':
        x = Math.max(stayX(), x - pace);
        odo += pace / (STRIDE * s);
        frame = Math.floor(odo);
        if (x <= stayX() + 0.01) {
          phase = 'greet';
          at = now;
          wander = 0;
        }
        break;
      case 'greet':
      case 'bark': {
        const f = Math.floor((now - at) / BARK_MS);
        sheet = bark;
        frame = f % bark.frames;
        if (f >= (phase === 'greet' ? GREET : 1) * bark.frames) {
          phase = 'stay';
          at = now;
          next = nowAndThen();
          restUntil = now + POTTER.rest[0];
        }
        break;
      }
      case 'stay': {
        // a few short trots about its place, a pause facing Sam after each, and now and then a bark
        const goal = stayX() + wander * s;
        const d = goal - x;
        if (now < restUntil || Math.abs(d) < 0.5) {
          if (Math.abs(d) < 0.5 && now >= restUntil) {
            moves++;
            restUntil = now + POTTER.rest[0] + ((moves * 2713) % (POTTER.rest[1] - POTTER.rest[0]));
            // out a bit, then back toward Sam, then a little the other way
            wander = moves % 2 === 0 ? 0 : moves % 4 === 1 ? POTTER.out * (0.5 + ((moves * 37) % 50) / 100) : -POTTER.back;
          }
          sheet = bark;
          frame = 0;
          if (now - at >= next) {
            phase = 'bark';
            at = now;
          }
        } else {
          const mv = Math.sign(d) * Math.min(Math.abs(d), pace * 0.6);
          x += mv;
          odo += Math.abs(mv) / (STRIDE * s);
          frame = Math.floor(odo);
          flip = d < 0;
        }
        break;
      }
      case 'out':
        flip = false;
        x += pace;
        odo += pace / (STRIDE * s);
        frame = Math.floor(odo);
        if (x >= edge()) {
          phase = 'away';
          el.style.display = 'none';
          drawn = '';
          return false;
        }
        break;
    }
    const key = `${sheet === walk ? 'w' : 'b'}${frame % sheet.frames}${flip ? 'f' : ''}`;
    if (key !== drawn) {
      drawn = key;
      drawCell(canvas, sheet, frame, flip);
    }
    const dpr = window.devicePixelRatio || 1;
    const size = SAM_CELL * s;
    const y = footerGroundY(scene) - (SAM_CELL - FOOT_SINK) * s;
    el.style.height = `${size}px`;
    el.style.transform = `translateY(${Math.round(y * dpr) / dpr}px)`;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.transform = `translateX(${Math.round(x * dpr) / dpr}px)`;
    el.style.display = '';
    return true;
  };

  const tick = (now: number) => {
    raf = 0;
    if (!visible || document.hidden || o.paused()) return;
    if (step(now)) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && visible && !document.hidden && !o.paused()) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (!visible) {
      // the field gone from the screen: so is the dog; it comes again when Sam settles there again
      phase = 'away';
      el.style.display = 'none';
      drawn = '';
    }
    wake();
  }).observe(scene);
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return { wake };
}
