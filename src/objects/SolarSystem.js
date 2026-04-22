import * as THREE from 'three';
import { Stars }  from './Stars.js';
import { Sun }    from './Sun.js';
import { Planet } from './Planet.js';
import { PLANET_DATA } from '../data/planets.js';

export class SolarSystem {
  constructor(scene) {
    this.scene   = scene;
    this.planets = [];
    this.elapsed = 0;

    // Track every texture — dispatches 'scene-ready' when all are loaded/errored
    const manager   = new THREE.LoadingManager();
    manager.onLoad  = () => window.dispatchEvent(new CustomEvent('scene-ready'));

    this.stars = new Stars(50000, 900, manager);
    this.sun   = new Sun(5.0, manager);
    this.stars.addTo(scene);
    this.sun.addTo(scene);

    PLANET_DATA.forEach(data => {
      const planet = new Planet(data, { loadingManager: manager });
      this.planets.push(planet);
      planet.addTo(scene);
    });
  }

  update(deltaTime, timeScale) {
    this.elapsed += deltaTime;
    this.stars.update(this.elapsed);
    this.sun.update(this.elapsed);

    const sunPos = new THREE.Vector3(0, 0, 0);
    this.planets.forEach(p => p.update(this.elapsed, deltaTime, timeScale, sunPos));
  }

  getPlanet(name) {
    return this.planets.find(p => p.data.name === name);
  }
}
