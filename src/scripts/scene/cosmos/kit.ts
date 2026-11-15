import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  ShaderMaterial,
  type Color,
} from 'three';
import { emit, type Shared } from './shared';

/**
 * What the drifting bodies are made of: faces of thin glass, one-pixel lines and small round
 * dots. All three only add light, so a body never hides what is behind it, and all three are
 * scaled by the `fade` of their body.
 */
export interface Fade {
  value: number;
}

const bodyVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/*
 * Glass: nearly nothing face-on, brighter where a face turns away from the camera, a little
 * light on the faces that look towards the light, and a glint when one mirrors it.
 */
const glassFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uGlint;
  uniform vec3 uLight;
  uniform float uFade;
  varying vec3 vN;
  varying vec3 vV;
  ${emit}
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    if (dot(n, v) < 0.0) n = -n; // both sides of a face are seen
    float edge = pow(1.0 - dot(n, v), 3.0);
    float lit = max(dot(n, uLight), 0.0);
    float glint = pow(max(dot(n, normalize(uLight + v)), 0.0), 48.0);
    vec3 col = uTint * (0.012 + 0.2 * edge + 0.05 * lit) + uGlint * glint * 0.2;
    gl_FragColor = vec4(emit(col * uFade), 1.0);
    #include <colorspace_fragment>
  }
`;

const lineVertex = /* glsl */ `
  #ifdef VERTEX_COLOR
    attribute vec3 aColor;
    varying vec3 vColor;
  #endif
  void main() {
    #ifdef VERTEX_COLOR
      vColor = aColor;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  #ifdef VERTEX_COLOR
    varying vec3 vColor;
  #endif
  ${emit}
  void main() {
    vec3 col = uColor;
    #ifdef VERTEX_COLOR
      col *= vColor;
    #endif
    gl_FragColor = vec4(emit(col * uFade), 1.0);
    #include <colorspace_fragment>
  }
`;

const dotVertex = /* glsl */ `
  uniform float uSize;
  uniform float uPx;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(uSize * uPx, 2.0);
  }
`;

const dotFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  ${emit}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    gl_FragColor = vec4(emit(uColor * uFade * exp(-dot(c, c) * 3.5)), 1.0);
    #include <colorspace_fragment>
  }
`;

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const;

export function glassMaterial(shared: Shared, fade: Fade, tint: Color, glint: Color): ShaderMaterial {
  return new ShaderMaterial({
    ...additive,
    vertexShader: bodyVertex,
    fragmentShader: glassFragment,
    side: DoubleSide,
    uniforms: { uTint: { value: tint }, uGlint: { value: glint }, uLight: shared.uLight, uFade: fade, uGain: shared.uGain },
  });
}

/** `vertexColors`: the geometry has an `aColor` attribute that the colour is multiplied by. */
export function lineMaterial(shared: Shared, fade: Fade, color: Color, vertexColors = false): ShaderMaterial {
  return new ShaderMaterial({
    ...additive,
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    defines: vertexColors ? { VERTEX_COLOR: '' } : {},
    uniforms: { uColor: { value: color }, uFade: fade, uGain: shared.uGain },
  });
}

/** `size`: diameter of the soft dot in CSS pixels. */
export function dotMaterial(shared: Shared, fade: Fade, color: Color, size: number): ShaderMaterial {
  return new ShaderMaterial({
    ...additive,
    vertexShader: dotVertex,
    fragmentShader: dotFragment,
    uniforms: { uColor: { value: color }, uSize: { value: size }, uPx: shared.uPx, uFade: fade, uGain: shared.uGain },
  });
}

/** The distinct points of a line geometry: the corners of a solid, from its edges. */
export function corners(lines: BufferGeometry): BufferGeometry {
  const from = lines.getAttribute('position');
  const seen = new Set<string>();
  const points: number[] = [];
  for (let i = 0; i < from.count; i++) {
    const p = [from.getX(i), from.getY(i), from.getZ(i)];
    const key = p.map((v) => v.toFixed(3)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(...p);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  return g;
}

/**
 * Circles around the y axis as line segments, one per entry; each can have its own strength,
 * which goes into the `aColor` attribute (use with `lineMaterial(…, true)`).
 */
export function circles(rings: { radius: number; strength?: number; y?: number }[], steps = 128): BufferGeometry {
  const points: number[] = [];
  const colors: number[] = [];
  for (const { radius, strength = 1, y = 0 } of rings) {
    for (let i = 0; i < steps; i++) {
      for (const k of [i, i + 1]) {
        const a = (k / steps) * Math.PI * 2;
        points.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
        colors.push(strength, strength, strength);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  g.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  return g;
}
