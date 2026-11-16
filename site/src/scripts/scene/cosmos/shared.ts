import type { Object3D, Vector2, Vector3 } from 'three';

/** Vertical field of view of the background camera, in degrees. */
export const FOV = 45;
/** Half the height of the view at depth 1; times a depth, half the height of the view there. */
export const HALF_VIEW = Math.tan((FOV * Math.PI) / 360);

/**
 * Uniforms that every part of the background reads. The objects are shared, not copied, so one
 * write per frame reaches all the materials.
 */
export interface Shared {
  uTime: { value: number };
  /** where the camera is in the field, in world units; the field moves past, the camera stays */
  uTravel: { value: Vector2 };
  /** device pixels per CSS pixel, times the size of the view against a 900 px tall one */
  uPx: { value: number };
  /** towards the sun, in view space (see ../sun.ts): low, to the right and behind, so everything is backlit */
  uLight: { value: Vector3 };
  /** x = gain, y = exponent of `emit` below */
  uGain: { value: Vector2 };
}

/**
 * Light that is added to the picture (stars, lines, glass). In the float pipeline of post.ts it
 * goes in as it is. Straight to the canvas it would be added to sRGB values instead of linear
 * ones, which makes faint light far too strong; there uGain bends it back to about the same look.
 */
export const emit = /* glsl */ `
  uniform vec2 uGain;
  vec3 emit(vec3 c) {
    return uGain.x * pow(c, vec3(uGain.y));
  }
`;

/** Wraps v into -period/2 … period/2. */
export const wrap = (v: number, period: number) => v - Math.floor(v / period + 0.5) * period;

/** Small seeded generator (mulberry32): the sky is the same on every visit. */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw order of a part of the background. three sorts by the order of the nearest group first,
 * and every group starts that again, so all the groups of the part get the same number.
 */
export function drawOrder(root: Object3D, order: number): void {
  root.traverse((o) => {
    if ((o as { isGroup?: boolean }).isGroup) o.renderOrder = order;
  });
}
