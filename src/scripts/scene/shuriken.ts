import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three';

/**
 * The contact emblem: a four-point throwing star (a hira shuriken), a nod to the "Ninja" in
 * the LinkedIn headline. It is built like the real thing: a flat steel plate with a hole in
 * the middle, ground down to a sharp edge all the way round. The flat and the ground bevels
 * catch the light differently as it turns. Fast pointer movement spins it up and leaves a few
 * fading outlines behind it.
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
const NOTCH = 0.4;
/** half the thickness of the plate */
const HALF = 0.05;
/** width of the ground edge, measured across it */
const BEVEL = 0.09;
const HOLE = 0.14;
/** segments per blade edge on the hole, so the hole has POINTS * 2 times as many */
const HOLE_STEPS = 6;
const GHOSTS = 4;

const FLAT = new Color('#356673');
const GROUND = new Color('#8FAEB6');
const BORE = new Color('#14343C');

type P2 = [number, number];
type P3 = [number, number, number];

interface StarGeometry {
  body: BufferGeometry;
  /** the cutting edge: the silhouette of the star */
  outline: BufferGeometry;
  /** where the bevels meet the flats, and the rims of the hole */
  detail: BufferGeometry;
}

function starGeometry(): StarGeometry {
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
  const color: number[] = [];
  /** one triangle, counter-clockwise seen from the front, and its mirror image on the back */
  const both = (a: P3, b: P3, c: P3, tint: Color): void => {
    position.push(...a, ...b, ...c);
    position.push(a[0], a[1], -a[2], c[0], c[1], -c[2], b[0], b[1], -b[2]);
    for (let i = 0; i < 6; i++) color.push(tint.r, tint.g, tint.b);
  };
  const one = (a: P3, b: P3, c: P3, tint: Color): void => {
    position.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) color.push(tint.r, tint.g, tint.b);
  };
  const up = ([x, y]: P2, z: number): P3 => [x, y, z];

  const outline: number[] = [];
  const detail: number[] = [];

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
      detail.push(...h0, ...h1, ...b0, ...b1);
    }
    both(f0, f1, up(hole(i * HOLE_STEPS + mid), HALF), FLAT);

    outline.push(...e0, ...e1);
    for (const z of [HALF, -HALF]) {
      detail.push(flat[i][0], flat[i][1], z, flat[j][0], flat[j][1], z);
      // the short ridge where two bevels meet, at every tip and notch
      detail.push(edge[i][0], edge[i][1], 0, flat[i][0], flat[i][1], z);
    }
  }

  const body = new BufferGeometry();
  body.setAttribute('position', new Float32BufferAttribute(position, 3));
  body.setAttribute('color', new Float32BufferAttribute(color, 3));
  body.computeVertexNormals(); // non-indexed, so every face keeps its own flat normal

  const lines = (points: number[]): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points, 3));
    return g;
  };
  return { body, outline: lines(outline), detail: lines(detail) };
}

export function createShuriken(): Emblem {
  const group = new Group();
  const spinner = new Group();
  group.add(spinner);

  const geo = starGeometry();
  const steel = new MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.6,
    roughness: 0.42,
    flatShading: true,
    emissive: new Color('#0C2229'),
    // the lines lie on the surface: push the faces back a touch, so the lines stay whole
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new Mesh(geo.body, steel);

  const edgeMat = new LineBasicMaterial({ color: new Color('#FFC95C'), transparent: true, opacity: 0.95 });
  const detailMat = new LineBasicMaterial({ color: new Color('#F2B33D'), transparent: true, opacity: 0.4 });
  spinner.add(mesh, new LineSegments(geo.outline, edgeMat), new LineSegments(geo.detail, detailMat));

  // Afterimages: outlines that trail the star while it spins fast.
  const ghostMats: LineBasicMaterial[] = [];
  const ghosts = Array.from({ length: GHOSTS }, () => {
    const mat = new LineBasicMaterial({ color: new Color('#F2B33D'), transparent: true, opacity: 0, depthWrite: false });
    ghostMats.push(mat);
    const ghost = new LineSegments(geo.outline, mat);
    group.add(ghost);
    return ghost;
  });

  // starts a little off the upright cross, so it reads as a star in flight when motion is off
  let angle = 0.32;

  return {
    group,
    update(dt, t, pointer, boost) {
      const speed = 0.5 + boost * 9;
      angle += dt * speed;
      spinner.rotation.z = -angle;
      // nearly face-on: a flat star tilted far over loses its outline
      group.rotation.x = 0.4 + Math.sin(t * 0.4) * 0.1 + pointer.y * 0.16;
      group.rotation.y = -0.34 + Math.sin(t * 0.27) * 0.12 + pointer.x * 0.3;

      ghosts.forEach((ghost, i) => {
        ghost.rotation.z = -angle + (i + 1) * 0.085 * Math.min(2.2, speed * 0.32);
        ghostMats[i].opacity = Math.min(0.5, boost * 0.55) * (1 - i / GHOSTS);
      });
    },
    dispose() {
      geo.body.dispose();
      geo.outline.dispose();
      geo.detail.dispose();
      steel.dispose();
      edgeMat.dispose();
      detailMat.dispose();
      ghostMats.forEach((m) => m.dispose());
    },
  };
}
