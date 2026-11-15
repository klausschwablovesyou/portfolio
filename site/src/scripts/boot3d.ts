/**
 * Starts the three.js scene only when WebGL works, and only after the page is idle:
 * three.js is a separate chunk, so the text never waits for it.
 */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function start3d(): void {
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement) || !webglAvailable()) return;

  const load = () => {
    import('./scene/index')
      .then((mod) => mod.initScene(canvas))
      .catch((err: unknown) => console.warn('3D scene disabled:', err));
  };

  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 1200 });
  else setTimeout(load, 150);
}
