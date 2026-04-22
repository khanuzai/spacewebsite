import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// Minimal vignette — single full-screen quad, no extra render targets needed
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.45 } },
  vertexShader:   `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main(){
      vec4 c   = texture2D(tDiffuse, vUv);
      float d  = length(vUv - 0.5) * 1.42; // 0 at center, 1 at corner
      float vig = 1.0 - d * d * uStrength;
      gl_FragColor = vec4(c.rgb * vig, c.a);
    }
  `,
};

export class PostProcessor {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    this.composer = new EffectComposer(renderer);

    // 1 — Scene render
    this.composer.addPass(new RenderPass(scene, camera));

    // 2 — Bloom (sun glow + atmosphere edges)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      1.4,   // strength
      0.8,   // radius
      0.9    // threshold — only sun core + atmosphere edges trigger bloom
    );
    this.composer.addPass(this.bloomPass);

    // 3 — Vignette
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);

    // 4 — Output (tone-mapping / colour-space correction)
    this.composer.addPass(new OutputPass());
  }

  resize(w, h) {
    this.composer.setSize(w, h);
    this.bloomPass.setSize(
      w * this.renderer.getPixelRatio(),
      h * this.renderer.getPixelRatio()
    );
  }

  // Stub kept so main.js callers don't throw
  setSunScreenUV() {}

  render() {
    this.composer.render();
  }
}
