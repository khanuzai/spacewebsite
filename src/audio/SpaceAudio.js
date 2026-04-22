/**
 * Creates the AudioContext and all nodes immediately (nodes start but AudioContext
 * may be suspended due to browser autoplay policy). Call resume() from the first
 * user-interaction handler to unblock playback.
 */
export class SpaceAudio {
  constructor() {
    this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0; // silent until resume() is called
    this._master.connect(this._ctx.destination);
    this._resumed = false;
    this._buildGraph();
  }

  // Call once from any user-interaction event handler
  resume() {
    if (this._resumed) return;
    this._resumed = true;
    this._ctx.resume().then(() => {
      // Gentle 4-second fade-in so the first note isn't a shock
      this._master.gain.setValueAtTime(0, this._ctx.currentTime);
      this._master.gain.linearRampToValueAtTime(0.28, this._ctx.currentTime + 4);
    });
  }

  _buildGraph() {
    const ctx    = this._ctx;
    const master = this._master;

    // ── 40 Hz sub-bass drone ────────────────────────────────────────────────
    const drone     = ctx.createOscillator();
    drone.type      = 'sine';
    drone.frequency.value = 40;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.75;

    // Slow amplitude LFO (0.1 Hz — 10-second swell)
    const lfo      = ctx.createOscillator();
    const lfoAmp   = ctx.createGain();
    lfo.type       = 'sine';
    lfo.frequency.value = 0.1;
    lfoAmp.gain.value   = 0.22;
    lfo.connect(lfoAmp);
    lfoAmp.connect(droneGain.gain);

    drone.connect(droneGain);
    droneGain.connect(master);

    // ── 80 Hz upper harmonic ────────────────────────────────────────────────
    const upper     = ctx.createOscillator();
    upper.type      = 'sine';
    upper.frequency.value = 80;
    const upperGain = ctx.createGain();
    upperGain.gain.value = 0.16;
    upper.connect(upperGain);
    upperGain.connect(master);

    // ── 120 Hz third harmonic (very faint) ──────────────────────────────────
    const third     = ctx.createOscillator();
    third.type      = 'sine';
    third.frequency.value = 120;
    const thirdGain = ctx.createGain();
    thirdGain.gain.value = 0.06;
    third.connect(thirdGain);
    thirdGain.connect(master);

    drone.start();
    upper.start();
    third.start();
    lfo.start();
  }
}
