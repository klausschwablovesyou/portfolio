import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { anchorToWorld } from './anchors';
import { createGraph, type GraphLabel } from './graph';
import { createPost } from './post';
import { createShuriken } from './shuriken';
import { createTerrain } from './terrain';

/**
 * One fixed full-window canvas and one renderer, drawing two layers:
 *
 *  1. the ridgeline terrain, with its own camera that scrolling raises and tilts;
 *  2. the anchored objects (stack graph, contact emblem), with a camera that looks straight
 *     ahead, so each object can follow an empty HTML element (data-anchor) and the 3D layout
 *     follows the responsive HTML layout.
 *
 * The frame then goes through the film look of post.ts (bloom, grain).
 *
 * Rendering runs only while a dark (transparent) section is on screen and the tab is visible;
 * with prefers-reduced-motion the scene holds still and redraws only on scroll and resize.
 *
 * Quality steps down by itself on a slow GPU: 2 = film look, 1 = film look at a lower
 * resolution, 0 = no post-processing. `?fx=0|1|2` pins a step.
 */
const INK = new Color('#0F262D');
const CAMERA_Z = 16;
const SCROLL_TO_WORLD = 0.02;

const smooth = (v: number) => {
  const k = Math.min(1, Math.max(0, v));
  return k * k * (3 - 2 * k);
};

export function initScene(canvas: HTMLCanvasElement): void {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
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

  /* quality tiers */
  const post = (() => {
    const p = createPost(renderer);
    if (!p) return null;
    // a GPU that refuses the float targets gets the plain picture instead of a black one
    p.setSize(16, 16);
    if (p.check()) return p;
    p.dispose();
    return null;
  })();
  const TIERS = [
    { post: false, ratio: 2 },
    { post: true, ratio: 1 },
    { post: true, ratio: 1.5 },
  ];
  const pinned = new URLSearchParams(location.search).get('fx');
  const pinnedTier = pinned !== null && /^[012]$/.test(pinned) ? Number(pinned) : -1;
  let tier = post ? (pinnedTier >= 0 ? pinnedTier : 2) : 0;
  const bufferSize = new Vector2();

  function applyTier(): void {
    const cfg = TIERS[tier];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.ratio));
    renderer.setSize(width, height, false);
    if (post && cfg.post) {
      renderer.getDrawingBufferSize(bufferSize);
      post.setSize(bufferSize.x, bufferSize.y);
    }
  }
  applyTier();

  /* layer 1: terrain */
  const terrain = createTerrain(small ? 64 : 96, width / height, small ? 14 : 22);

  /* layer 2: anchored objects */
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 120);
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

  // The labels of the open branches sit to the right of the graph: keep that much room free.
  let headRoom = 0;
  const measureHeadRoom = () => {
    const widths = stackLabels.filter((el) => el.dataset.side === 'head').map((el) => el.offsetWidth);
    headRoom = widths.length ? Math.max(...widths) + 10 : 0;
  };

  const emblem = createShuriken();
  scene.add(emblem.group);
  const emblemAnchor = document.querySelector('[data-anchor="shuriken"]');
  emblem.group.visible = !!emblemAnchor;

  /* pointer, smoothed */
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
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
    // the ridge-shaped edges of the light sections show the canvas a little beyond a dark section
    { rootMargin: '160px 0px' },
  );
  document.querySelectorAll('.dark').forEach((el) => darkIo.observe(el));

  let rafId = 0;
  let last = performance.now();
  let time = 0;
  let first = true;

  const shouldRun = () => !document.hidden && visibleDark.size > 0;
  const v = new Vector3();

  function place(el: HTMLElement, label: GraphLabel | undefined, rect: DOMRect, fade: number): void {
    if (!label) return;
    v.copy(label.point).project(camera);
    let sx = (v.x * 0.5 + 0.5) * width - rect.left;
    // keep the label inside the anchor box, so narrow phones never scroll sideways
    const lw = el.offsetWidth;
    const side = el.dataset.side;
    if (side === 'head' || side === 'tail') sx = Math.max(0, Math.min(sx, rect.width - lw));
    const sy = (-v.y * 0.5 + 0.5) * height - rect.top;
    el.style.setProperty('--x', `${sx.toFixed(1)}px`);
    el.style.setProperty('--y', `${sy.toFixed(1)}px`);
    el.style.setProperty('--o', (label.opacity * fade).toFixed(3));
  }

  function placeLabels(): void {
    if (!graphAnchor || !graph.group.visible) return;
    const rect = graphAnchor.getBoundingClientRect();
    const fade = Math.max(0, 1 - explodeAmount() * 2.4);
    const stacksAt = graph.stackLabels();
    stackLabels.forEach((el, i) => place(el, stacksAt[i], rect, fade));
    const yearsAt = graph.yearLabels();
    yearLabels.forEach((el, i) => place(el, yearsAt[i], rect, fade));
  }

  /** 0 while the graph sits in the lower 60% of the viewport, 1 once it has scrolled away. */
  function explodeAmount(): number {
    if (!graphAnchor || reduceMq.matches) return 0;
    const r = graphAnchor.getBoundingClientRect();
    const centre = r.top + r.height / 2;
    return Math.min(1, Math.max(0, (height * 0.4 - centre) / (height * 0.55)));
  }

  /** 0 at the top and at the very end of the page (low camera), 1 in between (high camera). */
  function riseAmount(y: number): number {
    const max = Math.max(1, root.scrollHeight - height);
    return smooth(y / (height * 1.1)) * (1 - smooth((y - (max - height * 1.5)) / (height * 1.1)));
  }

  // the camera follows the scroll position with a little inertia
  let scrollEase = window.scrollY;
  // frame-time watch for stepping the quality down
  let watched = 0;
  let watchedMs = 0;
  let settling = 0;

  function watchFrameTime(ms: number): void {
    if (pinnedTier >= 0 || tier === 0) return;
    if (settling < 20) {
      settling++;
      return;
    }
    // the loop restarts its clock after every pause, so a long frame here is a slow frame
    watched++;
    watchedMs += Math.min(ms, 500);
    if (watched < 45) return;
    if (watchedMs / watched > 38) {
      tier--;
      applyTier();
      settling = 0;
    }
    watched = 0;
    watchedMs = 0;
  }

  function frame(now: number): void {
    rafId = 0;
    const still = reduceMq.matches;
    if (!still && !first) watchFrameTime(now - last);
    const dt = still ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    pointer.x += (target.x - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (target.y - pointer.y) * Math.min(1, dt * 3);
    boost *= still ? 0 : Math.pow(0.25, dt);
    const p = still ? { x: 0, y: 0 } : pointer;

    scrollEase = still ? window.scrollY : scrollEase + (window.scrollY - scrollEase) * Math.min(1, dt * 6);
    const rise = riseAmount(scrollEase);
    // opening shot: 0 → 1 over a few seconds, easing out
    const introT = still ? 1 : Math.min(1, time / 3.6);
    const intro = 1 - Math.pow(1 - introT, 3);
    terrain.update({ scroll: scrollEase * SCROLL_TO_WORLD, time, rise, intro, pointer: p });

    // slight camera drift with the pointer; anchors include the camera offset, so the
    // anchored objects stay on their elements
    camera.position.x = p.x * 0.3;
    camera.position.y = p.y * 0.2;

    if (graphAnchor) {
      const w = anchorToWorld(graphAnchor, camera, width, height);
      graph.group.visible = w.near;
      if (w.near) {
        const room = (headRoom / w.rect.width) * w.width;
        const scale = Math.min((w.width - room) / graph.size.width, (w.height * 0.92) / graph.size.height);
        // a narrow anchor leaves height unused: spread the lanes into it, so the labels do not collide
        const stretch = Math.min(1.7, Math.max(1, (w.height * 0.8) / (graph.size.height * scale)));
        graph.group.scale.set(scale, scale * stretch, scale);
        graph.group.position.set(w.x - room / 2, w.y, 0);
        graph.update(time, p, explodeAmount(), still, stretch);
      }
    }

    if (emblemAnchor) {
      const w = anchorToWorld(emblemAnchor, camera, width, height);
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

    if (post && TIERS[tier].post) {
      post.render(
        {
          terrain: () => renderer.render(terrain.scene, terrain.camera),
          overlay: () => renderer.render(scene, camera),
        },
        { time: still ? 0 : time },
        INK,
      );
    } else {
      renderer.setRenderTarget(null);
      renderer.setClearColor(INK, 1);
      renderer.clear();
      renderer.render(terrain.scene, terrain.camera);
      renderer.clearDepth();
      renderer.render(scene, camera);
    }
    placeLabels();

    if (first) {
      first = false;
      root.classList.add('has-3d');
      measureHeadRoom(); // the labels only take their floating size once has-3d is set
      // one more frame with the measured labels, also when motion is reduced
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (!still && shouldRun()) rafId = requestAnimationFrame(frame);
  }

  function wake(): void {
    if (rafId || !shouldRun()) return;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  /* reduced motion: redraw on scroll and resize only */
  window.addEventListener('scroll', () => reduceMq.matches && wake(), { passive: true });

  window.addEventListener('resize', () => {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    applyTier();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    terrain.resize(width / height);
    measureHeadRoom();
    wake();
  });
  document.fonts?.ready.then(() => {
    measureHeadRoom();
    wake();
  });

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
    wake();
  });

  // First frame right away, so the labels and the canvas appear together.
  frame(performance.now());
}
