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
 *  - uStatic  a broken tube (the breakout): static where the picture was, under the same scanlines
 * Power-on: a bright line grows from the centre to the full width (uLine, uLineW), then the raster
 * opens vertically from it (uOn, uOpen); the off tube is a dark grey under the glass.
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
  uOn: { value: number };
  uOpen: { value: number };
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
uniform float uOn;
uniform float uOpen;
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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 c = vUv - 0.5;
  // Barrel: normalised so the edge midpoints stay on the opening's edges and only the corners
  // round off, as on the tube.
  vec2 uv = 0.5 + c * (1.0 + uBarrel * 4.0 * dot(c, c)) / (1.0 + uBarrel);
  vec2 e = fwidth(uv) * 1.5;
  vec2 inside = smoothstep(vec2(0.0), e, uv) * smoothstep(vec2(0.0), e, 1.0 - uv);
  float raster = inside.x * inside.y;

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

  // Phosphor colour: greyer, warm.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, mix(vec3(luma), col, 0.78) * vec3(1.05, 1.0, 0.86), uGrade);

  // Scanlines: a narrow dark gap between the beam's lines.
  float gap = 0.5 + 0.5 * cos(6.2831853 * uv.y * uScanLines);
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
  col *= 1.0 + uNoise * (hash(floor(vUv * uRes) + floor(uTime * 24.0)) - 0.5);
  // A broken tube: static where the picture was, in 2 px cells 30 times a second, under the scanlines.
  if (uStatic > 0.0) {
    float n = hash(floor(vUv * uRes * 0.5) + vec2(floor(uTime * 30.0) * 7.0, 0.0));
    col = mix(col, vec3(0.06 + 0.8 * n * n) * (1.0 - uScan * gap * gap), uStatic);
  }
  // The black level: phosphor glass is never quite black.
  col += uGrade * 0.006 * (1.0 - col);

  // Power: the raster opens vertically from the line; outside it (and outside the barrel) is the tube.
  float open = 1.0 - smoothstep(uOpen * 0.5 - e.y, uOpen * 0.5 + e.y, abs(vUv.y - 0.5));
  float lit = raster * open * uOn;
  vec3 tube = uTube * (1.0 + 0.35 * (1.0 - length(c) * 1.4));
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
    uOn: { value: 1 },
    uOpen: { value: 1 },
    uLine: { value: 0 },
    uLineW: { value: 1 },
    uLineH: { value: 0.006 },
    uTube: { value: tube },
    uTime: { value: 0 },
    uRes: { value: new Vector2(420, 340) },
  };
  const m = new ShaderMaterial({ uniforms: uniforms as unknown as ShaderMaterial['uniforms'], vertexShader: vertex, fragmentShader: fragment, toneMapped: false });
  return m as CrtMaterial;
}


/** One scanline every this many device px of the screen at rest (the reference shows about 4). */
export const SCAN_PX = 4;

/**
 * The sizes set in device px of the screen at rest (w × h device px): a dark gap every 4 px and an
 * RGB triad every 3 px — counts across the tube, so they grow with the zoom as a real tube's would
 * (the reference's lines grow the same way) — and the sizes tuneOnScreen holds.
 */
export function tuneAtRest(crt: CrtMaterial, w: number, h: number): void {
  const u = crt.uniforms;
  u.uScanLines.value = h / SCAN_PX;
  u.uMaskCols.value = w / 3;
  tuneOnScreen(crt, w, h);
}

/** Red and blue this far apart at the centre at rest, px, and at most this far apart on the page as the screen grows. */
const ABERR_PX = 1.2;
const ABERR_MAX_PX = 3;

/**
 * A ~6 px bloom and a 1 px grain, for a screen now w × h px (px of the canvas at rest; restW its width
 * at rest). Called through the zoom with the screen's size on the page, these keep their size on the
 * page — grown with the tube, the 8-tap bloom would ghost — while the convergence error grows with
 * the tube as the reference's does, up to ABERR_MAX_PX on the page.
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
