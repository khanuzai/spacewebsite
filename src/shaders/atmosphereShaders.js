// Rayleigh-scattering atmosphere — renders as a transparent sphere slightly
// larger than the planet, blended additively on the lit side.
export const atmosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal       = normalize(normalMatrix * normal);
    vWorldNormal  = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position   = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragmentShader = /* glsl */`
  uniform vec3  uAtmosphereColor;
  uniform float uDensity;
  uniform vec3  uSunDirection;   // world-space, normalised

  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Fresnel rim – bright at grazing angles
    float fresnel = 1.0 - abs(dot(normalize(vWorldNormal), viewDir));
    fresnel = pow(fresnel, 3.5);

    // Sun-lit fraction (Rayleigh scatter only on the illuminated limb)
    float sunDot = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float sunFactor = smoothstep(-0.25, 0.6, sunDot);

    // Blue-shift at limb: scatter more blue light
    vec3 scatterColor = mix(uAtmosphereColor, vec3(0.4, 0.6, 1.0), pow(fresnel, 1.5));

    float alpha = fresnel * uDensity * (0.3 + sunFactor * 0.7);

    gl_FragColor = vec4(scatterColor, clamp(alpha, 0.0, 1.0));
  }
`;
