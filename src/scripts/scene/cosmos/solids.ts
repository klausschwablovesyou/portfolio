import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineSegments,
  Mesh,
  OctahedronGeometry,
  Points,
  TetrahedronGeometry,
  Vector3,
  type Material,
} from 'three';
import { corners, dotMaterial, glassMaterial, lineMaterial, type Fade } from './kit';
import { rng, type Shared } from './shared';

/**
 * The geometric bodies that drift through the star field: regular solids of thin glass with
 * their edges drawn and a dot on every corner, and a tesseract that turns through the fourth
 * dimension. Each one tumbles slowly on an axis of its own.
 *
 * Every body is built with a radius of about 1 around the origin; cosmos/index.ts places and
 * scales it.
 */
export type SolidKind = 'icosahedron' | 'dodecahedron' | 'octahedron' | 'star' | 'tesseract';

export interface Solid {
  group: Group;
  /** 0–1, scales all the light of the body */
  fade: Fade;
  update(time: number): void;
  dispose(): void;
}

export interface SolidOptions {
  /** radians per second */
  spin: number;
  seed: number;
  /** amber lines instead of the cool blueprint colour */
  warm?: boolean;
}

const COOL = new Color('#A9CDD5');
const AMBER = new Color('#F2B33D');
const GLASS = new Color('#7FC3CF');
const GLINT = new Color('#FFE2B0');
const WHITE = new Color('#F4F8F7');

/** how strong the lines and dots are against the glass */
const LINE = 0.34;
const INNER = 0.2;
const DOT = 0.75;

export function createSolid(kind: SolidKind, shared: Shared, { spin, seed, warm = false }: SolidOptions): Solid {
  const rand = rng(seed * 7919);
  const fade: Fade = { value: 1 };
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => (geometries.push(g), g);
  const made = <T extends Material>(m: T): T => (materials.push(m), m);

  const hue = warm ? AMBER : COOL;
  const line = made(lineMaterial(shared, fade, hue.clone().multiplyScalar(LINE)));
  const faint = made(lineMaterial(shared, fade, hue.clone().multiplyScalar(INNER)));
  const glass = made(glassMaterial(shared, fade, GLASS, GLINT));
  const dot = made(dotMaterial(shared, fade, (warm ? AMBER : WHITE).clone().multiplyScalar(DOT), 3.6));

  /** the outer shell of a body: edges, a dot on every corner, glass faces */
  const shell = (shape: BufferGeometry): Group => {
    const part = new Group();
    const edges = keep(new EdgesGeometry(keep(shape), 1));
    part.add(new LineSegments(edges, line), new Points(keep(corners(edges)), dot), new Mesh(shape, glass));
    return part;
  };
  /** a smaller solid inside it: fainter edges only, so the two do not turn into a tangle */
  const core = (shape: BufferGeometry): Group => {
    const part = new Group();
    part.add(new LineSegments(keep(new EdgesGeometry(keep(shape), 1)), faint));
    return part;
  };

  const axis = () => new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
  /** things that turn: object, axis, start angle, speed against `spin` */
  const turning: { part: Group; axis: Vector3; phase: number; rate: number }[] = [];
  const turn = (part: Group, rate: number): Group => {
    turning.push({ part, axis: axis(), phase: rand() * Math.PI * 2, rate });
    return part;
  };
  /** extra work per frame, for the body that changes shape */
  let animate: ((time: number) => void) | undefined;

  const body = turn(new Group(), 1);
  group.add(body);

  if (kind === 'icosahedron') {
    body.add(shell(new IcosahedronGeometry(1, 0)));
    // its dual inside, turning the other way
    body.add(turn(core(new DodecahedronGeometry(0.5, 0)), -1.7));
  } else if (kind === 'dodecahedron') {
    body.add(shell(new DodecahedronGeometry(1, 0)));
  } else if (kind === 'octahedron') {
    body.add(shell(new OctahedronGeometry(1, 0)));
    body.add(turn(core(new OctahedronGeometry(0.42, 0)), -2.3));
  } else if (kind === 'star') {
    // two tetrahedra through each other: a quarter turn of one gives the other
    const second = shell(new TetrahedronGeometry(1, 0));
    second.rotation.z = Math.PI / 2;
    body.add(shell(new TetrahedronGeometry(1, 0)), second);
  } else {
    // tesseract: the 16 corners of a four-dimensional cube and its 32 edges
    const edges: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      for (let bit = 0; bit < 4; bit++) if (!(i & (1 << bit))) edges.push([i, i | (1 << bit)]);
    }
    const linePos = new Float32BufferAttribute(new Float32Array(edges.length * 6), 3);
    const dotPos = new Float32BufferAttribute(new Float32Array(16 * 3), 3);
    const lines = keep(new BufferGeometry());
    lines.setAttribute('position', linePos);
    const dots = keep(new BufferGeometry());
    dots.setAttribute('position', dotPos);
    const wire = new LineSegments(lines, line);
    const points = new Points(dots, dot);
    // the corners move every frame: no fixed bounds to cull against
    wire.frustumCulled = points.frustumCulled = false;
    body.add(wire, points);

    const phase = rand() * Math.PI * 2;
    const corner = new Float32Array(16 * 3);
    animate = (time) => {
      // turn in the x–w plane, then look at it from a point on the w axis: the cube that is
      // "further away" in w is drawn smaller, and the two cubes pass through each other
      const a = phase + time * spin * 2.2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (let i = 0; i < 16; i++) {
        const x = i & 1 ? 1 : -1;
        const y = i & 2 ? 1 : -1;
        const z = i & 4 ? 1 : -1;
        const w = i & 8 ? 1 : -1;
        const xr = x * cos - w * sin;
        const wr = x * sin + w * cos;
        const s = 0.78 / (2.6 - wr);
        corner.set([xr * s, y * s, z * s], i * 3);
      }
      dotPos.set(corner);
      edges.forEach(([from, to], e) => {
        linePos.set(corner.subarray(from * 3, from * 3 + 3), e * 6);
        linePos.set(corner.subarray(to * 3, to * 3 + 3), e * 6 + 3);
      });
      linePos.needsUpdate = dotPos.needsUpdate = true;
    };
  }

  return {
    group,
    fade,
    update(time) {
      for (const t of turning) t.part.quaternion.setFromAxisAngle(t.axis, t.phase + time * spin * t.rate);
      animate?.(time);
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
