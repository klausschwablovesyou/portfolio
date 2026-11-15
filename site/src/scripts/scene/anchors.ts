import type { PerspectiveCamera } from 'three';

/** A DOM element's screen rectangle, expressed in world units on a plane at depth z. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** element is within one viewport of the screen */
  near: boolean;
  rect: DOMRect;
}

/**
 * Converts an anchor element's screen rectangle into a world-space position for a camera
 * that looks straight down -z. The 3D objects follow the responsive HTML layout this way,
 * so the scene needs no breakpoints of its own.
 */
export function anchorToWorld(
  el: Element,
  camera: PerspectiveCamera,
  viewWidth: number,
  viewHeight: number,
  z = 0,
): WorldRect {
  const rect = el.getBoundingClientRect();
  const distance = camera.position.z - z;
  const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
  const perPx = worldHeight / viewHeight;
  return {
    x: camera.position.x + (rect.left + rect.width / 2 - viewWidth / 2) * perPx,
    y: camera.position.y - (rect.top + rect.height / 2 - viewHeight / 2) * perPx,
    width: rect.width * perPx,
    height: rect.height * perPx,
    near: rect.bottom > -viewHeight && rect.top < viewHeight * 2,
    rect,
  };
}
