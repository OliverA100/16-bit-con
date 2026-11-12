/**
 * The tube: a ShaderMaterial that shows the game frame through a vintage CRT.
 *
 * Colour path: the frame texture is sRGB, sampled to linear, and written back through
 * `colorspace_fragment` with tone mapping off — so with every effect at zero the screen shows the
 * game's pixels exactly, which is what lets the zoom hand over to the 2D canvas without a jump.
 *
 * The effects work in linear light, where a darkening reads about half as strong as its number
 * (×0.85 linear is ×0.93 on screen), so their rest values (CRT_REST) are set by what the eye sees at
 * the monitor's resting size. Each is one uniform, so the zoom can fade it to zero:
 *  - uBarrel  tube curvature (and uBulge, the cap's bulge, in the vertex shader)
 *  - uScan    the dark gaps between the beam's lines, uScanLines of them, in screen space
 *  - uMask    an aperture-grille phosphor mask, uMaskCols RGB triads across
 *  - uAberr   convergence error: red and blue drift apart, more toward the sides
 *  - uGlow    phosphor bloom, an 8-tap ring uGlowR wide
 *  - uVignette  the corners fall off, and a shadow runs round the inside of the tube's edge
 *  - uBar, uHum  the hum bar rolling down once every 6 s, brighter, nudging the lines it crosses sideways
 *  - uNoise   fine grain, 24 times a second
 *  - uGrade   phosphor colour: a little desaturated and warm, the blacks lifted off pure black
 *  - uBright  brightness (the scanlines and the mask take light away; this gives some back)
 *  - uStatic  a broken tube (the breakout): an untuned set's snow where the picture was, through the
 *             tube's whole look (curvature, bloom, phosphor colour, scanlines, vignette, hum bar) —
 *             soft grain smeared along each line, every line a little brighter or darker; a fresh field
 *             every 1/uStaticRate s, held, then snapping to the next (hashed from its cell and the
 *             frame's index, nothing added to the coordinates: nothing slides)
 * Power-on: a bright line grows from the centre to the full width (uLine, uLineW), then the raster
 * opens vertically from it (uOn, uOpen); the off tube is a dark grey under the glass. Switch-off: the
 * picture squashes vertically into the line (uSquash: the image scaled toward the centre line, brighter
 * as it gathers), then the line shrinks to a point.
 */
import { Color, ShaderMaterial, Vector2, Vector4, type Texture } from 'three';
import { DIMS } from './spec';

/** The effects at rest. The sizes measured in device px of the screen at rest are set by tuneAtRest(). */
export const CRT_REST = {
  barrel: 0.09,
  scan: 0.55,
  mask: 0,
  glow: 1,
  vignette: 0.7,
  bar: 0.22,
  hum: 0.0025,
  noise: 0.09,
  grade: 1,
  bright: 1.15,
} as const;

export interface CrtUniforms {
  uMap: { value: Texture | null };
  /** The frame's rectangle inside the texture (u0, v0, u1, v1), mapped onto the opening. */
  uFrame: { value: Vector4 };
  uBulge: { value: number };
  uBarrel: { value: number };
  uScan: { value: number };
  uScanLines: { value: number };
  uMask: { value: number };
  uMaskCols: { value: number };
  uAberr: { value: number };
  uGlow: { value: number };
  uGlowR: { value: Vector2 };
  uVignette: { value: number };
  uBar: { value: number };
  uHum: { value: number };
  uNoise: { value: number };
  uGrade: { value: number };
  uBright: { value: number };
  uStatic: { value: number };
  /** Static frames a second (0: one frame, held — reduced motion). */
  uStaticRate: { value: number };
  /** The static's cells across and down the screen: 2 device px each at rest, fixed through the zoom and the landing. */
  uStaticCells: { value: Vector2 };
  uOn: { value: number };
  uOpen: { value: number };
  /** Switching off: the picture's height, 1 (whole) to the line's, squashed toward the centre line. */
  uSquash: { value: number };
  uLine: { value: number };
  /** How much of the screen's width the power-on line spans, 0 (a point at the centre) to 1. */
  uLineW: { value: number };
  uLineH: { value: number };
  uTube: { value: Color };
  uTime: { value: number };
  /** The screen at rest in device px (the grain's cell). */
  uRes: { value: Vector2 };
}

const vertex = /* glsl */ `
uniform float uBulge;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec2 c = clamp(uv, 0.0, 1.0) * 2.0 - 1.0;
  vec3 p = position;
  p.z += uBulge * (1.0 - c.x * c.x) * (1.0 - c.y * c.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uFrame;
uniform float uBarrel;
uniform float uScan;
uniform float uScanLines;
uniform float uMask;
uniform float uMaskCols;
uniform float uAberr;
uniform float uGlow;
uniform vec2 uGlowR;
uniform float uVignette;
uniform float uBar;
uniform float uHum;
uniform float uNoise;
uniform float uGrade;
uniform float uBright;
uniform float uStatic;
uniform float uStaticRate;
uniform vec2 uStaticCells;
uniform float uOn;
uniform float uOpen;
uniform float uSquash;
uniform float uLine;
uniform float uLineW;
uniform float uLineH;
uniform vec3 uTube;
uniform float uTime;
uniform vec2 uRes;
varying vec2 vUv;

vec3 frame(vec2 uv) {
  return texture2D(uMap, mix(uFrame.xy, uFrame.zw, uv)).rgb;
}

// An integer hash (PCG3D, Jarzynski & Olano 2020): every (cell, frame) its own value, unrelated to its
// neighbours in space or in time, at any frame index.
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float rand(uvec2 cell, uint frame, uint k) {
  return float(pcg3d(uvec3(cell, frame * 4u + k)).x >> 8u) / 16777216.0;
}

// An untuned set's snow at screen UV (the tube's own, curved): grains twice as wide as tall (the beam
// smears them along its line), blended softly from one to the next along the line; every line a touch
// brighter or darker than its neighbours, now and then a bright streak. One frame of it per
// 1/uStaticRate s, held — each frame its own field, hashed from the cell and the frame's index.
float snow(vec2 uv) {
  uint frame = uint(floor(uTime * uStaticRate));
  vec2 g = clamp(uv, 0.0, 1.0) * uStaticCells * vec2(0.5, 1.0);
  uvec2 c = uvec2(g);
  float f = smoothstep(0.0, 1.0, fract(g.x));
  float n = mix(rand(c, frame, 0u), rand(c + uvec2(1u, 0u), frame, 0u), f);
  float fine = rand(uvec2(g * vec2(2.0, 1.0)), frame, 1u);
  n = mix(n, fine, 0.35);
  float line = rand(uvec2(0u, c.y), frame, 2u);
  float streak = step(0.985, rand(uvec2(1u, c.y), frame, 3u));
  float v = n * n * (0.75 + 0.5 * line) + 0.5 * streak * n;
  return 0.04 + 0.9 * v;
}

void main() {
  vec2 c = vUv - 0.5;
  // Barrel: normalised so the edge midpoints stay on the opening's edges and only the corners
  // round off, as on the tube.
  vec2 uv = 0.5 + c * (1.0 + uBarrel * 4.0 * dot(c, c)) / (1.0 + uBarrel);
  vec2 e = fwidth(uv) * 1.5;
  vec2 inside = smoothstep(vec2(0.0), e, uv) * smoothstep(vec2(0.0), e, 1.0 - uv);
  float raster = inside.x * inside.y;
  // switching off, the picture squashes toward the centre line (the raster's height collapses); the
  // scanlines stay where they are on the glass, so no moiré as it squashes
  float scanY = uv.y;
  if (uSquash < 1.0) uv.y = 0.5 + (uv.y - 0.5) / max(uSquash, 0.002);

  // The hum bar rolls down once every 6 s; the lines it crosses slip sideways a touch.
  float bar = 1.0 - fract(uTime / 6.0);
  float d = abs(uv.y - bar);
  d = min(d, 1.0 - d);
  float hum = exp(-d * d / 0.004);
  uv.x += uHum * hum * sin(uv.y * 260.0 + uTime * 11.0);

  // Convergence: red and blue drift apart, more toward the sides.
  vec3 col;
  if (uAberr > 0.0) {
    vec2 ab = vec2(uAberr * (0.4 + 2.2 * abs(c.x)), 0.0);
    col = vec3(frame(uv + ab).r, frame(uv).g, frame(uv - ab).b);
  } else col = frame(uv);

  // Phosphor bloom.
  if (uGlow > 0.0) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = 6.2831853 * float(i) / 8.0;
      g += frame(uv + vec2(cos(a), sin(a)) * uGlowR);
    }
    g /= 8.0;
    col = mix(col, g, 0.35 * uGlow) + g * 0.08 * uGlow;
  }

  // A broken tube: the snow of an untuned set where the picture was, before the tube's look goes over it.
  if (uStatic > 0.0) col = mix(col, vec3(snow(uv)), uStatic);

  // Phosphor colour: greyer, warm.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, mix(vec3(luma), col, 0.78) * vec3(1.05, 1.0, 0.86), uGrade);

  // Scanlines: a narrow dark gap between the beam's lines.
  float gap = 0.5 + 0.5 * cos(6.2831853 * scanY * uScanLines);
  col *= 1.0 - uScan * gap * gap;

  // Aperture grille: each column of a triad favours one phosphor (off at rest: it reads as a screen door at this size).
  if (uMask > 0.0) {
    float m = 6.2831853 * uv.x * uMaskCols;
    vec3 mask = 0.5 + 0.5 * cos(vec3(m, m - 2.0943951, m - 4.1887902));
    col *= 1.0 - uMask * (1.0 - mask);
  }

  // Vignette: the corners fall off, and a shadow runs round the inside of the tube's edge.
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  col *= 1.0 - uVignette * (0.55 * pow(clamp(length(c) / 0.7071, 0.0, 1.0), 2.6) + 0.5 * (1.0 - smoothstep(0.0, 0.14, edge)));
  // The hum bar's light, brightness, grain.
  col += col * uBar * hum;
  col *= uBright;
  // …and brightens as its light gathers into the line
  col *= 1.0 + 0.8 * (1.0 - uSquash);
  // (a fresh grain 24 times a second, hashed from the pixel and the frame's index: it flickers in place, never crawls)
  col *= 1.0 + uNoise * (rand(uvec2(clamp(vUv, 0.0, 1.0) * uRes), uint(floor(uTime * 24.0)), 5u) - 0.5);
  // The black level: phosphor glass is never quite black.
  col += uGrade * 0.006 * (1.0 - col);

  // Power: the raster opens vertically from the line; outside it (and outside the barrel) is the tube.
  float open = 1.0 - smoothstep(uOpen * 0.5 - e.y, uOpen * 0.5 + e.y, abs(vUv.y - 0.5));
  float lit = raster * open * uOn;
  // the off tube: dark and nearly even (a strong centre glow read as a plastic dome)
  vec3 tube = uTube * (1.0 + 0.1 * (1.0 - length(c) * 1.4));
  col = mix(tube, col, lit);
  // The power-on line: a hard core with a soft halo, grown out from the centre to uLineW of the width.
  float ly = abs(vUv.y - 0.5);
  float lx = 1.0 - smoothstep(uLineW * 0.5 - e.x * 2.0, uLineW * 0.5 + e.x * 2.0, abs(vUv.x - 0.5));
  col += vec3(uLine) * ((1.0 - smoothstep(0.0, uLineH, ly)) + 0.35 * exp(-ly * ly / (16.0 * uLineH * uLineH))) * lx * raster;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export type CrtMaterial = ShaderMaterial & { uniforms: CrtUniforms };

export function createCrtMaterial(tube: Color): CrtMaterial {
  const uniforms: CrtUniforms = {
    uMap: { value: null },
    uFrame: { value: new Vector4(0, 0, 1, 1) },
    uBulge: { value: DIMS.bulge },
    uBarrel: { value: CRT_REST.barrel },
    uScan: { value: CRT_REST.scan },
    uScanLines: { value: 120 },
    uMask: { value: CRT_REST.mask },
    uMaskCols: { value: 140 },
    uAberr: { value: 0.003 },
    uGlow: { value: CRT_REST.glow },
    uGlowR: { value: new Vector2(0.006, 0.007) },
    uVignette: { value: CRT_REST.vignette },
    uBar: { value: CRT_REST.bar },
    uHum: { value: CRT_REST.hum },
    uNoise: { value: CRT_REST.noise },
    uGrade: { value: CRT_REST.grade },
    uBright: { value: CRT_REST.bright },
    uStatic: { value: 0 },
    uStaticRate: { value: STATIC_RATE },
    uStaticCells: { value: new Vector2(210, 170) },
    uOn: { value: 1 },
    uOpen: { value: 1 },
    uSquash: { value: 1 },
    uLine: { value: 0 },
    uLineW: { value: 1 },
    uLineH: { value: 0.006 },
    uTube: { value: tube },
    uTime: { value: 0 },
    uRes: { value: new Vector2(420, 340) },
  };
  const m = new ShaderMaterial({
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: false,
  });
  return m as CrtMaterial;
}

/** The broken tube's static: a new frame this many times a second (each held ~1/18 s, as an untuned set snaps). */
export const STATIC_RATE = 18;

/** One scanline every this many device px of the screen at rest (about 4 reads as a tube of this size). */
export const SCAN_PX = 4;

/**
 * The sizes set in device px of the screen at rest (w × h device px): a dark gap every 4 px, an
 * RGB triad every 3 px and the static's 2 px cells — counts across the tube, so they grow with the zoom as a real tube's would
 * (a tube's lines grow the same way) — and the sizes tuneOnScreen holds.
 */
export function tuneAtRest(crt: CrtMaterial, w: number, h: number): void {
  const u = crt.uniforms;
  u.uScanLines.value = h / SCAN_PX;
  u.uMaskCols.value = w / 3;
  u.uStaticCells.value.set(Math.round(w / 2), Math.round(h / 2));
  tuneOnScreen(crt, w, h);
}

/** Red and blue this far apart at the centre at rest, px, and at most this far apart on the page as the screen grows. */
const ABERR_PX = 1.2;
const ABERR_MAX_PX = 3;

/**
 * A ~6 px bloom and a 1 px grain, for a screen now w × h px (px of the canvas at rest; restW its width
 * at rest). Called through the zoom with the screen's size on the page, these keep their size on the
 * page — grown with the tube, the 8-tap bloom would ghost — while the convergence error grows with
 * the tube as a real tube does, up to ABERR_MAX_PX on the page.
 */
export function tuneOnScreen(crt: CrtMaterial, w: number, h: number, restW = w): void {
  const u = crt.uniforms;
  u.uGlowR.value.set(6 / w, 6 / h);
  u.uAberr.value = Math.min(ABERR_PX / restW, ABERR_MAX_PX / w);
  u.uRes.value.set(w, h);
}

/**
 * Fit a frame of aspect `frameAspect` into the opening (aspect DIMS.opening.w / h) by covering it,
 * centred: returns the texture rectangle to show.
 */
export function coverRect(frameAspect: number): Vector4 {
  const screen = DIMS.opening.w / DIMS.opening.h;
  if (frameAspect > screen) {
    const w = screen / frameAspect;
    return new Vector4((1 - w) / 2, 0, (1 + w) / 2, 1);
  }
  const h = frameAspect / screen;
  return new Vector4(0, (1 - h) / 2, 1, (1 + h) / 2);
}
