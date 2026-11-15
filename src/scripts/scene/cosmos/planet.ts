import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  type Material,
} from 'three';
import { circles, dotMaterial, lineMaterial, type Fade } from './kit';
import type { Shared } from './shared';

/**
 * The one landmark of the sky: a dark planet drawn like a technical drawing. The body is a
 * plain dark disc with a thin crescent of light on the side of the sun, so it hides the stars
 * behind it; a graticule turns with it, a set of thin rings lies around its equator, and two
 * moons run on drawn orbits.
 *
 * Built with radius 1 around the origin; cosmos/index.ts places and scales it. It is far away,
 * so it rises only about half a screen while the whole page scrolls by.
 */
export interface Planet {
  group: Group;
  update(time: number): void;
  dispose(): void;
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

/* Night side nearly the colour of the sky; the day side shows only as a crescent along the limb. */
const bodyFragment = /* glsl */ `
  uniform vec3 uNight;
  uniform vec3 uDay;
  uniform vec3 uAir;
  uniform vec3 uLight;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float day = smoothstep(-0.1, 0.45, dot(n, uLight));
    float limb = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    vec3 col = mix(uNight, uDay, day * (0.3 + 0.7 * limb));
    // air: a thin bright line along the lit edge, a trace of it all the way round
    col += uAir * limb * (0.035 + 0.42 * day);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const BLUEPRINT = new Color('#A9CDD5');
const AMBER = new Color('#F2B33D');
const WHITE = new Color('#F4F8F7');

export function createPlanet(shared: Shared): Planet {
  const group = new Group();
  const fade: Fade = { value: 1 };
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => (geometries.push(g), g);
  const made = <T extends Material>(m: T): T => (materials.push(m), m);

  // the planet's own frame: y is its axis, the rings and orbits lie in the x–z plane.
  // Tipped towards the camera and rolled, so the rings open into ellipses
  const frame = new Group();
  frame.rotation.set(0.33, 0, -0.3);
  group.add(frame);

  const body = new Mesh(
    keep(new SphereGeometry(1, 72, 48)),
    made(
      new ShaderMaterial({
        vertexShader: bodyVertex,
        fragmentShader: bodyFragment,
        // opaque, but sorted with the see-through things, so it is drawn after the stars and
        // covers them, and before its own lines, which it hides where they pass behind it
        transparent: true,
        uniforms: {
          uNight: { value: new Color('#0B1D23') },
          uDay: { value: new Color('#256573') },
          uAir: { value: new Color('#8FD3DE') },
          uLight: shared.uLight,
        },
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    ),
  );
  body.renderOrder = 0;

  // graticule: parallels every 30°, meridians every 30°, a hair above the surface
  const R = 1.004;
  const parallels = [-60, -30, 0, 30, 60].map((lat) => {
    const a = (lat * Math.PI) / 180;
    return { radius: Math.cos(a) * R, y: Math.sin(a) * R, strength: lat === 0 ? 1 : 0.6 };
  });
  const grid = new Group();
  const gridLine = made(lineMaterial(shared, fade, BLUEPRINT.clone().multiplyScalar(0.16), true));
  grid.add(new LineSegments(keep(circles(parallels, 96)), gridLine));
  const meridian = keep(circles([{ radius: R, strength: 0.6 }], 96));
  for (let i = 0; i < 6; i++) {
    const m = new LineSegments(meridian, gridLine);
    // a circle around y, stood up through the poles, then turned to its longitude
    m.rotation.set(Math.PI / 2, (i * Math.PI) / 6, 0, 'YXZ');
    grid.add(m);
  }

  const globe = new Group();
  globe.add(body, grid);
  frame.add(globe);

  // rings: a few thin lines of different strength, with gaps, one of them amber
  const ringLine = made(lineMaterial(shared, fade, BLUEPRINT.clone().multiplyScalar(0.24), true));
  const rings = [
    [1.42, 0.45],
    [1.5, 0.8],
    [1.56, 0.55],
    [1.7, 1],
    [1.75, 0.7],
    [1.93, 0.5],
    [2.0, 0.9],
    [2.06, 0.4],
    [2.24, 0.6],
  ].map(([radius, strength]) => ({ radius, strength }));
  frame.add(new LineSegments(keep(circles(rings, 192)), ringLine));
  const warmLine = made(lineMaterial(shared, fade, AMBER.clone().multiplyScalar(0.3), true));
  frame.add(new LineSegments(keep(circles([{ radius: 1.84 }], 192)), warmLine));

  // moons: each on its own slightly tilted orbit; the orbit is drawn, the moon is a dot on it
  const one = keep(new BufferGeometry());
  one.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
  const orbitLine = made(lineMaterial(shared, fade, BLUEPRINT.clone().multiplyScalar(0.085), true));
  const moons = [
    { radius: 2.9, tilt: 0.07, period: 80, phase: 0.9, color: WHITE, size: 5 },
    { radius: 3.9, tilt: -0.05, period: 150, phase: 3.6, color: AMBER, size: 4.4 },
  ].map((m) => {
    const plane = new Group();
    plane.rotation.x = m.tilt;
    const arm = new Group();
    const moon = new Points(one, made(dotMaterial(shared, fade, m.color.clone().multiplyScalar(0.9), m.size)));
    moon.position.x = m.radius;
    arm.add(moon);
    plane.add(new LineSegments(keep(circles([{ radius: m.radius }], 256)), orbitLine), arm);
    frame.add(plane);
    return { arm, rate: (Math.PI * 2) / m.period, phase: m.phase };
  });

  // inside the group: the body first, then everything that may pass behind it
  frame.traverse((o) => {
    if (o !== body && !(o as { isGroup?: boolean }).isGroup) o.renderOrder = 1;
  });

  return {
    group,
    update(time) {
      globe.rotation.y = time * 0.035;
      for (const m of moons) m.arm.rotation.y = m.phase + time * m.rate;
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
