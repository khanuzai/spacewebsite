export const starsVertexShader = /* glsl */`
  attribute float aSize;
  attribute vec3  aColor;
  attribute float aTwinkleOffset;

  uniform float uTime;
  uniform float uPixelRatio;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;

    float twinkle = sin(uTime * 1.6 + aTwinkleOffset * 6.2831853) * 0.5 + 0.5;
    twinkle = 0.72 + 0.28 * twinkle;
    vAlpha = twinkle;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (320.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`;

// The fragment shader uses a canvas-generated circular gradient texture (uSprite)
// passed from Stars.js. Sampling a pre-rendered circle is the only reliable way
// to get perfectly round points — the manual discard approach can still produce
// square bloom artifacts in the post-processing pass.
export const starsFragmentShader = /* glsl */`
  uniform sampler2D uSprite;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec4 sprite = texture2D(uSprite, gl_PointCoord);
    if (sprite.a < 0.004) discard;
    gl_FragColor = vec4(vColor * vAlpha, sprite.a * vAlpha);
  }
`;
