import * as THREE from 'three';
import { starsVertexShader, starsFragmentShader } from '../shaders/starsShaders.js';

// Spectral class → approximate RGB color (normalized)
const SPECTRAL_COLORS = [
  [0.61, 0.69, 1.00],  // O  blue-white
  [0.68, 0.76, 1.00],  // B  blue-white
  [0.82, 0.87, 1.00],  // A  white
  [0.97, 0.97, 1.00],  // F  yellow-white
  [1.00, 0.96, 0.85],  // G  yellow
  [1.00, 0.81, 0.58],  // K  orange
  [1.00, 0.63, 0.35],  // M  red-orange
];

const SPECTRAL_CDF = [0.002, 0.015, 0.055, 0.11, 0.25, 0.52, 1.0];

function pickSpectralColor() {
  const r = Math.random();
  for (let i = 0; i < SPECTRAL_CDF.length; i++) {
    if (r < SPECTRAL_CDF[i]) return SPECTRAL_COLORS[i];
  }
  return SPECTRAL_COLORS[6];
}

// Layer definitions: [fraction of total count, size multiplier, parallax strength]
const LAYERS = [
  { fraction: 0.30, sizeScale: 1.00, parallax: 1.0  },  // near  — moves most
  { fraction: 0.40, sizeScale: 0.82, parallax: 0.6  },  // mid
  { fraction: 0.30, sizeScale: 0.65, parallax: 0.3  },  // far   — barely moves
];

export class Stars {
  constructor(count = 50000, radius = 900, loadingManager = null) {
    this.count    = count;
    this.radius   = radius;
    this._manager = loadingManager;
    this.meshes   = [];    // one Points per layer
    this.milkyWay = null;
    this.material = null;  // shared material (same shader, same sprite)

    // Parallax offsets per layer (separate from auto-rotation)
    this._parallaxOffX = [0, 0, 0];
    this._parallaxOffY = [0, 0, 0];

    // Slow automatic rotation accumulator (radians)
    this._autoRotY = 0;

    this._sprite = this._buildSpriteTexture();
    this._buildLayers();
    this._buildMilkyWay();
  }

  _buildLayers() {
    LAYERS.forEach((layerDef, idx) => {
      const count = Math.floor(this.count * layerDef.fraction);
      const mesh  = this._buildPointsLayer(count, layerDef.sizeScale);
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
    });
    // Expose main mesh reference for legacy callers
    this.mesh = this.meshes[0];
  }

  _buildPointsLayer(count, sizeScale) {
    const positions      = new Float32Array(count * 3);
    const colors         = new Float32Array(count * 3);
    const sizes          = new Float32Array(count);
    const twinkleOffsets = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Position — same galactic-plane bias as before
      const isGalactic = Math.random() < 0.55;
      if (isGalactic) {
        const galLat  = (Math.random() - 0.5) * 0.52;
        const galLon  = Math.random() * Math.PI * 2;
        const bandTilt = 0.9;
        const phi   = Math.PI / 2 - galLat;
        const theta = galLon;
        const x  = Math.sin(phi) * Math.cos(theta);
        const y  = Math.sin(phi) * Math.sin(theta);
        const z  = Math.cos(phi);
        const yr = y * Math.cos(bandTilt) - z * Math.sin(bandTilt);
        const zr = y * Math.sin(bandTilt) + z * Math.cos(bandTilt);
        positions[i * 3]     = x  * this.radius;
        positions[i * 3 + 1] = yr * this.radius;
        positions[i * 3 + 2] = zr * this.radius;
      } else {
        const phi   = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        positions[i * 3]     = Math.sin(phi) * Math.cos(theta) * this.radius;
        positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * this.radius;
        positions[i * 3 + 2] = Math.cos(phi)                   * this.radius;
      }

      // Color
      const col = pickSpectralColor();
      const brightness = 0.7 + Math.random() * 0.3;
      colors[i * 3]     = col[0] * brightness;
      colors[i * 3 + 1] = col[1] * brightness;
      colors[i * 3 + 2] = col[2] * brightness;

      // Size — log-normal, scaled by layer
      const lnSize = Math.random();
      let rawSize;
      if      (lnSize > 0.998) rawSize = 3.2 + Math.random() * 2.0;
      else if (lnSize > 0.98)  rawSize = 1.8 + Math.random() * 1.2;
      else if (lnSize > 0.85)  rawSize = 1.0 + Math.random() * 0.8;
      else                     rawSize = 0.3 + Math.random() * 0.7;
      sizes[i] = rawSize * sizeScale;

      twinkleOffsets[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',      new THREE.BufferAttribute(positions,      3));
    geo.setAttribute('aColor',        new THREE.BufferAttribute(colors,         3));
    geo.setAttribute('aSize',         new THREE.BufferAttribute(sizes,          1));
    geo.setAttribute('aTwinkleOffset',new THREE.BufferAttribute(twinkleOffsets, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   starsVertexShader,
      fragmentShader: starsFragmentShader,
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSprite:     { value: this._sprite },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    // Keep a reference to the material on the first layer for legacy update callers
    if (!this.material) this.material = mat;

    return new THREE.Points(geo, mat);
  }

  _buildSpriteTexture() {
    const size   = 64;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx  = canvas.getContext('2d');
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.00, 'rgba(255,255,255,1.00)');
    grad.addColorStop(0.12, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.40)');
    grad.addColorStop(0.70, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter       = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  _buildMilkyWay() {
    const geo = new THREE.SphereGeometry(this.radius - 5, 32, 32);
    this._milkyWayMat = new THREE.MeshBasicMaterial({
      color:      0x444444,
      side:       THREE.BackSide,
      depthWrite: false,
    });

    const loader = new THREE.TextureLoader(this._manager || undefined);
    loader.load(
      '/textures/8k_stars_milky_way.jpg',
      (tex) => {
        tex.colorSpace      = THREE.SRGBColorSpace;
        tex.minFilter       = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.mapping         = THREE.EquirectangularReflectionMapping;
        this._milkyWayMat.map   = tex;
        this._milkyWayMat.color.set(0xffffff);
        this._milkyWayMat.needsUpdate = true;
      },
      undefined,
      () => console.warn('Milky Way texture not found — using procedural stars only')
    );

    this.milkyWay = new THREE.Mesh(geo, this._milkyWayMat);
    this.milkyWay.frustumCulled = false;
    this.milkyWay.renderOrder   = -1;
  }

  // mouseX / mouseY in NDC [-1, 1]
  // Near layer rotates most, far layer barely moves — creates depth parallax
  setParallax(mouseX, mouseY) {
    const baseX = -mouseY * 0.05;
    const baseY =  mouseX * 0.05;

    LAYERS.forEach((layerDef, i) => {
      const targetX = baseX * layerDef.parallax;
      const targetY = baseY * layerDef.parallax;
      this._parallaxOffX[i] += (targetX - this._parallaxOffX[i]) * 0.025;
      this._parallaxOffY[i] += (targetY - this._parallaxOffY[i]) * 0.025;
    });
  }

  update(elapsed) {
    // Slow automatic drift — stars always subtly moving even when mouse is still
    this._autoRotY += 0.0002;

    // Update time uniform + apply combined auto-rotation + parallax per layer
    this.meshes.forEach((mesh, i) => {
      mesh.material.uniforms.uTime.value = elapsed;
      mesh.rotation.y = this._autoRotY + this._parallaxOffY[i];
      mesh.rotation.x = this._parallaxOffX[i];
    });

    // Milky Way follows at reduced auto-rotation (no parallax — it's infinite)
    if (this.milkyWay) {
      this.milkyWay.rotation.y = this._autoRotY * 0.4;
    }
  }

  addTo(scene) {
    scene.add(this.milkyWay);
    this.meshes.forEach(m => scene.add(m));
  }
}
