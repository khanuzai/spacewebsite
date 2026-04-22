# Solar System

An interactive 3D simulation of our solar system — built to feel less like a data tool and more like looking out a window.

---

## What it is

A real-time WebGL experience featuring all eight planets with high-resolution textures, custom atmosphere and ring shaders, a cinematic intro camera, ambient audio, and a minimal HUD that surfaces information without getting in the way. Click a planet to travel to it. Use the tour to drift through the system on autopilot.

## Tech stack

- **[Three.js](https://threejs.org/)** — 3D rendering, custom GLSL shaders, post-processing
- **[Vite](https://vitejs.dev/)** — dev server and bundler
- Vanilla JavaScript (no frameworks)

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

```bash
npm run build    # production build
npm run preview  # preview the build
```

## Controls

| Action | Input |
|---|---|
| Orbit | Click + drag |
| Zoom | Scroll |
| Focus planet | Click on it |
| Tour mode | Bottom bar → Tour |
| Time speed | Bottom bar → Speed slider |

---

## A note

Space has always fascinated me — the scale of it, the silence, the way every planet has its own personality. This project started as a way to bring that feeling into a browser. Not a textbook, not a dashboard — just the solar system, as close to how it feels as I could get.

---

*A Zai Production*
