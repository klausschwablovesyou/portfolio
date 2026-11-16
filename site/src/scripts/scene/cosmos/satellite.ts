import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { FILL_COLOR, SUN_COLOR } from '../sun';
import { emit, type Shared } from './shared';

/**
 * A satellite, built as a small solid model: a body wrapped in dark foil, two solar wings with
 * a cell grid, a dish on a short neck that looks off to one side, and a mast with a beacon that
 * flashes now and then. It is lit like everything else: a warm edge from the sun behind it, a
 * faint cool fill from the front, and a glint when a wing mirrors the sun. It turns slowly
 * around its own axis.
 *
 * Its own frame: y is the axis through the dish and the mast, the wings reach out along x.
 * Built with a radius of 1 (the tips of the wings) around the origin; cosmos/index.ts places
 * and scales it. All of it is one mesh and one point: two draw calls.
 */
export interface Satellite {
  group: Group;
  /** 0–1, scales all the light of the body */
  fade: { value: number };
  update(time: number): void;
  dispose(): void;
}

/** half the size of the body: x, y, z */
const BUS = [0.17, 0.23, 0.17];
/** a wing: from where to where along x, half its width, and how far it is pitched round the boom */
const WING = { from: 0.36, to: 1, half: 0.2, pitch: 0.5 };
/** the dish: radius of the rim, how deep it is, and how far above the body it starts */
const DISH = { radius: 0.3, deep: 0.11, neck: 0.07 };
const MAST = 0.44;
/** seconds for one turn around its axis, and between two flashes of the beacon */
const TURN = 140;
const FLASH = 3.4;

/** what a part is made of; the shader tells them apart */
const FOIL = 0;
const CELLS = 1;
const FRAME = 2;
const WHITE = 3;

const vertex = /* glsl */ `
  attribute float aPart;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vPart;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    vUv = uv;
    vPart = aPart;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uSun;
  uniform vec3 uFill;
  uniform float uFade;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vPart;

  // a line of the given width (in units of the coordinate) at every whole number, anti-aliased
  float grid(float x, float width) {
    float d = abs(fract(x - 0.5) - 0.5);
    float w = fwidth(x);
    return 1.0 - smoothstep(width * 0.5, width * 0.5 + w, d);
  }

  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vV);
    float ndl = max(dot(n, uLight), 0.0);
    // sky light from the front-left, so the side in shadow still has a form
    float fill = max(dot(n, normalize(vec3(-0.5, 0.35, 0.8))), 0.0);
    float ndh = max(dot(n, normalize(uLight + v)), 0.0);
    float graze = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec3 albedo;
    float gloss;
    float shine;
    if (vPart < 0.5) {
      // dark gold foil in four panels, with a seam between them
      float seam = max(grid(vUv.x * 2.0, 0.05), grid(vUv.y * 2.0, 0.04));
      albedo = mix(vec3(0.21, 0.155, 0.07), vec3(0.05, 0.045, 0.04), seam);
      gloss = 26.0;
      shine = 0.5;
    } else if (vPart < 1.5) {
      // solar cells: deep blue, in a pale frame with pale lines between the cells
      float line = max(grid(vUv.x * 8.0, 0.09), grid(vUv.y * 4.0, 0.09));
      albedo = mix(vec3(0.012, 0.028, 0.075), vec3(0.3, 0.33, 0.36), line);
      gloss = mix(260.0, 30.0, line);
      shine = mix(2.2, 0.3, line);
    } else if (vPart < 2.5) {
      albedo = vec3(0.26, 0.28, 0.3);
      gloss = 30.0;
      shine = 0.35;
    } else {
      albedo = vec3(0.46, 0.48, 0.5);
      gloss = 14.0;
      shine = 0.2;
    }

    vec3 col = albedo * (uSun * ndl * 1.5 + uFill * (0.1 + 0.26 * fill));
    // the sun mirrored: on a wing this is the glint
    col += uSun * pow(ndh, gloss) * shine;
    // and a little of the sky, mirrored at a glancing angle
    col += uFill * graze * 0.09;

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

const beaconVertex = /* glsl */ `
  uniform float uPx;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(7.0 * uPx, 2.0);
  }
`;

const beaconFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFlash;
  ${emit}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    gl_FragColor = vec4(emit(uColor * uFlash * exp(-dot(c, c) * 4.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Collects the parts of the model into one geometry. */
function builder() {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  return {
    /** adds `geometry`, placed by `at` and turned by `turn` (Euler angles), made of `kind` */
    add(geometry: BufferGeometry, kind: number, at: Vector3, turn = new Euler(), parent?: Matrix4) {
      const matrix = new Matrix4().compose(at, q.setFromEuler(turn), one);
      if (parent) matrix.premultiply(parent);
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      flat.applyMatrix4(matrix);
      const p = flat.getAttribute('position');
      const n = flat.getAttribute('normal');
      const t = flat.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        position.push(p.getX(i), p.getY(i), p.getZ(i));
        normal.push(n.getX(i), n.getY(i), n.getZ(i));
        uv.push(t.getX(i), t.getY(i));
        part.push(kind);
      }
      if (flat !== geometry) flat.dispose();
      geometry.dispose();
    },
    build() {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(position, 3));
      g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
      return g;
    },
  };
}

export function createSatellite(shared: Shared): Satellite {
  const group = new Group();
  const fade = { value: 1 };
  const flash = { value: 1 };

  // attitude: tipped towards the camera and rolled, so the turn is seen from above at an angle
  // and neither the wings nor the dish are ever edge-on for long
  const attitude = new Group();
  const spin = new Group();
  attitude.add(spin);
  group.add(attitude);

  const model = builder();
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

  // body
  model.add(new BoxGeometry(BUS[0] * 2, BUS[1] * 2, BUS[2] * 2), FOIL, v(0, 0, 0));

  // wings: a boom and a panel on each side; both panels are pitched the same way, as panels
  // that follow the sun would be
  for (const side of [-1, 1]) {
    const boom = WING.from - BUS[0];
    model.add(new BoxGeometry(boom, 0.024, 0.024), FRAME, v(side * (BUS[0] + boom / 2), 0, 0));
    model.add(
      new BoxGeometry(WING.to - WING.from, 0.014, WING.half * 2),
      CELLS,
      v((side * (WING.from + WING.to)) / 2, 0, 0),
      new Euler(WING.pitch, 0, 0),
    );
  }

  // dish: a shallow paraboloid on a short neck, the feed held at its focus by three struts.
  // It leans away from the axis, as if it looked at something
  {
    const { radius, deep, neck } = DISH;
    const k = deep / (radius * radius);
    const lean = new Matrix4().compose(v(0, BUS[1] + neck, 0), new Quaternion().setFromEuler(new Euler(0.2, 0, -0.42)), v(1, 1, 1));
    const curve = Array.from({ length: 9 }, (_, i) => {
      const r = (radius * i) / 8;
      return new Vector2(r, k * r * r);
    });
    model.add(new LatheGeometry(curve, 40), WHITE, v(0, 0, 0), new Euler(), lean);
    const focus = 1 / (4 * k);
    model.add(new BoxGeometry(0.04, 0.04, 0.04), FRAME, v(0, focus, 0), new Euler(), lean);
    const up = v(0, 1, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const from = v(Math.cos(a) * radius, deep, Math.sin(a) * radius);
      const along = v(0, focus, 0).sub(from);
      const length = along.length();
      const turn = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(up, along.normalize()));
      model.add(new CylinderGeometry(0.007, 0.007, length, 5), FRAME, from.addScaledVector(along, length / 2), turn, lean);
    }
    model.add(new CylinderGeometry(0.022, 0.022, neck, 8), FRAME, v(0, BUS[1] + neck / 2, 0));
  }

  // mast: down from the body, two short cross pieces, the beacon at its end
  const end = -BUS[1] - MAST;
  model.add(new CylinderGeometry(0.012, 0.012, MAST, 6), FRAME, v(0, -BUS[1] - MAST / 2, 0));
  model.add(new BoxGeometry(0.18, 0.012, 0.012), FRAME, v(0, -BUS[1] - 0.2, 0));
  model.add(new BoxGeometry(0.012, 0.012, 0.12), FRAME, v(0, -BUS[1] - 0.3, 0));

  const geometry = model.build();
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: DoubleSide,
    // opaque, but sorted with the see-through things, so it is drawn after the stars and
    // covers the ones behind it
    transparent: true,
    uniforms: {
      uLight: shared.uLight,
      uSun: { value: SUN_COLOR },
      uFill: { value: FILL_COLOR },
      uFade: fade,
    },
  });
  const body = new Mesh(geometry, material);
  body.renderOrder = 0;

  const beaconGeometry = new BufferGeometry();
  beaconGeometry.setAttribute('position', new Float32BufferAttribute([0, end, 0], 3));
  const beaconMaterial = new ShaderMaterial({
    vertexShader: beaconVertex,
    fragmentShader: beaconFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color('#F2B33D') }, uFlash: flash, uPx: shared.uPx, uGain: shared.uGain },
  });
  const beacon = new Points(beaconGeometry, beaconMaterial);
  beacon.renderOrder = 1;

  spin.add(body, beacon);

  return {
    group,
    fade,
    update(time) {
      spin.rotation.y = 0.6 + (time * Math.PI * 2) / TURN;
      // it is not held perfectly still either
      attitude.rotation.set(0.62 + Math.sin(time * 0.13) * 0.07, 0, -0.38 + Math.sin(time * 0.09 + 1) * 0.05);
      // a short flash, and a little light in between
      const beat = Math.max(0, Math.sin((time * Math.PI * 2) / FLASH));
      flash.value = fade.value * (0.2 + 1.5 * beat ** 10);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      beaconGeometry.dispose();
      beaconMaterial.dispose();
    },
  };
}
