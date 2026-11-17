import {
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  Quaternion,
  RedFormat,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
} from 'three';
import { FILL_COLOR, SUN_COLOR } from '../sun';
import { rng } from './shared';

/**
 * The planet is the one body that is not lit by the sun of ../sun.ts. Seen from behind, a ringed
 * planet hides the near arc of its rings in its own shadow, and reads as a ball in front of a
 * hoop. So its light comes from the same side (the right) but from the front: the rings pass
 * in front of the globe in full light, their shadow lies on the globe, and the globe's shadow
 * falls on the far arc behind it. View space: x right, y up, z towards the viewer.
 */
const PLANET_LIGHT = new Vector3(0.38, 0.32, 0.87).normalize();

/**
 * The one landmark of the sky: a gas giant with rings, far away. Most of the banded globe is
 * lit, with a soft terminator on the left and a thin atmosphere along the limb. The rings are
 * a real disc with bands and gaps: the near arc passes in front of the globe, the far arc
 * behind it; the planet's shadow falls across the far arc and the rings' shadow across the
 * globe. Two small moons run round it.
 *
 * Built with radius 1 around the origin; cosmos/index.ts places and scales it. It is small on
 * screen (about 80 px in radius), so every pixel of it can afford a careful shader.
 */
export interface Planet {
  group: Group;
  update(time: number): void;
  dispose(): void;
}

/** how far the ring plane is tipped towards a camera level with the planet, and its roll */
const TIP = 0.232;
const ROLL = 0.3;
/** inner and outer radius of the rings, in planet radii */
const RING = [1.28, 2.24];

const noise3 = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  // value noise, 0..1
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y);
    float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y);
    return mix(a, b, f.z);
  }
`;

const globeVertex = /* glsl */ `
  uniform float uSpin;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vFrame; // on the unit sphere, in the frame the rings lie in
  varying vec3 vBody; // the same point on the turning body
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    vFrame = position;
    float c = cos(uSpin);
    float s = sin(uSpin);
    vBody = vec3(c * position.x - s * position.z, position.y, s * position.x + c * position.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const globeFragment = /* glsl */ `
  uniform vec3 uLight; // towards the sun, view space
  uniform vec3 uLightFrame; // the same, in the frame of the rings
  uniform vec3 uSun;
  uniform vec3 uFill;
  uniform vec3 uDeep;
  uniform vec3 uPale;
  uniform vec3 uWarm;
  uniform vec3 uAir;
  uniform sampler2D tRing;
  uniform vec2 uRing;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vFrame;
  varying vec3 vBody;
  ${noise3}
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);

    // bands along the latitudes, bent by a little turbulence
    float turb = (noise3(vBody * 3.1) - 0.5) * 0.16 + (noise3(vBody * 8.0 + 4.0) - 0.5) * 0.05;
    float lat = vBody.y + turb;
    float wide = 0.5 + 0.5 * sin(lat * 15.0 + sin(lat * 6.0) * 1.4);
    float fine = 0.5 + 0.5 * sin(lat * 46.0 + 1.3);
    float tone = mix(wide, fine, 0.22);
    vec3 albedo = mix(uDeep, uPale, tone);
    albedo = mix(albedo, uWarm, smoothstep(0.6, 0.95, wide) * (1.0 - abs(vBody.y)) * 0.3);

    float ndl = dot(n, uLight);
    float mu = max(dot(n, v), 0.0);
    // a soft terminator, and the day side a little darker towards its own limb
    float day = smoothstep(-0.14, 0.34, ndl);
    vec3 col = albedo * uSun * day * (0.25 + 0.75 * pow(max(ndl, 0.0), 0.7));

    // the rings' shadow: from this point towards the sun, does the ray cross the ring plane?
    if (uLightFrame.y * vFrame.y < 0.0) {
      float t = -vFrame.y / uLightFrame.y;
      float r = length((vFrame + uLightFrame * t).xz);
      float k = (r - uRing.x) / (uRing.y - uRing.x);
      if (k > 0.0 && k < 1.0) col *= 1.0 - 0.7 * texture2D(tRing, vec2(k, 0.5)).r;
    }

    // night side: almost the sky, with a trace of the bands in the sky's own light
    col += albedo * uFill * 0.05 * (0.4 + 0.6 * mu);

    // air: a thin bright line along the lit limb, reaching a little past the terminator,
    // and a hair of it all the way round
    float limb = pow(1.0 - mu, 2.6);
    float reach = smoothstep(-0.6, 0.25, ndl);
    col += uAir * limb * (0.03 + 0.4 * reach * reach);

    // the silhouette is smoothed here, by fading the last pixel of the limb: the multisampling
    // of the picture is too coarse for an edge this dark against rings this bright
    gl_FragColor = vec4(col, clamp(mu / max(fwidth(mu) * 1.5, 1e-4), 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

const ringVertex = /* glsl */ `
  varying vec3 vFrame;
  varying vec3 vV;
  varying vec3 vUp;
  void main() {
    vFrame = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    // the normal of the ring plane, in view space
    vUp = normalMatrix * vec3(0.0, 1.0, 0.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const ringFragment = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uLightFrame;
  uniform vec3 uSun;
  uniform vec3 uSand;
  uniform vec3 uCool;
  uniform sampler2D tRing;
  uniform vec2 uRing;
  varying vec3 vFrame;
  varying vec3 vV;
  varying vec3 vUp;
  void main() {
    float r = length(vFrame.xz);
    float k = (r - uRing.x) / (uRing.y - uRing.x);
    float density = texture2D(tRing, vec2(k, 0.5)).r;
    if (density < 0.004) discard;

    // the planet's shadow: how close does the ray towards the sun pass the centre of the globe?
    float along = dot(vFrame, uLightFrame);
    float miss = sqrt(max(dot(vFrame, vFrame) - along * along, 0.0));
    float shadow = along < 0.0 ? mix(0.1, 1.0, smoothstep(0.88, 1.08, miss)) : 1.0;

    vec3 v = normalize(vV);
    vec3 up = normalize(vUp);
    float sunHeight = dot(up, uLight); // how steeply the light meets the ring plane, signed
    vec3 tint = mix(uSand, uCool, smoothstep(0.55, 1.0, k) * 0.5);
    vec3 col;
    if (sunHeight * dot(up, v) > 0.0) {
      // the lit face is the one we see: the dust shines where it is dense
      col = tint * uSun * density * (0.3 + 0.9 * abs(sunHeight));
    } else {
      // the unlit face: only what comes through the thin parts
      col = tint * uSun * density * exp(-density * 1.5) * 0.9;
    }
    col *= shadow;

    gl_FragColor = vec4(col, density * 0.82);
    #include <colorspace_fragment>
  }
`;

const moonFragment = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uSun;
  uniform vec3 uFill;
  uniform vec3 uRock;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vFrame;
  varying vec3 vBody;
  void main() {
    vec3 n = normalize(vN);
    float ndl = dot(n, uLight);
    vec3 col = uRock * (uSun * smoothstep(-0.1, 0.35, ndl) * 0.9 + uFill * 0.2);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** The rings from the inner edge (0) to the outer one (1): how much dust there is. */
function ringProfile(): DataTexture {
  const N = 512;
  const rand = rng(19990121);
  // smooth random curves from a few octaves of value noise
  const lattice = Array.from({ length: 512 }, () => rand());
  const curve = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return lattice[i & 511] * (1 - s) + lattice[(i + 1) & 511] * s;
  };
  const step = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const data = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    // broad bands, finer ringlets on them
    let d = 0.5 + 0.5 * curve(k * 7 + 3);
    d *= 0.6 + 0.4 * curve(k * 31 + 40);
    d *= 0.82 + 0.18 * curve(k * 110 + 90);
    // a faint inner ring, the bright main rings, one clear division, a shallow dip further out
    // (nothing narrower: a gap thinner than a pixel on screen breaks up into dashes)
    d *= 0.3 + 0.7 * step(0.16, 0.24, k);
    d *= 1 - 0.94 * step(0.585, 0.6, k) * (1 - step(0.645, 0.66, k));
    d *= 1 - 0.45 * step(0.8, 0.825, k) * (1 - step(0.86, 0.885, k));
    d *= 0.75 + 0.25 * (1 - step(0.66, 1, k));
    // soft edges
    d *= step(0, 0.035, k) * (1 - step(0.955, 1, k));
    data[i] = Math.round(Math.min(1, d) * 255);
  }
  const texture = new DataTexture(data, N, 1, RedFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createPlanet(): Planet {
  const group = new Group();

  // the planet's own frame: y is its axis, the rings and orbits lie in the x–z plane.
  // Rolled, so the rings climb to the right, away from the page column, and tipped towards
  // the camera just enough that the near arc crosses the lower part of the globe (see update)
  const frame = new Group();
  frame.rotation.set(TIP, 0, ROLL);
  group.add(frame);

  // the frame is only rotated against the view, and the camera barely turns, so view space
  // stands in for world space when the light is brought into the frame of the rings
  const toFrame = new Quaternion();

  const profile = ringProfile();
  const lightFrame = new Vector3();
  const light = {
    uLight: { value: PLANET_LIGHT },
    uLightFrame: { value: lightFrame },
    uSun: { value: SUN_COLOR.clone().multiplyScalar(0.7) },
    uFill: { value: FILL_COLOR },
  };
  const ring = { tRing: { value: profile }, uRing: { value: RING } };

  const sphere = new SphereGeometry(1, 64, 40);
  const globeMaterial = new ShaderMaterial({
    vertexShader: globeVertex,
    fragmentShader: globeFragment,
    // opaque, but sorted with the see-through things, so it is drawn after the stars and
    // covers them, and before its own rings, which it hides where they pass behind it
    transparent: true,
    uniforms: {
      ...light,
      ...ring,
      uSpin: { value: 0 },
      uDeep: { value: new Color('#27485A') },
      uPale: { value: new Color('#7FA9B8') },
      uWarm: { value: new Color('#B9B49A') },
      uAir: { value: new Color('#9FDCE8') },
    },
  });
  const globe = new Mesh(sphere, globeMaterial);
  globe.renderOrder = 0;
  frame.add(globe);

  // the rings: a flat disc in the plane of the equator
  const disc = new RingGeometry(RING[0], RING[1], 160, 1);
  disc.rotateX(-Math.PI / 2);
  const ringMaterial = new ShaderMaterial({
    vertexShader: ringVertex,
    fragmentShader: ringFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      ...light,
      ...ring,
      uSand: { value: new Color('#E2CFA8') },
      uCool: { value: new Color('#A9C4CC') },
    },
  });
  const rings = new Mesh(disc, ringMaterial);
  rings.renderOrder = 1;
  frame.add(rings);

  // moons: each on its own slightly tilted orbit
  const moonMaterial = new ShaderMaterial({
    vertexShader: globeVertex,
    fragmentShader: moonFragment,
    transparent: true,
    uniforms: { ...light, uSpin: { value: 0 }, uRock: { value: new Color('#8FA3A8') } },
  });
  const moons = [
    { radius: 2.75, tilt: 0.07, period: 80, phase: 2.2, size: 0.05 },
    { radius: 3.4, tilt: -0.05, period: 150, phase: 5.4, size: 0.038 },
  ].map((m) => {
    const plane = new Group();
    plane.rotation.x = m.tilt;
    const arm = new Group();
    const moon = new Mesh(sphere, moonMaterial);
    moon.scale.setScalar(m.size);
    moon.position.x = m.radius;
    moon.renderOrder = 1;
    arm.add(moon);
    plane.add(arm);
    frame.add(plane);
    return { arm, rate: (Math.PI * 2) / m.period, phase: m.phase };
  });

  return {
    group,
    update(time) {
      globeMaterial.uniforms.uSpin.value = time * 0.035;
      for (const m of moons) m.arm.rotation.y = m.phase + time * m.rate;
      // The planet climbs through the view as the page scrolls, so the camera sees it first
      // from above and at the end from below. Tipping the frame by that same angle keeps the
      // rings open by the same amount all the way, instead of closing to a line.
      frame.rotation.x = TIP + Math.atan2(group.position.y, -group.position.z);
      toFrame.copy(frame.quaternion).invert();
      lightFrame.copy(PLANET_LIGHT).applyQuaternion(toFrame);
    },
    dispose() {
      sphere.dispose();
      disc.dispose();
      profile.dispose();
      globeMaterial.dispose();
      ringMaterial.dispose();
      moonMaterial.dispose();
    },
  };
}
