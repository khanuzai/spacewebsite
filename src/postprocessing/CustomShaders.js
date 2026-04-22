// ---- Chromatic Aberration + Vignette + subtle Lens Distortion ----
// Single pass for performance: barrel distort → CA fringe → vignette

export const CinematicShader = {
  uniforms: {
    tDiffuse:      { value: null },
    uCAStrength:   { value: 0.0018 },  // chromatic aberration intensity
    uDistortion:   { value: 0.04 },    // barrel distortion amount
    uVignette:     { value: 0.55 },    // vignette darkness (0=none, 1=heavy)
    uVigFalloff:   { value: 1.6 },     // how sharp the vignette edge is
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uCAStrength;
    uniform float uDistortion;
    uniform float uVignette;
    uniform float uVigFalloff;
    varying vec2 vUv;

    vec2 barrel(vec2 uv, float k) {
      vec2 cc = uv - 0.5;
      float r2 = dot(cc, cc);
      return uv + cc * (k * r2);
    }

    void main() {
      // Barrel distortion (very subtle)
      vec2 uv = barrel(vUv, uDistortion);

      // Chromatic aberration: R shifts outward, B shifts inward
      vec2 dir = uv - 0.5;
      float len = length(dir);
      vec2 norm = len > 0.0001 ? dir / len : vec2(0.0);

      float r = texture2D(tDiffuse, clamp(uv + norm * len * uCAStrength * 1.0, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, clamp(uv,                                  0.0, 1.0)).g;
      float b = texture2D(tDiffuse, clamp(uv - norm * len * uCAStrength * 0.8, 0.0, 1.0)).b;

      vec4 col = vec4(r, g, b, 1.0);

      // Smooth vignette
      float vig = smoothstep(uVignette, uVignette - uVigFalloff * 0.3, len);
      col.rgb *= vig;

      gl_FragColor = col;
    }
  `,
};

// ---- Screen-space God Rays (radial light shafts from the sun) ----
// Reads the scene render, finds bright pixels near uSunPos, radially blurs them.
// Result is ADDED on top of the scene (additive composite).

export const GodRayShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uSunPos:    { value: null },  // vec2, UV space [0,1]
    uExposure:  { value: 0.22 },
    uDecay:     { value: 0.962 },
    uDensity:   { value: 0.92 },
    uWeight:    { value: 0.42 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uSunPos;
    uniform float uExposure;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;

    varying vec2 vUv;

    const int SAMPLES = 80;

    void main() {
      vec2 uv    = vUv;
      vec2 delta = (uv - uSunPos) * (1.0 / float(SAMPLES)) * uDensity;

      float decay = 1.0;
      vec4  acc   = vec4(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        vec4 samp      = texture2D(tDiffuse, clamp(uv, 0.001, 0.999));
        // Only the brightest pixels (the sun) contribute rays
        float lum      = dot(samp.rgb, vec3(0.2126, 0.7152, 0.0722));
        samp           *= step(0.65, lum);
        samp           *= decay * uWeight;
        acc            += samp;
        decay          *= uDecay;
      }

      // Composite additively: rays add warm orange-yellow tint
      vec4 scene = texture2D(tDiffuse, vUv);
      vec3 rays  = acc.rgb * uExposure;
      // Tint rays warm
      rays *= vec3(1.0, 0.85, 0.55);

      gl_FragColor = scene + vec4(rays, 0.0);
    }
  `,
};
