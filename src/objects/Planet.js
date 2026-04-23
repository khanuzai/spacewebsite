import * as THREE from 'three';
import { atmosphereVertexShader, atmosphereFragmentShader } from '../shaders/atmosphereShaders.js';
import { earthVertexShader, earthFragmentShader }           from '../shaders/earthShaders.js';
import { ringVertexShader, ringFragmentShader }             from '../shaders/ringShaders.js';

// loader is passed per-call so the LoadingManager can track all textures
function loadTexture(loader, path, onLoad, onError) {
  return loader.load(
    path,
    (tex) => {
      tex.minFilter       = THREE.LinearFilter;
      tex.magFilter       = THREE.LinearFilter;
      tex.generateMipmaps = false;
      if (onLoad) onLoad(tex);
    },
    undefined,
    onError || (() => console.warn(`Texture not found: ${path}`))
  );
}

export class Planet {
  constructor(data, options = {}) {
    this.data      = data;
    this.options   = options;
    this._loader   = new THREE.TextureLoader(options.loadingManager || undefined);
    this.group     = new THREE.Group();   // pivot for orbit
    this.pivot     = new THREE.Group();   // pivot for axial tilt + self-rotation
    this.group.add(this.pivot);

    this._sunDirection = new THREE.Vector3(1, 0, 0);
    this._orbitAngle   = Math.random() * Math.PI * 2; // start at random phase
    this._cloudOffset  = new THREE.Vector2(0, 0);

    this._buildMesh();
    this._buildAtmosphere();
    if (data.hasRings) this._buildRings();
    this._buildOrbitLine();

    // Apply axial tilt
    this.pivot.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);
  }

  // ---- Mesh ----------------------------------------------------------------

  _buildMesh() {
    const radius   = this.data.displayRadius;
    const segments = this.data.name === 'Earth' ? 64 : 32;
    const geo      = new THREE.SphereGeometry(radius, segments, segments);

    if (this.data.name === 'Earth') {
      this._buildEarthMesh(geo, radius);
    } else {
      this._buildStandardMesh(geo, radius);
    }
  }

  _buildEarthMesh(geo, radius) {
    // Compute tangents for normal mapping
    geo.computeTangents();

    // Uniforms shared by the Earth shader
    this._earthUniforms = {
      uDayTexture:      { value: null },
      uNightTexture:    { value: null },
      uCloudsTexture:   { value: null },
      uNormalMap:       { value: null },
      uSpecularMap:     { value: null },
      uSunDirection:    { value: new THREE.Vector3(1, 0, 0) },
      uTime:            { value: 0 },
      uHasNormalMap:    { value: false },
      uHasSpecularMap:  { value: false },
      uHasNightTexture: { value: false },
      uHasCloudsTexture:{ value: false },
      uCloudOffset:     { value: new THREE.Vector2(0, 0) },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader:   earthVertexShader,
      fragmentShader: earthFragmentShader,
      uniforms:       this._earthUniforms,
    });

    // Load textures (graceful fallback: try .jpg then .png)
    const base = '/textures/';
    const set = (key, file, flag) => {
      const onLoad = (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this._earthUniforms[key].value = t;
        if (flag) this._earthUniforms[flag].value = true;
      };
      loadTexture(this._loader, base + file + '.jpg', onLoad, () => {
        loadTexture(this._loader, base + file + '.png', onLoad);
      });
    };

    set('uDayTexture',    '8k_earth_daymap',       null);
    set('uNightTexture',  '8k_earth_nightmap',     'uHasNightTexture');
    set('uCloudsTexture', '8k_earth_clouds',       'uHasCloudsTexture');
    set('uNormalMap',     '8k_earth_normal_map',   'uHasNormalMap');
    set('uSpecularMap',   '8k_earth_specular_map', 'uHasSpecularMap');

    this.mesh = new THREE.Mesh(geo, mat);
    this.pivot.add(this.mesh);
  }

  _buildStandardMesh(geo, radius) {
    const data   = this.data;
    const params = {
      color:        data.color,
      roughness:    data.isGasGiant ? 0.7 : 0.85,
      metalness:    0.0,
    };

    const mat = new THREE.MeshStandardMaterial(params);

    // Try loading textures
    const base = '/textures/';
    const tryLoad = (file) => {
      loadTexture(this._loader, base + file + '.jpg', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        mat.map = t; mat.needsUpdate = true;
      }, () => {
        loadTexture(this._loader, base + file + '.png', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          mat.map = t; mat.needsUpdate = true;
        });
      });
    };

    if (data.texture) tryLoad(data.texture);

    this.mesh = new THREE.Mesh(geo, mat);
    this.pivot.add(this.mesh);
  }

  // ---- Atmosphere ----------------------------------------------------------

  _buildAtmosphere() {
    if (!this.data.atmosphere) return;
    const atm     = this.data.atmosphere;
    const radius  = this.data.displayRadius * (1 + atm.thickness);
    const geo     = new THREE.SphereGeometry(radius, 48, 48);

    this._atmosphereUniforms = {
      uAtmosphereColor: { value: new THREE.Color(...atm.color) },
      uDensity:         { value: atm.density },
      uSunDirection:    { value: new THREE.Vector3(1, 0, 0) },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader:   atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms:       this._atmosphereUniforms,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.FrontSide,
      blending:       THREE.AdditiveBlending,
    });

    this.atmosphere = new THREE.Mesh(geo, mat);
    this.pivot.add(this.atmosphere);
  }

  // ---- Rings (Saturn) ------------------------------------------------------
  // Three stacked planes give visual thickness and volumetric depth.

  _buildRings() {
    const inner = this.data.displayRadius * this.data.ringInner;
    const outer = this.data.displayRadius * this.data.ringOuter;

    this._ringUniforms = {
      uRingTexture:  { value: null },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uInnerRadius:  { value: inner },
      uOuterRadius:  { value: outer },
      uHasTexture:   { value: false },
    };

    loadTexture(this._loader, '/textures/8k_saturn_ring_alpha.png', (t) => {
      this._ringUniforms.uRingTexture.value = t;
      this._ringUniforms.uHasTexture.value  = true;
    });

    // Layer config: [yOffset, opacity multiplier]
    const layers = [
      [0,     1.00],
      [ 0.14, 0.55],
      [-0.14, 0.55],
    ];

    this._ringMeshes = [];
    layers.forEach(([yOff, opacMult]) => {
      const geo = this._buildRingGeometry(inner, outer, 192);
      const mat = new THREE.ShaderMaterial({
        vertexShader:   ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms:       this._ringUniforms, // shared uniforms
        transparent:    true,
        depthWrite:     false,
        side:           THREE.DoubleSide,
        opacity:        opacMult,           // note: opacity not used by this shader but stored
      });
      // Pass opacity through a uniform override via onBeforeRender is complex;
      // instead we just use three layers so the centre is visually denser.
      const mesh  = new THREE.Mesh(geo, mat);
      mesh.position.y = yOff;
      this.pivot.add(mesh);
      this._ringMeshes.push(mesh);
    });
  }

  _buildRingGeometry(inner, outer, segments) {
    const geo      = new THREE.BufferGeometry();
    const positions = [];
    const uvs       = [];
    const indices   = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // inner vertex
      positions.push(inner * cos, 0, inner * sin);
      uvs.push(0, i / segments);

      // outer vertex
      positions.push(outer * cos, 0, outer * sin);
      uvs.push(1, i / segments);
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2);
      indices.push(a + 1, a + 3, a + 2);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ---- Orbit line ----------------------------------------------------------

  _buildOrbitLine() {
    const dist   = this.data.displayDistance;
    const points = [];
    const segs   = 256;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * dist, 0, Math.sin(t) * dist));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.18 });
    this.orbitLine = new THREE.Line(geo, mat);
  }

  // ---- Update --------------------------------------------------------------

  update(elapsed, deltaTime, timeScale, sunWorldPos) {
    const data = this.data;

    this._orbitAngle += (deltaTime * timeScale * Math.PI * 2) / data.orbitalPeriod;

    const dist = data.displayDistance;

    this.group.position.set(
      Math.cos(this._orbitAngle) * dist,
      0,
      Math.sin(this._orbitAngle) * dist
    );

    // Self-rotation
    const rotSign = data.rotationPeriod < 0 ? -1 : 1;
    const rotPeriod = Math.abs(data.rotationPeriod);
    this.mesh.rotation.y += rotSign * (deltaTime * timeScale * Math.PI * 2) / rotPeriod;

    // Update sun direction uniform for atmosphere & Earth shader
    const sunDir = new THREE.Vector3()
      .subVectors(sunWorldPos, this.group.position)
      .normalize();

    if (this._atmosphereUniforms) {
      this._atmosphereUniforms.uSunDirection.value.copy(sunDir);
    }
    if (this._earthUniforms) {
      this._earthUniforms.uSunDirection.value.copy(sunDir);
      this._earthUniforms.uTime.value = elapsed;
      // Slowly offset clouds
      this._cloudOffset.x += deltaTime * timeScale * 0.0004;
      this._earthUniforms.uCloudOffset.value.copy(this._cloudOffset);
    }
    if (this._ringUniforms) {
      this._ringUniforms.uSunDirection.value.copy(sunDir);
    }
  }

  addTo(scene) {
    scene.add(this.group);
    scene.add(this.orbitLine);
  }

  get worldPosition() {
    const pos = new THREE.Vector3();
    this.mesh.getWorldPosition(pos);
    return pos;
  }
}
