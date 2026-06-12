# Hands — Robotic Finger Mechanism

English | [中文](README_CN.md)

**Live Demo**: [https://amazing-paw.netlify.app/](https://amazing-paw.netlify.app/)

Parametric 3D skeleton sketch + kinematic solver for a servo-driven mechanical finger with ball-link connections.

## Features

- **Design Mode** — Growth-based parametric editor with 15 parameters, CAD-style annotations, inline editing
- **Grid Mode** — β₁×β₂ workspace heatmap with BFS computation and physical validity filtering
- **IK Mode** — Drag a target sphere in 3D, grid-search inverse kinematics drives the mechanism
- **Track Mode** — MediaPipe hand tracking via webcam, fingertip displacement → β grid lookup → real-time mechanism drive
- **Workspace Surface** — 3D visualization of U (fingertip) reachable manifold
- **Math Drawer** — KaTeX-rendered 8-body rigid body model with SVG topology diagram

## Quick Start

```bash
uv sync
uv run app/server.py
# → http://localhost:8002/static/index.html
```

## Architecture

Single-page app, no build tools. FastAPI dev server serves static files only. Parameters persist via `localStorage`.

| Module | Responsibility |
|--------|---------------|
| `app/server.py` | FastAPI dev server: static files only |
| `app/static/main.js` | Entry point, async init |
| `app/static/defs.js` | Growth definitions, 15 parameters |
| `app/static/scene-builder.js` | Three.js scene lifecycle |
| `app/static/solver.js` | Newton-Raphson solver, grid computation |
| `app/static/ik-solver.js` | Damped Least Squares inverse kinematics |
| `app/static/mode-manager.js` | Design / Grid / IK / Track mode switching |
| `app/static/grid-mode.js` | β₁×β₂ heatmap rendering |
| `app/static/workspace.js` | U workspace surface visualization + nearest-neighbor lookup |
| `app/static/ik-mode.js` | IK drag interaction (grid search) |
| `app/static/hand-track-mode.js` | MediaPipe hand tracking → β grid lookup → mechanism drive |
| `app/static/math-drawer.js` | KaTeX math panel + SVG topology |
| `app/static/ui.js` | Selection, hover, growth tree |
| `app/static/annotations.js` | CAD annotations |
| `app/static/geometry.js` | Three.js geometry factories |
| `app/static/state.js` | Shared mutable state |

## Mechanism

8 rigid bodies, 11 joints (5 revolute, 4 spherical, 2 servo), 2 DOF.
Two servos (β₁, β₂) drive a rigid arm through connecting rods.
Passive variables (θ, ∠KAP) solved from rod-length constraints via Newton-Raphson.

## Documentation

- `docs/rigid_body_math_model.md` — 8-body decomposition, constraint equations, Jacobian, DOF analysis
- `docs/mechanism_math_model.md` — 6-body model (reference)
- `CLAUDE.md` — Full project history and development guide

## License

MIT
