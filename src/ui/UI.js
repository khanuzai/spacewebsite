import { PLANET_DATA } from '../data/planets.js';

/**
 * Minimal, cinematic HUD.
 * Philosophy: nearly invisible. Surfaces information poetically, never clinically.
 */
export class UI {
  constructor({ onPlanetSelect, onTimeChange, onTourToggle }) {
    this._onPlanetSelect = onPlanetSelect;
    this._onTimeChange   = onTimeChange;
    this._onTourToggle   = onTourToggle;

    this._nearestPlanet  = null;
    this._tourOn         = false;
    this._timeScale      = 0.1;

    this._inject();
  }

  _inject() {
    document.body.insertAdjacentHTML('beforeend', `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300&family=Space+Grotesk:wght@300&display=swap');

        :root {
          --white:  rgba(255,255,255,0.92);
          --dim:    rgba(255,255,255,0.28);
          --accent: rgba(140,190,255,0.9);
          --line:   rgba(255,255,255,0.08);
        }

        #ui-root {
          position: fixed; inset: 0;
          pointer-events: none;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--white);
          z-index: 10;
        }

        /* ── Planet info block — sits at 60% down the screen ── */
        #planet-block {
          position: absolute;
          top: 60%;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity 1.5s ease;
          width: max-content;
        }
        #planet-block.visible { opacity: 1; }

        /* Stats row — above name */
        #stats-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-bottom: 14px;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          padding: 8px 0;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 0 20px;
        }
        .stat-item + .stat-item {
          border-left: 1px solid var(--line);
        }
        .stat-val {
          font-size: 12px;
          font-weight: 200;
          letter-spacing: 0.08em;
          color: var(--white);
        }
        .stat-key {
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--dim);
        }

        /* Planet name */
        #planet-title-name {
          font-size: clamp(32px, 5vw, 64px);
          font-weight: 100;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--white);
          text-shadow: 0 0 80px rgba(140,190,255,0.35);
        }

        /* ── Bottom controls ── */
        #bottom-bar {
          position: absolute;
          bottom: 28px; left: 50%;
          transform: translateX(-50%);
          display: flex; align-items: center; gap: 24px;
          pointer-events: all;
          opacity: 0;
          transition: opacity 0.6s;
        }
        #bottom-bar.visible { opacity: 1; }

        .ctrl {
          display: flex; align-items: center; gap: 8px;
          font-size: 10px; font-weight: 200;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--dim);
        }

        /* Speed slider */
        #speed-slider {
          -webkit-appearance: none;
          width: 100px; height: 1px;
          background: rgba(255,255,255,0.12);
          outline: none; cursor: pointer;
        }
        #speed-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px; height: 10px; border-radius: 50%;
          background: rgba(255,255,255,0.7);
          box-shadow: 0 0 6px rgba(140,190,255,0.5);
        }
        #speed-label {
          font-size: 10px; font-weight: 200;
          letter-spacing: 0.15em; color: var(--accent);
          min-width: 36px;
        }

        /* Icon buttons */
        .icon-btn {
          background: none; border: none;
          cursor: pointer; padding: 4px;
          color: var(--dim);
          font-family: inherit;
          letter-spacing: 0.1em;
          font-size: 10px;
          text-transform: uppercase;
          transition: color 0.25s;
        }
        .icon-btn:hover  { color: var(--white); }
        .icon-btn.active { color: var(--accent); }

        /* Separator */
        .sep {
          width: 1px; height: 14px;
          background: rgba(255,255,255,0.1);
        }

        /* ── Top-left signature ── */
        #signature {
          position: absolute; top: 24px; left: 28px;
          font-size: 9px; font-weight: 200;
          letter-spacing: 0.35em; text-transform: uppercase;
          color: rgba(255,255,255,0.12);
          pointer-events: none;
        }

        /* ── Intro hint ── */
        #intro-hint {
          position: absolute;
          bottom: 10vh; left: 50%;
          transform: translateX(-50%);
          font-size: 10px; font-weight: 200;
          letter-spacing: 0.3em; text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          pointer-events: none;
          opacity: 0;
          transition: opacity 1.4s;
        }
        #intro-hint.visible { opacity: 1; }
      </style>

      <div id="ui-root">
        <div id="signature">Solar System</div>

        <!-- Planet info block -->
        <div id="planet-block">
          <div id="stats-panel"></div>
          <div id="planet-title-name"></div>
        </div>

        <!-- Bottom controls (hidden until intro ends) -->
        <div id="bottom-bar">
          <div class="ctrl">
            <span>Speed</span>
            <input type="range" id="speed-slider" min="0" max="100" value="28">
            <span id="speed-label">0.1×</span>
          </div>
          <div class="sep"></div>
          <button class="icon-btn" id="tour-btn">Tour</button>
        </div>

        <div id="intro-hint">Scroll to explore · Click a planet to travel</div>
      </div>
    `);

    this._planetBlock = document.getElementById('planet-block');
    this._titleName   = document.getElementById('planet-title-name');
    this._statsEl     = document.getElementById('stats-panel');
    this._bottomBar   = document.getElementById('bottom-bar');
    this._introHint   = document.getElementById('intro-hint');
    this._speedLabel  = document.getElementById('speed-label');

    this._bindEvents();
  }

  _bindEvents() {
    // Speed slider — exponential mapping: 0→0.05, 50→1, 100→60
    const slider = document.getElementById('speed-slider');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      const scale = v === 0 ? 0 : Math.pow(10, (v - 50) / 22);
      this._timeScale = scale;
      this._onTimeChange(scale);
      this._speedLabel.textContent = scale < 0.1
        ? scale.toFixed(2) + '×'
        : scale < 10 ? scale.toFixed(1) + '×'
        : Math.round(scale) + '×';
    });

    // Tour button
    document.getElementById('tour-btn').addEventListener('click', (e) => {
      this._tourOn = !this._tourOn;
      e.target.classList.toggle('active', this._tourOn);
      this._onTourToggle(this._tourOn);
    });
  }

  // Call from main.js when intro animation completes
  showControls() {
    this._bottomBar.classList.add('visible');
    setTimeout(() => {
      this._introHint.classList.add('visible');
      setTimeout(() => this._introHint.classList.remove('visible'), 5000);
    }, 1500);
  }

  // Call from main.js when camera is near a planet (proximity check)
  showNearPlanet(name, stats) {
    if (this._nearestPlanet === name) return;
    this._nearestPlanet = name;
    this._showTitle(name, stats);
  }

  clearNearPlanet() {
    if (!this._nearestPlanet) return;
    this._nearestPlanet = null;
    this._hideTitle();
  }

  _showTitle(name, stats) {
    this._titleName.textContent = name;

    if (stats) {
      this._statsEl.innerHTML = Object.entries(stats).slice(0, 4).map(([k, v]) => `
        <div class="stat-item">
          <div class="stat-val">${v}</div>
          <div class="stat-key">${k.replace(/([A-Z])/g, ' $1').trim()}</div>
        </div>
      `).join('');
      this._statsEl.style.display = 'flex';
    } else {
      this._statsEl.style.display = 'none';
    }

    this._planetBlock.classList.add('visible');
  }

  _hideTitle() {
    this._planetBlock.classList.remove('visible');
  }

  // Called each frame from main.js with camera distance to each planet
  updateProximity(planets, camera) {
    let nearest = null;
    let minDist  = Infinity;

    planets.forEach(p => {
      const d = camera.position.distanceTo(p.worldPosition);
      const threshold = p.data.displayRadius * 8;
      if (d < threshold && d < minDist) {
        minDist = d;
        nearest = p;
      }
    });

    if (nearest) {
      this.showNearPlanet(nearest.data.name, nearest.data.stats);
    } else {
      this.clearNearPlanet();
    }
  }
}
