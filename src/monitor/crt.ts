/**
 * The tube: a ShaderMaterial that shows the game frame through a CRT.
 *
 * Colour path: the frame texture is sRGB, sampled to linear, and written back through
 * `colorspace_fragment` with tone mapping off — so with every effect at zero the screen shows the
 * game's pixels exactly, which is what lets the zoom hand over to the 2D canvas without a jump.
 *
 * Effects (each one uniform, so the zoom can fade it): barrel curvature, scanlines defined in screen
 * space (they grow with the zoom, as on a real tube), corner vignette, a rolling bar, a ~4 px glow,
 * brightness; the cap's bulge lives in the vertex shader so it can flatten. Power-on is a vertical
 * opening mask plus a bright line, and the off tube is a dark grey with the glass reflection on top.
 */
import { Color, ShaderMaterial, Vector2, Vector4, type Texture } from 'three';
import { DIMS } from './build';

export interface CrtUniforms {
  uMap: { value: Texture | null };
  /** The frame's rectangle inside the texture (u0, v0, u1, v1), mapped onto the opening. */
  uFrame: { value: Vector4 };
  uBulge: { value: number };
  uBarrel: { value: number };
  uScan: { value: number };
  uScanLines: { value: number };
  uVignette: { value: number };
  uBar: { value: number };
  uGlow: { value: number };
  uGlowR: { value: Vector2 };
  uBright: { value: number };
  uOn: { value: number };
  uOpen: { value: number };
  uLine: { value: number };
  uLineH: { value: number };
  uTube: { value: Color };
  uTime: { value: number };
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
uniform float uVignette;
uniform float uBar;
uniform float uGlow;
uniform vec2 uGlowR;
uniform float uBright;
uniform float uOn;
uniform float uOpen;
uniform float uLine;
uniform float uLineH;
uniform vec3 uTube;
uniform float uTime;
varying vec2 vUv;

vec3 frame(vec2 uv) {
  return texture2D(uMap, mix(uFrame.xy, uFrame.zw, uv)).rgb;
}

void main() {
  vec2 c = vUv - 0.5;
  // Barrel: normalised so the edge midpoints stay on the opening's edges and only the corners
  // round off, as on the tube.
  vec2 uv = 0.5 + c * (1.0 + uBarrel * 4.0 * dot(c, c)) / (1.0 + uBarrel);
  vec2 e = fwidth(uv) * 1.5;
  vec2 inside = smoothstep(vec2(0.0), e, uv) * smoothstep(vec2(0.0), e, 1.0 - uv);
  float raster = inside.x * inside.y;

  vec3 col = frame(uv);
  if (uGlow > 0.0) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = 6.2831853 * float(i) / 8.0;
      g += frame(uv + vec2(cos(a), sin(a)) * uGlowR);
    }
    g /= 8.0;
    col = mix(col, g, 0.22 * uGlow) + g * 0.10 * uGlow;
  }
  // Scanlines: one dark line per period, 15 % at its darkest.
  col *= 1.0 - uScan * (0.5 + 0.5 * cos(6.2831853 * uv.y * uScanLines));
  // Vignette, darkest in the corners.
  col *= 1.0 - uVignette * pow(clamp(length(c) / 0.7071, 0.0, 1.0), 2.4);
  // Rolling bar, top to bottom once every 6 s.
  float bar = 1.0 - fract(uTime / 6.0);
  float d = abs(uv.y - bar);
  d = min(d, 1.0 - d);
  col += col * uBar * exp(-d * d / 0.0035);
  col *= uBright;

  // Power: the raster opens vertically from a line; outside it (and outside the barrel) is the tube.
  float open = 1.0 - smoothstep(uOpen * 0.5 - e.y, uOpen * 0.5 + e.y, abs(vUv.y - 0.5));
  float lit = raster * open * uOn;
  vec3 tube = uTube * (1.0 + 0.35 * (1.0 - length(c) * 1.4));
  col = mix(tube, col, lit);
  col += vec3(uLine) * (1.0 - smoothstep(0.0, uLineH, abs(vUv.y - 0.5))) * raster;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createCrtMaterial(tube: Color): ShaderMaterial & { uniforms: CrtUniforms } {
  const uniforms: CrtUniforms = {
    uMap: { value: null },
    uFrame: { value: new Vector4(0, 0, 1, 1) },
    uBulge: { value: DIMS.bulge },
    uBarrel: { value: 0.06 },
    uScan: { value: 0.15 },
    uScanLines: { value: 120 },
    uVignette: { value: 0.25 },
    uBar: { value: 0.08 },
    uGlow: { value: 1 },
    uGlowR: { value: new Vector2(0.004, 0.005) },
    uBright: { value: 1 },
    uOn: { value: 1 },
    uOpen: { value: 1 },
    uLine: { value: 0 },
    uLineH: { value: 0.004 },
    uTube: { value: tube },
    uTime: { value: 0 },
  };
  const m = new ShaderMaterial({ uniforms: uniforms as unknown as ShaderMaterial['uniforms'], vertexShader: vertex, fragmentShader: fragment, toneMapped: false });
  return m as ShaderMaterial & { uniforms: CrtUniforms };
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
