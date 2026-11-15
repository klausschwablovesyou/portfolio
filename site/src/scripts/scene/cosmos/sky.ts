import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, Vector2 } from 'three';
import { HALF_VIEW, type Shared } from './shared';

/**
 * The far sky, drawn on one triangle that covers the view: thin gas with darker lanes, gathered
 * in a broad band like the plane of a galaxy, and the faintest stars as specks of dust. It is
 * so far away that it barely moves with the camera, and it stays close to the page colour:
 * text sits right on top of it.
 */
export interface Sky {
  mesh: Mesh;
  /** yaw and pitch of the camera: the sky turns with it */
  look(yaw: number, pitch: number): void;
  /** true when the picture goes straight to the canvas, see index.ts */
  direct(on: boolean): void;
  resize(aspect: number, viewHeight: number, pixelRatio: number): void;
  dispose(): void;
}

/** depth the sky moves at; a star field depth for comparison is 14–170 */
const SKY_DEPTH = 320;

/* Ashima Arts / Ian McEwan 2D simplex noise (MIT). */
const noise = /* glsl */ `
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uVoid;
  uniform vec3 uGas;
  uniform vec3 uWarm;
  uniform vec2 uTravel;
  uniform vec2 uLook;
  uniform vec2 uBand;
  uniform float uBandAt;
  uniform float uPerDepth;
  uniform float uAspect;
  uniform float uViewPx;
  uniform float uRatio;
  uniform float uTime;
  uniform float uDither;
  varying vec2 vUv;
  ${noise}

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      sum += amp * snoise(p);
      p = p * 2.03 + vec2(13.7, 7.1);
      amp *= 0.5;
    }
    return sum;
  }

  vec3 hash3(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yzz) * q.zyx);
  }

  // One faint star per cell of a grid, in some of the cells. A star keeps clear of the edges
  // of its cell, so no neighbour has to be looked at.
  vec3 dust(vec2 px, float cell, float amount) {
    vec2 g = floor(px / cell);
    vec3 h = hash3(g);
    if (h.z > amount) return vec3(0.0);
    float d = length(px - (g + 0.2 + 0.6 * h.xy) * cell);
    float rank = h.z / amount; // 0 … 1, even among the stars that exist
    float radius = 0.75 + 0.55 * fract(h.x * 7.3);
    // most of them barely show, a few stand out
    float light = 0.035 + 0.5 * pow(rank, 7.0);
    light *= 0.82 + 0.18 * sin(uTime * (0.6 + 2.0 * h.y) + h.x * 40.0);
    vec3 tint = mix(vec3(0.72, 0.9, 1.0), vec3(1.0, 0.84, 0.62), smoothstep(0.86, 1.0, h.y));
    return tint * light * smoothstep(radius, radius * 0.25, d);
  }

  void main() {
    // sky position in view heights; the travel of the camera moves it a little, a turn moves it all
    vec2 shift = uTravel * uPerDepth + uLook;
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) + shift;
    float t = uTime * 0.008;

    // two slow fields bend the space the gas is read from, so it streams instead of billowing
    vec2 warp = vec2(fbm(p * 0.8 + vec2(0.0, t)), fbm(p * 0.8 + vec2(4.7, 2.3 - t)));
    vec2 q = p + warp * 0.5;

    float body = fbm(q * 1.1 + 9.0) * 0.5 + 0.5;
    float gas = smoothstep(0.4, 0.88, body);
    // thin bright strands inside the gas
    float strand = 1.0 - abs(snoise(q * 2.6 + 3.0));
    gas *= 0.45 + 0.95 * strand * strand * strand;

    // the gas gathers in a broad band across the sky
    float across = dot(p, uBand) - uBandAt;
    float band = exp(-across * across * 4.5);
    gas *= 0.2 + 0.8 * band;

    // lanes of dark dust in the band, a touch darker than the page
    float lane = smoothstep(0.5, 0.18, body) * band;
    vec3 col = uVoid * (1.0 - 0.3 * lane);
    col = mix(col, uGas, clamp(gas, 0.0, 1.0));
    float warm = smoothstep(0.5, 0.9, fbm(q * 0.55 + 31.0) * 0.5 + 0.5);
    col = mix(col, uWarm, warm * clamp(gas, 0.0, 1.0) * 0.55);

    // star dust, in CSS pixels so it is as fine on every screen; denser in the band
    vec2 px = gl_FragCoord.xy / uRatio + shift * uViewPx;
    col += dust(px, 13.0, 0.03 + 0.19 * band) * (1.0 - 0.6 * lane);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // 8-bit output only: break up the steps of the slow gradients
    gl_FragColor.rgb += (hash3(gl_FragCoord.xy).x - 0.5) * uDither;
  }
`;

export function createSky(shared: Shared, octaves: number): Sky {
  // one triangle that covers the screen
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  const band = new Vector2(0.42, 0.91).normalize();
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { OCTAVES: octaves },
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: shared.uTime,
      uTravel: shared.uTravel,
      // the page colour: the patches of it behind the text and the nav melt into the sky
      uVoid: { value: new Color('#0F262D') },
      // brightest the gas gets; any lighter and the muted text on it drops under AA contrast
      uGas: { value: new Color('#17404A') },
      uWarm: { value: new Color('#3A3222') },
      uLook: { value: new Vector2() },
      uBand: { value: band },
      uBandAt: { value: band.dot(new Vector2(0.1, -0.08)) },
      uPerDepth: { value: 1 / (2 * HALF_VIEW * SKY_DEPTH) },
      uAspect: { value: 1 },
      uViewPx: { value: 900 },
      uRatio: { value: 1 },
      uDither: { value: 0 },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  return {
    mesh,
    look(yaw, pitch) {
      // turning left shows sky further left; looking up shows sky further up
      material.uniforms.uLook.value.set(-yaw / (2 * HALF_VIEW), pitch / (2 * HALF_VIEW));
    },
    direct(on) {
      material.uniforms.uDither.value = on ? 1.5 / 255 : 0;
    },
    resize(aspect, viewHeight, pixelRatio) {
      material.uniforms.uAspect.value = aspect;
      material.uniforms.uViewPx.value = viewHeight;
      material.uniforms.uRatio.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
