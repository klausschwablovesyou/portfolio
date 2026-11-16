import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { SUN, SUN_COLOR } from './sun';

/**
 * The landscape behind the contact section: where the journey through space ends. Mountain
 * ridges at dusk, backlit by the low sun on the right: thin warm light along the crests, the
 * near slopes in blue shadow, each further ridge paler in the haze, a glowing horizon. It is
 * drawn over the cosmos, and its sky is only that glow, so the stars and the planet stay
 * visible above the mountains.
 *
 * The land is fixed in the world and so is the sun, so everything costly is computed once:
 * `bake` renders the height, the surface normal and a soft shadow of the stretch of land the
 * camera can ever see into one texture. Per frame the mesh is only displaced and lit from it.
 *
 * Scrolling flies the camera forward over the land. The travel is counted back from the end of
 * the page (0 there), so the same stretch is seen whatever the length of the page. The grid
 * stays in front of the camera by jumping ahead whole rows at a time, so its vertices always
 * sit on the same ground points. The scene has its own camera: scrolling raises and tilts it,
 * which the anchored objects of the main scene must not follow.
 */
export interface Terrain {
  scene: Scene;
  camera: PerspectiveCamera;
  /** bakes the land; called once ahead of time, and by itself when the land changes */
  prepare(renderer: WebGLRenderer): void;
  /**
   * travel: how far the camera is from where it stands at the end of the page, in world units
   * (0 at the end, negative before it).
   * rise: 0 = low camera with the horizon in the lower third, 1 = high camera looking down.
   */
  update(state: { travel: number; time: number; rise: number; pointer: { x: number; y: number } }): void;
  resize(aspect: number): void;
  dispose(): void;
}

const COLS = 200; // samples along a row
const NEAR = 6; // distance of the first row from the camera
const FAR = 88;
const FOV = 45;
/** the camera never stands further back than this from its place at the end of the page */
const TRAVEL = 46;
/**
 * The baked stretch of land: x from -HALF_WIDTH to HALF_WIDTH (wide enough for the far rows on
 * a 21:9 screen), and from the nearest row at the start of the travel to the farthest at its
 * end. 1024 × 512 texels are about a quarter of a unit each; the finest detail of the land is
 * some ten times that.
 */
const HALF_WIDTH = 136;
const DEPTH_FROM = NEAR - TRAVEL - 2;
const DEPTH_TO = FAR + 2;
const BAKE = [1024, 512];
/** heights are stored against this, so they also fit a buffer of 8 bits */
const MAX_HEIGHT = 24;

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

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
 * The bake. A texel is a ground point p = (x across, w along the way of the camera).
 * Out: r = height / MAX_HEIGHT, g and b = the x and z of the surface normal (y follows from
 * them), a = how much of the sun reaches the point.
 */
const bakeFragment = /* glsl */ `
  uniform vec4 uRect; // x and w of the first texel, width and depth of the stretch
  uniform vec3 uSunDir;
  uniform float uAmp;
  varying vec2 vUv;
  ${noise}

  // shape before scaling: 0..~1.3; the cheap version skips the fine detail (for shadow rays)
  float shapeAt(vec2 p, bool detailed) {
    float hills = snoise(p * 0.024) * 0.5 + 0.5;
    // a slow domain warp, so the crests wander and bend instead of running in even bands
    float w = snoise(p * 0.011 + 5.0);
    vec2 q = p + vec2(w * 11.0, -w * 7.0);
    float ridge = 1.0 - abs(snoise(q * 0.036 + 11.0));
    ridge *= ridge;
    // big crests where the hills are high, faint ones in the lowlands: uneven heights along the skyline
    ridge *= mix(0.25, 1.0, smoothstep(0.2, 0.8, hills));
    float h = hills * 0.55 + ridge * 0.72;
    if (detailed) {
      // finer ridges on the shoulders of the large ones, then a little roughness
      float r2 = 1.0 - abs(snoise(q * 0.09 + 71.0));
      h += (r2 * r2 - 0.5) * 0.12 * ridge;
      float r3 = 1.0 - abs(snoise(q * 0.21 + 37.0));
      h += (r3 * r3 - 0.5) * 0.045 * (0.3 + ridge);
      h += snoise(p * 0.45 + 3.0) * 0.012;
    }
    return h;
  }
  // a low valley along the centre line, mountains at the sides
  float heightAt(vec2 p, bool detailed) {
    return shapeAt(p, detailed) * uAmp * mix(0.12, 1.0, smoothstep(2.0, 40.0, abs(p.x)));
  }

  void main() {
    vec2 p = uRect.xy + vUv * uRect.zw;
    const float e = 0.14;
    float h = heightAt(p, true);
    float hx = heightAt(p + vec2(e, 0.0), true);
    float hw = heightAt(p + vec2(0.0, e), true);
    // w grows away from the camera, world z shrinks: that axis is flipped
    vec3 n = normalize(vec3(-(hx - h), e, hw - h));

    // a soft shadow: march from the point towards the sun through the cheap heightfield
    vec3 step3 = vec3(uSunDir.x, uSunDir.y, -uSunDir.z); // in (x, height, w)
    vec3 at = vec3(p.x, h + 0.06, p.y);
    float lit = 1.0;
    float t = 0.4;
    for (int i = 0; i < 44; i++) {
      vec3 q = at + step3 * t;
      float d = q.y - heightAt(q.xz, false);
      lit = min(lit, 9.0 * d / t);
      if (lit < 0.0 || q.y > uAmp * 1.35) break;
      t += clamp(t * 0.2, 0.35, 5.0);
    }
    gl_FragColor = vec4(h / ${MAX_HEIGHT}.0, n.x, n.z, smoothstep(0.0, 1.0, lit));
    #ifdef BAKE_8BIT
      gl_FragColor.gb = gl_FragColor.gb * 0.5 + 0.5;
    #endif
  }
`;

/* What the sky is at the horizon: cool haze, warm where one looks towards the sun. */
const horizon = /* glsl */ `
  uniform vec3 uHazeCool;
  uniform vec3 uHazeWarm;
  uniform vec3 uSunDir;
  // dir: where one looks, any length; 0 away from the sun … 1 straight towards its bearing
  float sunward(vec3 dir) {
    float along = dot(normalize(dir.xz), normalize(uSunDir.xz));
    return pow(max(along, 0.0), 5.0);
  }
  vec3 horizonColor(vec3 dir) {
    return mix(uHazeCool, uHazeWarm, sunward(dir));
  }
`;

const landVertex = /* glsl */ `
  uniform sampler2D tBake;
  uniform vec4 uRect;
  uniform float uSpread;
  uniform float uNear;
  uniform float uFar;
  uniform float uShift;
  uniform float uTravel;
  varying vec2 vBake;
  varying float vDist;
  varying float vU;
  varying vec3 vWorld;
  void main() {
    float u = position.x;
    // evenly spaced rows and columns, fixed to world points: the grid jumps forward by whole
    // rows (uShift is the camera's way into the current row), so every vertex keeps sampling
    // the same spot of the land and nothing morphs while scrolling
    float dist = uNear + (uFar - uNear) * position.z - uShift;
    float x = u * (uFar * uSpread + 3.0);
    vBake = (vec2(x, dist + uTravel) - uRect.xy) / uRect.zw;
    float y = texture2D(tBake, vBake).r * ${MAX_HEIGHT}.0;
    vDist = dist;
    vU = u;
    vWorld = vec3(x, y, -dist);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorld, 1.0);
  }
`;

/*
 * The land, lit per pixel from the baked normal and shadow: the low warm sun on the slopes
 * that face it, a cool fill from the sky on all the others, a rim of light where a slope turns
 * away from the camera towards the sun, and haze that thickens with distance until the far
 * rows are the colour of the horizon.
 */
const landFragment = /* glsl */ `
  uniform sampler2D tBake;
  uniform vec3 uRock;
  uniform vec3 uPale;
  uniform vec3 uSun;
  uniform vec3 uSkyFill;
  uniform float uNear;
  uniform float uFar;
  ${horizon}
  varying vec2 vBake;
  varying float vDist;
  varying float vU;
  varying vec3 vWorld;
  void main() {
    vec4 bake = texture2D(tBake, vBake);
    #ifdef BAKE_8BIT
      bake.gb = bake.gb * 2.0 - 1.0;
    #endif
    vec3 n = vec3(bake.g, sqrt(max(1.0 - bake.g * bake.g - bake.b * bake.b, 0.0)), bake.b);
    float shadow = bake.a;
    vec3 toEye = cameraPosition - vWorld;
    vec3 view = normalize(toEye);
    vec3 l = normalize(uSunDir);

    // rock, paler where it is high and not steep
    float high = smoothstep(0.42, 0.8, bake.r * ${MAX_HEIGHT}.0 / 16.0) * smoothstep(0.55, 0.2, 1.0 - n.y);
    vec3 albedo = mix(uRock, uPale, high * 0.7);

    float ndl = dot(n, l);
    // light wraps a little past the edge before the shadow takes over
    float direct = max((ndl + 0.12) / 1.12, 0.0) * shadow;
    vec3 col = albedo * (uSun * direct * 2.6 + uSkyFill * (0.3 + 0.7 * n.y));

    // crests against the sun: slopes that turn away from the camera catch it along their edge
    float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    float into = pow(max(dot(-view, l), 0.0), 2.0);
    col += uSun * fres * into * shadow * 1.1;

    // aerial perspective: every ridge further away is nearer to the colour of the horizon
    vec3 hazeCol = horizonColor(-toEye);
    float haze = 1.0 - exp(-max(vDist - uNear, 0.0) * 0.019);
    col = mix(col, hazeCol, haze);
    // the far rows and the outer columns are the horizon itself
    float far = smoothstep(uFar * 0.6, uFar * 0.98, vDist);
    float side = smoothstep(0.86, 1.0, abs(vU));
    col = mix(col, hazeCol, max(far, side));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/*
 * The sky of the landscape is only its horizon: a glow that is opaque at and under the horizon,
 * warm towards the sun, and thins out upwards into the night, where the cosmos shows through.
 */
const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uTeal;
  ${horizon}
  varying vec3 vWorld;
  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float up = max(dir.y, 0.0); // sine of the height above the horizon
    float s = sunward(dir);
    vec3 col = mix(horizonColor(dir), uTeal, smoothstep(0.0, 0.16, up));
    // the glow reaches higher towards the sun
    float alpha = exp(-up * mix(13.0, 6.5, s));

    // the sun itself, when it is inside the view: a small clean disc in a soft halo
    float c = max(dot(dir, normalize(uSunDir)), 0.0);
    float halo = pow(c, 90.0) * 0.5 + pow(c, 900.0) * 0.7;
    float disc = smoothstep(0.99972, 0.99986, c);
    col += uSun * (halo + disc * 3.0);
    alpha = max(alpha, clamp(halo * 1.5 + disc, 0.0, 1.0));

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export function createTerrain(rows: number, aspect: number): Terrain {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, aspect, 0.5, 400);
  camera.rotation.order = 'YXZ';

  /* the bake */
  const rect = new Vector4(-HALF_WIDTH, DEPTH_FROM, HALF_WIDTH * 2, DEPTH_TO - DEPTH_FROM);
  const triangle = new BufferGeometry();
  triangle.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const bakeMaterial = new ShaderMaterial({
    vertexShader: fullscreenVertex,
    fragmentShader: bakeFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: { uRect: { value: rect }, uSunDir: { value: SUN }, uAmp: { value: 15 } },
  });
  const bakeMesh = new Mesh(triangle, bakeMaterial);
  bakeMesh.frustumCulled = false;
  const bakeScene = new Scene();
  bakeScene.add(bakeMesh);
  const bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let bakeTarget: WebGLRenderTarget | null = null;
  let renderer: WebGLRenderer | null = null;
  /** the height of the mountains the last bake was made for; 0 = not baked yet */
  let bakedAmp = 0;

  // One vertex buffer: x = position across (-1..1), z = row (0..1).
  const grid = new Float32Array(COLS * rows * 3);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < COLS; i++) {
      const o = (j * COLS + i) * 3;
      grid[o] = (i / (COLS - 1)) * 2 - 1;
      grid[o + 1] = 0;
      grid[o + 2] = j / (rows - 1);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i;
      const b = a + COLS;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const shared = {
    tBake: { value: null as WebGLRenderTarget['texture'] | null },
    uRect: { value: rect },
    uSpread: { value: 1 },
    uNear: { value: NEAR },
    uFar: { value: FAR },
    uShift: { value: 0 },
    uTravel: { value: 0 },
  };
  // The haze the land fades into is darker than the glow of the sky behind it, so every ridge,
  // the last one included, stands against the horizon as a silhouette.
  const landAir = {
    uHazeCool: { value: new Color('#16303F') },
    uHazeWarm: { value: new Color('#4D3F42') },
    uSunDir: { value: SUN },
  };
  const skyAir = {
    uHazeCool: { value: new Color('#1F4656') },
    uHazeWarm: { value: new Color('#C4835A') },
    uSunDir: { value: SUN },
  };

  const landGeo = new BufferGeometry();
  landGeo.setAttribute('position', new Float32BufferAttribute(grid, 3));
  landGeo.setIndex(index);
  const landMat = new ShaderMaterial({
    vertexShader: landVertex,
    fragmentShader: landFragment,
    uniforms: {
      ...shared,
      ...landAir,
      uRock: { value: new Color('#33485A') },
      uPale: { value: new Color('#7E98A8') },
      uSun: { value: SUN_COLOR },
      // the light of the sky, not a surface colour: what the slopes in shadow are seen by
      uSkyFill: { value: new Color('#6B93B4').multiplyScalar(0.55) },
    },
    side: DoubleSide,
  });
  const land = new Mesh(landGeo, landMat);
  land.frustumCulled = false;
  land.renderOrder = 1;

  const skyGeo = new PlaneGeometry(1000, 320);
  const skyMat = new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    // see-through things are drawn after the land, whatever their order: the depth test is
    // what keeps the glow behind the mountains
    transparent: true,
    depthWrite: false,
    uniforms: { ...skyAir, uSun: { value: SUN_COLOR }, uTeal: { value: new Color('#173B4B') } },
  });
  const sky = new Mesh(skyGeo, skyMat);
  sky.position.set(0, 40, -(FAR + 40));
  sky.renderOrder = 0;
  sky.frustumCulled = false;

  scene.add(sky, land);

  let amp = 15;
  const halfFov = (FOV * Math.PI) / 360;
  function resize(a: number): void {
    camera.aspect = a;
    camera.updateProjectionMatrix();
    // wide enough for the far rows to pass both screen edges, with room for the pointer yaw
    shared.uSpread.value = Math.min((HALF_WIDTH - 3) / FAR, Math.tan(halfFov) * a * 1.35 + 0.12);
    // a portrait screen sees a narrow strip of land: lower mountains keep the valley open
    amp = 15 * Math.min(1, Math.max(0.6, 0.42 + a * 0.4));
  }
  resize(aspect);

  function bake(): void {
    if (!renderer) return;
    if (!bakeTarget) {
      const float =
        renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
      bakeTarget = new WebGLRenderTarget(BAKE[0], BAKE[1], {
        type: float ? HalfFloatType : UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
      });
      if (!float) {
        bakeMaterial.defines = { BAKE_8BIT: '' };
        landMat.defines = { BAKE_8BIT: '' };
        bakeMaterial.needsUpdate = landMat.needsUpdate = true;
      }
      shared.tBake.value = bakeTarget.texture;
    }
    bakeMaterial.uniforms.uAmp.value = amp;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(bakeTarget);
    renderer.render(bakeScene, bakeCamera);
    renderer.setRenderTarget(previous);
    bakedAmp = amp;
  }

  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  const rowStep = (FAR - NEAR) / (rows - 1);

  return {
    scene,
    camera,
    prepare(r) {
      renderer = r;
      if (Math.abs(bakedAmp - amp) > 0.01) bake();
    },
    update({ travel, time, rise, pointer }) {
      // the window has another shape, or the bake was not asked for ahead: do it now
      if (Math.abs(bakedAmp - amp) > 0.01) bake();
      const at = Math.min(0, Math.max(-TRAVEL, travel));
      shared.uTravel.value = at;
      shared.uShift.value = at - Math.floor(at / rowStep) * rowStep;
      // a hand-held camera never stands perfectly still
      const swayPitch = Math.sin(time * 0.31) * 0.004 + Math.sin(time * 0.73 + 1.3) * 0.002;
      const swayYaw = Math.sin(time * 0.27 + 0.6) * 0.006 + Math.sin(time * 0.61) * 0.0025;
      camera.position.set(pointer.x * 0.9, mix(3.4, 8.5, rise) + pointer.y * 0.25, 0);
      // low: looking slightly up, horizon in the lower third; high: looking down over the land
      camera.rotation.set(mix(0.19, -0.17, rise) + pointer.y * 0.012 + swayPitch, -pointer.x * 0.035 + swayYaw, Math.sin(time * 0.19) * 0.004);
    },
    resize,
    dispose() {
      landGeo.dispose();
      skyGeo.dispose();
      triangle.dispose();
      landMat.dispose();
      skyMat.dispose();
      bakeMaterial.dispose();
      bakeTarget?.dispose();
    },
  };
}
