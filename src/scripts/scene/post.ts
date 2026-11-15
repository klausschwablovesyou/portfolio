import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from 'three';

/**
 * The film look. Instead of drawing straight to the screen, a frame goes through:
 *
 *  1. terrain → float target;
 *  2. the anchored objects are drawn on top;
 *  3. bloom: bright parts are blurred down and up a small pyramid and added back,
 *     plus a wide horizontal streak, like an anamorphic lens flare;
 *  4. final pass: slight colour fringing towards the corners, vignette, highlight roll-off,
 *     conversion to sRGB and film grain.
 *
 * Everything is linear light in half-float targets until the last pass, so the dark teal
 * gradients do not band.
 */
export interface PostState {
  time: number;
}

export interface Post {
  /** true when the GPU accepts the render targets this needs; call after setSize */
  check(): boolean;
  /** size of the drawing buffer in pixels */
  setSize(width: number, height: number): void;
  render(draw: { terrain(): void; overlay(): void }, state: PostState, clearColor: Color): void;
  dispose(): void;
}

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/* Bloom: soft threshold, then a dual-filter pyramid (Marius Bjørge's "dual Kawase"). */
const prefilterFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uHalfTexel;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv + uHalfTexel).rgb + texture2D(tColor, vUv - uHalfTexel).rgb
      + texture2D(tColor, vUv + vec2(uHalfTexel.x, -uHalfTexel.y)).rgb
      + texture2D(tColor, vUv - vec2(uHalfTexel.x, -uHalfTexel.y)).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float keep = max(soft, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(min(c * keep, vec3(6.0)), 1.0);
  }
`;

const downFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uHalfTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb * 4.0;
    c += texture2D(tColor, vUv - uHalfTexel).rgb;
    c += texture2D(tColor, vUv + uHalfTexel).rgb;
    c += texture2D(tColor, vUv + vec2(uHalfTexel.x, -uHalfTexel.y)).rgb;
    c += texture2D(tColor, vUv - vec2(uHalfTexel.x, -uHalfTexel.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }
`;

const upFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tBase;
  uniform vec2 uHalfTexel;
  varying vec2 vUv;
  void main() {
    vec2 h = uHalfTexel;
    vec3 c = texture2D(tColor, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
    c += texture2D(tColor, vUv + vec2(-h.x, h.y)).rgb * 2.0;
    c += texture2D(tColor, vUv + vec2(0.0, h.y * 2.0)).rgb;
    c += texture2D(tColor, vUv + vec2(h.x, h.y)).rgb * 2.0;
    c += texture2D(tColor, vUv + vec2(h.x * 2.0, 0.0)).rgb;
    c += texture2D(tColor, vUv + vec2(h.x, -h.y)).rgb * 2.0;
    c += texture2D(tColor, vUv + vec2(0.0, -h.y * 2.0)).rgb;
    c += texture2D(tColor, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
  }
`;

/* One horizontal blur step of the anamorphic streak. */
const streakFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform float uStepX;
  uniform float uCut;
  varying vec2 vUv;
  // only the hottest lights streak: the first step drops everything dimmer than uCut,
  // scaling the colour as a whole so the streak keeps the hue of its light
  vec3 tap(vec2 uv) {
    vec3 c = texture2D(tColor, uv).rgb;
    return c * smoothstep(uCut, uCut * 2.0 + 1e-4, max(c.r, max(c.g, c.b)));
  }
  void main() {
    vec3 c = tap(vUv) * 0.2;
    for (int i = 1; i <= 4; i++) {
      float w = 0.4 * exp(-float(i * i) / 7.0) / 1.62;
      vec2 o = vec2(uStepX * float(i), 0.0);
      c += (tap(vUv + o) + tap(vUv - o)) * w;
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const finalFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tBloom;
  uniform sampler2D tStreak;
  uniform vec2 uResolution;
  uniform vec3 uStreakTint;
  uniform float uBloom;
  uniform float uStreak;
  uniform float uFringe;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  // values up to the knee pass unchanged, so the page colours stay what they are;
  // above it the highlights roll off instead of clipping
  vec3 rollOff(vec3 c) {
    const float knee = 0.62;
    vec3 over = max(c - knee, 0.0) / (1.0 - knee);
    return min(c, vec3(knee)) + (1.0 - knee) * (1.0 - exp(-over));
  }
  void main() {
    vec2 centre = vUv - 0.5;
    float r2 = dot(centre, centre);
    // colour fringing: red and blue are sampled a touch apart, growing towards the corners
    vec2 fringe = centre * r2 * uFringe;
    vec3 col = vec3(
      texture2D(tColor, vUv - fringe).r,
      texture2D(tColor, vUv).g,
      texture2D(tColor, vUv + fringe).b
    );
    col += texture2D(tBloom, vUv).rgb * uBloom;
    col += texture2D(tStreak, vUv).rgb * uStreakTint * uStreak;

    vec2 v = centre * vec2(mix(1.0, uResolution.x / uResolution.y, 0.25), 1.0);
    col *= 1.0 - uVignette * smoothstep(0.32, 0.95, length(v));

    gl_FragColor = vec4(rollOff(col), 1.0);
    #include <colorspace_fragment>
    // grain goes on after the conversion, so it is as strong in the shadows as in the lights
    float g = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 311.0) - 0.5;
    gl_FragColor.rgb += g * uGrain;
  }
`;

const BLOOM_LEVELS = 4;

export function createPost(renderer: WebGLRenderer): Post | null {
  // half-float colour targets are needed; without them the caller draws straight to the screen
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    return null;
  }

  const target = (samples = 0, depth = false) =>
    new WebGLRenderTarget(4, 4, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: depth,
      samples,
    });

  const rtComp = target(4, true);
  const down = Array.from({ length: BLOOM_LEVELS }, () => target());
  const up = Array.from({ length: BLOOM_LEVELS - 1 }, () => target());
  const streak = [target(), target()];
  const targets = [rtComp, ...down, ...up, ...streak];

  const resolution = new Vector2(4, 4);
  const material = (fragmentShader: string, uniforms: Record<string, IUniform>) =>
    new ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false });

  const prefilter = material(prefilterFragment, {
    tColor: { value: rtComp.texture },
    uHalfTexel: { value: new Vector2() },
    uThreshold: { value: 0.36 },
    uKnee: { value: 0.22 },
  });
  const downMat = material(downFragment, { tColor: { value: null }, uHalfTexel: { value: new Vector2() } });
  const upMat = material(upFragment, {
    tColor: { value: null },
    tBase: { value: null },
    uHalfTexel: { value: new Vector2() },
  });
  const streakMat = material(streakFragment, { tColor: { value: null }, uStepX: { value: 0 }, uCut: { value: 0 } });
  const final = material(finalFragment, {
    tColor: { value: rtComp.texture },
    tBloom: { value: up[0].texture },
    tStreak: { value: streak[0].texture },
    uResolution: { value: resolution },
    uStreakTint: { value: new Color('#FFE2B8') },
    uBloom: { value: 0.2 },
    uStreak: { value: 0.4 },
    uFringe: { value: 0.004 },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.024 },
    uTime: { value: 0 },
  });
  const materials = [prefilter, downMat, upMat, streakMat, final];

  // one triangle that covers the screen
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(geometry, final);
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const draw = (mat: ShaderMaterial, to: WebGLRenderTarget | null) => {
    quad.material = mat;
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCamera);
  };

  return {
    check() {
      const gl = renderer.getContext();
      let complete = true;
      for (const t of [rtComp, down[0]]) {
        renderer.setRenderTarget(t);
        complete &&= gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      }
      renderer.setRenderTarget(null);
      return complete;
    },
    setSize(width, height) {
      resolution.set(width, height);
      rtComp.setSize(width, height);
      let w = width;
      let h = height;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        w = Math.max(2, Math.round(w / 2));
        h = Math.max(2, Math.round(h / 2));
        down[i].setSize(w, h);
        if (i < BLOOM_LEVELS - 1) up[i].setSize(w, h);
      }
      streak.forEach((s) => s.setSize(down[1].width, down[1].height));
    },
    render(drawScene, state, clearColor) {
      final.uniforms.uTime.value = state.time;

      renderer.setRenderTarget(rtComp);
      renderer.setClearColor(clearColor, 1); // set per target: it is converted to the target's colour space
      renderer.clear();
      drawScene.terrain();
      renderer.clearDepth();
      drawScene.overlay();

      // bloom pyramid: down …
      prefilter.uniforms.uHalfTexel.value.set(0.5 / rtComp.width, 0.5 / rtComp.height);
      draw(prefilter, down[0]);
      for (let i = 1; i < BLOOM_LEVELS; i++) {
        downMat.uniforms.tColor.value = down[i - 1].texture;
        downMat.uniforms.uHalfTexel.value.set(0.5 / down[i - 1].width, 0.5 / down[i - 1].height);
        draw(downMat, down[i]);
      }
      // … and up again, adding each level on the way
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        const from = i === BLOOM_LEVELS - 2 ? down[BLOOM_LEVELS - 1] : up[i + 1];
        upMat.uniforms.tColor.value = from.texture;
        upMat.uniforms.tBase.value = down[i].texture;
        upMat.uniforms.uHalfTexel.value.set(0.5 / from.width, 0.5 / from.height);
        draw(upMat, up[i]);
      }

      // anamorphic streak: three horizontal steps, each three times wider than the last
      const sources = [down[1], streak[0], streak[1]];
      const dests = [streak[0], streak[1], streak[0]];
      for (let i = 0; i < 3; i++) {
        streakMat.uniforms.tColor.value = sources[i].texture;
        streakMat.uniforms.uStepX.value = (1.6 * Math.pow(3, i)) / streak[0].width;
        streakMat.uniforms.uCut.value = i === 0 ? 0.2 : 0;
        draw(streakMat, dests[i]);
      }

      draw(final, null);
    },
    dispose() {
      targets.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometry.dispose();
    },
  };
}
