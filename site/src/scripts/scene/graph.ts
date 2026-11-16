import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  CurvePath,
  Float32BufferAttribute,
  Group,
  LineCurve3,
  LineSegments,
  Mesh,
  Points,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
  type Curve,
} from 'three';
import { axisYears, roleStarts, stacks, timeline } from '../../i18n/shared';

/**
 * The stack graph: the career drawn the way git draws history. One trunk runs from 2003 to
 * today; every stack is a branch that forks off at the year it was first used and either
 * merges back when it was last used, or is still open and runs to today (amber, with a
 * light at its head). The x axis is time, so every length is that stack's real span.
 * The dots on the trunk are the starts of the roles.
 *
 * It is a diagram made of light: thin lines of a constant width in pixels, commit dots with a
 * dark centre, a small light at each open head. It stands still unless the pointer moves or the
 * page scrolls: its labels are HTML elements placed from it, so every movement costs style work.
 *
 * Built in unit space (10 units = the whole time axis) and scaled to its DOM anchor. All the
 * lines are one mesh, all the dots one set of points: five draw calls in total.
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

/* Colours are light, not paint: values above 1 are what the bloom of post.ts picks up. */
const AMBER = new Color('#F2B33D').multiplyScalar(1.45);
const EARLIER = new Color('#6A97A2').multiplyScalar(0.9);
const TRUNK = new Color('#DCE8E6');
const BLUEPRINT = new Color('#A9CDD5');
const INK = new Color('#0B1620');

/** line widths and dot sizes in CSS pixels, at the scale of a desktop hero */
const WIDTH = { open: 2.5, earlier: 1.8, trunk: 2 };
const DOT = { role: 5.5, fork: 7.5, era: 6, head: 9.5, halo: 44 };
/** pixels per graph unit at that scale; smaller graphs get proportionally finer marks, within limits */
const REFERENCE_UNIT_PX = 56;

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
  /**
   * stretch: how much taller than wide the anchor scales the graph (narrow screens);
   * unitPx: CSS pixels per graph unit on screen, so widths can be given in pixels.
   */
  update(
    t: number,
    pointer: { x: number; y: number },
    explode: number,
    still: boolean,
    stretch: number,
    unitPx: number,
  ): void;
  /** device pixels per CSS pixel of the drawing buffer */
  resize(pixelRatio: number): void;
  /** label points, in the order of `stacks`; the same objects every time */
  stackLabels(): GraphLabel[];
  /** label points of the year ticks, in the order of `axisYears`; the same objects every time */
  yearLabels(): GraphLabel[];
  dispose(): void;
}

const toX = (year: number) => ((year - timeline.start) / (timeline.end - timeline.start) - 0.5) * LENGTH;

/*
 * Lines. The tubes are built with radius 1, so `position - normal` is the centre line and the
 * shader can give every line its width in pixels, whatever the scale of the graph.
 */
const lineVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aLine; // width in px, 1 for a line that carries light packets
  uniform float uUnitsPerPx;
  uniform float uStretch;
  varying float vX;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec3 centre = position - normal;
    vec3 offset = normal * (aLine.x * 0.5 * uUnitsPerPx);
    offset.y /= uStretch; // the anchor may scale y more than x: keep the line as thick as it is wide
    vX = centre.x;
    vColor = aColor;
    vPulse = aLine.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + offset, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  uniform float uReveal;
  uniform float uTime;
  uniform float uFade;
  varying float vX;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    if (vX > uReveal) discard;
    // a packet of light now and then, running towards today
    float packet = vPulse * pow(max(0.0, sin((vX - uTime * 0.7) * 1.6)), 30.0);
    // the head of the line while it draws itself in
    float tip = smoothstep(uReveal - 0.5, uReveal, vX);
    gl_FragColor = vec4(vColor * (1.0 + packet * 0.8 + tip * 1.4), uFade);
    #include <colorspace_fragment>
  }
`;

/* Dots: round sprites of a size in pixels, so they stay round however the graph is scaled. */
const dotVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute vec4 aDot; // size in px, 1 for a filled dot (0: dark centre), x at which it appears, phase
  uniform float uReveal;
  uniform float uPx;
  uniform float uScale;
  uniform float uTime;
  varying vec3 vColor;
  varying float vFilled;
  varying float vSize;
  varying float vBeat;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float pop = smoothstep(0.0, 0.35, uReveal - aDot.z);
    vSize = aDot.x * uScale * uPx * pop;
    gl_PointSize = vSize + 2.0; // a pixel of room all round for the soft edge
    vColor = aColor;
    vFilled = aDot.y;
    vBeat = 0.88 + 0.12 * sin(uTime * 2.0 + aDot.w);
  }
`;

const dotFragment = /* glsl */ `
  uniform vec3 uInk;
  uniform float uFade;
  varying vec3 vColor;
  varying float vFilled;
  varying float vSize;
  void main() {
    if (vSize < 0.5) discard;
    float d = length(gl_PointCoord - 0.5) * (vSize + 2.0); // px from the centre
    float radius = vSize * 0.5;
    float alpha = clamp(radius - d + 0.5, 0.0, 1.0);
    // a commit dot: a ring of the line's colour around the colour of the page
    float core = clamp(radius * 0.48 - d + 0.5, 0.0, 1.0) * (1.0 - vFilled);
    gl_FragColor = vec4(mix(vColor, uInk, core), alpha * uFade);
    #include <colorspace_fragment>
  }
`;

/* The light at an open head: a soft additive disc. */
const haloFragment = /* glsl */ `
  uniform float uFade;
  varying vec3 vColor;
  varying float vSize;
  varying float vBeat;
  void main() {
    if (vSize < 0.5) discard;
    vec2 c = (gl_PointCoord - 0.5) * 2.0 * (vSize + 2.0) / vSize;
    float light = exp(-dot(c, c) * 5.5) * 0.42 * vBeat;
    gl_FragColor = vec4(vColor * light * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

const axisVertex = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const axisFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * uFade);
    #include <colorspace_fragment>
  }
`;

export function createGraph(): StackGraph {
  const group = new Group();
  const inner = new Group(); // turns and recedes; `group` is positioned and scaled by the anchor
  group.add(inner);

  const uniforms = {
    uReveal: { value: -LENGTH },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uUnitsPerPx: { value: 1 / REFERENCE_UNIT_PX },
    uStretch: { value: 1 },
    uPx: { value: 1 },
    uScale: { value: 1 },
  };

  /* lines: every branch as a tube of radius 1, merged into one geometry */
  const linePos: number[] = [];
  const lineNormal: number[] = [];
  const lineColor: number[] = [];
  const lineInfo: number[] = [];
  const lineIndex: number[] = [];
  const addLine = (path: Curve<Vector3>, segments: number, color: Color, width: number, pulse: boolean) => {
    const tube = new TubeGeometry(path, segments, 1, 6, false);
    const base = linePos.length / 3;
    const p = tube.getAttribute('position');
    const n = tube.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      linePos.push(p.getX(i), p.getY(i), p.getZ(i));
      lineNormal.push(n.getX(i), n.getY(i), n.getZ(i));
      lineColor.push(color.r, color.g, color.b);
      lineInfo.push(width, pulse ? 1 : 0);
    }
    const index = tube.getIndex()!;
    for (let i = 0; i < index.count; i++) lineIndex.push(base + index.getX(i));
    tube.dispose();
  };

  /* dots and head lights */
  const dotPos: number[] = [];
  const dotColor: number[] = [];
  const dotInfo: number[] = [];
  const haloPos: number[] = [];
  const haloColor: number[] = [];
  const haloInfo: number[] = [];
  const dot = (x: number, y: number, z: number, size: number, color: Color, filled = false) => {
    dotPos.push(x, y, z);
    dotColor.push(color.r, color.g, color.b);
    dotInfo.push(size, filled ? 1 : 0, x, 0);
  };
  const halo = (x: number, y: number, z: number, color: Color, phase: number) => {
    haloPos.push(x, y, z);
    haloColor.push(color.r, color.g, color.b);
    haloInfo.push(DOT.halo, 1, x, phase);
  };

  const xStart = toX(stacks.reduce((min, s) => Math.min(min, s.from), Infinity));
  const xNow = toX(stacks.reduce((max, s) => Math.max(max, s.to), -Infinity));

  /* trunk: the career itself */
  addLine(new LineCurve3(new Vector3(xStart, 0, 0), new Vector3(xNow, 0, 0)), 8, TRUNK, WIDTH.trunk, true);

  /* branches */
  const branchLabels: { point: Vector3; x: number }[] = [];
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
    const color = s.current ? AMBER : EARLIER;
    addLine(path, 120, color, s.current ? WIDTH.open : WIDTH.earlier, s.current);

    // fork point on the trunk, and either the merge point or the open head
    dot(x0, 0, 0, DOT.fork, color);
    if (s.current) {
      dot(x1, y, z, DOT.head, color, true);
      halo(x1, y, z, AMBER, i * 1.7);
    } else {
      dot(x1, 0, 0, DOT.fork, color);
    }
    // era boundaries inside the span, as commits on the branch
    s.segments?.slice(1).forEach((sg) => dot(toX(sg.from), y, z, DOT.era, color));

    // open branches: the label sits right after the head, like a git ref;
    // merged branches: it starts where the line straightens, below it
    branchLabels.push({
      point: s.current ? new Vector3(x1 + 0.3, y, z) : new Vector3(x0 + bend * labelLead, y - 0.3, z),
      x: s.current ? x1 - 0.4 : x0 + bend,
    });
  });

  // role starts on the trunk (after the forks, so they are drawn over them), and today's end of it
  for (const year of roleStarts) dot(toX(year), 0, 0, DOT.role, TRUNK);
  dot(xNow, 0, 0, DOT.head * 0.9, TRUNK, true);
  halo(xNow, 0, 0, BLUEPRINT, 0.6);

  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new Float32BufferAttribute(linePos, 3));
  lineGeo.setAttribute('normal', new Float32BufferAttribute(lineNormal, 3));
  lineGeo.setAttribute('aColor', new Float32BufferAttribute(lineColor, 3));
  lineGeo.setAttribute('aLine', new Float32BufferAttribute(lineInfo, 2));
  lineGeo.setIndex(lineIndex);
  const lineMat = new ShaderMaterial({
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    transparent: true,
    uniforms: {
      uReveal: uniforms.uReveal,
      uTime: uniforms.uTime,
      uFade: uniforms.uFade,
      uUnitsPerPx: uniforms.uUnitsPerPx,
      uStretch: uniforms.uStretch,
    },
  });
  const lines = new Mesh(lineGeo, lineMat);
  lines.frustumCulled = false; // the shader moves the vertices off the built radius
  lines.renderOrder = 1;

  const points = (pos: number[], color: number[], info: number[]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aColor', new Float32BufferAttribute(color, 3));
    g.setAttribute('aDot', new Float32BufferAttribute(info, 4));
    return g;
  };
  const dotUniforms = {
    uReveal: uniforms.uReveal,
    uTime: uniforms.uTime,
    uFade: uniforms.uFade,
    uPx: uniforms.uPx,
    uScale: uniforms.uScale,
  };
  const dotGeo = points(dotPos, dotColor, dotInfo);
  const dotMat = new ShaderMaterial({
    vertexShader: dotVertex,
    fragmentShader: dotFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { ...dotUniforms, uInk: { value: INK } },
  });
  const dots = new Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  dots.renderOrder = 3;

  const haloGeo = points(haloPos, haloColor, haloInfo);
  const haloMat = new ShaderMaterial({
    vertexShader: dotVertex,
    fragmentShader: haloFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: dotUniforms,
  });
  const halos = new Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  halos.renderOrder = 2;

  /* time axis: a fine baseline, a tick and a faint guide line every five years */
  const top = Math.max(...LANES.map((l) => l.lane)) * LANE + 0.5;
  const axisY = Math.min(...LANES.map((l) => l.lane)) * LANE - 0.95;
  const axisPos: number[] = [-LENGTH / 2, axisY, 0, LENGTH / 2, axisY, 0];
  const axisAlpha: number[] = [0.34, 0.34];
  for (const y of axisYears) {
    const x = toX(y);
    axisPos.push(x, axisY, 0, x, axisY - 0.16, 0, x, axisY, 0, x, top, 0);
    axisAlpha.push(0.34, 0.34, 0.09, 0.09);
  }
  const axisGeo = new BufferGeometry();
  axisGeo.setAttribute('position', new Float32BufferAttribute(axisPos, 3));
  axisGeo.setAttribute('aAlpha', new Float32BufferAttribute(axisAlpha, 1));
  const axisMat = new ShaderMaterial({
    vertexShader: axisVertex,
    fragmentShader: axisFragment,
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: BLUEPRINT }, uFade: { value: 1 } },
  });
  const axis = new LineSegments(axisGeo, axisMat);
  axis.renderOrder = 0;

  inner.add(axis, lines, halos, dots);

  // centre the drawing on the anchor
  const centreY = (top + axisY - 0.3) / 2;
  inner.position.y = -centreY;

  const stackOut: GraphLabel[] = branchLabels.map(() => ({ point: new Vector3(), opacity: 0 }));
  const yearPoints = axisYears.map((y) => new Vector3(toX(y), axisY - 0.34, 0));
  const yearOut: GraphLabel[] = yearPoints.map(() => ({ point: new Vector3(), opacity: 0 }));

  const REVEAL_FROM = xStart - 0.3;
  const REVEAL_TO = xNow + 0.8;
  const REVEAL_SECONDS = 2.6;
  let startedAt = -1;

  const smooth = (v: number) => {
    const k = Math.min(1, Math.max(0, v));
    return k * k * (3 - 2 * k);
  };

  return {
    group,
    size: { width: LENGTH * 1.06, height: top - axisY + 0.9 },
    update(t, pointer, explode, still, stretch, unitPx) {
      uniforms.uTime.value = t;
      if (still) {
        uniforms.uReveal.value = REVEAL_TO;
      } else {
        if (startedAt < 0) startedAt = t;
        const p = Math.min(1, (t - startedAt) / REVEAL_SECONDS);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        uniforms.uReveal.value = REVEAL_FROM + (REVEAL_TO - REVEAL_FROM) * eased;
      }

      // The pose: turned just enough to show the depth of the lanes. Only the pointer and the
      // scroll position move it, so it stands still when they do.
      const e = smooth(explode);
      inner.rotation.x = 0.1 + pointer.y * 0.05 + e * 0.22;
      inner.rotation.y = -0.26 + pointer.x * 0.1 - e * 0.3;
      inner.rotation.z = 0.02;
      // scrolling away: the lanes open a little in depth and the drawing fades
      inner.scale.set(1, 1, 1 + e * 1.1);
      uniforms.uFade.value = 1 - e * 0.9;
      axisMat.uniforms.uFade.value = (1 - e) * (1 - e);

      // widths and sizes are given in pixels; a small graph gets finer marks, within limits
      const k = Math.min(1.12, Math.max(0.72, unitPx / REFERENCE_UNIT_PX));
      uniforms.uUnitsPerPx.value = k / Math.max(1, unitPx);
      uniforms.uStretch.value = stretch;
      uniforms.uScale.value = k;
    },
    resize(pixelRatio) {
      uniforms.uPx.value = pixelRatio;
    },
    stackLabels() {
      for (let i = 0; i < branchLabels.length; i++) {
        const b = branchLabels[i];
        inner.localToWorld(stackOut[i].point.copy(b.point));
        stackOut[i].opacity = smooth((uniforms.uReveal.value - b.x) / 0.6);
      }
      return stackOut;
    },
    yearLabels() {
      for (let i = 0; i < yearPoints.length; i++) {
        inner.localToWorld(yearOut[i].point.copy(yearPoints[i]));
        yearOut[i].opacity = smooth((uniforms.uReveal.value - yearPoints[i].x) / 0.6);
      }
      return yearOut;
    },
    dispose() {
      [lineGeo, dotGeo, haloGeo, axisGeo].forEach((g) => g.dispose());
      [lineMat, dotMat, haloMat, axisMat].forEach((m) => m.dispose());
    },
  };
}
