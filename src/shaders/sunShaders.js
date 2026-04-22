import { NOISE_GLSL } from './noise.glsl.js';

export const sunVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv       = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const sunFragmentShader = /* glsl */`
  ${NOISE_GLSL}

  uniform float      uTime;
  uniform vec3       uColor1;        // deep orange core
  uniform vec3       uColor2;        // bright yellow surface
  uniform vec3       uColor3;        // hot-white granule peaks
  uniform sampler2D  uSunTexture;
  uniform bool       uHasSunTexture;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    vec3 p = normalize(vPosition) * 1.8;

    // --- Granulation layers ---
    float gran1 = snoise(p * 3.0  + vec3(0.0, 0.0, uTime * 0.04));
    float gran2 = snoise(p * 6.5  + vec3(uTime * 0.06, 0.0, 0.0));
    float gran3 = snoise(p * 14.0 + vec3(0.0, uTime * 0.10, 0.0));
    float gran4 = snoise(p * 30.0 + vec3(uTime * 0.05, uTime * 0.07, 0.0));

    float granulation = gran1 * 0.45 + gran2 * 0.28 + gran3 * 0.16 + gran4 * 0.11;
    granulation = (granulation + 1.0) * 0.5; // remap to [0,1]

    // --- Limb darkening (classic solar physics) ---
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float cosTheta = dot(normalize(vNormal), viewDir);
    float mu   = max(cosTheta, 0.0);
    // Stronger contrast: deeper limb darkening for dramatic edge
    float limb = 0.18 + 0.97 * mu - 0.15 * mu * mu;

    // --- Base procedural color (more contrast between hot/cool cells) ---
    float contrast = pow(granulation, 1.4); // push darks darker
    vec3 col = mix(uColor1, uColor2, contrast);
    col = mix(col, uColor3, pow(contrast, 2.2) * 0.75);

    // --- Blend in the 8K photo texture ---
    // The texture provides real sunspot structure and large-scale color variation.
    // We multiply it through so the procedural noise modulates on top.
    if (uHasSunTexture) {
      vec3 texCol = texture2D(uSunTexture, vUv).rgb;
      // Slightly scroll the UV to animate the texture as if the sun rotates
      vec2 scrollUv = vUv + vec2(uTime * 0.003, 0.0);
      texCol = texture2D(uSunTexture, scrollUv).rgb;
      // Blend: texture provides macro structure (sunspots), noise adds micro detail
      col = mix(col, texCol * 1.15, 0.55);
      // Noise still modulates brightness on top of the texture
      col *= (0.82 + granulation * 0.36);
    }

    // --- Solar flares / active regions ---
    float flare  = snoise(p * 1.5 + vec3(uTime * 0.02)) * 0.5 + 0.5;
    float flare2 = snoise(p * 0.8 + vec3(0.0, uTime * 0.015, 0.0)) * 0.5 + 0.5;
    float activeRegion = pow(flare * flare2, 2.0);
    col = mix(col, vec3(1.0, 0.95, 0.8), activeRegion * 0.25);

    col *= limb;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---- Corona / glow sphere (rendered additive, larger than sun) ----
export const coronaVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaFragmentShader = /* glsl */`
  ${NOISE_GLSL}

  uniform float uTime;
  uniform float uScale;   // corona sphere radius / sun radius
  uniform vec3  uColor;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));

    // Structured corona rays using noise
    vec3 p = normalize(vPosition);
    float rays = snoise(p * 4.0 + vec3(uTime * 0.01)) * 0.5 + 0.5;
    rays += snoise(p * 9.0 + vec3(uTime * 0.015)) * 0.3;

    float alpha = pow(rim, 2.5) * (0.5 + rays * 0.5);
    alpha *= 0.85;

    // Hot inner / cooler outer gradient
    float radialFade = 1.0 - (1.0 / uScale); // normalized distance contribution
    vec3 col = mix(vec3(1.0, 0.9, 0.5), uColor, pow(rim, 1.2));

    gl_FragColor = vec4(col, alpha);
  }
`;
