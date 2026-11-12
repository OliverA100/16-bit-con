/**
 * Sam out on the page, once he has broken out of the game and landed on the Register window.
 *
 * Wide screens: Vega's beanstalk grows from the footer's field up past the top of the page
 * (src/game/stalk.ts). Sam stays on the Register window for as long as he and his bubble have room there under
 * the nav. Once its title bar comes nearer the nav than that, he jumps onto the stalk and climbs toward a line a
 * little above the middle of the screen (LINE) wherever the page goes: down as it scrolls down, up as it scrolls up. He has his own pace (CLIMB_PACE): a fast scroll leaves him behind and he
 * catches up, his climb's frames following his own movement. Near the end of the page he climbs down to the
 * footer's field, jumps off, takes a few steps and smokes; back up, he walks back, jumps on and climbs, and
 * he climbs to the window's height and jumps back onto it. Scrolled up past the window (its title bar under
 * LINE_LOW), he leaves it the other way and climbs up the stalk, into the opening. When the page stops a moment with him
 * beside the Schedule drawer, he jumps over and grips its left edge, climbing along it for a stretch.
 *
 * Narrow screens (no room in the margin for the stalk): he stays on the Register window, and when the
 * footer's ground comes on screen with the window gone, he walks in from the left and smokes.
 *
 * Nothing leaves him stuck: every move starts from where he is and ends on something; when the page jumps
 * far (keys, "Register now", a flick) and leaves him off screen, he is put just past the screen's edge on
 * his way, so he climbs into view rather than across the whole page. He moves at whole device px; only his
 * sprite frames step. One Sam: the perch's canvas on the Register window, or this one, never both.
 */
import { drawCell, setAway, type Perch } from './landing';
import { CLIMB_FEET, FOOT_SINK, loadPageSheets, RUN_FPS_MAX, SAM_CELL, STRIDE, type SamSheets } from './sam';
import type { Strip } from './sprites';
import { footerGroundY, queryFooterScene, samK } from './footer';
import { loadStalkArt, Stalk } from './stalk';
import { startSky } from './sky';
import { startDog } from './dog';
import { CLIMB_HANDS } from '../schedule/kit';
import { clamp } from '../lib/math';
import { reducedMotion } from '../lib/reduced-motion';

/** The line he climbs toward on the stalk, as a fraction of the screen's height. */
const LINE = 0.45;
/** Scrolling up: once the Register window's title bar sinks under this line, he leaves it and climbs up the stalk. */
const LINE_LOW = 0.9;
/** His top pace on the stalk, art px a second; the climb's frames follow his own distance, CLIMB_STEP art px a frame. */
const CLIMB_PACE = 90;
const CLIMB_STEP = 9;
/** The page still this long with the drawer's edge near: he goes and grips it. */
const REST_MS = 350;
/**
 * Slack against hopping to and fro on a nudge (a trackpad's touch, a momentum tail): CSS px of scroll past the
 * window's and the ground's lines before he changes place, art px past the ends of his stretch on the wall, and
 * how far (a share of the screen) the page must move from where he let go of the wall before he grips it again.
 */
const SLACK = 16;
const EDGE_SLACK = 24;
const REGRIP = 0.25;
/** At rest, the drawer's edge counts as near when it is within this much of the screen's height from his line. */
const NEAR = 0.35;
/** Art px he climbs along the drawer's edge (either way from where he gripped) before he jumps back to the stalk. */
const EDGE_RUN = 160;
/** Art px over the ground he jumps off the stalk from. */
const HOP = 16;
/** Art px a second walking on the ground; the steps he takes after jumping off the stalk. */
const WALK = 54;
const STEPS = 48;
const SMOKE_MS = 125;
/**
 * On the stalk he holds the stem from its right, facing it (the climb sheet mirrored), so his body is on the
 * page's side and a jump to the drawer or the Register window pushes off the stem toward them: his hands
 * (mirrored, the cell's columns 23–31) round the stem's centre, his cell's left this many art px left of it.
 */
const STEM_OFFSET = SAM_CELL - CLIMB_HANDS;
/** His climbing body's columns in the mirrored cell (the climb's columns 10–37). */
const BODY_LEFT = SAM_CELL - 1 - 37;
const BODY_RIGHT = SAM_CELL - 1 - 10;
/** Gripping the drawer: its edge line in his hands, 3 art px further onto the wall than the stem sits in them. */
const EDGE_HANDS = 30;
/** His climbing body's rows over his feet (the climb cell's rows 9–52). */
const BODY_H = 44;
/** Gaps, CSS px: his body on the stalk from the screen's left edge and from the content. */
const EDGE_GAP = 8;
const CONTENT_GAP = 16;
/** The ground is his from this far (CSS px) before the page's end at the latest. */
const GROUND_SLACK = 48;
/** A click on him: a small hop. */
const CLICK_HOP = { h: 14, ms: 320 };

type Target = 'window' | 'stalk' | 'edge' | 'ground';
type Mode = Target | 'air';

interface Pose {
  x: number;
  y: number;
}

interface Geo {
  a: number;
  vw: number;
  vh: number;
  /** The Register window's title bar (his feet there) and his cell's left there, page px. */
  R: number;
  perchX: number;
  /** The line he climbs toward, px from the screen's top. */
  L: number;
  /** The footer's ground line, page px. */
  G: number;
  /** He leaves the window past scroll sA (no room left for him under the nav); the ground is his from sG. */
  sA: number;
  /** Above the window: scrolled up past sB (its title bar under LINE_LOW), he climbs up the stalk instead. */
  sB: number;
  sG: number;
  /** The stalk fits in the margin (and the page is long enough to climb). */
  wide: boolean;
  stemLeft: number;
  /** The Schedule drawer's left edge he can grip: page x, and the range his feet may be in beside it. */
  edge: { x: number; top: number; bottom: number } | null;
}

export interface JourneyOptions {
  perch: Perch;
  sheets: SamSheets;
  /** His idle on the Register window (smiling). */
  perchIdle: Strip;
  paused: () => boolean;
}

const pageRect = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { left: r.left + window.scrollX, top: r.top + window.scrollY, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY, width: r.width, height: r.height };
};

export async function startJourney(o: JourneyOptions): Promise<void> {
  if (reducedMotion.matches) return;
  const scene = queryFooterScene();
  if (!scene) return;
  const [page, art] = await Promise.all([loadPageSheets(), loadStalkArt()]);
  const { perch } = o;
  const sheets = { ...o.sheets, ...page };

  // ── The page Sam: one 60 × 60 canvas on the page, scaled up a whole number of device px per art px ──
  const el = document.createElement('div');
  el.className = 'page-sam';
  el.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.width = SAM_CELL;
  canvas.height = SAM_CELL;
  // his click target: his body only, beside his hands (columns 10–27, or 32–49 mirrored; rows 9–52), never the rest of his cell
  const hit = document.createElement('div');
  el.append(canvas, hit);
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', zIndex: '6', pointerEvents: 'none', display: 'none', willChange: 'transform' });
  Object.assign(hit.style, { position: 'absolute', left: `${(10 / 60) * 100}%`, top: `${(9 / 60) * 100}%`, width: `${(18 / 60) * 100}%`, height: `${(44 / 60) * 100}%`, pointerEvents: 'none' });
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' });
  document.body.append(el);
  const style = document.createElement('style');
  style.textContent = '.page-stalk canvas{position:absolute;left:0;top:0;image-rendering:pixelated}';
  document.head.append(style);

  let stalk: Stalk | null = null;
  let geo = measure();
  let mode: Mode = 'window';
  /** His feet's page y on the stalk or the drawer's edge (and where a jump onto either lands). */
  let y = geo.R;
  let air: { from: Pose; to: Target; y: number; t0: number; ms: number; h: number } | null = null;
  let grip = 0;
  let gripAt = -Infinity;
  /** How far his line was from where he gripped: on the wall he keeps it, moving with the page from there. */
  let gripOffset = 0;
  /** On the ground: his cell's left, where he is walking to, when he began smoking. */
  let ground = { x: 0, goal: 0, smokeAt: -1 };
  /** His dog in the field (src/game/dog.ts): woken whenever he moves, so it comes and goes with him. */
  let dog: { wake(): void } | null = null;
  let climbOdo = 0;
  let runOdo = 0;
  let lastScrollAt = -Infinity;
  let lastScrollY = window.scrollY;
  /** Where the page was when he let go of the drawer's wall: no grip again until it has moved on from there. */
  let leftWallAt = -Infinity;
  let lastNow = performance.now();
  let raf = 0;
  let restTimer = 0;
  let hopAt = -Infinity;
  let drawn = '';
  let placed = '';

  /** The stalk's place and the page's lines, for this viewport and page height. */
  function measure(): Geo {
    const dpr = window.devicePixelRatio || 1;
    const a = samK() / dpr;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const pr = pageRect(perch.root);
    const reg = document.getElementById('register');
    const L = LINE * vh;
    const G = footerGroundY(scene!);
    const sMax = Math.max(0, document.documentElement.scrollHeight - vh);
    // He leaves the window once its title bar is too near the nav for him and his bubble to stand clear of it
    // (never later than his own line on the stalk, on a screen too short for both).
    const navFoot = document.querySelector('.nav-slot')?.getBoundingClientRect().bottom ?? 0;
    const bubble = perch.root.querySelector<HTMLElement>('[data-landing-bubble]');
    // (his bubble stands 24 art px over the bar: index.astro .landing__bubble)
    const room = Math.max((SAM_CELL - FOOT_SINK) * a, bubble ? 24 * a + bubble.offsetHeight : 0);
    const sA = pr.bottom - Math.min(L, navFoot + room);
    const sB = pr.bottom - LINE_LOW * vh;
    const sG = Math.max(sA + 1, Math.min(G - vh + 32, sMax - GROUND_SLACK));
    // The stalk in the middle of the left margin: his body never nearer than EDGE_GAP to the screen's edge or
    // CONTENT_GAP to the content (the drawer, the Register window); its leaves may reach behind them.
    const content = [document.querySelector('.drawer'), reg].filter((e): e is Element => !!e).map((e) => e.getBoundingClientRect().left);
    const contentLeft = content.length ? Math.min(...content) : 0;
    const wiggle = (art.stemMax - art.stemMin) * a;
    const lo = EDGE_GAP + (STEM_OFFSET - BODY_LEFT - 0.5) * a; // his body's left, at the stem's leftmost
    const hi = contentLeft - CONTENT_GAP - wiggle - (BODY_RIGHT + 1 - STEM_OFFSET + 0.5) * a; // his body's right, at its rightmost
    const stemLeft = clamp(contentLeft / 2 - wiggle / 2, lo, Math.max(lo, hi));
    // a page too short to climb (the window and the ground nearly together) goes by the narrow rules
    const wide = hi >= lo && sG - sA > 0.5 * vh;
    let edge: Geo['edge'] = null;
    const body = document.querySelector('.drawer__body');
    const front = document.querySelector('.drawer__front');
    if (body && front) {
      const b = pageRect(body);
      // from right under the day tabs (his head at the body's top line) down to the front's top corner
      const top = b.top + (BODY_H + 2) * a;
      const bottom = pageRect(front).top - 2 * a;
      if (bottom - top > 24 * a) edge = { x: b.left, top, bottom };
    }
    return { a, vw, vh, R: pr.bottom, perchX: pr.left, L, G, sA, sB, sG, wide, stemLeft, edge };
  }

  // ── Poses: his cell's top-left, page px ──
  const stand = (x: number, feet: number): Pose => ({ x, y: feet - (SAM_CELL - FOOT_SINK) * geo.a });
  const hang = (x: number, feet: number): Pose => ({ x, y: feet - (CLIMB_FEET + 1 - FOOT_SINK) * geo.a });
  const stalkPose = (feet: number): Pose => hang(stalk ? stalk.stemX(feet - 30 * geo.a) - STEM_OFFSET * geo.a : 0, feet);
  const edgePose = (feet: number): Pose => hang((geo.edge?.x ?? 0) - EDGE_HANDS * geo.a, feet);
  const windowPose = (): Pose => stand(geo.perchX, geo.R);
  /** The ground: where he lands from the stalk (just right of the stem) and where he stops to smoke; narrow: off the left edge. */
  const groundSpot = () => {
    if (geo.wide && stalk) {
      const land = stalk.stemX(geo.G - 10 * geo.a) - 8 * geo.a;
      return { land, stop: land + STEPS * geo.a };
    }
    return { land: -SAM_CELL * geo.a, stop: Math.max(EDGE_GAP, 0.08 * geo.vw) };
  };
  const poseOf = (t: Target, feet: number): Pose =>
    t === 'window' ? windowPose() : t === 'stalk' ? stalkPose(feet) : t === 'edge' ? edgePose(feet) : stand(groundSpot().land, geo.G);

  const hopFeet = () => geo.G - HOP * geo.a;
  const windowOn = (s: number) => geo.R > s && geo.R - SAM_CELL * geo.a < s + geo.vh;
  const groundOn = (s: number) => geo.G <= s + geo.vh - 24;

  /** Where the scroll sends him. */
  function zone(s: number): Target {
    if (!geo.wide || !stalk) return !windowOn(s) && groundOn(s) ? 'ground' : 'window';
    if (!stalk.grown) return 'window';
    // each line holds him where he is until the page is SLACK past it
    const going = mode === 'air' ? air?.to : mode;
    // scrolled up past the window: up the stalk; between the two lines: on the window
    if (s < geo.sB + (going === 'window' ? -SLACK : SLACK)) return 'stalk';
    if (s < geo.sA + (going === 'window' ? SLACK : -SLACK)) return 'window';
    if (s >= geo.sG + (going === 'ground' ? -SLACK : SLACK)) return 'ground';
    return 'stalk';
  }
  /**
   * The height on the stalk he climbs toward: his line on the screen, above the window or below it, never higher
   * than his own height under the page's top nor lower than just over the ground; over the last stretch before
   * the ground zone it eases down toward the ground, so he is near it when he gets there.
   */
  const lineFeet = (s: number) => {
    const g = geo;
    const end = hopFeet();
    const drop = end - (g.sG + g.L);
    const span = Math.min(Math.max(drop, 0.3 * g.vh), g.sG - g.sA);
    const u = span > 0 ? clamp((s - (g.sG - span)) / span, 0, 1) : 0;
    return clamp(s + g.L + Math.max(0, drop) * u * u * (3 - 2 * u), SAM_CELL * g.a, end);
  };

  // ── Moves ──
  function launch(to: Target, feet: number, now: number): void {
    const from = air ? airPose(now) : currentPose();
    const end = poseOf(to, feet);
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    if (mode === 'window') setAway(perch, true);
    air = { from, to, y: feet, t0: now, ms: clamp(260 + 0.35 * dist, 260, 460), h: clamp(0.18 * Math.abs(end.x - from.x) + 14 * geo.a, 14 * geo.a, 70) };
    mode = 'air';
  }
  function airPose(now: number): Pose {
    if (!air) return currentPose();
    const u = clamp((now - air.t0) / air.ms, 0, 1);
    const end = poseOf(air.to, air.y);
    return { x: air.from.x + (end.x - air.from.x) * u, y: air.from.y + (end.y - air.from.y) * u - 4 * air.h * u * (1 - u) };
  }
  function land(): void {
    if (!air) return;
    const { to, y: feet } = air;
    air = null;
    mode = to;
    if (to === 'window') setAway(perch, false);
    else if (to === 'ground') {
      const spot = groundSpot();
      ground = { x: spot.land, goal: spot.stop, smokeAt: -1 };
    } else {
      y = feet;
      if (to === 'edge') {
        grip = feet;
        gripAt = performance.now();
        gripOffset = lineFeet(window.scrollY) - feet;
      }
    }
  }
  /** Straight there, no jump (he is off screen, or the layout changed under him). */
  function place(to: Target, feet: number, now: number): void {
    air = null;
    if (to === 'window') {
      mode = 'window';
      setAway(perch, false);
      return;
    }
    if (mode === 'window') setAway(perch, true);
    mode = to;
    y = feet;
    if (to === 'ground') {
      const spot = groundSpot();
      ground = { x: spot.stop, goal: spot.stop, smokeAt: now };
    }
  }
  function currentPose(): Pose {
    switch (mode) {
      case 'window':
        return windowPose();
      case 'stalk':
        return stalkPose(y);
      case 'edge':
        return edgePose(y);
      case 'ground':
        return stand(ground.x, geo.G);
      default:
        return airPose(performance.now());
    }
  }
  /** Climb toward `goal` at his pace, easing in at the end; the climb's frames follow (up forward, down backward). */
  function climb(goal: number, dt: number): boolean {
    const d = goal - y;
    if (Math.abs(d) < 0.25) {
      y = goal;
      return false;
    }
    const v = Math.min(CLIMB_PACE * geo.a, Math.abs(d) * 10);
    const mv = Math.sign(d) * Math.min(Math.abs(d), v * dt);
    y += mv;
    climbOdo -= Math.min(Math.abs(mv) / (CLIMB_STEP * geo.a), RUN_FPS_MAX * dt) * Math.sign(mv);
    return true;
  }
  /** Walk toward `goal` on the ground; the run's frames follow the distance. */
  function walk(goal: number, dt: number, fast: boolean): boolean {
    const d = goal - ground.x;
    if (Math.abs(d) < 0.25) {
      ground.x = goal;
      return false;
    }
    const mv = Math.sign(d) * Math.min(Math.abs(d), WALK * geo.a * (fast ? 1.8 : 1) * dt);
    ground.x += mv;
    runOdo += Math.min(Math.abs(mv) / (STRIDE * geo.a), RUN_FPS_MAX * dt);
    return true;
  }

  // ── The frame ──
  let flip = false;
  function step(now: number): boolean {
    const s = window.scrollY;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    stalk?.update();
    const z = zone(s);
    let moving = false;
    let look: { sheet: Strip; frame: number } = { sheet: sheets.climb, frame: Math.floor(climbOdo) };
    const wide = geo.wide && !!stalk;

    if (mode === 'air' && air) {
      moving = true;
      if (now - air.t0 >= air.ms) land();
    } else if (!wide) {
      // narrow: walk in from the left onto the ground, walk off to the left back to the window
      if (mode === 'window' && z === 'ground') {
        setAway(perch, true);
        mode = 'ground';
        const spot = groundSpot();
        ground = { x: spot.land, goal: spot.stop, smokeAt: -1 };
      } else if (mode === 'ground' && z === 'window') {
        if (windowOn(s)) place('window', y, now);
        else ground.goal = groundSpot().land;
      } else if (mode !== 'window' && mode !== 'ground') place(z, y, now);
      if (mode === 'ground') {
        if (z === 'ground') ground.goal = groundSpot().stop;
        moving = walk(ground.goal, dt, z !== 'ground');
      }
    } else if (mode === 'window') {
      if (z !== 'window') {
        if (windowOn(s)) launch('stalk', geo.R, now);
        else place('stalk', clamp(lineFeet(s), s - 2 * geo.a, s + geo.vh + SAM_CELL * geo.a), now);
      }
    } else if (mode === 'stalk') {
      // the page at rest with the drawer's edge near: he climbs to the nearest point of it and jumps over
      const e = geo.edge;
      const line = lineFeet(s);
      const rest = z === 'stalk' && !!e && now - lastScrollAt >= REST_MS && Math.abs(clamp(line, e.top, e.bottom) - line) <= NEAR * geo.vh && Math.abs(s - leftWallAt) >= REGRIP * geo.vh;
      const goal = z === 'window' ? geo.R : z === 'ground' ? hopFeet() : rest ? clamp(line, e!.top, e!.bottom) : line;
      moving = climb(goal, dt);
      if (!moving && z === 'window') launch('window', y, now);
      else if (!moving && z === 'ground') launch('ground', y, now);
      else if (!moving && rest) launch('edge', y, now);
    } else if (mode === 'edge') {
      // Once the page moves again: along the drawer's edge toward his line, as far as the edge (and his stretch
      // from the grip) goes, then back to the stalk.
      const e = geo.edge;
      if (!e || z !== 'stalk') {
        leftWallAt = s;
        launch('stalk', y, now);
      } else if (lastScrollAt > gripAt) {
        const lo = Math.max(e.top, grip - EDGE_RUN * geo.a);
        const hi = Math.min(e.bottom, grip + EDGE_RUN * geo.a);
        const want = lineFeet(s) - gripOffset;
        moving = climb(clamp(want, lo, hi), dt);
        const slack = EDGE_SLACK * geo.a;
        if (!moving && (want < lo - slack || want > hi + slack)) {
          leftWallAt = s;
          launch('stalk', y, now);
        }
      }
    } else if (mode === 'ground') {
      if (z === 'ground') {
        ground.goal = groundSpot().stop;
        moving = walk(ground.goal, dt, false);
      } else {
        // back up: a few steps back to the stem, then the jump onto it
        const spot = groundSpot();
        ground.goal = spot.land;
        ground.smokeAt = -1;
        moving = walk(ground.goal, dt, true);
        if (!moving) launch('stalk', hopFeet(), now);
      }
    }

    // narrow: walked off the left edge, back on the window
    if (mode === 'ground' && !wide && z === 'window' && Math.abs(ground.x - groundSpot().land) < 0.5) place('window', y, now);

    // Off screen and still on his way: just past the screen's edge, so he comes into view at his own pace.
    if (wide && mode !== 'window') {
      const p = mode === 'air' ? airPose(now) : currentPose();
      const off = p.y + SAM_CELL * geo.a < s || p.y > s + geo.vh;
      if (off) {
        if (z === 'window' && !windowOn(s)) place('window', y, now);
        else if (z === 'ground' && !groundOn(s)) place('ground', hopFeet(), now);
        else if (mode !== 'ground' || z !== 'ground') {
          const feet = mode === 'stalk' || mode === 'edge' ? y : p.y + (CLIMB_FEET + 1 - FOOT_SINK) * geo.a;
          place('stalk', clamp(feet, s - 2 * geo.a, s + geo.vh + SAM_CELL * geo.a), now);
          moving = true;
        }
      }
    }

    if (mode === 'window') {
      el.style.display = 'none';
      drawn = '';
      placed = '';
      return moving;
    }

    // how he looks
    let pose: Pose;
    if (mode === 'air' && air) {
      pose = airPose(now);
      const end = poseOf(air.to, air.y);
      flip = end.x < air.from.x;
      look = { sheet: sheets.jump, frame: 0 };
      moving = true;
    } else if (mode === 'ground') {
      pose = stand(ground.x, geo.G);
      if (Math.abs(ground.goal - ground.x) > 0.25 || moving) {
        flip = ground.goal < ground.x;
        look = { sheet: sheets.run, frame: Math.floor(runOdo) };
      } else {
        if (ground.smokeAt < 0) ground.smokeAt = now;
        flip = false;
        look = { sheet: sheets.smoke, frame: Math.floor((now - ground.smokeAt) / SMOKE_MS) };
        // smoking loops while he is on screen
        moving = moving || groundOn(s) || geo.G - SAM_CELL * geo.a < s + geo.vh;
      }
    } else {
      pose = currentPose();
      // on the stalk he faces the stem from its right; on the drawer's wall, the wall from its left
      flip = mode === 'stalk';
      look = { sheet: sheets.climb, frame: Math.floor(climbOdo) };
    }
    // a click: a small hop where he is
    let lift = 0;
    const hu = (now - hopAt) / CLICK_HOP.ms;
    if (hu >= 0 && hu < 1 && mode !== 'air') {
      lift = 4 * CLICK_HOP.h * geo.a * hu * (1 - hu);
      look = { sheet: sheets.jump, frame: 0 };
      moving = true;
    }
    const f = ((look.frame % look.sheet.frames) + look.sheet.frames) % look.sheet.frames;
    const key = `${Object.entries(sheets).find(([, v]) => v === look.sheet)?.[0]}${f}${flip ? 'f' : ''}`;
    if (key !== drawn) {
      drawn = key;
      drawCell(canvas, look.sheet, f, flip);
    }
    // on the page, at whole device px
    const dpr = window.devicePixelRatio || 1;
    const x = Math.round(pose.x * dpr) / dpr;
    const yy = Math.round((pose.y - lift) * dpr) / dpr;
    const size = SAM_CELL * geo.a;
    const where = `${x},${yy},${size}`;
    if (where !== placed) {
      placed = where;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.transform = `translate(${x}px, ${yy}px)`;
      el.style.display = '';
    }
    // he takes a click only while holding on or standing, never mid-air; on his body, mirrored with him
    hit.style.pointerEvents = mode === 'air' ? 'none' : 'auto';
    hit.style.left = `${((flip ? SAM_CELL - 28 : 10) / SAM_CELL) * 100}%`;
    return moving;
  }

  const loop = (now: number) => {
    raf = 0;
    if (o.paused()) return;
    const busy = step(now);
    dog?.wake();
    if (busy || now - lastScrollAt < 250 || (stalk && !stalk.grown)) raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (!raf && !o.paused()) {
      lastNow = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  // ── The stalk: only where the margin has room for it ──
  const syncStalk = (growing: boolean) => {
    if (geo.wide && !stalk) {
      stalk = new Stalk(art);
      document.body.append(stalk.root);
      // over the page and the hero, under the content its leaves reach (the drawer and the Register window are z 2)
      Object.assign(stalk.root.style, { position: 'absolute', top: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '1' });
      stalk.layout(geo.G, geo.stemLeft, o.paused);
      if (growing) stalk.grow(wake);
      else stalk.finishGrowth();
    } else if (!geo.wide && stalk) {
      // narrower than the stalk's room: it goes, and he is placed by the narrow rules at once
      stalk.destroy();
      stalk = null;
      const s = window.scrollY;
      const z = zone(s);
      if (mode !== 'window') place(z, y, performance.now());
    } else if (stalk) stalk.layout(geo.G, geo.stemLeft, o.paused);
  };
  const relayout = () => {
    if (raf < 0) return; // reduced motion came on: Sam is back on the Register window for good
    geo = measure();
    syncStalk(false);
    placed = '';
    drawn = '';
    // the layout moved under him: he keeps to what he was on
    if (mode === 'stalk' || mode === 'edge') {
      y = clamp(y, geo.R, hopFeet());
      if (mode === 'edge' && (!geo.edge || y < geo.edge.top || y > geo.edge.bottom)) mode = 'stalk';
    } else if (mode === 'air' && air) place(air.to, air.y, performance.now());
    else if (mode === 'ground') ground.x = ground.goal = groundSpot().stop;
    wake();
  };

  syncStalk(true);

  window.addEventListener(
    'scroll',
    () => {
      // only real movement counts as scrolling (a scroll event that leaves the page where it was does not)
      const sy = window.scrollY;
      if (Math.abs(sy - lastScrollY) < 1) return;
      lastScrollY = sy;
      lastScrollAt = performance.now();
      clearTimeout(restTimer);
      // the page at rest a moment: maybe a grip on the drawer's edge
      restTimer = window.setTimeout(wake, REST_MS + 20);
      wake();
    },
    { passive: true },
  );
  window.addEventListener('resize', relayout);
  new ResizeObserver(relayout).observe(document.body);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      stalk?.resume();
      wake();
    }
  });
  // the Register dialog (pausing everything) closed: on again
  new MutationObserver(() => {
    if (!o.paused()) {
      stalk?.resume();
      wake();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // Reduced motion switched on: the stalk goes and Sam is back on the Register window, for good.
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    stalk?.destroy();
    stalk = null;
    el.remove();
    setAway(perch, false);
    cancelAnimationFrame(raf);
    raf = -1;
  });

  // a click on him: a small hop (on the page, or on the Register window)
  hit.addEventListener('click', () => {
    if (mode === 'air') return;
    hopAt = performance.now();
    wake();
  });
  /** A hop on the Register window, fist up (the jump sheet), on a click; the perch's idle loop holds off meanwhile (is-hopping). */
  let perchHop = 0;
  const perchHops = (hops: { h: number; ms: number }[]) => {
    if (!perch.root.classList.contains('is-landed') || perch.root.classList.contains('is-away') || perchHop) return;
    perch.root.classList.add('is-hopping');
    const t0 = performance.now();
    const total = hops.reduce((t, h) => t + h.ms, 0);
    const hop = (now: number) => {
      let t = now - t0;
      if (t >= total || perch.root.classList.contains('is-away')) {
        perch.canvas.style.translate = '';
        perch.root.classList.remove('is-hopping');
        drawCell(perch.canvas, o.perchIdle, Math.floor(now / SMOKE_MS) % o.perchIdle.frames);
        perchHop = 0;
        return;
      }
      let k = 0;
      while (t >= hops[k]!.ms) t -= hops[k++]!.ms;
      const u = t / hops[k]!.ms;
      const dpr = window.devicePixelRatio || 1;
      perch.canvas.style.translate = `0 ${-Math.round(4 * hops[k]!.h * geo.a * u * (1 - u) * dpr) / dpr}px`;
      drawCell(perch.canvas, sheets.jump, 0);
      perchHop = requestAnimationFrame(hop);
    };
    perchHop = requestAnimationFrame(hop);
  };
  perch.canvas.addEventListener('click', () => perchHops([CLICK_HOP]));
  // someone registered: he jumps once on the window, fist up (perchHops does nothing while he's away)
  document.getElementById('register')?.addEventListener('register:done', () => perchHops([CLICK_HOP]));

  // the rest of the page comes alive with him: clouds drifting in, and now and then a dog visiting him in the field
  startSky(o.paused).catch((err) => console.error('[sky]', err));
  startDog({ paused: o.paused, samStop: () => groundSpot().stop, samSettled: () => mode === 'ground' && ground.smokeAt >= 0 })
    .then((d) => (dog = d))
    .catch((err) => console.error('[dog]', err));

  wake();
}
