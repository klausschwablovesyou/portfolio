import type { PerspectiveCamera } from 'three';

/** The rectangle of a DOM element in document coordinates (it does not change while scrolling). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An element's screen rectangle, expressed in world units on the plane z = 0. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** element is within one viewport of the screen */
  near: boolean;
  /** the same rectangle on screen, in CSS pixels */
  left: number;
  top: number;
  pxWidth: number;
  pxHeight: number;
}

export const emptyBox = (): Box => ({ left: 0, top: 0, width: 0, height: 0 });

export const emptyWorldRect = (): WorldRect => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  near: false,
  left: 0,
  top: 0,
  pxWidth: 0,
  pxHeight: 0,
});

/**
 * Reads an element's rectangle. This asks the browser for layout, so it is called when the
 * layout may have changed (resize, fonts, document height), never in the render loop.
 */
export function measureBox(el: Element, out: Box): Box {
  const r = el.getBoundingClientRect();
  out.left = r.left + window.scrollX;
  out.top = r.top + window.scrollY;
  out.width = r.width;
  out.height = r.height;
  return out;
}

/**
 * Converts a measured box into a world-space rectangle for a camera that looks straight down
 * -z, at the given scroll position. The 3D objects follow the responsive HTML layout this way,
 * so the scene needs no breakpoints of its own, and nothing is read from the DOM per frame.
 */
export function anchorToWorld(
  box: Box,
  scrollY: number,
  camera: PerspectiveCamera,
  viewWidth: number,
  viewHeight: number,
  out: WorldRect,
): WorldRect {
  const top = box.top - scrollY;
  const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  const perPx = worldHeight / viewHeight;
  out.x = camera.position.x + (box.left + box.width / 2 - viewWidth / 2) * perPx;
  out.y = camera.position.y - (top + box.height / 2 - viewHeight / 2) * perPx;
  out.width = box.width * perPx;
  out.height = box.height * perPx;
  out.near = top + box.height > -viewHeight && top < viewHeight * 2;
  out.left = box.left;
  out.top = top;
  out.pxWidth = box.width;
  out.pxHeight = box.height;
  return out;
}
