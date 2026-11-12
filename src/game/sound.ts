/**
 * The game's sound, Web Audio only. Enter, exit and static are synthesised here; the cracks and the
 * shatter are the user's files in public/sounds/, never re-encoded (two are levelled and faded here, FILE_TRIM).
 *
 * Nothing exists before unlock(), which PRESS START's click calls inside its gesture: until then every
 * call is a no-op. Every sound is a voice — its own gain into the master, which runs through a limiter —
 * and a voice lets go of its nodes once its last source has ended. The envelopes of enter and exit are
 * functions of time over the animation's own length (segments.ts PLAY), sampled into value curves, so a
 * play started part-way picks up where it is.
 *
 * Silent while the tab is hidden, under the Register dialog (hold) and with sound off (the HUD's button,
 * remembered). Reduced motion and the static page never boot the game, so never get here.
 */
import { DIVE, ENTER, PLAY, clamp01, playMs, playP } from './segments';

/** The numbers to tune by ear (/dev/sound edits them live). Levels are linear gain, times seconds. */
export const params = {
  master: 0.5,
  // enter / exit
  clickLevel: 0.22,
  clickHz: 4000,
  thumpHz: 90,
  thumpEnd: 45,
  thumpTime: 0.3,
  thumpLevel: 0.2,
  whooshLo: 250,
  whooshHi: 5000,
  whooshQ: 1.2,
  whooshLevel: 0.2,
  /** How long enter's whoosh and buzz ring on after the camera has landed, s. */
  enterTail: 0.3,
  /** Exit's own whoosh level (enter's is whooshLevel). */
  exitWhooshLevel: 0.12,
  /** How long exit's whoosh rings on after the monitor is back at rest, s. */
  exitTail: 0.3,
  buzzLo: 180,
  buzzHi: 1500,
  buzzLevel: 0.13,
  // the glass
  crackLevel: 0.7,
  /** ± share of the playback rate, picked at random for each crack. */
  crackPitch: 0.05,
  /** The cracks' pitch, semitones (the random variation is on top). */
  crackShift: -2,
  shatterLevel: 0.875,
  /** The low body under the shatter's hit (off: with it the shatter stopped sounding like glass). */
  shatterBody: 0,
  /** The shatter file's pitch, semitones (lower is also a touch longer, as a slower playback is). */
  shatterPitch: -2,
  // the monitor's power button: enter's and exit's own sound, shorter
  /** The power sounds' level next to enter and exit (1: the same). */
  powerLevel: 1,
  /** How long they ring on after the picture has opened or gone, s. */
  powerTail: 0.25,
  // static
  staticLevel: 0.22,
  humLevel: 0.25,
  crackleLevel: 0.6,
  staticHold: 1,
  staticFade: 2.5,
};
export type SoundParams = typeof params;
export const defaults: Readonly<SoundParams> = { ...params };

export const CRACK_FILES = ['crack-4', 'crack-3', 'glass-1', 'glass-3'] as const;
const FILES = [...CRACK_FILES, 'shatter'] as const;
export type FileName = (typeof FILES)[number];
/**
 * What glass-1 and glass-3 need that the other files already have, done here so the files stay as they are:
 * a gain to bring each one's loudest moment to the others' (−3.4 dBFS; theirs are −14.7 and −14.0),
 * and a fade on the end, since both stop at 486 ms while still sounding.
 */
const FILE_TRIM: Partial<Record<FileName, { db: number; fade: number }>> = {
  'glass-1': { db: 11.3, fade: 0.03 },
  'glass-3': { db: 10.6, fade: 0.03 },
};
/** A crack "cut to fit": it plays this long (s, real time) and then fades over CUT_FIT_FADE, so it ends as the next auto hit lands. */
export const CUT_FIT = 0.32;
const CUT_FIT_FADE = 0.06;
/**
 * The crack for each stage, 1–6, and whether it is cut to fit. The new crack length per stage,
 * measured on the pattern (src/monitor/breakout.ts makePattern) at five impacts across the screen:
 * 3.5 % · 5.5 % · 13 % · 13.5 % · 14.5 % · 50 % (stage 6 is the last ring, the rim and the rays' ends).
 * Set by ear (2026-11-11), picked from six files and then ordered: crack-4 (one tiny tick) starts it,
 * crack-3 (a run of ticks, the user's favourite) on 2 and 4, glass-1 (a dense, spreading crackle) on 3
 * and 6, glass-3 (spaced ticks) on 5. glass-1 and glass-3 run ~0.5 s, longer than the 380 ms between
 * auto hits, so on 3 and 5 they are cut to fit; on 6 glass-1 plays whole into the beat before the shatter.
 * crack-1 (on 2, 3 and 5 before) and a third new file, a creak, were tried and not kept; crack-2 went earlier.
 */
export const CRACK_STAGES: readonly { file: FileName; cut: boolean }[] = [
  { file: 'crack-4', cut: false },
  { file: 'crack-3', cut: false },
  { file: 'glass-1', cut: true },
  { file: 'crack-3', cut: false },
  { file: 'glass-3', cut: true },
  { file: 'glass-1', cut: false },
];
/** A crack or the shatter asked for before its file has decoded plays late if it can within this long, ms. */
const LATE_MS = 150;
/** Two cracks in one frame: the second this much later, s. */
const CRACK_GAP = 0.04;
/** Every fade that cuts a sound short, s. */
const CUT = 0.05;
const STORE_KEY = '16bc-sound';

const log: (...a: unknown[]) => void = import.meta.env.DEV ? (...a) => console.log('[sound]', ...a) : () => {};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let crackle: AudioBuffer | null = null;
const buffers = new Map<FileName, AudioBuffer | 'loading' | 'failed'>();
const pending: { name: FileName; at: number; play: (b: AudioBuffer) => void; label: string }[] = [];
const holds = new Set<string>();
let on = readEnabled();
let staticPlayed = false;
let lastCrackAt = -Infinity;
const stats = { started: 0, ended: 0 };

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    return true;
  }
}

// ── Voices ────────────────────────────────────────────────────────────────

export class Voice {
  readonly out: GainNode;
  private readonly nodes: AudioNode[] = [];
  private live = 0;
  private stopped = false;
  ended = false;

  constructor(readonly name: string) {
    this.out = ctx!.createGain();
    this.out.connect(master!);
    voices.add(this);
  }

  node<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  source<T extends AudioScheduledSourceNode>(s: T, start: number, stop: number, offset?: number): T {
    if (!this.nodes.includes(s)) this.nodes.push(s);
    this.live++;
    stats.started++;
    s.onended = () => {
      stats.ended++;
      if (--this.live > 0) return;
      for (const n of this.nodes) n.disconnect();
      this.out.disconnect();
      this.ended = true;
      voices.delete(this);
      log(`${this.name} ended (live voices: ${voices.size})`);
    };
    if (s instanceof AudioBufferSourceNode && offset !== undefined) s.start(start, offset);
    else s.start(start);
    s.stop(stop);
    return s;
  }

  /** Fade out over `fade` s and stop, never a click. */
  stop(fade = CUT): void {
    if (this.stopped || this.ended || !ctx) return;
    this.stopped = true;
    const t = ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    for (const n of this.nodes) if (n instanceof AudioScheduledSourceNode) n.stop(t + fade + 0.01);
    log(`${this.name} stopped (${Math.round(fade * 1000)} ms fade)`);
  }
}
const voices = new Set<Voice>();

// ── The context ───────────────────────────────────────────────────────────

/** Inside a user gesture: the context made (or resumed), and the files fetched once. */
export function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(limiter);
    noise = makeNoise(ctx, 2);
    crackle = makeCrackle(ctx, 3);
    document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
    if (document.hidden) hold('hidden', true);
    log(`unlocked (${ctx.sampleRate} Hz, sound ${on ? 'on' : 'off'})`);
    load();
  }
  if (ctx.state === 'suspended' && holds.size === 0) void ctx.resume();
}

function level(): number {
  return on && holds.size === 0 ? params.master : 0;
}

function setMaster(fade = 0.03): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const g = master.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(level(), t + fade);
}

/** A reason to be silent ('hidden', 'dialog'): the master fades and the context suspends until none is left. */
export function hold(reason: string, held: boolean): void {
  if (held === holds.has(reason)) return;
  if (held) holds.add(reason);
  else holds.delete(reason);
  if (!ctx) return;
  if (held) {
    // a dive or a zoom out can't wait for the tab: its animation jumps on meanwhile
    if (reason === 'hidden') for (const v of voices) if (v.name === 'enter' || v.name === 'exit') v.stop();
    // the Register dialog pauses the game: what is playing ends now (the off button's fast fade), so
    // closing it never plays the rest of a sound that belonged to the moment before
    if (reason === 'dialog') {
      for (const v of voices) v.stop();
      pending.length = 0;
    }
    setMaster();
    const c = ctx;
    // suspend once the voices' fades (CUT, 50 ms) have run, so none is left half-faded to finish on resume
    setTimeout(() => {
      if (holds.size > 0 && c.state === 'running') void c.suspend();
    }, 80);
  } else if (holds.size === 0) {
    void ctx.resume().then(() => setMaster());
  }
  log(`hold ${reason} ${held ? 'on' : 'off'} → ${holds.size ? 'silent' : 'live'}`);
}

export function enabled(): boolean {
  return on;
}

/** The HUD's button: off stops whatever plays (a fast fade) and nothing new starts; remembered. */
export function setEnabled(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(STORE_KEY, v ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts the visit */
  }
  if (!v) {
    for (const vc of voices) vc.stop();
    pending.length = 0;
  }
  setMaster();
  log(`sound ${v ? 'on' : 'off'}`);
}

/** The master's level now (the tuning page moves it). */
export function applyMaster(): void {
  setMaster(0.05);
}

/** Every voice still holding nodes (dev checks, and "stop all"). */
export function live(): { name: string }[] {
  return [...voices].map((v) => ({ name: v.name }));
}

export function stopAll(): void {
  for (const v of voices) v.stop();
}

/** Whether a sound may start now; logs why not. */
function ready(what: string): boolean {
  if (!ctx || !master) {
    log(`skipped ${what}: locked`);
    return false;
  }
  if (!on) {
    log(`skipped ${what}: off`);
    return false;
  }
  return true;
}

// ── Buffers ───────────────────────────────────────────────────────────────

function makeNoise(c: AudioContext, s: number): AudioBuffer {
  const b = c.createBuffer(1, Math.round(c.sampleRate * s), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Silence with ~20 pops a second: each 1–4 ms, decaying, its own size and sign. */
function makeCrackle(c: AudioContext, s: number): AudioBuffer {
  const sr = c.sampleRate;
  const b = c.createBuffer(1, Math.round(sr * s), sr);
  const d = b.getChannelData(0);
  const pops = Math.round(20 * s);
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(Math.random() * (d.length - sr * 0.005));
    const len = Math.floor(sr * (0.001 + Math.random() * 0.003));
    const amp = (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? -1 : 1);
    for (let i = 0; i < len; i++) d[at + i] = d[at + i]! + amp * Math.exp((-5 * i) / len) * (0.6 + 0.4 * Math.random());
  }
  return b;
}

/** The files the game uses, fetched once each at unlock. */
function load(names: readonly FileName[] = FILES): void {
  const c = ctx!;
  for (const name of names) {
    if (buffers.has(name)) continue;
    buffers.set(name, 'loading');
    fetch(`/sounds/${name}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((a) => c.decodeAudioData(a))
      .then((b) => {
        buffers.set(name, b);
        log(`decoded ${name} (${b.duration.toFixed(3)} s)`);
        flush(name, b);
      })
      .catch((err) => {
        buffers.set(name, 'failed');
        log(`failed ${name}: ${err instanceof Error ? err.message : err} — it stays silent`);
        flush(name, null);
      });
  }
}

/** A file has decoded (or failed): what waited for it plays if it is still within LATE_MS, else goes. */
function flush(name: FileName, b: AudioBuffer | null): void {
  const now = performance.now();
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]!;
    if (p.name !== name) continue;
    pending.splice(i, 1);
    const late = Math.round(now - p.at);
    if (!b) log(`${p.label} dropped: ${name} missing`);
    else if (late <= LATE_MS && on) {
      log(`${p.label} late +${late}ms`);
      p.play(b);
    } else log(`${p.label} dropped: not decoded (+${late}ms)`);
  }
}

/** Play from a file now, or as soon as it has decoded if that is within LATE_MS. */
function withFile(name: FileName, label: string, play: (b: AudioBuffer) => void): void {
  const b = buffers.get(name);
  if (b instanceof AudioBuffer) return play(b);
  if (b === 'failed' || b === undefined) {
    log(`${label} skipped: ${name} missing`);
    return;
  }
  const entry = { name, at: performance.now(), play, label };
  pending.push(entry);
  setTimeout(() => {
    const i = pending.indexOf(entry);
    if (i < 0) return;
    pending.splice(i, 1);
    log(`${label} dropped: not decoded (+${Math.round(performance.now() - entry.at)}ms)`);
  }, LATE_MS + 1);
}

// ── Building blocks ───────────────────────────────────────────────────────

/** `fn` (0–1 over [t0, t0 + dur], from u0 on) sampled every 5 ms into a value curve on `p`. */
function curve(p: AudioParam, t0: number, dur: number, fn: (u: number) => number, u0 = 0): void {
  const span = dur * (1 - u0);
  if (span <= 0.002) return;
  const n = Math.max(8, Math.ceil(span / 0.005) + 1);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = fn(u0 + ((1 - u0) * i) / (n - 1));
  p.setValueCurveAtTime(v, t0, span);
}

/** Exponential from a to b over u 0–1. */
const expo = (a: number, b: number, u: number) => a * Math.pow(b / a, Math.min(1, Math.max(0, u)));

function noiseSource(v: Voice, start: number, stop: number): AudioBufferSourceNode {
  const s = v.node(ctx!.createBufferSource());
  s.buffer = noise;
  s.loop = true;
  return v.source(s, start, stop, Math.random() * (noise!.duration - 0.1));
}

/** A sine thump falling from hz to end over `time`, its gain decaying to exactly 0. */
function thump(v: Voice, at: number, hz: number, end: number, time: number, lvl: number): void {
  if (lvl <= 0) return;
  const c = ctx!;
  const len = time * 1.5;
  const o = v.node(c.createOscillator());
  o.type = 'sine';
  o.frequency.setValueAtTime(hz, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, end), at + time);
  const g = v.node(c.createGain());
  g.gain.value = 0;
  curve(g.gain, at, len, (u) => {
    const x = u * len;
    return lvl * (x < 0.005 ? x / 0.005 : Math.pow(1 - u, 3));
  });
  o.connect(g).connect(v.out);
  v.source(o, at, at + len + 0.01);
}

/** A few ms of noise through a band-pass: the click as the dive starts. */
function click(v: Voice, at: number): void {
  const c = ctx!;
  const bp = v.node(c.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = params.clickHz;
  bp.Q.value = 2;
  const g = v.node(c.createGain());
  g.gain.value = 0;
  const len = 0.008;
  curve(g.gain, at, len, (u) => params.clickLevel * (u < 0.1 ? u / 0.1 : Math.pow(1 - u, 2)));
  const s = noiseSource(v, at, at + len + 0.005);
  s.connect(bp).connect(g).connect(v.out);
}

/**
 * The whoosh (noise through a sweeping band-pass) and the buzz under it (a 60 Hz sawtooth through a
 * low-pass opening to its peak at g and closing again), both swelling to g and gone by T.
 * `freq(u)` is the whoosh's band, u = t / T; `buzzCut(u)`, if given, replaces the buzz filter's rise and fall round g.
 */
function rush(
  v: Voice,
  t0: number,
  T: number,
  g: number,
  from: number,
  freq: (u: number) => number,
  swell: (t: number) => number,
  buzzCut?: (u: number) => number,
  whoosh = params.whooshLevel,
): void {
  const c = ctx!;
  const u0 = from / T;
  const bp = v.node(c.createBiquadFilter());
  bp.type = 'bandpass';
  bp.Q.value = params.whooshQ;
  bp.frequency.value = freq(u0);
  curve(bp.frequency, t0, T, freq, u0);
  const wg = v.node(c.createGain());
  wg.gain.value = 0;
  curve(wg.gain, t0, T, (u) => whoosh * swell(u * T), u0);
  noiseSource(v, t0, t0 + T * (1 - u0) + 0.01).connect(bp).connect(wg).connect(v.out);

  if (params.buzzLevel <= 0) return;
  const saw = v.node(c.createOscillator());
  saw.type = 'sawtooth';
  saw.frequency.value = 60;
  const lp = v.node(c.createBiquadFilter());
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  const cut = buzzCut ?? ((u: number) => {
    const t = u * T;
    return t <= g ? expo(params.buzzLo, params.buzzHi, g > 0 ? t / g : 1) : expo(params.buzzHi, params.buzzLo, (t - g) / Math.max(1e-3, T - g));
  });
  lp.frequency.value = cut(u0);
  curve(lp.frequency, t0, T, cut, u0);
  const bg = v.node(c.createGain());
  bg.gain.value = 0;
  curve(bg.gain, t0, T, (u) => params.buzzLevel * swell(u * T), u0);
  saw.connect(lp).connect(bg).connect(v.out);
  v.source(saw, t0, t0 + T * (1 - u0) + 0.01);
}

// ── The sounds ────────────────────────────────────────────────────────────

/**
 * The camera's dive into the screen: `ms` long (the camera's move, PLAY.dive from the top — the sound
 * ends as it lands, not with the world's fade after it), `fromMs` into it when the play starts part-way.
 * The whoosh peaks at `glassMs`, as the camera passes the glass (the picture nearly fills the view: the
 * monitor finds when, src/monitor/hero.ts flatP), and is gone by the landing.
 */
export function enter(ms: number, fromMs = 0, glassMs = (ms * playMs(ENTER.fillBy)) / PLAY.dive): Voice | null {
  if (!ready('enter') || ms - fromMs < 20) return null;
  // the move is ms long; the whoosh rings on past the landing (enterTail), dying away slowly
  const T = ms / 1000 + Math.max(0, params.enterTail);
  const from = Math.max(0, fromMs) / 1000;
  const g = Math.min(ms - 20, Math.max(20, glassMs)) / 1000;
  const t0 = ctx!.currentTime + 0.005;
  const v = new Voice('enter');
  if (from < 0.02) click(v, t0);
  if (from < params.thumpTime) thump(v, t0, params.thumpHz, params.thumpEnd, params.thumpTime, params.thumpLevel * (1 - from / params.thumpTime));
  // up to the glass, then a long fall that eases out (a raised cosine), never cut off
  const swell = (t: number) => (t <= g ? Math.pow(t / g, 2) : 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - g) / Math.max(1e-3, T - g)))));
  rush(v, t0, T, g, from, (u) => expo(params.whooshLo, params.whooshHi, (u * T) / g), swell);
  log(`enter ${Math.round(ms)}ms, glass at ${Math.round(g * 1000)}ms${fromMs > 0 ? `, from ${Math.round(fromMs)}ms` : ''}`);
  return v;
}

/**
 * The zoom out, `ms` long (`fromMs` into it), following the camera itself. `path(tMs)` is the enter
 * progress p the monitor shows over the move (by default Exit game's zoom: the dive backwards at PRESS
 * START's pace). The camera holds while the world fades back into the monitor, then creeps off the glass,
 * gathers speed and is fastest just before the monitor is back at rest: the whoosh's level follows the
 * camera's speed, its band the camera's distance (bright at the glass, dull at rest), and it rings on
 * for exitTail after the camera has stopped.
 */
export function exit(ms: number, fromMs = 0, path: (tMs: number) => number = (t) => playP(ms - t)): Voice | null {
  if (!ready('exit') || ms - fromMs < 20) return null;
  const move = ms / 1000;
  const tail = Math.max(0, params.exitTail);
  const T = move + tail;
  const from = Math.max(0, fromMs) / 1000;
  // the camera along the move, sampled every 5 ms: its place on the dive (1 at the glass, 0 at rest) and its speed
  const dt = 0.005;
  const n = Math.max(2, Math.ceil(move / dt) + 1);
  const cam = new Float32Array(n);
  for (let i = 0; i < n; i++) cam[i] = DIVE(clamp01(path(Math.min(ms, i * dt * 1000)) / ENTER.camera[1]));
  const speed = new Float32Array(n);
  for (let i = 1; i < n; i++) speed[i] = Math.max(0, cam[i - 1]! - cam[i]!);
  // a little smoothing, so the 5 ms steps never show
  const smooth = speed.map((_, i) => (speed[Math.max(0, i - 2)]! + speed[Math.max(0, i - 1)]! + speed[i]! + speed[Math.min(n - 1, i + 1)]! + speed[Math.min(n - 1, i + 2)]!) / 5);
  const vmax = Math.max(1e-6, ...smooth);
  const at = (arr: Float32Array, t: number) => arr[Math.min(n - 1, Math.max(0, Math.round(t / dt)))]!;
  const level = (t: number) => Math.pow(at(smooth, t) / vmax, 0.7);
  const endLevel = level(move);
  const swell = (t: number) => (t <= move ? level(t) : endLevel * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - move) / Math.max(1e-3, tail)))));
  const band = (u: number) => expo(params.whooshLo, params.whooshHi, at(cam, Math.min(move, u * T)));
  const buzzCut = (u: number) => expo(params.buzzLo, params.buzzHi, Math.min(1, swell(u * T)));
  const t0 = ctx!.currentTime + 0.005;
  const v = new Voice('exit');
  rush(v, t0, T, 0, from, band, swell, buzzCut, params.exitWhooshLevel);
  const peak = smooth.indexOf(vmax) * dt * 1000;
  log(`exit ${Math.round(ms)}ms + ${Math.round(tail * 1000)}ms tail, fastest at ${Math.round(peak)}ms${fromMs > 0 ? `, from ${Math.round(fromMs)}ms` : ''}`);
  return v;
}

/**
 * One crack, stage 1–6: its file (CRACK_STAGES, unless `file` is given), its pitch ± crackPitch, later
 * stages a touch louder. Cut to fit: only the first CUT_FIT s, faded out (from CRACK_STAGES, unless `cut` is given).
 */
export function crack(stage: number, shift?: number, file?: FileName, cut?: boolean): void {
  const label = `crack ${stage}`;
  if (!ready(label)) return;
  const entry = CRACK_STAGES[Math.min(5, Math.max(0, stage - 1))]!;
  const name = file ?? entry.file;
  cut ??= file ? false : entry.cut;
  withFile(name, label, (b) => {
    if (!ctx || !on) return;
    const at = Math.max(ctx.currentTime + 0.002, lastCrackAt + CRACK_GAP);
    lastCrackAt = at;
    const st = shift ?? params.crackShift;
    const rate = Math.pow(2, st / 12) * (1 + (Math.random() * 2 - 1) * params.crackPitch);
    const trim = FILE_TRIM[name];
    const v = new Voice(label);
    const g = v.node(ctx.createGain());
    const level = params.crackLevel * (0.82 + 0.036 * (stage - 1)) * Math.pow(10, (trim?.db ?? 0) / 20);
    const full = b.duration / rate;
    const len = cut ? Math.min(full, CUT_FIT + CUT_FIT_FADE) : full;
    const fade = cut ? CUT_FIT_FADE : (trim?.fade ?? 0);
    g.gain.value = level;
    if (fade > 0) {
      g.gain.setValueAtTime(level, at + len - fade);
      g.gain.linearRampToValueAtTime(0, at + len);
    }
    const s = v.node(ctx.createBufferSource());
    s.buffer = b;
    s.playbackRate.value = rate;
    s.connect(g).connect(v.out);
    v.source(s, at, at + len + 0.02);
    log(`${label} ${name}${st ? ` ${st > 0 ? '+' : ''}${st} st` : ''} rate ${rate.toFixed(3)}${trim ? ` +${trim.db} dB` : ''}${cut ? `, cut to ${Math.round(len * 1000)}ms` : ''}`);
  });
}

/** The glass breaking: once, a little louder than the cracks. */
export function shatter(pitch = params.shatterPitch, bodyLevel = params.shatterBody): void {
  if (!ready('shatter')) return;
  withFile('shatter', 'shatter', (b) => {
    if (!ctx || !on) return;
    const at = ctx.currentTime + 0.002;
    const v = new Voice('shatter');
    const g = v.node(ctx.createGain());
    g.gain.value = params.shatterLevel;
    const s = v.node(ctx.createBufferSource());
    s.buffer = b;
    const rate = Math.pow(2, pitch / 12);
    s.playbackRate.value = rate;
    s.connect(g).connect(v.out);
    v.source(s, at, at + b.duration / rate + 0.02);
    body(v, at, bodyLevel);
    log(`shatter${pitch ? ` ${pitch > 0 ? '+' : ''}${pitch} st` : ''}${bodyLevel > 0 ? ` + body ${bodyLevel}` : ''}`);
  });
}

/**
 * Weight under the glass breaking: a burst of low rumble (noise below ~300 Hz) and a soft low tone
 * falling 75 → 40 Hz, both gone in ~0.35 s, so it sits inside the hit rather than reading as a thump.
 */
function body(v: Voice, at: number, lvl: number): void {
  if (lvl <= 0 || !ctx) return;
  const len = 0.35;
  const lp = v.node(ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  lp.Q.value = 0.7;
  const g = v.node(ctx.createGain());
  g.gain.value = 0;
  curve(g.gain, at, len, (u) => lvl * (u * len < 0.004 ? (u * len) / 0.004 : Math.pow(1 - u, 3)));
  noiseSource(v, at, at + len + 0.01).connect(lp).connect(g).connect(v.out);
  thump(v, at, 75, 40, 0.25, lvl * 0.6);
}

/** The static's envelope: in over 30 ms, held staticHold, faded to exactly 0 over staticFade. */
function staticEnvelope(name: string, level: number) {
  const c = ctx!;
  const t0 = c.currentTime + 0.005;
  const rise = 0.03;
  const end = t0 + rise + params.staticHold + params.staticFade;
  const v = new Voice(name);
  const env = v.node(c.createGain());
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(level, t0 + rise);
  env.gain.setValueAtTime(level, t0 + rise + params.staticHold);
  env.gain.linearRampToValueAtTime(0, end);
  env.connect(v.out);
  return { c, v, env, t0, end, stop: end + 0.05 };
}

/** The broken tube's static, under the shatter, once per visit: it holds, fades to exactly 0 and stops. */
export function playStatic(force = false): Voice | null {
  if (staticPlayed && !force) {
    log('static skipped: already played');
    return null;
  }
  if (!ready('static')) return null;
  staticPlayed = true;
  return staticSynth();
}

/** Hiss (noise round 4 kHz), a quiet 60 Hz hum with a few harmonics and sparse crackle. */
function staticSynth(): Voice {
  const { c, v, env, t0, end, stop } = staticEnvelope('static', params.staticLevel);

  const bp = v.node(c.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 4000;
  bp.Q.value = 0.7;
  noiseSource(v, t0, stop).connect(bp).connect(env);

  const hum = v.node(c.createGain());
  hum.gain.value = params.humLevel;
  hum.connect(env);
  [1, 0.5, 0.25, 0.12].forEach((lvl, i) => {
    const o = v.node(c.createOscillator());
    o.frequency.value = 60 * (i + 1);
    const g = v.node(c.createGain());
    g.gain.value = lvl * 0.5;
    o.connect(g).connect(hum);
    v.source(o, t0, stop);
  });

  const cr = v.node(c.createBufferSource());
  cr.buffer = crackle;
  cr.loop = true;
  const cg = v.node(c.createGain());
  cg.gain.value = params.crackleLevel;
  cr.connect(cg).connect(env);
  v.source(cr, t0, stop, Math.random() * 2);

  log(`static: hold ${params.staticHold}s, fade ${params.staticFade}s → gain 0 at +${(end - t0).toFixed(2)}s`);
  if (import.meta.env.DEV) watchGain(env, t0, end, v);
  return v;
}
export { playStatic as static };

// ── The power button ──────────────────────────────────────────────────────

/**
 * The picture's own timing (src/monitor/hero.ts POWER), s: on, the line grows (0.17), brightens (0.04)
 * and the picture opens from it (0.17); off runs that backwards — the picture squashes into the line,
 * the line dims, then shrinks to a point (0.38 in all).
 */
const POWER_T = { grow: 0.17, brighten: 0.04, open: 0.17 } as const;
const POWER_ALL = POWER_T.grow + POWER_T.brighten + POWER_T.open;
let powerVoice: Voice | null = null;

/**
 * The monitor switched on (dir 1) or off (−1) by its power button — only ever on a click, never the
 * power-on at load. A new press ends the last one's sound; switching off also ends the broken tube's
 * static, as its picture squashes into the line.
 */
export function power(dir: 1 | -1): Voice | null {
  const what = dir > 0 ? 'power on' : 'power off';
  if (!ready(what)) return null;
  const c = ctx!;
  powerVoice?.stop();
  if (dir < 0) for (const v of voices) if (v.name === 'static') v.stop(POWER_T.open);
  const v = new Voice(what);
  powerVoice = v;
  v.out.gain.value = params.powerLevel;
  const at = c.currentTime + 0.005;
  const end = dir > 0 ? powerOn(v, at) : powerOff(v, at);
  log(`${what}, ${Math.round((end - at) * 1000)}ms`);
  return v;
}

/**
 * On: a short enter — the click, the quiet thump and the whoosh with the buzz under it, rising to its
 * peak as the picture has opened (its band climbing with it) and falling away over powerTail. Returns the end.
 */
function powerOn(v: Voice, at: number): number {
  const p = params;
  const g = POWER_ALL;
  const T = g + Math.max(0, p.powerTail);
  click(v, at);
  thump(v, at, p.thumpHz, p.thumpEnd, p.thumpTime, p.thumpLevel);
  // as enter: up to the peak, then a long fall that eases out (a raised cosine)
  const swell = (t: number) => (t <= g ? Math.pow(t / g, 2) : 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - g) / Math.max(1e-3, T - g)))));
  rush(v, at, T, g, 0, (u) => expo(p.whooshLo, p.whooshHi, (u * T) / g), swell);
  return at + T;
}

/**
 * Off: a short exit — no click or thump, the whoosh and the buzz following the picture as it goes: at
 * their loudest and brightest as it starts to squash (it moves fastest then), dulling and dying as the
 * line shrinks to a point, then ringing on over powerTail. Returns the end.
 */
function powerOff(v: Voice, at: number): number {
  const p = params;
  const move = POWER_ALL;
  const T = move + Math.max(0, p.powerTail);
  const peak = 0.03;
  // in fast, then down with the picture (most of the way by the line), then the tail's raised cosine
  const level = (t: number) => (t < peak ? t / peak : Math.pow(1 - ((t - peak) / (move - peak)) * 0.85, 2));
  const endLevel = level(move);
  const swell = (t: number) => (t <= move ? level(t) : endLevel * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - move) / Math.max(1e-3, T - move)))));
  const band = (u: number) => expo(p.whooshLo, p.whooshHi, 1 - Math.min(1, (u * T) / move));
  const buzzCut = (u: number) => expo(p.buzzLo, p.buzzHi, Math.min(1, swell(u * T)));
  rush(v, at, T, 0, 0, band, swell, buzzCut, p.exitWhooshLevel);
  return at + T;
}

/** Dev only: the static's envelope read back as it runs, until it is 0 and its nodes have ended. */
function watchGain(env: GainNode, t0: number, end: number, v: Voice): void {
  const id = setInterval(() => {
    if (!ctx) return clearInterval(id);
    const t = ctx.currentTime;
    if (t >= end && env.gain.value === 0) {
      log(`static gain 0 @ ${(t - t0).toFixed(2)}s`);
      clearInterval(id);
    } else if (v.ended) clearInterval(id);
  }, 100);
}

/** Dev checks (__sound): the context, the counts, the voices. */
export function debug() {
  return { state: ctx?.state ?? null, on, holds: [...holds], live: live(), stats: { ...stats }, files: Object.fromEntries([...buffers].map(([k, b]) => [k, b instanceof AudioBuffer ? 'ready' : b])), staticPlayed };
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __sound: unknown }).__sound = { debug, params, live, stopAll };
