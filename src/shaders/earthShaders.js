// Full PBR-style Earth shader: day/night blend, city lights, specular ocean, normal mapping
export const earthVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  attribute vec4 tangent;

  void main() {
    vUv           = uv;
    vNormal       = normalize(normalMatrix * normal);
    vWorldNormal  = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

    // TBN matrix for normal mapping
    vec3 N = normalize((modelMatrix * vec4(normal,   0.0)).xyz);
    vec3 T = normalize((modelMatrix * vec4(tangent.xyz, 0.0)).xyz);
    vec3 B = cross(N, T) * tangent.w;
    vTBN = mat3(T, B, N);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const earthFragmentShader = /* glsl */`
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;    // city lights
  uniform sampler2D uCloudsTexture;
  uniform sampler2D uNormalMap;
  uniform sampler2D uSpecularMap;
  uniform vec3      uSunDirection;    // world-space, normalised
  uniform float     uTime;
  uniform bool      uHasNormalMap;
  uniform bool      uHasSpecularMap;
  uniform bool      uHasNightTexture;
  uniform bool      uHasCloudsTexture;
  uniform vec2      uCloudOffset;     // animated UV offset for clouds

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    // --- Normal mapping ---
    vec3 N;
    if (uHasNormalMap) {
      vec3 nSample = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
      N = normalize(vTBN * nSample);
    } else {
      N = normalize(vWorldNormal);
    }

    // --- Lighting ---
    vec3 sunDir    = normalize(uSunDirection);
    float NdotL    = dot(N, sunDir);
    float diffuse  = smoothstep(-0.1, 0.35, NdotL);  // soft terminator
    float twilight = smoothstep(-0.15, 0.15, NdotL);  // width of terminator band

    // --- Day texture ---
    vec4 dayColor = texture2D(uDayTexture, vUv);

    // --- City lights (night side) ---
    vec4 nightColor = vec4(0.0);
    if (uHasNightTexture) {
      nightColor = texture2D(uNightTexture, vUv);
      // Mild boost — enough to see cities, not enough to trigger square bloom
      nightColor.rgb *= 1.4;
    }

    // Blend day / night
    vec3 surfaceColor = mix(nightColor.rgb, dayColor.rgb, diffuse);

    // Make the terminator zone slightly brighter (scattered light effect)
    float terminatorBrightness = smoothstep(0.0, 0.08, NdotL) * (1.0 - smoothstep(0.08, 0.25, NdotL));
    surfaceColor += vec3(0.18, 0.12, 0.08) * terminatorBrightness;

    // --- Specular highlights (ocean glint) ---
    if (uHasSpecularMap) {
      float specMask = texture2D(uSpecularMap, vUv).r; // white = water
      vec3 viewDir   = normalize(cameraPosition - vWorldPosition);
      vec3 halfVec   = normalize(sunDir + viewDir);
      float spec     = pow(max(dot(N, halfVec), 0.0), 80.0);
      surfaceColor  += vec3(1.0, 0.97, 0.9) * spec * specMask * diffuse * 0.8;
    }

    // --- Clouds ---
    if (uHasCloudsTexture) {
      vec2 cloudUv   = vUv + uCloudOffset;
      float cloud    = texture2D(uCloudsTexture, cloudUv).r;
      // Clouds are white on day side, slightly visible at terminator
      vec3 cloudColor = mix(vec3(0.04, 0.04, 0.06), vec3(1.0, 1.0, 1.0), diffuse);
      // Cloud self-shadow on surface
      surfaceColor = mix(surfaceColor, cloudColor, cloud * (twilight * 0.85 + 0.1));
      // Cloud specular
      if (uHasSpecularMap) {
        vec3 viewDir2  = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec2  = normalize(sunDir + viewDir2);
        float cSpec    = pow(max(dot(N, halfVec2), 0.0), 30.0);
        surfaceColor  += vec3(1.0) * cSpec * cloud * diffuse * 0.3;
      }
    }

    // --- Ambient (very dim – space is dark) ---
    vec3 ambient = dayColor.rgb * 0.015;
    surfaceColor += ambient;

    gl_FragColor = vec4(surfaceColor, 1.0);
  }
`;
