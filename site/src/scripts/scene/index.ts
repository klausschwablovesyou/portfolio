import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { anchorToWorld, emptyBox, emptyWorldRect, measureBox, type WorldRect } from './anchors';
import { createCosmos, type Layout } from './cosmos';
import { createGraph, type GraphLabel } from './graph';
import { createPost } from './post';
import { createShuriken } from './shuriken';
import { createTerrain } from './terrain';

/**
 * One fixed full-window canvas and one renderer, drawing two layers:
 *
 *  1. the backdrop, with a camera of its own: the cosmos (scrolling moves the star field past it),
 *     except behind the contact section, which has the lit mountain landscape of terrain.ts;
 *  2. the anchored objects (stack graph, contact emblem), with a camera that looks straight
 *     ahead, so each object can follow an empty HTML element (data-anchor) and the 3D layout
 *     follows the responsive HTML layout.
 *
 * The frame then goes through the film look of post.ts (bloom, grain).
 *
 * Rendering runs only while a dark (transparent) section is on screen and the tab is visible;
 * with prefers-reduced-motion the scene holds still and redraws only on scroll and resize.
 *
 * Nothing is read from the DOM per frame: the rectangles of the anchors and the sizes of the
 * labels are measured when the layout can have changed, and positions follow from scrollY.
 */
const INK = new Color('#0B1620');
const CAMERA_Z = 16;
const CAMERA_FOV = 35;
/** height of the view of the anchored objects' camera on the plane z = 0, in world units */
const VIEW_HEIGHT = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_Z;
const SCROLL_TO_WORLD = 0.02;

/**
 * Quality tiers. The drawing buffer is sized by a pixel budget as well as by a ratio cap,
 *
 *   ratio = min(devicePixelRatio, cap, sqrt(budget / (cssWidth × cssHeight))),
 *
 * so a large screen costs about what a laptop screen costs. The scene starts on the best tier
 * and steps down by itself, never up, when frames stay slow. `?fx=0|1|2` pins a tier; 0 also
 * switches the film look off (the path of a GPU without float render targets).
 */
const TIERS = [
  { cap: 1.25, budget: 1.5e6, bloom: false },
  { cap: 1.25, budget: 1.9e6, bloom: true },
  { cap: 2, budget: 3.4e6, bloom: true },
];
const MIN_RATIO = 0.75;
/** phones have dense screens and weak GPUs: they never go above this ratio */
const SMALL_CAP = 1.5;
/** a frame that took longer counts as slow; a tier goes when most frames of a window are slow */
const SLOW_MS = 24;
const WATCH_FRAMES = 40;

const smooth = (v: number) => {
  const k = Math.min(1, Math.max(0, v));
  return k * k * (3 - 2 * k);
};

/**
 * True when the GPU can render into float targets, which the film look needs. Asked of a
 * throwaway context, because whether the canvas itself is antialiased has to be decided
 * before the real context is made.
 */
function floatTargets(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function initScene(canvas: HTMLCanvasElement): void {
  const pinned = new URLSearchParams(location.search).get('fx');
  const pinnedTier = pinned !== null && /^[012]$/.test(pinned) ? Number(pinned) : -1;
  // Straight to the canvas: when asked for, or without float targets. Only then does the canvas
  // need antialiasing of its own; with the film look the picture is antialiased in the
  // composition target, and a multisampled canvas would be resolved every frame for nothing.
  let direct = pinnedTier === 0 || !floatTargets();

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: direct, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('WebGL renderer unavailable:', err);
    return;
  }

  const root = document.documentElement;
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 640px)').matches;

  let width = canvas.clientWidth || window.innerWidth;
  let height = canvas.clientHeight || window.innerHeight;
  renderer.autoClear = false;

  const post = direct
    ? null
    : (() => {
        const p = createPost(renderer);
        if (!p) return null;
        // a GPU that refuses the float targets after all gets the plain picture, not a black one
        p.setSize(16, 16);
        if (p.check()) return p;
        p.dispose();
        return null;
      })();
  if (!post) direct = true;
  let tier = pinnedTier >= 0 ? pinnedTier : direct ? 0 : 2;

  /* layer 1: cosmos, and the landscape behind the contact section */
  const cosmos = createCosmos(small);
  const landSection = document.querySelector('#contact');
  const terrain = landSection ? createTerrain(small ? 64 : 96, width / height, small ? 14 : 22) : null;

  /* layer 2: anchored objects */
  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 120);
  camera.position.set(0, 0, CAMERA_Z);

  scene.add(new AmbientLight(0xbfd6db, 0.7));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 7, 9);
  scene.add(key);
  const rim = new DirectionalLight(0xf2b33d, 2.2);
  rim.position.set(-8, -4, 3);
  scene.add(rim);
  const glow = new PointLight(0xf2b33d, 0, 14, 1.6);
  scene.add(glow);

  const graph = createGraph();
  scene.add(graph.group);
  const graphAnchor = document.querySelector('[data-anchor="tower"]');
  const stackLabels = Array.from(document.querySelectorAll<HTMLElement>('[data-tower-label]'));
  const yearLabels = Array.from(document.querySelectorAll<HTMLElement>('[data-tower-year]'));
  graph.group.visible = !!graphAnchor;

  const emblem = createShuriken();
  scene.add(emblem.group);
  const emblemAnchor = document.querySelector('[data-anchor="shuriken"]');
  emblem.group.visible = !!emblemAnchor;

  /* DOM geometry, measured when the layout can have changed and never per frame */
  const column = document.querySelector('.wrap');
  const pageEl = document.querySelector('.page');
  const graphBox = emptyBox();
  const emblemBox = emptyBox();
  const landBox = emptyBox();
  const labels = [...stackLabels, ...yearLabels];
  const labelWidth = new Float32Array(labels.length);
  /** x, y and opacity as last written to each label: a style is only touched when it changes */
  const written = new Float32Array(labels.length * 3).fill(NaN);
  /** the labels of the open branches sit to the right of the graph: that much room is kept free */
  let headRoom = 0;
  /** what the cosmos has to know about the page to keep out of its way */
  const layout: Layout = { margin: 0, band: -0.68, spot: null };
  const bandSection = document.querySelector('#numbers');
  const lastButton = document.querySelector('.hero-cta > :last-child');
  let maxScroll = 1;

  function measure(): void {
    if (graphAnchor) measureBox(graphAnchor, graphBox);
    if (emblemAnchor) measureBox(emblemAnchor, emblemBox);
    if (landSection) measureBox(landSection, landBox);
    layout.margin = column ? Math.max(0, column.getBoundingClientRect().left) / width : 0;
    const scrolled = window.scrollY;
    // the band of numbers under the first screen: the planet rests on it
    if (bandSection) layout.band = 1 - (2 * (bandSection.getBoundingClientRect().top + scrolled)) / height;
    // the gap between the buttons of the first screen and the graph: the satellite's place
    layout.spot = null;
    if (lastButton && graphAnchor) {
      const b = lastButton.getBoundingClientRect();
      const gap = graphBox.left - b.right;
      if (gap > 160) {
        layout.spot = [((b.right + gap / 2) / width) * 2 - 1, 1 - (2 * (b.top + scrolled + b.height / 2)) / height];
      }
    }
    maxScroll = Math.max(1, root.scrollHeight - height);
    headRoom = 0;
    for (let i = 0; i < labels.length; i++) {
      labelWidth[i] = labels[i].offsetWidth;
      if (i < stackLabels.length && labels[i].dataset.side === 'head') headRoom = Math.max(headRoom, labelWidth[i] + 10);
    }
  }

  function applyTier(): void {
    const cfg = TIERS[tier];
    const cap = small ? Math.min(cfg.cap, SMALL_CAP) : cfg.cap;
    const fit = Math.sqrt(cfg.budget / Math.max(1, width * height));
    renderer.setPixelRatio(Math.max(MIN_RATIO, Math.min(window.devicePixelRatio || 1, cap, fit)));
    renderer.setSize(width, height, false);
    if (post) post.setSize(canvas.width, canvas.height);
    // sizes that the cosmos gives in pixels depend on the pixel ratio of the tier
    cosmos.resize(width / height, height, renderer.getPixelRatio(), layout);
    graph.resize(renderer.getPixelRatio());
    terrain?.resize(width / height);
  }

  measure();
  applyTier();

  /* pointer, smoothed */
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const still0 = { x: 0, y: 0 };
  let boost = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      const nx = (e.clientX / width) * 2 - 1;
      const ny = -((e.clientY / height) * 2 - 1);
      boost = Math.min(1.2, boost + Math.hypot(nx - target.x, ny - target.y) * 0.6);
      target.x = nx;
      target.y = ny;
    },
    { passive: true },
  );

  /* render gating: any dark section on screen, tab visible */
  const visibleDark = new Set<Element>();
  const darkIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visibleDark.add(e.target);
        else visibleDark.delete(e.target);
      }
      wake();
    },
    { rootMargin: '80px 0px' },
  );
  document.querySelectorAll('.dark').forEach((el) => darkIo.observe(el));

  let rafId = 0;
  let last = performance.now();
  let time = 0;
  let first = true;
  let started = false;

  const shouldRun = () => started && !document.hidden && visibleDark.size > 0;
  const v = new Vector3();
  const graphRect = emptyWorldRect();
  const emblemRect = emptyWorldRect();

  function place(i: number, label: GraphLabel | undefined, rect: WorldRect, fade: number): void {
    if (!label) return;
    v.copy(label.point).project(camera);
    let sx = (v.x * 0.5 + 0.5) * width - rect.left;
    // keep a stack label inside the anchor box, so narrow phones never scroll sideways
    if (i < stackLabels.length) sx = Math.max(0, Math.min(sx, rect.pxWidth - labelWidth[i]));
    const sy = (-v.y * 0.5 + 0.5) * height - rect.top;
    const o = label.opacity * fade;
    const k = i * 3;
    const style = labels[i].style;
    // NaN (never written) fails every comparison, so the first frame always writes
    if (!(Math.abs(sx - written[k]) < 0.2 && Math.abs(sy - written[k + 1]) < 0.2)) {
      style.setProperty('--x', `${sx.toFixed(1)}px`);
      style.setProperty('--y', `${sy.toFixed(1)}px`);
      written[k] = sx;
      written[k + 1] = sy;
    }
    if (!(Math.abs(o - written[k + 2]) < 0.01)) {
      style.setProperty('--o', o.toFixed(2));
      written[k + 2] = o;
    }
  }

  function placeLabels(scrollY: number): void {
    if (!graphAnchor || !graph.group.visible) return;
    const fade = Math.max(0, 1 - explodeAmount(scrollY) * 2.4);
    const stacksAt = graph.stackLabels();
    for (let i = 0; i < stackLabels.length; i++) place(i, stacksAt[i], graphRect, fade);
    const yearsAt = graph.yearLabels();
    for (let i = 0; i < yearLabels.length; i++) place(stackLabels.length + i, yearsAt[i], graphRect, fade);
  }

  /** 0 while the graph sits in the lower 60% of the viewport, 1 once it has scrolled away. */
  function explodeAmount(scrollY: number): number {
    if (!graphAnchor || reduceMq.matches) return 0;
    const centre = graphBox.top - scrollY + graphBox.height / 2;
    return Math.min(1, Math.max(0, (height * 0.4 - centre) / (height * 0.55)));
  }

  /** The landscape camera: high while the contact section comes in, low at the very end of the page. */
  function riseAmount(y: number): number {
    return 1 - smooth((y - (maxScroll - height * 1.5)) / (height * 1.1));
  }

  /*
   * Where the landscape starts on screen, in CSS pixels from the top: 0 = it fills the view,
   * height = it is not on screen. Above that line the cosmos is drawn, below it the landscape.
   */
  let landTop = height;

  function clipBelow(top: number, on: boolean): void {
    const rt = renderer.getRenderTarget();
    if (rt) {
      rt.scissor.set(0, 0, rt.width, Math.ceil(((height - top) / height) * rt.height));
      rt.scissorTest = on;
      renderer.setRenderTarget(rt); // a target's scissor is applied when it is bound
    } else {
      renderer.setScissor(0, 0, width, height - top);
      renderer.setScissorTest(on);
    }
  }

  function drawBackdrop(): void {
    if (landTop > 0) renderer.render(cosmos.scene, cosmos.camera);
    if (!terrain || landTop >= height) return;
    if (landTop > 0) {
      clipBelow(landTop, true);
      renderer.clear(true, true, false);
    }
    renderer.render(terrain.scene, terrain.camera);
    if (landTop > 0) clipBelow(landTop, false);
  }

  const drawOverlay = () => renderer.render(scene, camera);
  const draw = { backdrop: drawBackdrop, overlay: drawOverlay };
  const postState = { time: 0, bloom: true };

  // the camera follows the scroll position with a little inertia
  let scrollEase = window.scrollY;
  // frame-time watch for stepping the quality down
  let watched = 0;
  let slow = 0;
  let settling = 0;

  function watchFrameTime(ms: number): void {
    if (pinnedTier >= 0 || tier === 0 || direct) return;
    // the first frames after a start or a pause say nothing about the steady state
    if (settling < 12) {
      settling++;
      return;
    }
    watched++;
    if (ms > SLOW_MS) slow++;
    if (watched < WATCH_FRAMES) return;
    if (slow > WATCH_FRAMES * 0.6) {
      tier--;
      applyTier();
      settling = 0;
    }
    watched = 0;
    slow = 0;
  }

  function frame(now: number): void {
    rafId = 0;
    const still = reduceMq.matches;
    if (!still && !first) watchFrameTime(now - last);
    const dt = still ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const scrollY = window.scrollY;

    pointer.x += (target.x - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (target.y - pointer.y) * Math.min(1, dt * 3);
    boost *= still ? 0 : Math.pow(0.25, dt);
    const p = still ? still0 : pointer;

    scrollEase = still ? scrollY : scrollEase + (scrollY - scrollEase) * Math.min(1, dt * 6);
    // opening shot: 0 → 1 over a few seconds, easing out
    const introT = still ? 1 : Math.min(1, time / 3.6);
    const intro = 1 - Math.pow(1 - introT, 3);
    cosmos.update({ screens: scrollEase / height, progress: Math.min(1, scrollEase / maxScroll), time, intro, pointer: p, direct });

    landTop = height;
    if (terrain && landSection) {
      const top = landBox.top - scrollY;
      if (top < height && top + landBox.height > 0) {
        landTop = Math.max(0, Math.round(top));
        terrain.update({ scroll: scrollEase * SCROLL_TO_WORLD, time, rise: riseAmount(scrollEase), intro, pointer: p });
      }
    }
    if (landTop > 0) cosmos.prerender(renderer);

    // slight camera drift with the pointer; anchors include the camera offset, so the
    // anchored objects stay on their elements
    camera.position.x = p.x * 0.3;
    camera.position.y = p.y * 0.2;

    if (graphAnchor) {
      const w = anchorToWorld(graphBox, scrollY, camera, width, height, graphRect);
      graph.group.visible = w.near;
      if (w.near) {
        const room = (headRoom / w.pxWidth) * w.width;
        const scale = Math.min((w.width - room) / graph.size.width, (w.height * 0.92) / graph.size.height);
        // a narrow anchor leaves height unused: spread the lanes into it, so the labels do not collide
        const stretch = Math.min(1.7, Math.max(1, (w.height * 0.8) / (graph.size.height * scale)));
        graph.group.scale.set(scale, scale * stretch, scale);
        graph.group.position.set(w.x - room / 2, w.y, 0);
        graph.update(time, p, explodeAmount(scrollY), still, stretch, (scale * height) / VIEW_HEIGHT);
      }
    }

    if (emblemAnchor) {
      const w = anchorToWorld(emblemBox, scrollY, camera, width, height, emblemRect);
      emblem.group.visible = w.near;
      if (w.near) {
        emblem.group.scale.setScalar(Math.min(w.width, w.height) * 0.4);
        emblem.group.position.set(w.x, w.y, 0);
        emblem.update(dt, time, p, boost);
        glow.position.set(w.x - w.width * 0.2, w.y + w.height * 0.25, 3);
        glow.intensity = 12;
      } else {
        glow.intensity = 0;
      }
    }

    if (post && !direct) {
      postState.time = still ? 0 : time;
      postState.bloom = TIERS[tier].bloom;
      post.render(draw, postState, INK);
    } else {
      renderer.setRenderTarget(null);
      renderer.setClearColor(INK, 1);
      renderer.clear();
      drawBackdrop();
      renderer.clearDepth();
      drawOverlay();
    }
    placeLabels(scrollY);

    if (first) {
      first = false;
      root.classList.add('has-3d');
      // the labels only take their floating size once has-3d is set: measure them, and draw
      // one more frame with the measured labels, also when motion is reduced
      measure();
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (!still && shouldRun()) rafId = requestAnimationFrame(frame);
  }

  function wake(): void {
    if (rafId || !shouldRun()) return;
    last = performance.now();
    settling = 0;
    rafId = requestAnimationFrame(frame);
  }

  /* reduced motion: redraw on scroll and resize only */
  window.addEventListener('scroll', () => reduceMq.matches && wake(), { passive: true });

  function relayout(): void {
    measure();
    applyTier();
    written.fill(NaN);
    wake();
  }

  window.addEventListener('resize', () => {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    relayout();
  });
  // the document grows or shrinks when fonts and images arrive: the anchors move with it
  if (pageEl && 'ResizeObserver' in window) new ResizeObserver(() => started && relayout()).observe(pageEl);
  document.fonts?.ready.then(() => started && relayout());

  document.addEventListener('visibilitychange', wake);
  reduceMq.addEventListener('change', wake);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    root.classList.remove('has-3d');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    first = true;
    written.fill(NaN);
    wake();
  });

  /*
   * Start. The shaders are compiled ahead and without blocking where the browser can do that,
   * so the first frame does not hold up the page while the opening text is still moving in.
   * A program depends on the colour space of its target, hence post.withTarget.
   */
  const compileAll = () => {
    const jobs = [renderer.compileAsync(cosmos.scene, cosmos.camera), renderer.compileAsync(scene, camera)];
    if (terrain) jobs.push(renderer.compileAsync(terrain.scene, terrain.camera));
    return jobs;
  };
  let jobs: Promise<unknown>[] = [];
  try {
    if (post && !direct) post.withTarget(() => (jobs = compileAll()));
    else jobs = compileAll();
  } catch {
    jobs = [];
  }
  const start = () => {
    if (started) return;
    started = true;
    last = performance.now();
    frame(last);
  };
  // never wait long for it: the first frame compiles whatever is still missing
  Promise.race([Promise.all(jobs), new Promise((resolve) => setTimeout(resolve, 1200))]).then(start, start);
}
