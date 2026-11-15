import { Group, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three';
import { createMeteor } from './meteor';
import { createPlanet } from './planet';
import { drawOrder, FOV, HALF_VIEW, wrap, type Shared } from './shared';
import { createSky } from './sky';
import { createSolid, type SolidKind } from './solids';
import { createStars } from './stars';

/**
 * The background: deep space behind the dark sections. From far to near:
 *
 *  - the sky (sky.ts): thin gas and star dust, almost fixed;
 *  - the stars (stars.ts): points at every depth, endless in all directions;
 *  - the planet (planet.ts): the one landmark, far away, with rings and two moons;
 *  - the solids (solids.ts): a few glass polyhedra that tumble slowly;
 *  - a shooting star now and then (meteor.ts).
 *
 * The camera never leaves the origin: the field moves past it. Where the camera "is" in the
 * field is one 2D vector, the travel. Scrolling moves it down, so everything rises, slower the
 * further away it is: a body at depth REF would keep up with the page, one at twice that depth
 * moves half as fast. On top of that the camera floats in a slow, bounded figure, so there is
 * always some movement between the layers, but nothing ever drifts away from where it was put.
 *
 * It has to stay a background: everything is thin, dim and close to the page colour, and the
 * brightest things are small.
 */
export interface Cosmos {
  scene: Scene;
  camera: PerspectiveCamera;
  update(state: {
    /** scroll position in view heights */
    screens: number;
    time: number;
    /** 0 → 1 while the opening shot settles */
    intro: number;
    pointer: { x: number; y: number };
    /** the picture goes straight to the canvas instead of through post.ts */
    direct: boolean;
  }): void;
  resize(aspect: number, viewHeight: number, pixelRatio: number): void;
  dispose(): void;
}

/** depth that scrolls at the speed of the page; everything is further away than this */
const REF = 9;
/** how far above its resting place the camera starts, in world units */
const INTRO_DROP = 9;
/** a solid comes round again after this many view heights of its own movement */
const LAP = 2.2;

/**
 * Where things are. `at` is the place in the view while the page is at the top: x and y from
 * -1 to 1 (left to right, bottom to top), beyond that it is outside. `size` is the radius
 * against half the view height.
 */
const PLANET = { depth: 150, size: 0.18, at: [0.82, -0.88] };

/*
 * The text of the page is set to the left, so the solids keep to the right half and to the
 * left margin, in columns: the planet has the outer right one to itself. Two solids share a
 * column only if they never meet in it, because the nearer one rises faster and would pass
 * through the other.
 */
const SOLIDS: { kind: SolidKind; depth: number; size: number; at: [number, number]; spin: number; warm?: boolean }[] = [
  { kind: 'icosahedron', depth: 34, size: 0.11, at: [0.3, 0.62], spin: 0.11 },
  { kind: 'dodecahedron', depth: 46, size: 0.1, at: [0.55, -1.45], spin: 0.09 },
  { kind: 'star', depth: 60, size: 0.065, at: [0.55, 0.7], spin: 0.13 },
  { kind: 'tesseract', depth: 52, size: 0.085, at: [0.55, 1.6], spin: 0.08 },
  { kind: 'octahedron', depth: 44, size: 0.05, at: [-1, -0.8], spin: 0.16, warm: true },
];

/*
 * An upright screen has no free half: the text runs the whole width. There the planet starts
 * below the view and comes up later, and only the first two solids are shown, half out of
 * view on the left edge and fainter.
 */
const UPRIGHT = { below: 1.06, aspect: 0.9, solids: 2, x: -1, fade: 0.75 };

export function createCosmos(small: boolean): Cosmos {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 600);
  camera.rotation.order = 'YXZ';

  const shared: Shared = {
    uTime: { value: 0 },
    uTravel: { value: new Vector2() },
    uPx: { value: 1 },
    uLight: { value: new Vector3(-0.7, 0.45, -0.55).normalize() },
    uGain: { value: new Vector2(1, 1) },
  };

  const sky = createSky(shared, small ? 3 : 4);
  const stars = createStars(shared);
  const planet = createPlanet(shared);
  const solids = (small ? SOLIDS.slice(0, UPRIGHT.solids) : SOLIDS).map((spec, i) => ({
    spec,
    body: createSolid(spec.kind, shared, { spin: spec.spin, seed: i + 1, warm: spec.warm }),
    // the far ones are dimmer, as if seen through more of the dark
    fade: 1 - 0.45 * Math.min(1, Math.max(0, (spec.depth - 24) / 70)),
  }));
  const meteor = createMeteor(shared);

  // far to near; the planet is drawn after the stars, so its dark disc covers them
  const layers = [[stars.points], [planet.group], solids.map((s) => s.body.group), [meteor.mesh]].map((parts, i) => {
    const layer = new Group();
    layer.add(...parts);
    drawOrder(layer, i + 1);
    return layer;
  });
  scene.add(sky.mesh, ...layers);

  let aspect = 1;
  let viewHeight = 900;
  /** bodies are drawn smaller on a narrow screen, where they would fill the width */
  let fit = 1;
  /** and the camera floats less far sideways there, in step with the width */
  let reach = 1;

  return {
    scene,
    camera,
    update({ screens, time, intro, pointer, direct }) {
      shared.uTime.value = time;
      shared.uGain.value.set(direct ? 0.68 : 1, direct ? 1.2 : 1);
      sky.direct(direct);

      // the slow float of the camera, and the pointer leaning it a little. It is kept short:
      // a near body moves about a hundred pixels either way, which the columns above allow for
      const floatX = (Math.sin(time * 0.083) * 2.2 + Math.sin(time * 0.19 + 1.3) * 0.9) * reach;
      const floatY = Math.sin(time * 0.097 + 0.5) * 1.1 + Math.sin(time * 0.23) * 0.5;
      // opening shot: the camera comes down from above and eases to rest, so the sky rises into place
      const drop = (1 - intro) * (1 - intro) * INTRO_DROP;
      const tx = floatX + pointer.x * 0.9;
      const ty = -screens * 2 * HALF_VIEW * REF + floatY + pointer.y * 0.5 + drop;
      shared.uTravel.value.set(tx, ty);

      // a hand-held camera never points perfectly still
      const pitch = pointer.y * 0.012 + Math.sin(time * 0.31) * 0.003 + Math.sin(time * 0.73 + 1.3) * 0.0015;
      const yaw = -pointer.x * 0.02 + Math.sin(time * 0.27 + 0.6) * 0.004 + Math.sin(time * 0.61) * 0.002;
      camera.rotation.set(pitch, yaw, Math.sin(time * 0.19) * 0.004);
      sky.look(yaw, pitch);

      const upright = aspect < UPRIGHT.aspect;
      {
        const halfH = HALF_VIEW * PLANET.depth;
        const y = upright ? -UPRIGHT.below : PLANET.at[1];
        planet.group.position.set(PLANET.at[0] * halfH * aspect - tx, y * halfH - ty, -PLANET.depth);
        planet.group.scale.setScalar(PLANET.size * halfH * fit);
        planet.update(time);
      }
      solids.forEach(({ spec, body, fade }, i) => {
        body.group.visible = !upright || i < UPRIGHT.solids;
        if (!body.group.visible) return;
        const halfH = HALF_VIEW * spec.depth;
        body.group.position.set(
          (upright ? UPRIGHT.x : spec.at[0]) * halfH * aspect - tx,
          wrap(spec.at[1] * halfH - ty, 2 * halfH * LAP),
          -spec.depth,
        );
        body.group.scale.setScalar(spec.size * halfH * fit);
        body.fade.value = upright ? fade * UPRIGHT.fade : fade;
        body.update(time);
      });
      meteor.update(time, aspect, viewHeight);
    },
    resize(a, height, pixelRatio) {
      aspect = a;
      viewHeight = height;
      fit = Math.min(1, Math.max(0.62, a / 1.1));
      reach = Math.min(1, a / 1.2);
      camera.aspect = a;
      camera.updateProjectionMatrix();
      // sizes given in pixels grow a little with the view, so a large screen is not all specks
      shared.uPx.value = pixelRatio * Math.min(1.4, Math.max(0.85, height / 900));
      sky.resize(a, height, pixelRatio);
      stars.resize(a);
    },
    dispose() {
      sky.dispose();
      stars.dispose();
      planet.dispose();
      solids.forEach((s) => s.body.dispose());
      meteor.dispose();
    },
  };
}
