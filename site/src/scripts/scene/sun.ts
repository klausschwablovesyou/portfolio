import { Color, Vector3 } from 'three';

/**
 * The one light of the whole scene. The direction towards the sun, in view space (the cameras
 * look down -z, x is to the right, y is up): low, to the right, behind the scene. So every body
 * is backlit: a thin warm edge on its right side, the rest in shadow, with a faint cool fill
 * from the front-left so the form still reads. That keeps the picture dark behind the text.
 */
export const SUN = new Vector3(0.61, 0.14, -0.78).normalize();

export const SUN_COLOR = new Color('#FFE3B5');
/** sky light from the front-left; always used at low strength */
export const FILL_COLOR = new Color('#6FA7C4');
