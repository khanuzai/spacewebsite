import * as THREE from 'three';
import { sunVertexShader, sunFragmentShader, coronaVertexShader, coronaFragmentShader } from '../shaders/sunShaders.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

export class Sun {
  constructor(radius = 5.0, loadingManager = null) {
    this.radius   = radius;
    this._manager = loadingManager;
    this.group    = new THREE.Group();
    this._buildSurface();
    this._buildCorona();
    this._buildLight();
    this._buildLensflare();
  }

  _buildSurface() {
    const geo = new THREE.SphereGeometry(this.radius, 64, 64);
    this.material = new THREE.ShaderMaterial({
      vertexShader:   sunVertexShader,
      fragmentShader: sunFragmentShader,
      uniforms: {
        uTime:          { value: 0 },
        uColor1:        { value: new THREE.Color(0.9, 0.35, 0.05) },  // deep orange
        uColor2:        { value: new THREE.Color(1.0, 0.75, 0.15) },  // bright yellow
        uColor3:        { value: new THREE.Color(1.0, 0.97, 0.88) },  // hot white
        uSunTexture:    { value: null },
        uHasSunTexture: { value: false },
      },
    });

    // Load the 8K sun photo — blended with procedural granulation in the shader
    const loader = new THREE.TextureLoader(this._manager || undefined);
    loader.load(
      '/textures/8k_sun.jpg',
      (tex) => {
        tex.colorSpace      = THREE.SRGBColorSpace;
        tex.wrapS           = tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter       = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.material.uniforms.uSunTexture.value    = tex;
        this.material.uniforms.uHasSunTexture.value = true;
      },
      undefined,
      () => console.warn('8k_sun.jpg not found — using procedural sun surface only')
    );

    this.surface = new THREE.Mesh(geo, this.material);
    this.group.add(this.surface);
  }

  _buildCorona() {
    // Three layered corona shells for depth
    const coronaLayers = [
      { scale: 1.18, opacity: 0.55 },
      { scale: 1.45, opacity: 0.30 },
      { scale: 2.00, opacity: 0.12 },
    ];

    coronaLayers.forEach(({ scale, opacity }) => {
      const geo = new THREE.SphereGeometry(this.radius * scale, 48, 48);
      const mat = new THREE.ShaderMaterial({
        vertexShader:   coronaVertexShader,
        fragmentShader: coronaFragmentShader,
        uniforms: {
          uTime:  { value: 0 },
          uScale: { value: scale },
          uColor: { value: new THREE.Color(0.6, 0.35, 0.05) },
        },
        transparent: true,
        depthWrite:  false,
        side:        THREE.FrontSide,
        blending:    THREE.AdditiveBlending,
      });
      // Store reference to sync time
      mat._isCorona = true;
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
    });
  }

  _buildLight() {
    // decay=0 disables distance attenuation — physically wrong but required so
    // outer planets (Neptune is 90 units away) receive the same light as inner ones.
    this.light = new THREE.PointLight(0xfff4e0, 3.0, 0, 0);
    this.group.add(this.light);

    // Slightly raised ambient so night sides aren't pure black
    this.ambient = new THREE.AmbientLight(0x0a0e1a, 0.12);
    this.group.add(this.ambient);
  }

  _buildLensflare() {
    // Procedural lensflare — canvas-generated texture, no URL load needed
    this.lensflare = new Lensflare();
    const flareTexture = this._createFlareTexture(256);

    this.lensflare.addElement(new LensflareElement(flareTexture, 512, 0,  new THREE.Color(1.0, 0.95, 0.7)));
    this.lensflare.addElement(new LensflareElement(flareTexture, 60,  0.6, new THREE.Color(1.0, 0.8,  0.4)));
    this.lensflare.addElement(new LensflareElement(flareTexture, 80,  0.7, new THREE.Color(0.8, 0.7,  1.0)));
    this.lensflare.addElement(new LensflareElement(flareTexture, 40,  0.9, new THREE.Color(0.6, 0.8,  1.0)));
    this.lensflare.addElement(new LensflareElement(flareTexture, 120, 1.0, new THREE.Color(1.0, 0.5,  0.2)));

    this.light.add(this.lensflare);
  }

  _createFlareTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;

    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0,    'rgba(255,255,255,1)');
    gradient.addColorStop(0.15, 'rgba(255,240,200,0.9)');
    gradient.addColorStop(0.4,  'rgba(255,200,100,0.4)');
    gradient.addColorStop(1,    'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;
    this.group.children.forEach(child => {
      if (child.material && child.material._isCorona) {
        child.material.uniforms.uTime.value = elapsed;
      }
    });
  }

  addTo(scene) {
    scene.add(this.group);
  }

  get position() {
    return this.group.position;
  }
}
