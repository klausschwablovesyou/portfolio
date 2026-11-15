import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  CubicBezierCurve3,
  CurvePath,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineCurve3,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import { axisYears, roleStarts, stacks, timeline } from '../../i18n/shared';

/**
 * The stack graph: the career drawn the way git draws history. One trunk runs from 2003 to
 * today; every stack is a branch that forks off at the year it was first used and either
 * merges back when it was last used, or is still open and runs to today (amber, with a
 * light at its head). The x axis is time, so every length is that stack's real span.
 * The dots on the trunk are the starts of the roles.
 *
 * Built in unit space (10 units = the whole time axis) and scaled to its DOM anchor.
 */
const LENGTH = 10;
const LANE = 0.82;

/** Lane (rows above or below the trunk) and depth per stack, in the order of `stacks`. */
const LANES: { lane: number; z: number; labelLead?: number }[] = [
  { lane: 3, z: -0.55 }, // Java Spring
  { lane: 2, z: 0.5 }, // Angular
  // React shares a lane with PHP (PHP ends in 2017, React starts in 2018); below the trunk,
  // so its merge in 2020 does not cross Angular forking off at the same point
  { lane: -1, z: -0.5 }, // React
  { lane: 1, z: -0.2 }, // TypeScript
  // .NET · C# shares a lane with Flash (they never overlap); its label starts a little later,
  // so the two labels keep apart on a phone
  { lane: -2, z: 0.6, labelLead: 1.45 },
  { lane: -1, z: -0.5 }, // PHP · Symfony
  { lane: -2, z: 0.6 }, // Flash · ActionScript
  { lane: -3, z: 0.15 }, // SQL: under everything, from 2003 to today
];

const AMBER = new Color('#F2B33D');
const EARLIER = new Color('#5F8D97');
const TRUNK = new Color('#DCE8E6');
const BLUEPRINT = new Color('#A9CDD5');

export interface GraphLabel {
  /** world-space point the label hangs on */
  point: Vector3;
  /** 0–1: follows the draw-in of the graph */
  opacity: number;
}

export interface StackGraph {
  group: Group;
  /** fitted size in unit space, for scaling to the anchor */
  size: { width: number; height: number };
  /** stretch: how much taller than wide the anchor scales the graph (narrow screens), so dots stay round */
  update(t: number, pointer: { x: number; y: number }, explode: number, still: boolean, stretch: number): void;
  /** label points, in the order of `stacks` */
  stackLabels(): GraphLabel[];
  /** label points of the year ticks, in the order of `axisYears` */
  yearLabels(): GraphLabel[];
  dispose(): void;
}

const toX = (year: number) => ((year - timeline.start) / (timeline.end - timeline.start) - 0.5) * LENGTH;

const tubeVertex = /* glsl */ `
  varying float vX;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vX = position.x;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/* Solid tube: soft top light, a bright rim, light packets running towards today. */
const tubeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uTime;
  uniform float uPulse;
  varying float vX;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vX > uReveal) discard;
    vec3 n = normalize(vN);
    float rim = 1.0 - abs(dot(n, normalize(vV)));
    float packet = uPulse * pow(max(0.0, sin((vX - uTime * 1.5) * 2.1)), 22.0);
    float tip = smoothstep(uReveal - 0.5, uReveal, vX);
    vec3 col = uColor * (0.74 + 0.26 * n.y) + uColor * rim * 0.25;
    col += vec3(1.0, 0.93, 0.78) * (packet * 0.5 + tip * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* Wider additive shell around a tube: its glow. */
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uTime;
  uniform float uPulse;
  uniform float uStrength;
  varying float vX;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vX > uReveal) discard;
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float packet = uPulse * pow(max(0.0, sin((vX - uTime * 1.5) * 2.1)), 22.0);
    float tip = smoothstep(uReveal - 0.5, uReveal, vX);
    float a = pow(facing, 2.6) * uStrength * (1.0 + packet * 1.6 + tip * 1.6);
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Soft round sprite texture for the lights at the open branch heads. */
function haloTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export function createGraph(): StackGraph {
  const group = new Group();
  const inner = new Group(); // rotates and fans out; `group` is positioned and scaled by the anchor
  group.add(inner);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const reveal = { value: -LENGTH };
  const time = { value: 0 };

  const tubeMaterial = (color: Color, pulse: boolean) => {
    const m = new ShaderMaterial({
      vertexShader: tubeVertex,
      fragmentShader: tubeFragment,
      uniforms: { uColor: { value: color }, uReveal: reveal, uTime: time, uPulse: { value: pulse ? 1 : 0 } },
    });
    materials.push(m);
    return m;
  };
  const glowMaterial = (color: Color, strength: number, pulse: boolean) => {
    const m = new ShaderMaterial({
      vertexShader: tubeVertex,
      fragmentShader: glowFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: color },
        uReveal: reveal,
        uTime: time,
        uPulse: { value: pulse ? 1 : 0 },
        uStrength: { value: strength },
      },
    });
    materials.push(m);
    return m;
  };

  const amberTube = tubeMaterial(AMBER, true);
  const amberGlow = glowMaterial(new Color('#E0841A'), 0.24, true);
  const earlierTube = tubeMaterial(EARLIER, false);
  const earlierGlow = glowMaterial(EARLIER, 0.09, false);
  const trunkTube = tubeMaterial(TRUNK, true);
  const trunkGlow = glowMaterial(BLUEPRINT, 0.1, true);

  const nodeGeo = new SphereGeometry(1, 20, 14);
  geometries.push(nodeGeo);
  const nodeMat = (color: Color) => {
    const m = new MeshBasicMaterial({ color });
    materials.push(m);
    return m;
  };
  const amberNode = nodeMat(new Color('#FFD27A'));
  const earlierNode = nodeMat(new Color('#8DB7C0'));
  const trunkNode = nodeMat(new Color('#F4F8F7'));

  const halo = haloTexture();
  const haloMat = (color: Color, opacity: number) => {
    const m = new SpriteMaterial({ map: halo, color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending });
    materials.push(m);
    return m;
  };

  /** things that pop in when the draw-in reaches their x */
  const popIns: { obj: Mesh | Sprite; x: number; scale: number; pulse?: number }[] = [];
  const node = (x: number, y: number, z: number, r: number, mat: Material, parent: Group = inner) => {
    const m = new Mesh(nodeGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(0);
    parent.add(m);
    popIns.push({ obj: m, x, scale: r });
    return m;
  };

  const tube = (path: CurvePath<Vector3> | LineCurve3, segments: number, r: number, solid: Material, glow: Material) => {
    const geo = new TubeGeometry(path, segments, r, 10, false);
    const glowGeo = new TubeGeometry(path, segments, r * 3.2, 10, false);
    geometries.push(geo, glowGeo);
    const g = new Mesh(glowGeo, glow);
    g.renderOrder = 3;
    inner.add(new Mesh(geo, solid), g);
  };

  const xStart = toX(stacks.reduce((min, s) => Math.min(min, s.from), Infinity));
  const xNow = toX(stacks.reduce((max, s) => Math.max(max, s.to), -Infinity));

  /* trunk: the career itself */
  tube(new LineCurve3(new Vector3(xStart, 0, 0), new Vector3(xNow, 0, 0)), 8, 0.04, trunkTube, trunkGlow);
  for (const year of roleStarts) {
    node(toX(year), 0, 0, 0.085, trunkNode);
  }

  /* branches */
  interface Branch {
    index: number;
    labelPoint: Vector3;
    labelX: number;
  }
  const branches: Branch[] = [];

  stacks.forEach((s, i) => {
    const { lane, z, labelLead = 0.8 } = LANES[i];
    const y = lane * LANE;
    const x0 = toX(s.from);
    const x1 = s.current ? xNow : toX(s.to);
    const bend = Math.min(0.42 + Math.abs(lane) * 0.2, (x1 - x0) * 0.3);

    const path = new CurvePath<Vector3>();
    path.add(
      new CubicBezierCurve3(
        new Vector3(x0, 0, 0),
        new Vector3(x0 + bend * 0.62, 0, 0),
        new Vector3(x0 + bend * 0.38, y, z),
        new Vector3(x0 + bend, y, z),
      ),
    );
    if (s.current) {
      path.add(new LineCurve3(new Vector3(x0 + bend, y, z), new Vector3(x1, y, z)));
    } else {
      path.add(new LineCurve3(new Vector3(x0 + bend, y, z), new Vector3(x1 - bend, y, z)));
      path.add(
        new CubicBezierCurve3(
          new Vector3(x1 - bend, y, z),
          new Vector3(x1 - bend * 0.38, y, z),
          new Vector3(x1 - bend * 0.62, 0, 0),
          new Vector3(x1, 0, 0),
        ),
      );
    }

    const r = s.current ? 0.062 : 0.045;
    tube(path, 140, r, s.current ? amberTube : earlierTube, s.current ? amberGlow : earlierGlow);

    // fork point on the trunk, and either the merge point or the open head
    node(x0, 0, 0, 0.115, s.current ? amberNode : earlierNode);
    if (s.current) {
      node(x1, y, z, 0.13, amberNode);
      const light = new Sprite(haloMat(AMBER, 0.7));
      light.position.set(x1, y, z);
      light.scale.setScalar(0);
      inner.add(light);
      popIns.push({ obj: light, x: x1, scale: 1.25, pulse: i * 1.7 });
    } else {
      node(x1, 0, 0, 0.115, earlierNode);
    }
    // era boundaries inside the span, as commits on the branch
    s.segments?.slice(1).forEach((sg) => node(toX(sg.from), y, z, 0.1, trunkNode));

    // open branches: the label sits right after the head, like a git ref;
    // merged branches: it starts where the line straightens, below it
    const labelPoint = s.current
      ? new Vector3(x1 + 0.3, y, z)
      : new Vector3(x0 + bend * labelLead, y - 0.3, z);
    branches.push({ index: i, labelPoint, labelX: s.current ? x1 - 0.4 : x0 + bend });
  });

  // today's end of the trunk
  node(xNow, 0, 0, 0.115, trunkNode);
  const trunkLight = new Sprite(haloMat(BLUEPRINT, 0.5));
  trunkLight.position.set(xNow, 0, 0);
  trunkLight.scale.setScalar(0);
  inner.add(trunkLight);
  popIns.push({ obj: trunkLight, x: xNow, scale: 1.1, pulse: 0.6 });

  /* blueprint time axis: baseline, a tick and a faint guide line every five years */
  const top = Math.max(...LANES.map((l) => l.lane)) * LANE + 0.5;
  const axisY = Math.min(...LANES.map((l) => l.lane)) * LANE - 0.95;
  const pts: number[] = [-LENGTH / 2, axisY, 0, LENGTH / 2, axisY, 0];
  const guide: number[] = [];
  for (const y of axisYears) {
    const x = toX(y);
    pts.push(x, axisY, 0, x, axisY - 0.16, 0);
    guide.push(x, axisY, 0, x, top, 0);
  }
  const axisGeo = new BufferGeometry();
  axisGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const guideGeo = new BufferGeometry();
  guideGeo.setAttribute('position', new Float32BufferAttribute(guide, 3));
  const axisMat = new LineBasicMaterial({ color: BLUEPRINT, transparent: true, opacity: 0.4 });
  const guideMat = new LineBasicMaterial({ color: BLUEPRINT, transparent: true, opacity: 0.1 });
  geometries.push(axisGeo, guideGeo);
  materials.push(axisMat, guideMat);
  const axis = new LineSegments(axisGeo, axisMat);
  const guides = new LineSegments(guideGeo, guideMat);
  inner.add(axis, guides);

  // centre the drawing on the anchor
  const centreY = (top + axisY - 0.3) / 2;
  inner.position.y = -centreY;

  const yearPoints = axisYears.map((y) => new Vector3(toX(y), axisY - 0.34, 0));

  const REVEAL_FROM = xStart - 0.3;
  const REVEAL_TO = xNow + 0.8;
  const REVEAL_SECONDS = 2.6;
  let startedAt = -1;

  const smooth = (v: number) => {
    const k = Math.min(1, Math.max(0, v));
    return k * k * (3 - 2 * k);
  };
  const out = new Vector3();

  return {
    group,
    size: { width: LENGTH * 1.06, height: top - axisY + 0.9 },
    update(t, pointer, explode, still, stretch) {
      time.value = t;
      if (still) {
        reveal.value = REVEAL_TO;
      } else {
        if (startedAt < 0) startedAt = t;
        const p = Math.min(1, (t - startedAt) / REVEAL_SECONDS);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        reveal.value = REVEAL_FROM + (REVEAL_TO - REVEAL_FROM) * eased;
      }

      const e = smooth(explode);
      inner.rotation.x = 0.16 + pointer.y * 0.07 + e * 0.5;
      inner.rotation.y = -0.46 + Math.sin(t * 0.21) * 0.07 + pointer.x * 0.13 - e * 0.55;
      inner.rotation.z = 0.035 + Math.sin(t * 0.17) * 0.012;
      // scrolling away fans the lanes out in depth
      inner.scale.set(1, 1 + e * 0.35, 1 + e * 3.2);

      for (const item of popIns) {
        const k = smooth((reveal.value - item.x) / 0.35);
        const beat = item.pulse === undefined ? 1 : 0.86 + 0.14 * Math.sin(t * 2.2 + item.pulse);
        const s = item.scale * k * beat;
        item.obj.scale.set(s, s / stretch, s);
      }
      axisMat.opacity = 0.4 * (1 - e);
      guideMat.opacity = 0.1 * (1 - e);
    },
    stackLabels() {
      return branches.map((b) => ({
        point: inner.localToWorld(out.copy(b.labelPoint)).clone(),
        opacity: smooth((reveal.value - b.labelX) / 0.6),
      }));
    },
    yearLabels() {
      return yearPoints.map((p) => ({
        point: inner.localToWorld(out.copy(p)).clone(),
        opacity: smooth((reveal.value - p.x) / 0.6),
      }));
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      halo.dispose();
    },
  };
}
