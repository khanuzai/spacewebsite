import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { SolarSystem }     from './objects/SolarSystem.js';
import { PostProcessor }   from './postprocessing/PostProcessor.js';
import { CinematicCamera } from './camera/CinematicCamera.js';
import { SpaceAudio }      from './audio/SpaceAudio.js';
import { UI }              from './ui/UI.js';

// ── Renderer ────────────────────────────────────────────────────────────────

const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;';
document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:              false,
  powerPreference:        'high-performance',
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 2000);
camera.position.set(25, 5, 10); // overridden by intro sequence

// ── OrbitControls ────────────────────────────────────────────────────────────

const controls = new OrbitControls(camera, canvas);
controls.enableDamping    = true;
controls.dampingFactor    = 0.04;
controls.minDistance      = 1.0;
controls.maxDistance      = 700;
controls.rotateSpeed      = 0.6;
controls.zoomSpeed        = 1.2;
controls.panSpeed         = 0.8;
controls.enabled          = false; // cinematic camera takes over first

// ── Scene ───────────────────────────────────────────────────────────────────

let timeScale = 0.1; // slow, meditative default

const solarSystem = new SolarSystem(scene);

// ── Post-processing ──────────────────────────────────────────────────────────

const postProcessor = new PostProcessor(renderer, scene, camera);

// ── Audio ────────────────────────────────────────────────────────────────────

const audio = new SpaceAudio();

// Resume audio on first user interaction (autoplay policy)
let _audioStarted = false;
function _resumeAudio() {
  if (_audioStarted) return;
  _audioStarted = true;
  audio.resume();
}
['click', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, _resumeAudio, { once: true, passive: true })
);

// ── Cinematic camera ─────────────────────────────────────────────────────────

const cinematic = new CinematicCamera(camera, controls);

// ── UI ───────────────────────────────────────────────────────────────────────

const ui = new UI({
  onPlanetSelect: (name) => {
    if (name === 'Sun') {
      cinematic.focusSun();
    } else {
      const planet = solarSystem.getPlanet(name);
      if (planet) cinematic.focusPlanet(planet);
    }
  },
  onTimeChange: (scale) => { timeScale = scale; },
  onTourToggle: (on)    => { on ? cinematic.startTour() : cinematic.stopTour(); },
});

// ── Hover pulse rings ────────────────────────────────────────────────────────

const _hoverRings = new Map(); // planet name → { mesh, targetOpacity }
solarSystem.planets.forEach(p => {
  const r   = p.data.displayRadius * 1.65;
  const geo = new THREE.RingGeometry(r, r + r * 0.07, 64);
  const mat = new THREE.MeshBasicMaterial({
    color:       0x88bbff,
    transparent: true,
    opacity:     0,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.renderOrder = 1;
  scene.add(ring);
  _hoverRings.set(p.data.name, { mesh: ring, targetOpacity: 0 });
});

// ── Mouse state ──────────────────────────────────────────────────────────────

const raycaster  = new THREE.Raycaster();
const _mouse     = new THREE.Vector2();
let   _mouseNDC  = new THREE.Vector2(0, 0);

canvas.addEventListener('mousemove', (e) => {
  _mouseNDC.set(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  // Star parallax
  if (solarSystem.stars) solarSystem.stars.setParallax(_mouseNDC.x, _mouseNDC.y);

  // Hover raycaster
  raycaster.setFromCamera(_mouseNDC, camera);
  const meshes = solarSystem.planets.map(p => p.mesh).filter(Boolean);
  const hits   = raycaster.intersectObjects(meshes, false);
  const hitPlanet = hits.length > 0
    ? solarSystem.planets.find(p => p.mesh === hits[0].object)
    : null;

  _hoverRings.forEach((ring, name) => {
    ring.targetOpacity = (hitPlanet && hitPlanet.data.name === name) ? 0.55 : 0;
  });

  canvas.style.cursor = hitPlanet ? 'pointer' : 'default';
});

// ── Click to focus planet ─────────────────────────────────────────────────────

canvas.addEventListener('click', (e) => {
  cinematic.onUserInteract();

  _mouse.set(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(_mouse, camera);

  const meshes = solarSystem.planets.map(p => p.mesh).filter(Boolean);
  const hits   = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    const planet = solarSystem.planets.find(p => p.mesh === hits[0].object);
    if (planet) {
      cinematic.focusPlanet(planet);
      ui.showNearPlanet(planet.data.name, planet.data.stats);
    }
  }
});

// Notify cinematic camera of user interaction on mouse/scroll
['mousedown', 'touchstart', 'wheel'].forEach(ev =>
  canvas.addEventListener(ev, () => cinematic.onUserInteract(), { passive: true })
);

// ── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  postProcessor.resize(w, h);
});

// ── Animation loop ────────────────────────────────────────────────────────────

const clock      = new THREE.Clock();
let   introShown = false;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  cinematic.update(dt, solarSystem);

  if (!introShown && cinematic.state !== 'INTRO') {
    introShown = true;
    ui.showControls();
  }

  if (controls.enabled) controls.update();

  solarSystem.update(dt, timeScale);

  // Update hover rings — follow planet, face camera, lerp opacity
  _hoverRings.forEach((ring, name) => {
    const planet = solarSystem.getPlanet(name);
    if (planet) {
      ring.mesh.position.copy(planet.worldPosition);
      ring.mesh.quaternion.copy(camera.quaternion);
      ring.mesh.material.opacity +=
        (ring.targetOpacity - ring.mesh.material.opacity) * 0.1;
    }
  });

  ui.updateProximity(solarSystem.planets, camera);

  postProcessor.render();
}

animate();
