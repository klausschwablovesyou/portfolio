import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import { SUN, SUN_COLOR } from './sun';

/**
 * The contact emblem: a four-point throwing star (a hira shuriken), a nod to the "Ninja" in
 * the LinkedIn headline. It is built like the real thing: a flat plate of dark steel with a
 * hole in the middle, ground down to a sharp edge all the way round. It has no lights of its
 * own to answer to: the steel mirrors the dusk around it (a dark sky, the glow of the horizon,
 * the low sun behind it on the right), so the ground bevels flash as it turns and the flats
 * carry a soft brushed sheen. Fast pointer movement spins it up; it eases back by itself.
 *
 * To swap it for a neutral shape, return any other object with the same Emblem interface
 * (scene/index.ts only uses `group`, `update` and `dispose`).
 */
export interface Emblem {
  group: Group;
  update(dt: number, t: number, pointer: { x: number; y: number }, boost: number): void;
  dispose(): void;
}

const POINTS = 4;
const OUTER = 1;
/** radius of the notch between two points: this wide, the blades read as steel, not as a sparkle */
const NOTCH = 0.37;
/** half the thickness of the plate */
const HALF = 0.042;
/** width of the ground edge, measured across it */
const BEVEL = 0.075;
const HOLE = 0.13;
/** segments per blade edge on the hole, so the hole has POINTS * 2 times as many */
const HOLE_STEPS = 6;
/** the star against the size scene/index.ts gives its group: an accent, not the main thing */
const SIZE = 0.74;

/** what a face is: the shader finishes each differently */
const FLAT = 0;
const GROUND = 1;
const BORE = 2;

type P2 = [number, number];
type P3 = [number, number, number];

function starGeometry(): BufferGeometry {
  const corners = POINTS * 2;
  const step = Math.PI / POINTS;
  const at = (angle: number, r: number): P2 => [Math.cos(angle) * r, Math.sin(angle) * r];

  // the cutting edge, in the middle of the plate: tips and notches in turn
  const edge: P2[] = Array.from({ length: corners }, (_, i) => at(i * step, i % 2 ? NOTCH : OUTER));
  // The flat is the same star moved in by the bevel width. Every edge is the same distance
  // from the centre, so moving them all in by the same amount is a plain scale.
  const [ax, ay] = edge[0];
  const [bx, by] = edge[1];
  const reach = Math.abs(ax * by - ay * bx) / Math.hypot(bx - ax, by - ay);
  const inset = (reach - BEVEL) / reach;
  const flat: P2[] = edge.map(([x, y]) => [x * inset, y * inset]);
  const hole = (i: number): P2 => at((i * step) / HOLE_STEPS, HOLE);

  const position: number[] = [];
  const part: number[] = [];
  /** one triangle, counter-clockwise seen from the front, and its mirror image on the back */
  const both = (a: P3, b: P3, c: P3, kind: number): void => {
    position.push(...a, ...b, ...c);
    position.push(a[0], a[1], -a[2], c[0], c[1], -c[2], b[0], b[1], -b[2]);
    for (let i = 0; i < 6; i++) part.push(kind);
  };
  const one = (a: P3, b: P3, c: P3, kind: number): void => {
    position.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) part.push(kind);
  };
  const up = ([x, y]: P2, z: number): P3 => [x, y, z];

  for (let i = 0; i < corners; i++) {
    const j = (i + 1) % corners;
    const e0 = up(edge[i], 0);
    const e1 = up(edge[j], 0);
    const f0 = up(flat[i], HALF);
    const f1 = up(flat[j], HALF);

    // the ground bevel, from the cutting edge up to the flat
    both(e0, e1, f1, GROUND);
    both(e0, f1, f0, GROUND);

    // the flat, from the bevel in to the hole
    const mid = HOLE_STEPS / 2;
    for (let s = 0; s < HOLE_STEPS; s++) {
      const h0 = up(hole(i * HOLE_STEPS + s), HALF);
      const h1 = up(hole(i * HOLE_STEPS + s + 1), HALF);
      both(s < mid ? f0 : f1, h1, h0, FLAT);
      // the bore of the hole, facing the axis
      const b0: P3 = [h0[0], h0[1], -HALF];
      const b1: P3 = [h1[0], h1[1], -HALF];
      one(h0, h1, b1, BORE);
      one(h0, b1, b0, BORE);
    }
    both(f0, f1, up(hole(i * HOLE_STEPS + mid), HALF), FLAT);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  geometry.computeVertexNormals(); // non-indexed, so every face keeps its own flat normal
  return geometry;
}

const vertex = /* glsl */ `
  attribute float aPart;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObject;
  varying vec3 vAcross;
  varying vec3 vWorldOut;
  varying float vPart;
  void main() {
    // outwards from the middle of the star, in the world: which way a crowned plate leans
    vWorldOut = (modelMatrix * vec4(position.xy, 0.0, 0.0)).xyz / max(length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), 1e-4);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    vObject = position;
    // across the blade, in view space: the direction the brushing tilts the surface in
    vAcross = normalMatrix * normalize(vec3(-position.y, position.x, 0.0) + 1e-4);
    vPart = aPart;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSun;
  uniform vec3 uSky;
  uniform vec3 uSoft;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform vec3 uGroundTone;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObject;
  varying vec3 vAcross;
  varying vec3 vWorldOut;
  varying float vPart;

  float hash1(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
  }

  // What the steel mirrors: a dark sky above, a glowing horizon (warm towards the sun), dark
  // ground below, the sun itself, and the pale light of the sky behind the viewer, high on the
  // left. Smooth on purpose: it is seen in a brushed surface.
  // polished: 0 for the brushed plate (a narrow sheen that travels across it), 1 for the
  // ground edge (many small faces at every angle: they take light from everywhere)
  vec3 surroundings(vec3 dir, float polished) {
    float towards = pow(max(dot(normalize(dir.xz + 1e-4), normalize(uSunDir.xz)), 0.0), 2.0);
    vec3 glow = mix(uCool, uWarm, towards);
    float band = exp(-dir.y * dir.y * mix(4.0, 2.2, polished));
    vec3 col = mix(dir.y > 0.0 ? uSky : uGroundTone, glow, band);
    float soft = max(dot(dir, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
    col += uSoft * pow(soft, mix(7.0, 1.6, polished)) * mix(1.15, 0.75, polished);
    float sun = max(dot(dir, normalize(uSunDir)), 0.0);
    return col + uSun * (pow(sun, mix(18.0, 90.0, polished)) * mix(0.9, 2.6, polished));
  }

  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vV);

    float ground = step(0.5, vPart) * step(vPart, 1.5);
    float bore = step(1.5, vPart);

    // the flats are brushed outwards along the blades: fine streaks tilt the mirror a little
    float lane = atan(vObject.y, vObject.x) * 46.0 + length(vObject.xy) * 3.0;
    float streak = mix(hash1(floor(lane)), hash1(floor(lane) + 1.0), smoothstep(0.0, 1.0, fract(lane))) - 0.5;
    float plate = (1.0 - ground) * (1.0 - bore);
    n = normalize(n + normalize(vAcross) * streak * 0.16 * plate);
    // no plate is perfectly flat: the faintest crown lets the sheen travel across it
    n = normalize(n + (viewMatrix * vec4(vWorldOut, 0.0)).xyz * 0.26 * plate);

    vec3 mirrored = reflect(-v, n);
    float facing = max(dot(n, v), 0.0);
    // steel: a dark blued flat, a bright ground bevel, a dull bore
    vec3 tint = mix(vec3(0.2, 0.235, 0.275), vec3(0.82, 0.84, 0.86), ground);
    tint = mix(tint, vec3(0.12, 0.14, 0.16), bore);
    vec3 f0 = tint;
    vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);
    vec3 col = surroundings(mirrored, ground) * fresnel;
    // a little of the sky's light on the steel itself, so a face that mirrors the dark is not a hole;
    // the ground edge is polished and takes more of it
    col += tint * (uSky * 0.7 + uSoft * 0.12 * ground);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createShuriken(): Emblem {
  const group = new Group();
  const tilt = new Group();
  const spinner = new Group();
  tilt.scale.setScalar(SIZE);
  tilt.add(spinner);
  group.add(tilt);

  const geometry = starGeometry();
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uSunDir: { value: SUN },
      uSun: { value: SUN_COLOR },
      uSky: { value: new Color('#16303F') },
      uSoft: { value: new Color('#9DB9CC') },
      uCool: { value: new Color('#2C5A6C') },
      uWarm: { value: new Color('#C98A55') },
      uGroundTone: { value: new Color('#070D12') },
    },
  });
  spinner.add(new Mesh(geometry, material));

  // starts a little off the upright cross, so it reads as a star in flight when motion is off
  let angle = 0.32;
  /** turns per second above the resting speed; pointer movement adds to it, friction takes it away */
  let extra = 0;

  return {
    group,
    update(dt, t, pointer, boost) {
      // the pointer's boost is a push, not a speed: the star gathers speed and coasts down
      extra += (boost * 7 - extra) * Math.min(1, dt * (boost * 7 > extra ? 5 : 0.9));
      angle += dt * (0.32 + extra);
      spinner.rotation.z = -angle;
      // Nearly face-on: a flat star tilted far over loses its outline. It leans back and to
      // the left, so its flats mirror the pale sky behind the viewer and not the dark ground.
      tilt.rotation.x = -0.36 + Math.sin(t * 0.4) * 0.06 + pointer.y * 0.14;
      tilt.rotation.y = -0.34 + Math.sin(t * 0.27) * 0.07 + pointer.x * 0.26;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
