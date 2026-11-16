import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { HALF_VIEW, type Shared } from './shared';

/**
 * The far sky: thin gas with filaments and darker lanes, gathered in a broad band like the
 * plane of a galaxy, and the faintest stars as specks of dust. It is so far away that it barely
 * moves with the camera, and it stays close to the page colour: text sits right on top of it.
 *
 * It is drawn in two steps. The gas is smooth and dim, so it is computed in a small off-screen
 * buffer (`prerender`, a few hundred pixels tall) and only enlarged on screen; that takes the
 * noise, the costly part, off the full-resolution picture. The star dust has to be crisp, so it
 * is added per pixel in the full-screen pass that also shows the buffer.
 */
export interface Sky {
  mesh: Mesh;
  /** every frame, before the scene is drawn: updates the gas buffer */
  prerender(renderer: WebGLRenderer): void;
  /** yaw and pitch of the camera: the sky turns with it */
  look(yaw: number, pitch: number): void;
  /** true when the picture goes straight to the canvas, see index.ts */
  direct(on: boolean): void;
  resize(aspect: number, viewHeight: number, pixelRatio: number): void;
  dispose(): void;
}

/** depth the sky moves at; a star field depth for comparison is 14–170 */
const SKY_DEPTH = 320;
/** height of the gas buffer in pixels; its width follows the view, up to GAS_MAX_WIDTH */
const GAS_HEIGHT = 288;
const GAS_MAX_WIDTH = 768;

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

/*
 * The gas, into the small buffer. rgb = colour (linear; square-rooted when the buffer has only
 * 8 bits), a = how dense the star dust is at this place.
 */
const gasFragment = /* glsl */ `
  uniform vec3 uVoid;
  uniform vec3 uGas;
  uniform vec3 uWarm;
  uniform vec2 uTravel;
  uniform vec2 uLook;
  uniform vec2 uBand;
  uniform float uBandAt;
  uniform float uPerDepth;
  uniform float uAspect;
  uniform float uTime;
  varying vec2 vUv;
  ${noise}

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * snoise(p);
      p = p * 2.03 + vec2(13.7, 7.1);
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    // sky position in view heights; the travel of the camera moves it a little, a turn moves it all
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) + uTravel * uPerDepth + uLook;
    float t = uTime * 0.008;

    // two slow fields bend the space the gas is read from, so it streams instead of billowing
    vec2 warp = vec2(fbm(p * 0.8 + vec2(0.0, t)), fbm(p * 0.8 + vec2(4.7, 2.3 - t)));
    vec2 q = p + warp * 0.55;

    // the gas gathers in a broad band across the sky, which meanders a little itself
    float across = dot(p + warp * 0.2, uBand) - uBandAt;
    float band = exp(-across * across * 3.6);

    float body = fbm(q * 1.1 + 9.0) * 0.5 + 0.5;
    float cloud = smoothstep(0.36, 0.86, body);
    // filaments: the ridges of two finer fields, where there is cloud at all
    float ridge = 1.0 - abs(snoise(q * 2.4 + 3.0));
    float fine = 1.0 - abs(snoise(q * 5.3 + warp * 2.0 + 17.0));
    float strand = ridge * ridge * ridge * (0.6 + 0.4 * fine * fine);
    float density = clamp(cloud * (0.3 + 0.9 * strand) * (0.14 + 0.86 * band), 0.0, 1.0);

    // lanes of dark dust in the band, a touch darker than the page
    float lane = smoothstep(0.52, 0.2, body) * band * (0.55 + 0.45 * fine);

    vec3 col = uVoid * (1.0 - 0.32 * lane);
    col = mix(col, uGas, density);
    float warm = smoothstep(0.5, 0.9, fbm(q * 0.55 + 31.0) * 0.5 + 0.5);
    col = mix(col, uWarm, warm * density * 0.5);

    #ifdef GAS_SQRT
      col = sqrt(col);
    #endif
    gl_FragColor = vec4(col, band * (1.0 - 0.6 * lane));
  }
`;

/* On screen: the enlarged gas, plus the star dust at full resolution. */
const fragment = /* glsl */ `
  uniform sampler2D tGas;
  uniform vec2 uTravel;
  uniform vec2 uLook;
  uniform float uPerDepth;
  uniform float uViewPx;
  uniform float uRatio;
  uniform float uTime;
  uniform float uDither;
  varying vec2 vUv;

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
    float radius = 0.7 + 0.5 * fract(h.x * 7.3);
    // most of them barely show, a few stand out
    float light = 0.03 + 0.45 * pow(rank, 7.0);
    light *= 0.86 + 0.14 * sin(uTime * (0.5 + 1.6 * h.y) + h.x * 40.0);
    // the same population as the nearer stars: most blue-white, some warm
    vec3 tint = mix(vec3(0.74, 0.88, 1.0), vec3(1.0, 0.84, 0.62), smoothstep(0.84, 1.0, h.y));
    return tint * light * smoothstep(radius, radius * 0.25, d);
  }

  void main() {
    vec4 gas = texture2D(tGas, vUv);
    #ifdef GAS_SQRT
      gas.rgb *= gas.rgb;
    #endif
    vec3 col = gas.rgb;

    // star dust, in CSS pixels so it is as fine on every screen; denser in the band
    vec2 px = gl_FragCoord.xy / uRatio + (uTravel * uPerDepth + uLook) * uViewPx;
    col += dust(px, 11.0, 0.025 + 0.2 * gas.a);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // 8-bit output only: break up the steps of the slow gradients
    gl_FragColor.rgb += (hash3(gl_FragCoord.xy).x - 0.5) * uDither;
  }
`;

export function createSky(shared: Shared): Sky {
  // one triangle that covers the screen
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  const band = new Vector2(0.42, 0.91).normalize();
  const look = new Vector2();
  const perDepth = { value: 1 / (2 * HALF_VIEW * SKY_DEPTH) };

  const gasMaterial = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: gasFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: shared.uTime,
      uTravel: shared.uTravel,
      // the page colour: the patches of it behind the text and the nav melt into the sky
      uVoid: { value: new Color('#0B1620') },
      // brightest the gas gets; any lighter and the muted text on it drops under AA contrast
      uGas: { value: new Color('#152C3D') },
      uWarm: { value: new Color('#2C261C') },
      uLook: { value: look },
      uBand: { value: band },
      uBandAt: { value: band.dot(new Vector2(0.1, -0.08)) },
      uPerDepth: perDepth,
      uAspect: { value: 1 },
    },
  });
  const gasMesh = new Mesh(geometry, gasMaterial);
  gasMesh.frustumCulled = false;
  const gasScene = new Scene();
  gasScene.add(gasMesh);
  const gasCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // made on the first prerender, when the renderer can say which kind of buffer it supports
  let gasTarget: WebGLRenderTarget | null = null;
  const gasSize = new Vector2(Math.round(GAS_HEIGHT * 1.6), GAS_HEIGHT);

  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tGas: { value: null },
      uTime: shared.uTime,
      uTravel: shared.uTravel,
      uLook: { value: look },
      uPerDepth: perDepth,
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
    prerender(renderer) {
      if (!gasTarget) {
        const float =
          renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
        gasTarget = new WebGLRenderTarget(gasSize.x, gasSize.y, {
          type: float ? HalfFloatType : UnsignedByteType,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
          depthBuffer: false,
        });
        if (!float) {
          // 8 bits hold dark colours far better as square roots
          gasMaterial.defines = { GAS_SQRT: '' };
          material.defines = { GAS_SQRT: '' };
          gasMaterial.needsUpdate = material.needsUpdate = true;
        }
        material.uniforms.tGas.value = gasTarget.texture;
      }
      if (gasTarget.width !== gasSize.x || gasTarget.height !== gasSize.y) gasTarget.setSize(gasSize.x, gasSize.y);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(gasTarget);
      renderer.render(gasScene, gasCamera);
      renderer.setRenderTarget(previous);
    },
    look(yaw, pitch) {
      // turning left shows sky further left; looking up shows sky further up
      look.set(-yaw / (2 * HALF_VIEW), pitch / (2 * HALF_VIEW));
    },
    direct(on) {
      material.uniforms.uDither.value = on ? 1.5 / 255 : 0;
    },
    resize(aspect, viewHeight, pixelRatio) {
      gasMaterial.uniforms.uAspect.value = aspect;
      material.uniforms.uViewPx.value = viewHeight;
      material.uniforms.uRatio.value = pixelRatio;
      gasSize.set(Math.min(GAS_MAX_WIDTH, Math.max(64, Math.round(GAS_HEIGHT * aspect))), GAS_HEIGHT);
    },
    dispose() {
      geometry.dispose();
      gasMaterial.dispose();
      material.dispose();
      gasTarget?.dispose();
    },
  };
}
