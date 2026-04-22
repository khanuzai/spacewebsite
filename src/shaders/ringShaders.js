export const ringVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv            = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ringFragmentShader = /* glsl */`
  uniform sampler2D uRingTexture;
  uniform vec3      uSunDirection;
  uniform float     uInnerRadius;
  uniform float     uOuterRadius;
  uniform bool      uHasTexture;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  // Henyey-Greenstein phase function — models forward scattering in ice/dust
  float henyeyGreenstein(float cosTheta, float g) {
    float g2  = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 0.0001), 1.5));
  }

  void main() {
    float r = vUv.x; // 0 = inner edge, 1 = outer edge

    // ---- Base ring density & color ----
    vec4 ringColor;
    if (uHasTexture) {
      vec4 samp  = texture2D(uRingTexture, vec2(r, 0.5));
      float opac = (samp.a > 0.01) ? samp.a : samp.r;
      vec3  col  = (samp.a > 0.01) ? samp.rgb : vec3(0.88, 0.82, 0.70);
      ringColor  = vec4(col, opac);
    } else {
      // Procedural Cassini / A / B / F bands
      float cassini = smoothstep(0.48, 0.50, r) * (1.0 - smoothstep(0.50, 0.52, r));
      float bRing   = smoothstep(0.02, 0.06, r) * (1.0 - smoothstep(0.42, 0.48, r));
      float aRing   = smoothstep(0.52, 0.56, r) * (1.0 - smoothstep(0.78, 0.82, r));
      float fRing   = smoothstep(0.83, 0.85, r) * (1.0 - smoothstep(0.87, 0.90, r)) * 0.28;
      float sub     = sin(r * 200.0) * 0.04 + sin(r * 100.0) * 0.025;
      float density = clamp((bRing * 0.9 + aRing * 0.65 + fRing) * (1.0 - cassini) + sub * bRing, 0.0, 1.0);
      vec3  iceCol  = mix(vec3(0.82, 0.76, 0.65), vec3(0.96, 0.92, 0.84), r);
      ringColor     = vec4(iceCol, density * 0.90);
    }

    if (ringColor.a < 0.008) discard;

    // ---- Lighting ----
    vec3 sunDir  = normalize(uSunDirection);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Forward-scatter phase: sun behind rings from viewer's POV
    // cosTheta > 0 when viewer faces toward the sun (sun is "in front")
    float cosTheta = dot(-viewDir, sunDir);
    // Strong forward scatter (g=0.75) — ice particles scatter light forward
    float phase    = henyeyGreenstein(cosTheta, 0.75) * (4.0 * 3.14159265);
    // Normalised so isotropic (g=0) gives 1.0
    phase          = clamp(phase, 0.0, 6.0);

    // Direct diffuse (top-lit)
    float diffuse  = abs(dot(vec3(0.0, 1.0, 0.0), sunDir));

    // How much is the sun behind the rings from the viewer?
    float backlit  = max(0.0, cosTheta); // 1 = viewer facing sun

    // Blended illumination
    float lit      = mix(diffuse * 0.5 + 0.15,          // face-on lit
                         phase  * 1.8  * backlit + 0.1, // edge-on backscatter
                         backlit * 0.85);

    // Warm the backlit glow — ice rings turn golden when backlit
    vec3 backlitTint = mix(vec3(1.0), vec3(1.0, 0.88, 0.52), backlit * 0.9);
    ringColor.rgb   *= lit * backlitTint;

    // Edge-on brightness boost (more material in line of sight)
    float edgeFactor = 1.0 - abs(dot(viewDir, vec3(0.0, 1.0, 0.0)));
    ringColor.a     *= 0.85 + edgeFactor * 0.5;
    ringColor.rgb   *= 1.0  + edgeFactor * 0.6 * backlit;

    gl_FragColor = ringColor;
  }
`;
