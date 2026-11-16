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
 * The film look, kept quiet. Instead of drawing straight to the screen, a frame goes through:
 *
 *  1. the backdrop → float target (multisampled);
 *  2. the anchored objects are drawn on top;
 *  3. bloom: the few bright things are blurred down and up a small pyramid and added back.
 *     The pyramid starts at a quarter of the resolution, which is all a soft glow needs;
 *  4. final pass: a slight vignette, highlight roll-off, conversion to sRGB and a little grain
 *     against banding.
 *
 * Everything is linear light in half-float targets until the last pass, so the dark gradients
 * do not band.
 */
export interface PostState {
  time: number;
  /** false on the lowest tier: the bloom pyramid is skipped */
  bloom: boolean;
}

export interface Post {
  /** true when the GPU accepts the render targets this needs; call after setSize */
  check(): boolean;
  /** size of the drawing buffer in pixels */
  setSize(width: number, height: number): void;
  render(draw: { backdrop(): void; overlay(): void }, state: PostState, clearColor: Color): void;
  /**
   * Runs `fn` with the composition target bound. A program depends on the colour space of the
   * target it draws into, so shaders compiled ahead have to be compiled against this one.
   */
  withTarget(fn: () => void): void;
  dispose(): void;
}

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
 * Bloom: soft threshold, then a dual-filter pyramid (Marius Bjørge's "dual Kawase").
 * The first step goes from the full picture to a quarter of it: four bilinear taps, each
 * between four pixels, read every pixel of a 4×4 block once, so small stars do not flicker.
 */
const prefilterFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv + uTexel).rgb + texture2D(tColor, vUv - uTexel).rgb
      + texture2D(tColor, vUv + vec2(uTexel.x, -uTexel.y)).rgb
      + texture2D(tColor, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
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

const finalFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tBloom;
  uniform vec2 uResolution;
  uniform float uBloom;
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
    vec3 col = texture2D(tColor, vUv).rgb;
    col += texture2D(tBloom, vUv).rgb * uBloom;

    vec2 v = (vUv - 0.5) * vec2(mix(1.0, uResolution.x / uResolution.y, 0.25), 1.0);
    col *= 1.0 - uVignette * smoothstep(0.38, 1.0, length(v));

    gl_FragColor = vec4(rollOff(col), 1.0);
    #include <colorspace_fragment>
    // grain goes on after the conversion, so it is as strong in the shadows as in the lights
    float g = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 311.0) - 0.5;
    gl_FragColor.rgb += g * uGrain;
  }
`;

const BLOOM_LEVELS = 4;
/** how much of the blurred light is added back */
const BLOOM = 0.22;

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
  const targets = [rtComp, ...down, ...up];

  const resolution = new Vector2(4, 4);
  const material = (fragmentShader: string, uniforms: Record<string, IUniform>) =>
    new ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false });

  const prefilter = material(prefilterFragment, {
    tColor: { value: rtComp.texture },
    uTexel: { value: new Vector2() },
    uThreshold: { value: 0.4 },
    uKnee: { value: 0.24 },
  });
  const downMat = material(downFragment, { tColor: { value: null }, uHalfTexel: { value: new Vector2() } });
  const upMat = material(upFragment, {
    tColor: { value: null },
    tBase: { value: null },
    uHalfTexel: { value: new Vector2() },
  });
  const final = material(finalFragment, {
    tColor: { value: rtComp.texture },
    tBloom: { value: up[0].texture },
    uResolution: { value: resolution },
    uBloom: { value: BLOOM },
    uVignette: { value: 0.26 },
    uGrain: { value: 0.011 },
    uTime: { value: 0 },
  });
  const materials = [prefilter, downMat, upMat, final];

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
      // the pyramid: a quarter, an eighth, …
      let w = Math.max(2, Math.round(width / 2));
      let h = Math.max(2, Math.round(height / 2));
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        w = Math.max(2, Math.round(w / 2));
        h = Math.max(2, Math.round(h / 2));
        down[i].setSize(w, h);
        if (i < BLOOM_LEVELS - 1) up[i].setSize(w, h);
      }
    },
    withTarget(fn) {
      renderer.setRenderTarget(rtComp);
      fn();
      renderer.setRenderTarget(null);
    },
    render(drawScene, state, clearColor) {
      final.uniforms.uTime.value = state.time;
      final.uniforms.uBloom.value = state.bloom ? BLOOM : 0;

      renderer.setRenderTarget(rtComp);
      renderer.setClearColor(clearColor, 1); // set per target: it is converted to the target's colour space
      renderer.clear();
      drawScene.backdrop();
      renderer.clearDepth();
      drawScene.overlay();

      if (!state.bloom) {
        draw(final, null);
        return;
      }

      // bloom pyramid: down …
      prefilter.uniforms.uTexel.value.set(1 / rtComp.width, 1 / rtComp.height);
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

      draw(final, null);
    },
    dispose() {
      targets.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometry.dispose();
    },
  };
}
