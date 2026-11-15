import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Vector2 } from 'three';
import { emit, HALF_VIEW, rng, type Shared } from './shared';

/**
 * The stars with depth: points between NEAR and FAR that the camera travels past, so the near
 * ones cross the view many times faster than the far ones. That difference is what makes the
 * background read as space instead of as a pattern.
 *
 * The field is endless. A star is stored as a place in a box whose size grows with its depth
 * (a little larger than the view there) and wraps around inside it; it re-enters outside the
 * view. Most stars are small and dim, a few are bright with a halo and four thin spikes, and
 * about a third sit in loose clusters, because evenly scattered stars look like noise.
 */
export interface Stars {
  points: Points;
  resize(aspect: number): void;
  dispose(): void;
}

const NEAR = 14;
const FAR = 170;
/** size of the wrap box against the view */
const MARGIN = 1.3;
/** stars drawn per unit of aspect ratio, so a phone is as densely starred as a wide screen */
const PER_ASPECT = 700;
const MAX = 1800;

const TINTS = ['#DDEFF2', '#DDEFF2', '#DDEFF2', '#9FD8E2', '#9FD8E2', '#B9CEFF', '#FFD79A'].map(
  (hex) => new Color(hex),
);

const vertex = /* glsl */ `
  attribute vec4 aStar; // size in px, light, twinkle phase, twinkle rate
  attribute vec4 aTint; // colour, 1 for a bright star
  uniform vec2 uTravel;
  uniform vec2 uSpan;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vBright;
  varying float vHalf;
  void main() {
    float depth = position.z;
    vec2 period = uSpan * depth;
    vec2 xy = (fract(position.xy - uTravel / period) - 0.5) * period;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(xy, -depth, 1.0);

    float near = 1.0 - smoothstep(${NEAR}.0, ${FAR}.0, depth);
    float px = aStar.x * mix(1.0, 1.6, near * near) * uPx;
    // a star under two pixels would flicker as it moves: keep it that wide and dim it instead
    float shown = max(px, 2.0);
    gl_PointSize = shown;

    float twinkle = 1.0 + mix(0.3, 0.1, aTint.w) * sin(uTime * aStar.w + aStar.z);
    float light = aStar.y * twinkle * (px * px) / (shown * shown) * mix(0.55, 1.0, near);
    vColor = aTint.rgb * light;
    vBright = aTint.w;
    vHalf = shown * 0.5 / uPx;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vBright;
  varying float vHalf;
  ${emit}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    float light;
    if (vBright > 0.5) {
      // small hard core, soft halo, four thin spikes that fade out before the edge of the sprite
      vec2 q = abs(c) * vHalf;
      float core = exp(-dot(q, q) * 0.6);
      float halo = exp(-r2 * 7.0) * 0.1;
      float spike = exp(-min(q.x, q.y) * 1.5) * exp(-max(q.x, q.y) * 4.5 / vHalf) * 0.38;
      light = core + (halo + spike) * (1.0 - smoothstep(0.7, 1.0, max(abs(c.x), abs(c.y))));
    } else {
      light = exp(-r2 * 4.5);
    }
    gl_FragColor = vec4(emit(vColor * light), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createStars(shared: Shared): Stars {
  const rand = rng(20031126);
  // two uniform numbers → one normally distributed
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  // more stars far than near, as in a real volume, but not as steeply: the near ones carry the depth
  const depthAt = (u: number) => Math.pow(NEAR ** 2.2 + u * (FAR ** 2.2 - NEAR ** 2.2), 1 / 2.2);

  const clusters = Array.from({ length: 7 }, () => ({ x: rand(), y: rand(), depth: depthAt(rand()), spread: 0.03 + rand() * 0.05 }));

  const position = new Float32Array(MAX * 3);
  const star = new Float32Array(MAX * 4);
  const tint = new Float32Array(MAX * 4);
  for (let i = 0; i < MAX; i++) {
    let x = rand();
    let y = rand();
    let depth = depthAt(rand());
    if (rand() < 0.3) {
      const c = clusters[Math.floor(rand() * clusters.length)];
      x = c.x + gauss() * c.spread;
      y = c.y + gauss() * c.spread;
      depth = Math.min(FAR, Math.max(NEAR, c.depth * (1 + gauss() * 0.07)));
    }
    position.set([x - Math.floor(x), y - Math.floor(y), depth], i * 3);

    const bright = rand() < 0.022;
    const size = bright ? 20 + rand() * 16 : 2.2 + 3.4 * rand() ** 3;
    const light = bright ? 0.8 + rand() * 0.6 : 0.1 + 0.75 * rand() ** 2.4;
    star.set([size, light, rand() * Math.PI * 2, 0.5 + rand() * 1.9], i * 4);

    const c = TINTS[Math.floor(rand() * TINTS.length)];
    tint.set([c.r, c.g, c.b, bright ? 1 : 0], i * 4);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aStar', new Float32BufferAttribute(star, 4));
  geometry.setAttribute('aTint', new Float32BufferAttribute(tint, 4));

  const span = new Vector2();
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uTravel: shared.uTravel,
      uPx: shared.uPx,
      uGain: shared.uGain,
      uSpan: { value: span },
    },
  });

  const points = new Points(geometry, material);
  // the stored positions are places in the wrap box, not world positions
  points.frustumCulled = false;

  return {
    points,
    resize(aspect) {
      span.set(2 * HALF_VIEW * aspect * MARGIN, 2 * HALF_VIEW * MARGIN);
      // the stars are in random order, so any first part of them is an even sample
      geometry.setDrawRange(0, Math.min(MAX, Math.max(320, Math.round(PER_ASPECT * aspect))));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
