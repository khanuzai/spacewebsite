import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

export class CinematicCamera {
  constructor(camera, controls) {
    this.camera   = camera;
    this.controls = controls;

    // State machine
    // INTRO → FREE ↔ FLY_TO → ORBIT
    //                        ↕
    //                     FLY_THROUGH
    this.state = 'INTRO';

    this._elapsed      = 0;
    this._stateTimer   = 0;
    this._lastUserInput = -999;

    // ---- Intro ----
    // Cinematic sweep: nearly overhead (54° elevation) → god's-eye (31° elevation)
    // Both positions are far enough back to show every planet simultaneously.
    this._introDuration = 12;
    this._introReady    = false;
    this._introStart    = new THREE.Vector3(0, 380, 280);
    this._introEnd      = new THREE.Vector3(0, 130, 220);

    // ---- Drift (idle gentle float) ----
    this._driftBase    = new THREE.Vector3();
    this._driftPhase   = Math.random() * Math.PI * 2;

    // ---- Fly-to ----
    this._flyStart       = new THREE.Vector3();
    this._flyLookStart   = new THREE.Vector3();
    this._flyApproachDir = new THREE.Vector3(0, 0.25, 1).normalize();
    this._flyTargetDist  = 10;
    this._flyDuration    = 3.5;
    this._flyT           = 0;
    this._flyCallback    = null;

    // ---- Orbit ----
    this._orbitTarget    = null; // THREE.Vector3 (world pos, updated each frame)
    this._orbitTargetFn  = null; // () => THREE.Vector3
    this._orbitRadius    = 10;
    this._orbitAngle     = 0;
    this._orbitElev      = 0.4;   // radians above equator
    this._orbitSpeed     = 0.08;  // rad/s
    this._orbitDuration  = 12;    // seconds before auto-advancing tour

    // ---- Tour ----
    this._tourPlanets    = ['Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    this._tourIndex      = 0;
    this._solarSystem    = null;  // set from main.js
    this._tourActive     = false;

    this._setupInputTracking();
  }

  _setupInputTracking() {
    const mark = () => { this._lastUserInput = this._elapsed; };
    window.addEventListener('mousedown', mark);
    window.addEventListener('touchstart', mark, { passive: true });
    window.addEventListener('wheel', mark);
    window.addEventListener('keydown', mark);
  }

  // Called from main.js each frame
  update(deltaTime, solarSystem) {
    this._elapsed    += deltaTime;
    this._stateTimer += deltaTime;
    this._solarSystem = solarSystem;

    switch (this.state) {
      case 'INTRO':        this._updateIntro(deltaTime, solarSystem);   break;
      case 'FLY_TO':       this._updateFlyTo(deltaTime);                break;
      case 'ORBIT':        this._updateOrbit(deltaTime, solarSystem);   break;
      case 'FLY_THROUGH':  this._updateFlyThrough(deltaTime);           break;
      case 'DRIFT':        this._updateDrift(deltaTime);                break;
      case 'FREE':
        // Only start idle drift after 30 seconds of zero user input
        if ((this._elapsed - this._lastUserInput) > 30) {
          this._enterDrift();
        }
        break;
    }
  }

  // ---- INTRO ----------------------------------------------------------------

  _updateIntro(deltaTime, solarSystem) {
    if (!this._introReady) {
      this.camera.position.copy(this._introStart);
      this.controls.target.set(0, 0, 0);
      this.controls.enabled = false;
      this._introReady = true;
    }

    const t     = Math.min(this._stateTimer / this._introDuration, 1.0);
    const eased = easeInOutCubic(t);

    // Sweep from nearly-overhead down into god's-eye view; always look at the system centre
    this.camera.position.lerpVectors(this._introStart, this._introEnd, eased);
    this.controls.target.set(0, 0, 0);

    if (t >= 1.0) {
      this.controls.enabled = true;
      this._enterFree();
    }
  }

  // ---- FLY-TO ---------------------------------------------------------------

  flyTo(getPlanetPosFn, distance, onArrival) {
    const targetPos = getPlanetPosFn();
    const dir = new THREE.Vector3().subVectors(this.camera.position, targetPos).normalize();
    if (dir.lengthSq() < 0.001) dir.set(0, 0.3, 1).normalize();

    this._flyStart.copy(this.camera.position);
    this._flyLookStart.copy(this.controls.target);
    // Store the approach direction and desired distance — used every frame in _updateFlyTo
    this._flyApproachDir = dir.clone();
    this._flyTargetDist  = distance;
    this._flyDuration    = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(targetPos) * 0.055, 2.2, 5.0
    );
    this._flyT           = 0;
    this._flyGetTarget   = getPlanetPosFn;
    this._flyCallback    = onArrival || null;
    this.controls.enabled = false;
    this.state           = 'FLY_TO';
    this._stateTimer     = 0;
  }

  _updateFlyTo(deltaTime) {
    this._flyT += deltaTime / this._flyDuration;
    const t     = Math.min(this._flyT, 1.0);
    const eased = easeInOutCubic(t);

    // Re-sample the planet's live world position each frame so we follow a moving target
    const live = this._flyGetTarget();

    // Recompute approach direction each frame: from fly-start toward the planet's CURRENT
    // position. This keeps the camera homing in from its original bearing relative to
    // wherever the planet is now, so it always lands perfectly centered regardless of
    // how far the planet has moved in its orbit during the flight.
    const dir = new THREE.Vector3().subVectors(this._flyStart, live);
    if (dir.lengthSq() > 0.001) dir.normalize();
    else dir.copy(this._flyApproachDir);

    const dest = new THREE.Vector3()
      .copy(live)
      .addScaledVector(dir, this._flyTargetDist);

    this.camera.position.lerpVectors(this._flyStart, dest, eased);
    this.controls.target.lerpVectors(this._flyLookStart, live, eased);

    // OrbitControls is disabled during fly-to so it never calls camera.lookAt().
    // Call it explicitly every frame to guarantee the planet stays perfectly centred.
    this.camera.lookAt(live);

    if (t >= 1.0) {
      if (this._flyCallback) {
        this._flyCallback();
      } else {
        this._enterOrbit(this._flyGetTarget, this._flyTargetDist);
      }
    }
  }

  // ---- ORBIT ----------------------------------------------------------------

  orbitAround(getPlanetPosFn, radius) {
    this._orbitTargetFn = getPlanetPosFn;
    this._orbitRadius   = radius;
    this._orbitAngle    = Math.atan2(
      this.camera.position.z - getPlanetPosFn().z,
      this.camera.position.x - getPlanetPosFn().x
    );
    this._orbitElev = 0.25 + Math.random() * 0.3;
    this.controls.enabled = false;
    this.state       = 'ORBIT';
    this._stateTimer = 0;
  }

  _enterOrbit(getPlanetPosFn, radius) {
    this.orbitAround(getPlanetPosFn, radius);
  }

  _updateOrbit(deltaTime) {
    if (!this._orbitTargetFn) return;
    this._orbitAngle += this._orbitSpeed * deltaTime;

    const target = this._orbitTargetFn();
    const x = target.x + Math.cos(this._orbitAngle) * this._orbitRadius;
    const z = target.z + Math.sin(this._orbitAngle) * this._orbitRadius;
    const y = target.y + Math.sin(this._orbitElev) * this._orbitRadius * 0.5;

    this.camera.position.lerp(new THREE.Vector3(x, y, z), 0.04);
    this.controls.target.lerp(target, 0.06);

    // OrbitControls is disabled during cinematic orbit so point the camera explicitly.
    this.camera.lookAt(target);

    // Tour: advance to next planet after orbitDuration
    if (this._tourActive && this._stateTimer > this._orbitDuration) {
      this._advanceTour();
    }
  }

  // ---- DRIFT ----------------------------------------------------------------

  _enterDrift() {
    this._driftBase.copy(this.camera.position);
    this._driftPhase = this._elapsed;
    this.controls.enabled = false;
    this.state = 'DRIFT';
    this._stateTimer = 0;
  }

  _updateDrift(deltaTime) {
    const t    = this._elapsed;
    const amp  = Math.min(this.camera.position.length() * 0.015, 4.0);

    // Lissajous-style gentle float
    const ox = Math.sin(t * 0.012 + 1.1) * amp;
    const oy = Math.sin(t * 0.008)       * amp * 0.4;
    const oz = Math.cos(t * 0.010 + 0.7) * amp;

    const target = new THREE.Vector3(
      this._driftBase.x + ox,
      this._driftBase.y + oy,
      this._driftBase.z + oz
    );
    this.camera.position.lerp(target, 0.008);

    // Break drift on user input
    if ((this._elapsed - this._lastUserInput) < 0.5) {
      this._enterFree();
    }
  }

  // ---- FLY-THROUGH (auto tour) ---------------------------------------------

  startTour() {
    this._tourActive = true;
    this._tourIndex  = 0;
    this.state       = 'FLY_THROUGH';
    this._stateTimer = 0;
    this._advanceTour();
  }

  stopTour() {
    this._tourActive = false;
    this._enterFree();
  }

  _updateFlyThrough(deltaTime) {
    // State is managed by _advanceTour calling flyTo / orbitAround in sequence.
    // If we somehow end up here without a target, advance.
    if (this._stateTimer > 2 && this.state === 'FLY_THROUGH') {
      this._advanceTour();
    }
  }

  _advanceTour() {
    if (!this._tourActive || !this._solarSystem) return;
    const name   = this._tourPlanets[this._tourIndex % this._tourPlanets.length];
    this._tourIndex++;

    const planet = this._solarSystem.getPlanet(name);
    if (!planet) { this._advanceTour(); return; }

    const r   = planet.data.displayRadius;
    const dist = r * 5.5 + 6;

    this.flyTo(
      () => planet.worldPosition,
      dist,
      () => {
        // Arrive → orbit for orbitDuration, then tour advances
        this._enterOrbit(() => planet.worldPosition, dist);
        this.state = 'ORBIT'; // keep tour flag active
      }
    );
  }

  // ---- FREE (user control) -------------------------------------------------

  _enterFree() {
    this.controls.enabled = true;
    this.state            = 'FREE';
    this._stateTimer      = 0;
  }

  // Called when user manually selects a planet
  focusPlanet(planet) {
    const r    = planet.data.displayRadius;
    const dist = r * 5.5 + 6;
    this.flyTo(
      () => planet.worldPosition,
      dist,
      () => this._enterOrbit(() => planet.worldPosition, dist)
    );
    this._tourActive = false;
  }

  focusSun() {
    this._flyStart.copy(this.camera.position);
    this._flyLookStart.copy(this.controls.target);
    this._flyEnd.set(0, 12, 32);
    this._flyLookEnd.set(0, 0, 0);
    this._flyDuration = 3.5;
    this._flyT        = 0;
    this._flyGetTarget  = () => new THREE.Vector3(0, 0, 0);
    this._flyCallback   = () => this._enterOrbit(() => new THREE.Vector3(0, 0, 0), 32);
    this.controls.enabled = false;
    this.state          = 'FLY_TO';
    this._stateTimer    = 0;
    this._tourActive    = false;
  }

  // Any user interaction immediately hands control back — no auto state ever fights the user
  onUserInteract() {
    this._lastUserInput = this._elapsed;
    if (this.state !== 'INTRO') {
      this._enterFree();
    }
  }
}
