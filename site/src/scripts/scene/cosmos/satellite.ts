import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Points,
  type Material,
} from 'three';
import { circles, corners, dotMaterial, glassMaterial, lineMaterial, type Fade } from './kit';
import type { Shared } from './shared';

/**
 * A satellite, drawn like the planet: thin lines, a dot on the corners, faces of thin glass.
 * A box for the body, two solar panels on booms, a dish that looks off to one side and a mast
 * with a beacon that flashes now and then. It turns slowly around its own axis, so the panels
 * sweep round and glint when one of them mirrors the light.
 *
 * Its own frame: y is the axis through the dish and the mast, the panels reach out along x.
 * Built with a radius of 1 (the tips of the panels) around the origin; cosmos/index.ts places
 * and scales it.
 */
export interface Satellite {
  group: Group;
  /** 0–1, scales all the light of the body */
  fade: Fade;
  update(time: number): void;
  dispose(): void;
}

const COOL = new Color('#A9CDD5');
const AMBER = new Color('#F2B33D');
const GLASS = new Color('#7FC3CF');
const GLINT = new Color('#FFE2B0');
const WHITE = new Color('#F4F8F7');

/** how strong the lines and dots are against the glass */
const LINE = 0.36;
const INNER = 0.17;
const DOT = 0.7;

/** half the size of the body: x, y, z */
const BUS = [0.17, 0.23, 0.17];
/** a panel: from where to where along x, and half its width */
const PANEL = { from: 0.36, to: 1, half: 0.2, cells: 4 };
/** the dish: radius of the rim, how deep it is, and how far above the body it starts */
const DISH = { radius: 0.3, deep: 0.11, neck: 0.07 };
/** seconds for one turn around its axis, and between two flashes of the beacon */
const TURN = 140;
const FLASH = 3.4;

/** Line segments from pairs of points. */
function segments(points: number[][]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
  return g;
}

export function createSatellite(shared: Shared): Satellite {
  const group = new Group();
  const fade: Fade = { value: 1 };
  /** the beacon has its own, so it can flash */
  const flash: Fade = { value: 1 };
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => (geometries.push(g), g);
  const made = <T extends Material>(m: T): T => (materials.push(m), m);

  const line = made(lineMaterial(shared, fade, COOL.clone().multiplyScalar(LINE)));
  const faint = made(lineMaterial(shared, fade, COOL.clone().multiplyScalar(INNER)));
  const rings = made(lineMaterial(shared, fade, COOL.clone().multiplyScalar(LINE), true));
  const cells = made(lineMaterial(shared, fade, AMBER.clone().multiplyScalar(0.2)));
  const glass = made(glassMaterial(shared, fade, GLASS, GLINT));
  const dot = made(dotMaterial(shared, fade, WHITE.clone().multiplyScalar(DOT), 3.2));
  const feedDot = made(dotMaterial(shared, fade, AMBER.clone().multiplyScalar(0.8), 4));
  const beaconDot = made(dotMaterial(shared, flash, AMBER.clone(), 5.5));

  // attitude: tipped towards the camera and rolled, so the turn is seen from above at an angle
  // and neither the panels nor the dish are ever edge-on for long
  const attitude = new Group();
  const spin = new Group();
  attitude.add(spin);
  group.add(attitude);

  // body: a box of glass with its edges drawn
  {
    const box = keep(new BoxGeometry(BUS[0] * 2, BUS[1] * 2, BUS[2] * 2));
    const edges = keep(new EdgesGeometry(box, 1));
    spin.add(new LineSegments(edges, line), new Points(keep(corners(edges)), dot), new Mesh(box, glass));
    // a band around the middle, where the booms are fixed
    const band = [-0.07, 0.07].flatMap((y) => [
      [-BUS[0], y, BUS[2]], [BUS[0], y, BUS[2]],
      [BUS[0], y, BUS[2]], [BUS[0], y, -BUS[2]],
      [BUS[0], y, -BUS[2]], [-BUS[0], y, -BUS[2]],
      [-BUS[0], y, -BUS[2]], [-BUS[0], y, BUS[2]],
    ]);
    spin.add(new LineSegments(keep(segments(band)), faint));
  }

  // solar panels: the same wing twice, the second one turned half round. A wing lies in its
  // x–z plane; it is pitched around the boom, as a panel that follows the sun would be
  {
    const { from, to, half, cells: count } = PANEL;
    const outline = keep(
      segments([
        [from, 0, -half], [to, 0, -half],
        [to, 0, -half], [to, 0, half],
        [to, 0, half], [from, 0, half],
        [from, 0, half], [from, 0, -half],
        // the boom, and a yoke from its end to the corners of the panel
        [BUS[0], 0, 0], [from - 0.09, 0, 0],
        [from - 0.09, 0, 0], [from, 0, -half * 0.6],
        [from - 0.09, 0, 0], [from, 0, half * 0.6],
      ]),
    );
    const grid: number[][] = [[from, 0, 0], [to, 0, 0]];
    for (let i = 1; i < count; i++) {
      const x = from + ((to - from) * i) / count;
      grid.push([x, 0, -half], [x, 0, half]);
    }
    const gridLines = keep(segments(grid));
    const tips = keep(
      segments([
        [from, 0, -half], [to, 0, -half],
        [to, 0, half], [from, 0, half],
      ]),
    );
    const face = keep(new PlaneGeometry(to - from, half * 2));
    face.rotateX(-Math.PI / 2);
    face.translate((from + to) / 2, 0, 0);

    for (const side of [0, Math.PI]) {
      const wing = new Group();
      wing.add(
        new LineSegments(outline, line),
        new LineSegments(gridLines, cells),
        new Points(tips, dot),
        new Mesh(face, glass),
      );
      // both wings face the same way: the pitch is undone by the half turn, so it is mirrored
      wing.rotation.set(side ? -0.5 : 0.5, side, 0, 'YXZ');
      spin.add(wing);
    }
  }

  // dish: a shallow paraboloid of rings and ribs on a short neck, the feed held over it by
  // three struts. It leans away from the axis, as if it looked at something
  {
    const { radius, deep, neck } = DISH;
    const k = deep / (radius * radius);
    const at = (r: number, a: number) => [Math.cos(a) * r, k * r * r, Math.sin(a) * r];
    const dish = new Group();
    dish.add(
      new LineSegments(
        keep(
          circles(
            [
              { radius, y: deep },
              { radius: radius * 0.62, y: k * (radius * 0.62) ** 2, strength: 0.5 },
            ],
            64,
          ),
        ),
        rings,
      ),
    );
    const ribs: number[][] = [];
    const steps = 5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let s = 0; s < steps; s++) ribs.push(at((radius * s) / steps, a), at((radius * (s + 1)) / steps, a));
    }
    dish.add(new LineSegments(keep(segments(ribs)), faint));
    // the feed sits at the focus of the paraboloid
    const focus = [0, 1 / (4 * k), 0];
    const struts: number[][] = [];
    for (let i = 0; i < 3; i++) struts.push(at(radius, (i / 3) * Math.PI * 2 + 0.5), focus);
    dish.add(new LineSegments(keep(segments(struts)), line));
    dish.add(new Points(keep(segments([focus])), feedDot));

    dish.position.y = BUS[1] + neck;
    dish.rotation.set(0.2, 0, -0.42);
    spin.add(dish, new LineSegments(keep(segments([[0, BUS[1], 0], [0, BUS[1] + neck, 0]])), line));
  }

  // mast: down from the body, two short cross pieces, the beacon at its end
  {
    const top = -BUS[1];
    const end = top - 0.44;
    const mast = [
      [0, top, 0], [0, end, 0],
      [-0.09, top - 0.2, 0], [0.09, top - 0.2, 0],
      [0, top - 0.3, -0.06], [0, top - 0.3, 0.06],
    ];
    spin.add(new LineSegments(keep(segments(mast)), line), new Points(keep(segments([[0, end, 0]])), beaconDot));
  }

  return {
    group,
    fade,
    update(time) {
      spin.rotation.y = 0.6 + (time * Math.PI * 2) / TURN;
      // it is not held perfectly still either
      attitude.rotation.set(0.62 + Math.sin(time * 0.13) * 0.07, 0, -0.38 + Math.sin(time * 0.09 + 1) * 0.05);
      // a short flash, and a little light in between
      const beat = Math.max(0, Math.sin((time * Math.PI * 2) / FLASH));
      flash.value = fade.value * (0.22 + 0.78 * beat ** 10);
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
