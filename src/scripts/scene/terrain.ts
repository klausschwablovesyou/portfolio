import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';

/**
 * The background: a noise heightfield rendered as lit terrain. The surface is shaded per
 * pixel against a low sun behind the mountains (soft raymarched shadows, sky fill, backlit
 * rims, aerial haze); the old ridgelines, one per row, stay on top as a faint contour overlay.
 *
 * The land is fixed in the world and scrolling flies the camera forward over it. The grid
 * stays in front of the camera by jumping ahead whole rows at a time, so its vertices always
 * sit on the same ground points and the ridges never morph; rows only come and go at the
 * faded near and far ends. Without scrolling the land holds still (apart from the opening push-in).
 * The scene has its own camera: scrolling raises and tilts it, which the anchored objects of
 * the main scene must not follow.
 */
export interface Terrain {
  scene: Scene;
  camera: PerspectiveCamera;
  /**
   * rise: 0 = low camera with the horizon in the lower third, 1 = high camera looking down.
   * intro: 0 → 1 while the opening shot pushes in and settles.
   */
  update(state: {
    scroll: number;
    time: number;
    rise: number;
    intro: number;
    pointer: { x: number; y: number };
  }): void;
  resize(aspect: number): void;
  dispose(): void;
}

const COLS = 200; // samples along a ridgeline
const NEAR = 6; // distance of the first row from the camera
const FAR = 88;
const FOV = 45;
/** towards the sun: low, behind the mountains and to the right, away from the headline, so the land is backlit */
const SUN_DIR = new Vector3(0.5, 0.17, -1).normalize();
const SUN = new Color('#FFC77A');

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

/*
 * The heightfield as a function of a ground point (x across, d = distance ahead of the camera),
 * so the vertex stage can place the mesh and the fragment stage can ask for normals and shadows
 * at any point, not only at the vertices.
 */
const field = /* glsl */ `
  uniform float uSpread;
  uniform float uNear;
  uniform float uFar;
  uniform float uScroll;
  uniform float uShift;
  uniform float uAmp;
  ${noise}
  // shape before scaling: 0..~1.2; the cheap version skips the fine detail (for shadow rays)
  float shapeAt(vec2 g, bool detailed) {
    vec2 p = vec2(g.x, g.y + uScroll);
    float hills = snoise(p * 0.024) * 0.5 + 0.5;
    // a slow domain warp, so the crests wander and bend instead of running in even bands
    float w = snoise(p * 0.011 + 5.0);
    vec2 q = p + vec2(w * 11.0, -w * 7.0);
    // fewer crests: a lower ridge frequency than before
    float ridge = 1.0 - abs(snoise(q * 0.036 + 11.0));
    ridge *= ridge;
    // big crests where the hills are high, faint ones in the lowlands: uneven heights along the skyline
    ridge *= mix(0.25, 1.0, smoothstep(0.2, 0.8, hills));
    float h = hills * 0.55 + ridge * 0.72;
    if (detailed) {
      // a second, finer ridge octave breaks up the regular profile of each crest
      float r2 = 1.0 - abs(snoise(q * 0.09 + 71.0));
      h += (r2 * r2 - 0.5) * 0.1 * ridge;
      h += snoise(p * 0.21 + 37.0) * 0.05;
    }
    return h;
  }
  // a low valley along the centre line, mountains at the sides. It depends on the world x only,
  // never on the distance from the camera, so the land does not change shape as the camera flies on
  float valleyAt(float x) {
    return mix(0.12, 1.0, smoothstep(2.0, 40.0, abs(x)));
  }
  float envelope(vec2 g) {
    return uAmp * valleyAt(g.x);
  }
  float heightAt(vec2 g, bool detailed) {
    return shapeAt(g, detailed) * envelope(g);
  }
`;

/* Shared by the lines and the shaded surface, so both sit on exactly the same heights. */
const vertex = /* glsl */ `
  ${field}
  varying float vH;
  varying float vDist;
  varying float vU;
  varying vec3 vGround;
  void main() {
    float u = position.x;
    // evenly spaced rows and columns, fixed to world points: the grid jumps forward by whole
    // rows (uShift is the camera's way into the current row), so every vertex keeps sampling
    // the same spot of the land and nothing morphs while scrolling
    float dist = uNear + (uFar - uNear) * position.z - uShift;
    float x = u * (uFar * uSpread + 3.0);
    vec2 g = vec2(x, dist);
    float h = shapeAt(g, true);
    float y = h * envelope(g);

    vH = h * valleyAt(x);
    vDist = dist;
    vU = u;
    vGround = vec3(x, y, dist);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, -dist, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform float uNear;
  uniform float uFar;
  uniform float uOpacity;
  varying float vH;
  varying float vDist;
  varying float vU;
  void main() {
    float far = 1.0 - smoothstep(uFar * 0.5, uFar * 0.97, vDist);
    float near = smoothstep(uNear, uNear + 5.0, vDist);
    float side = 1.0 - smoothstep(0.82, 1.0, abs(vU));
    float warm = smoothstep(0.5, 0.86, vH);
    vec3 col = mix(uCool, uWarm, warm);
    float alpha = (0.34 + 0.56 * warm) * far * near * side * uOpacity;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/*
 * The land itself, lit per pixel: a low warm sun behind the mountains, off to the right,
 * soft shadows marched through the heightfield towards it, a cool fill from the sky, a rim
 * of light where the slopes turn away from the camera, and haze that thickens with distance
 * and glows warm in the direction of the sun.
 */
const surfaceFragment = /* glsl */ `
  ${field}
  uniform vec3 uInk;
  uniform vec3 uRock;
  uniform vec3 uMeadow;
  uniform vec3 uCap;
  uniform vec3 uSun;
  uniform vec3 uSky;
  uniform vec3 uHaze;
  uniform vec3 uSunDir;
  uniform float uSunPower;
  varying float vH;
  varying float vDist;
  varying float vU;
  varying vec3 vGround;

  float softShadow(vec3 p, vec3 l) {
    float res = 1.0;
    float t = 0.35;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      vec3 q = p + l * t;
      float d = q.y - heightAt(vec2(q.x, -q.z), false);
      res = min(res, 9.0 * d / t);
      if (res < 0.0 || q.y > uAmp * 1.25) break;
      t += clamp(t * 0.22, 0.3, 4.5);
    }
    return smoothstep(0.0, 1.0, res);
  }

  void main() {
    vec2 g = vGround.xz;
    // per-pixel normal from the analytic heightfield: sharper ridges than the mesh can carry
    float e = 0.04 + vDist * 0.004;
    float h0 = heightAt(g, true);
    float hx = heightAt(g + vec2(e, 0.0), true);
    float hz = heightAt(g + vec2(0.0, e), true);
    // ground d grows away from the camera, world z shrinks: flip that axis
    vec3 n = normalize(vec3(-(hx - h0), e, (hz - h0)));
    vec3 p = vec3(g.x, h0, -g.y);

    vec3 view = normalize(cameraPosition - p);
    vec3 l = normalize(uSunDir);

    // material: meadow on the gentle ground, rock on the steep faces, pale caps high up
    float slope = 1.0 - n.y;
    vec3 albedo = mix(uMeadow, uRock, smoothstep(0.18, 0.5, slope));
    float cap = smoothstep(0.62, 0.9, vH) * smoothstep(0.55, 0.25, slope);
    albedo = mix(albedo, uCap, cap);

    float ndl = dot(n, l);
    float diffuse = max(ndl, 0.0);
    // a soft terminator: light wraps a little past the edge before the shadow takes over
    float wrap = max((ndl + 0.25) / 1.25, 0.0);
    float shadow = diffuse > 0.0 || wrap > 0.0 ? softShadow(p + n * 0.05, l) : 0.0;

    float skyFill = 0.5 + 0.5 * n.y;
    // light from the ground bouncing back up into the shaded faces
    float bounce = 0.5 - 0.5 * n.y;

    vec3 light = uSun * uSunPower * mix(wrap * 0.35, diffuse, 0.7) * shadow;
    light += uSky * skyFill * 0.35;
    light += uSun * bounce * 0.06;
    vec3 col = albedo * light;

    // backlit rim: slopes that turn away from the camera catch the sun along their edge
    float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    float toward = pow(max(dot(-view, l), 0.0), 3.0);
    col += uSun * fres * toward * (0.25 + 0.75 * shadow) * 0.5;

    // a faint sheen on sunlit caps
    vec3 hv = normalize(l + view);
    col += uSun * pow(max(dot(n, hv), 0.0), 40.0) * cap * shadow * 0.35;

    // aerial perspective: exponential haze, warmer where we look into the sun
    float haze = 1.0 - exp(-max(vDist - uNear, 0.0) * 0.024);
    float sunward = pow(max(dot(-view, l), 0.0), 6.0);
    vec3 hazeCol = mix(uHaze, uSun * 0.3, sunward * 0.35);
    col = mix(col, hazeCol, haze * 0.8);

    // the far rows melt into the page colour, as before
    float far = smoothstep(uFar * 0.55, uFar * 0.98, vDist);
    col = mix(col, uInk, far);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* Light behind the mountains, so the ridges have something to stand against. */
const skyVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uCool;
  uniform vec3 uPale;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float band = exp(-pow((vUv.y - 0.3) * 4.2, 2.0));
    float wide = exp(-x * x * 1.7);
    float core = exp(-x * x * 9.0) * exp(-pow((vUv.y - 0.275) * 8.0, 2.0));
    vec3 col = mix(uInk, uCool, band * wide * 0.6 * uOpacity);
    col = mix(col, uPale, core * 0.3 * uOpacity);

    // the sun the land is lit by: a small hot disc inside a wide warm glow
    vec3 dir = normalize(vWorld - cameraPosition);
    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    // the wide glow fades out before the top edge of the plane, so the plane never shows an edge
    float glow = pow(s, 40.0) * 0.12 * smoothstep(1.0, 0.55, vUv.y) + pow(s, 400.0) * 0.5;
    float disc = smoothstep(0.99965, 0.99985, s);
    col += uSun * (glow + disc * 2.0) * uOpacity;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createTerrain(rows: number, aspect: number, shadowSteps = 22): Terrain {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, aspect, 0.5, 400);
  camera.rotation.order = 'YXZ';

  // One vertex buffer for both objects: x = position across the ridge (-1..1), z = row (0..1).
  const grid = new Float32Array(COLS * rows * 3);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < COLS; i++) {
      const o = (j * COLS + i) * 3;
      grid[o] = (i / (COLS - 1)) * 2 - 1;
      grid[o + 1] = 0;
      grid[o + 2] = j / (rows - 1);
    }
  }
  const position = new Float32BufferAttribute(grid, 3);

  const lineIndex: number[] = [];
  const surfaceIndex: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i;
      lineIndex.push(a, a + 1);
      if (j < rows - 1) {
        const b = a + COLS;
        surfaceIndex.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  const shared = {
    uSpread: { value: 1 },
    uNear: { value: NEAR },
    uFar: { value: FAR },
    uScroll: { value: 0 },
    uShift: { value: 0 },
    uAmp: { value: 15 },
    uTime: { value: 0 },
  };

  const surfaceGeo = new BufferGeometry();
  surfaceGeo.setAttribute('position', position);
  surfaceGeo.setIndex(surfaceIndex);
  const surfaceMat = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: surfaceFragment,
    defines: { SHADOW_STEPS: shadowSteps },
    uniforms: {
      ...shared,
      uInk: { value: new Color('#0F262D') },
      uRock: { value: new Color('#3E5A5E') },
      uMeadow: { value: new Color('#4F7A6E') },
      uCap: { value: new Color('#C9E4DE') },
      uSun: { value: SUN },
      uSky: { value: new Color('#24606C') },
      uHaze: { value: new Color('#1E4A54') },
      uSunDir: { value: SUN_DIR },
      uSunPower: { value: 1.5 },
    },
    side: DoubleSide,
    // pushed back a little, so the lines on the same heights always win the depth test
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
  });
  const surface = new Mesh(surfaceGeo, surfaceMat);
  surface.frustumCulled = false;
  surface.renderOrder = 1;

  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', position);
  lineGeo.setIndex(lineIndex);
  const lineMat = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: lineFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...shared,
      uCool: { value: new Color('#6FA3AE') },
      uWarm: { value: new Color('#F2B33D') },
      uOpacity: { value: 0.32 },
    },
  });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;

  const skyGeo = new PlaneGeometry(520, 90);
  const skyMat = new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    // opaque and drawn first: it fades to the page colour at its edges, and the land covers it
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uInk: { value: new Color('#0F262D') },
      uCool: { value: new Color('#2C7D8C') },
      uPale: { value: new Color('#A6DAD2') },
      uSun: { value: SUN },
      uSunDir: { value: SUN_DIR },
      uOpacity: { value: 1 },
    },
  });
  const sky = new Mesh(skyGeo, skyMat);
  sky.position.set(0, 23, -(FAR + 30));
  sky.renderOrder = 0;
  sky.frustumCulled = false;

  scene.add(sky, surface, lines);

  const halfFov = (FOV * Math.PI) / 360;
  function resize(a: number): void {
    camera.aspect = a;
    camera.updateProjectionMatrix();
    // wide enough for the far rows to pass both screen edges, with room for the pointer yaw
    shared.uSpread.value = Math.tan(halfFov) * a * 1.35 + 0.12;
    // a portrait screen sees a narrow strip of land: lower mountains keep the valley open
    shared.uAmp.value = 15 * Math.min(1, Math.max(0.6, 0.42 + a * 0.4));
  }
  resize(aspect);

  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  const rowStep = (FAR - NEAR) / (rows - 1);

  return {
    scene,
    camera,
    update({ scroll, time, rise, intro, pointer }) {
      // opening shot: the camera starts low and further back, pushes in and comes to rest
      const settle = (1 - intro) * (1 - intro);
      // no drift of its own: when the page stands still, the land stands still
      const travel = scroll - settle * 16;
      shared.uScroll.value = travel;
      shared.uShift.value = travel - Math.floor(travel / rowStep) * rowStep;
      shared.uTime.value = time;
      // a hand-held camera never stands perfectly still
      const swayPitch = Math.sin(time * 0.31) * 0.004 + Math.sin(time * 0.73 + 1.3) * 0.002;
      const swayYaw = Math.sin(time * 0.27 + 0.6) * 0.006 + Math.sin(time * 0.61) * 0.0025;
      const swayRoll = Math.sin(time * 0.19) * 0.004;
      camera.position.set(pointer.x * 0.9, mix(3.1, 8.5, rise) + pointer.y * 0.25 - settle * 1.3, 0);
      // low: looking slightly up, horizon in the lower third; high: looking down over the land
      camera.rotation.set(
        mix(0.2, -0.17, rise) + pointer.y * 0.012 + swayPitch + settle * 0.06,
        -pointer.x * 0.035 + swayYaw,
        swayRoll,
      );
      lineMat.uniforms.uOpacity.value = mix(0.32, 0.2, rise);
      skyMat.uniforms.uOpacity.value = mix(1, 0.4, rise);
    },
    resize,
    dispose() {
      surfaceGeo.dispose();
      lineGeo.dispose();
      skyGeo.dispose();
      surfaceMat.dispose();
      lineMat.dispose();
      skyMat.dispose();
    },
  };
}
