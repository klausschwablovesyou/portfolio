import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { emit, HALF_VIEW, type Shared } from './shared';

/**
 * A shooting star, now and then: a thin streak that crosses part of the upper sky in well
 * under a second and is gone. One at a time, several seconds apart, so it stays a small
 * surprise at the edge of the eye and never a show.
 *
 * It lives on a plane at a fixed depth in front of the camera and takes no part in the travel
 * of the field. With reduced motion the clock stands still, so none ever starts.
 */
export interface Meteor {
  mesh: Mesh;
  update(time: number, aspect: number, viewHeight: number): void;
  dispose(): void;
}

const DEPTH = 60;
const FIRST_AFTER = 4.5;
/** seconds between two: at least, and at most that much more */
const PAUSE = [7, 9];

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLife;
  varying vec2 vUv;
  ${emit}
  void main() {
    // u runs from the end of the tail (0) to the head (1)
    float across = abs(vUv.y - 0.5) * 2.0;
    float tail = pow(vUv.x, 2.4);
    float head = smoothstep(0.93, 1.0, vUv.x);
    float light = (tail * 0.55 + head) * exp(-across * across * 4.0) * uLife;
    gl_FragColor = vec4(emit(uColor * light), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createMeteor(shared: Shared): Meteor {
  // the head sits on the origin and the tail runs back along -x, so the mesh is placed by its head
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(-0.5, 0, 0);
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color('#DDEFF2') }, uLife: { value: 0 }, uGain: shared.uGain },
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = -DEPTH;
  mesh.visible = false;

  const halfH = HALF_VIEW * DEPTH;
  let next = FIRST_AFTER;
  let born = -1;
  // the flight in progress, in units of half the view height
  const flight = { x: 0, y: 0, dx: 0, dy: 0, speed: 0, length: 0, seconds: 1 };

  return {
    mesh,
    update(time, aspect, viewHeight) {
      if (born < 0) {
        if (time < next) return;
        born = time;
        // starts in the upper part of the view and falls at a shallow angle, to the left or the right
        const side = Math.random() < 0.5 ? -1 : 1;
        const angle = 0.22 + Math.random() * 0.4;
        flight.x = (Math.random() * 1.5 - 0.75) * aspect;
        flight.y = 0.15 + Math.random() * 0.75;
        flight.dx = Math.cos(angle) * side;
        flight.dy = -Math.sin(angle);
        flight.speed = 1.5 + Math.random() * 0.9;
        flight.length = 0.3 + Math.random() * 0.25;
        flight.seconds = 0.55 + Math.random() * 0.35;
        mesh.rotation.z = Math.atan2(flight.dy, flight.dx);
        mesh.visible = true;
      }

      const age = (time - born) / flight.seconds;
      if (age >= 1) {
        born = -1;
        next = time + PAUSE[0] + Math.random() * PAUSE[1];
        mesh.visible = false;
        return;
      }
      const run = age * flight.seconds * flight.speed;
      mesh.position.x = (flight.x + flight.dx * run) * halfH;
      mesh.position.y = (flight.y + flight.dy * run) * halfH;
      // the tail grows out behind the head, and the streak is about two pixels wide on any screen
      const length = Math.min(run, flight.length) * halfH;
      mesh.scale.set(Math.max(length, 0.001), (2.4 / viewHeight) * 2 * halfH, 1);
      material.uniforms.uLife.value = Math.min(1, age * 8) * (1 - age * age);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
