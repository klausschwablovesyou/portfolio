import { Group, PerspectiveCamera, Scene, Vector2, type WebGLRenderer } from 'three';
import { SUN } from '../sun';
import { createMeteor } from './meteor';
import { createPlanet } from './planet';
import { drawOrder, FOV, HALF_VIEW, wrap, type Shared } from './shared';
import { createSatellite } from './satellite';
import { createSky } from './sky';
import { createStars } from './stars';

/**
 * The background: deep space behind the dark sections. From far to near:
 *
 *  - the sky (sky.ts): thin gas and star dust, almost fixed;
 *  - the stars (stars.ts): points at every depth, endless in all directions;
 *  - the planet (planet.ts): the one landmark, far away, with rings and two moons;
 *  - the satellite (satellite.ts): nearer, on the other side of the view, turning slowly;
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
    /** scroll position as a part of the whole page, 0 at the top, 1 at the end */
    progress: number;
    time: number;
    /** 0 → 1 while the opening shot settles */
    intro: number;
    pointer: { x: number; y: number };
    /** the picture goes straight to the canvas instead of through post.ts */
    direct: boolean;
  }): void;
  /** every frame, before the scene is drawn: updates the small off-screen buffers */
  prerender(renderer: WebGLRenderer): void;
  resize(aspect: number, viewHeight: number, pixelRatio: number, layout: Layout): void;
  dispose(): void;
}

/** What the scene has to know about the page to keep out of its way. */
export interface Layout {
  /** the free strip to the left of the page column, as a part of the view width */
  margin: number;
  /**
   * Where the band of numbers that closes the first screen begins while the page is at the top,
   * as a view height (1 = top edge, -1 = bottom edge; below -1 it starts under the fold)
   */
  band: number;
  /** the free spot beside the buttons of the first screen, x and y in the view, or null */
  spot: [number, number] | null;
}

/** depth that scrolls at the speed of the page; everything is further away than this */
const REF = 9;
/** how far above its resting place the camera starts, in world units */
const INTRO_DROP = 9;
/** the satellite comes round again after this many view heights of its own movement */
const LAP = 1.3;

/**
 * Where things are, in the view: x and y from -1 to 1 (left to right, bottom to top), beyond
 * that outside. `size` is the radius against half the view height.
 *
 * The planet keeps to the right edge, its limb just inside the view. On the first screen it
 * rests on the band of numbers that closes that screen, sunk into it a little so its rings stay
 * clear of the year labels of the graph (wherever the layout puts that band:
 * on a low screen it starts under the fold, and so does most of the planet); by the end of
 * the page it has climbed into the upper right, above the landscape. Its height follows
 * the reading progress and not the scroll distance, so it ends in the same place on a page of
 * any length.
 */
const PLANET = { depth: 190, size: 0.18, inset: 0.055, from: -0.5, to: 0.62, above: 0.02 };

/*
 * The satellite is nearer, so it rises faster as the page scrolls, leaves at the top and comes
 * in again from below. Where the page column leaves a margin that holds it with room to spare
 * (a wide screen), it floats in the middle of that margin. Otherwise it starts beside the
 * buttons under the copy of the first screen, the one spot of the left half that is free; the
 * page says where that is (`Layout.spot`), and `at` is only the fallback.
 */
const SATELLITE = { depth: 64, size: 0.16, at: [-0.17, -0.5], margin: { y: -0.5, room: 1.5 } };

/*
 * An upright screen has no free side: the text runs the whole width. There the planet starts
 * below the view and comes up later, cut by the right edge, and the satellite is fainter and
 * keeps to the gap between the buttons and the graph, which is lower on a phone, where the copy
 * takes more of the height.
 */
const UPRIGHT = { below: 1.06, to: 0.2, x: 0.9, aspect: 0.9, satellite: [-0.66, -0.3], phone: [-0.66, -0.5], fade: 0.7 };

export function createCosmos(small: boolean): Cosmos {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 600);
  camera.rotation.order = 'YXZ';

  const shared: Shared = {
    uTime: { value: 0 },
    uTravel: { value: new Vector2() },
    uPx: { value: 1 },
    uLight: { value: SUN.clone() },
    uGain: { value: new Vector2(1, 1) },
  };

  const sky = createSky(shared);
  const stars = createStars(shared);
  const planet = createPlanet();
  const satellite = createSatellite(shared);
  const meteor = createMeteor(shared);

  // far to near; the planet is drawn after the stars, so its dark disc covers them
  const layers = [[stars.points], [planet.group], [satellite.group], [meteor.mesh]].map((parts, i) => {
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
  /** where the satellite is while the page is at the top, as `at` above */
  let home = SATELLITE.at;
  /** where the planet is while the page is at the top */
  let planetFrom = PLANET.from;

  return {
    scene,
    camera,
    update({ screens, progress, time, intro, pointer, direct }) {
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
      const drift = floatY + pointer.y * 0.5 + drop;
      const ty = -screens * 2 * HALF_VIEW * REF + drift;
      shared.uTravel.value.set(tx, ty);

      // a hand-held camera never points perfectly still
      const pitch = pointer.y * 0.012 + Math.sin(time * 0.31) * 0.003 + Math.sin(time * 0.73 + 1.3) * 0.0015;
      const yaw = -pointer.x * 0.02 + Math.sin(time * 0.27 + 0.6) * 0.004 + Math.sin(time * 0.61) * 0.002;
      camera.rotation.set(pitch, yaw, Math.sin(time * 0.19) * 0.004);
      sky.look(yaw, pitch);

      const upright = aspect < UPRIGHT.aspect;
      {
        const halfH = HALF_VIEW * PLANET.depth;
        const radius = PLANET.size * fit;
        const x = upright ? UPRIGHT.x : 1 - radius / aspect - PLANET.inset;
        const from = upright ? -UPRIGHT.below : planetFrom;
        const y = from + ((upright ? UPRIGHT.to : PLANET.to) - from) * progress;
        planet.group.position.set(x * halfH * aspect - tx, y * halfH - drift, -PLANET.depth);
        planet.group.scale.setScalar(radius * halfH);
        planet.update(time);
      }
      {
        const halfH = HALF_VIEW * SATELLITE.depth;
        satellite.group.position.set(
          home[0] * halfH * aspect - tx,
          wrap(home[1] * halfH - ty, 2 * halfH * LAP),
          -SATELLITE.depth,
        );
        satellite.group.scale.setScalar(SATELLITE.size * halfH * fit);
        satellite.fade.value = upright ? UPRIGHT.fade : 1;
        satellite.update(time);
      }
      meteor.update(time, aspect, viewHeight);
    },
    prerender(renderer) {
      sky.prerender(renderer);
    },
    resize(a, height, pixelRatio, { margin, band, spot }) {
      aspect = a;
      viewHeight = height;
      fit = Math.min(1, Math.max(0.62, a / 1.1));
      reach = Math.min(1, a / 1.2);
      // the width of the satellite against the width of the view
      const span = (SATELLITE.size * fit) / a;
      if (a < UPRIGHT.aspect) home = small ? UPRIGHT.phone : UPRIGHT.satellite;
      else home = margin >= span * SATELLITE.margin.room ? [margin - 1, SATELLITE.margin.y] : (spot ?? SATELLITE.at);
      planetFrom = Math.min(-0.3, Math.max(-1.2, band + PLANET.size * fit + PLANET.above));
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
      satellite.dispose();
      meteor.dispose();
    },
  };
}
