import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Vector2 } from 'three';
import { emit, HALF_VIEW, rng, type Shared } from './shared';

/**
 * The stars with depth: points between NEAR and FAR that the camera travels past, so the near
 * ones cross the view many times faster than the far ones. That difference is what makes the
 * background read as space instead of as a pattern.
 *
 * The field is endless. A star is stored as a place in a box whose size grows with its depth
 * (a little larger than the view there) and wraps around inside it; it re-enters outside the
 * view. Most stars are small and dim, a few are bright with a soft halo, a handful carry thin
 * diffraction spikes (each turned a little differently, so none looks stamped), and about a
 * third sit in loose clusters, because evenly scattered stars look like noise.
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
/** stars with diffraction spikes */
const HEROES = 5;

const TINTS = ['#DDEFF2', '#DDEFF2', '#DDEFF2', '#9FD8E2', '#9FD8E2', '#B9CEFF', '#FFD79A'].map(
  (hex) => new Color(hex),
);

const vertex = /* glsl */ `
  attribute vec4 aStar; // size in px, light, twinkle phase, twinkle rate
  attribute vec4 aTint; // colour; 1 for a bright star, 2 for one with spikes
  uniform vec2 uTravel;
  uniform vec2 uSpan;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vBright;
  varying float vHalf;
  varying vec2 vTurn;
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

    float twinkle = 1.0 + mix(0.16, 0.05, min(aTint.w, 1.0)) * sin(uTime * aStar.w + aStar.z);
    float light = aStar.y * twinkle * (px * px) / (shown * shown) * mix(0.55, 1.0, near);
    vColor = aTint.rgb * light;
    vBright = aTint.w;
    vHalf = shown * 0.5 / uPx;
    // the spikes of each star are turned by its own small angle
    float turn = 0.2 + 0.5 * fract(aStar.z);
    vTurn = vec2(cos(turn), sin(turn));
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vBright;
  varying float vHalf;
  varying vec2 vTurn;
  ${emit}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    float light;
    if (vBright > 0.5) {
      // a small hard core in a soft halo that fades out before the edge of the sprite
      vec2 q = c * vHalf; // CSS pixels from the centre
      float d2 = dot(q, q);
      float edge = 1.0 - smoothstep(0.55, 1.0, sqrt(r2));
      light = exp(-d2 * 0.8) + edge * 0.07 / (1.0 + d2 * 0.3);
      if (vBright > 1.5) {
        // thin diffraction spikes, off the axes
        vec2 t = abs(vec2(q.x * vTurn.x - q.y * vTurn.y, q.x * vTurn.y + q.y * vTurn.x));
        light += edge * exp(-min(t.x, t.y) * 2.4) * exp(-max(t.x, t.y) * 3.6 / vHalf) * 0.2;
      }
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

    // the first few stars are the ones with spikes: they are drawn at every aspect ratio
    const hero = i < HEROES;
    const bright = hero || rand() < 0.014;
    const size = hero ? 30 + rand() * 12 : bright ? 13 + rand() * 9 : 2.2 + 3.2 * rand() ** 3;
    const light = hero ? 1.0 + rand() * 0.5 : bright ? 0.7 + rand() * 0.5 : 0.09 + 0.75 * rand() ** 2.6;
    star.set([size, light, rand() * Math.PI * 2, 0.5 + rand() * 1.9], i * 4);

    const c = TINTS[Math.floor(rand() * TINTS.length)];
    tint.set([c.r, c.g, c.b, hero ? 2 : bright ? 1 : 0], i * 4);
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
