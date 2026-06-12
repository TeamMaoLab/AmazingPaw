# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Robotic hand kinematics modeling and visualization tool. A servo-driven mechanical finger with ball-link connections. Two servos (β₁, β₂) drive a rigid arm through connecting rods, with passive variables (θ, φ) solved from rod-length constraints.

**Live demo**: https://amazing-paw.netlify.app/

## Quick start

```bash
uv sync
uv run app/server.py
# → http://localhost:8002/static/index.html
```

The backend is a FastAPI dev server that only serves static files. The app runs entirely client-side — no build tools, no server-side logic. Parameters persist via `localStorage`.

## Architecture

Single-page app. Modular ES modules in `app/static/`, vendored Three.js r170 in `app/static/lib/`.

### Module responsibilities

| Module | Responsibility |
|--------|---------------|
| `app/static/main.js` | Entry point: async init, loads saved params, binds save button |
| `app/static/state.js` | Shared mutable state object `S` + rebuild callback |
| `app/static/defs.js` | Growth definitions, 15 parameters, `localStorage` load/save |
| `app/static/scene-builder.js` | Three.js scene lifecycle: init, rebuild, `updatePositions()` |
| `app/static/geometry.js` | Stateless THREE.js geometry factories (points, cylinders, planes) |
| `app/static/ui.js` | Growth tree panel, selection, hover highlighting, view buttons |
| `app/static/annotations.js` | CAD-style dim/angle/radius annotations, inline editing |
| `app/static/solver.js` | Newton-Raphson solver, `forwardPositions()`, grid computation |
| `app/static/mode-manager.js` | Design / Grid / IK mode switching, rod length inheritance |
| `app/static/grid-mode.js` | β₁×β₂ heatmap canvas rendering, pointer interaction |
| `app/static/workspace.js` | U workspace surface: point cloud + wireframe + marker sphere |
| `app/static/ik-solver.js` | Damped Least Squares inverse kinematics |
| `app/static/ik-mode.js` | IK drag interaction, RAF-throttled solving |
| `app/static/hand-track-mode.js` | Track mode: MediaPipe hand tracking → fingertip displacement → β grid lookup → mechanism drive |
| `app/static/math-drawer.js` | Right-half KaTeX panel with SVG topology diagram |
| `app/static/experiments/hand-track.js` | Standalone hand tracking experiment page (not part of main app) |
| `app/server.py` | FastAPI dev server: static files only |

### Data flow

```
User edits param / drags IK target / clicks grid / hand gesture
  │
  ▼
mode-manager.js — switches mode, inherits rod lengths
  │
  ├─ Design mode: defs.js → state.js.params → scene-builder.rebuildScene()
  ├─ Grid mode:   solver.computeGrid() → grid-mode.drawGrid() → workspace.buildWorkspaceSurface()
  ├─ IK mode:     ik-mode._runLookup() → workspace.findNearestU() → scene-builder.updatePositions()
  └─ Track mode:  hand-track-mode → MediaPipe HandLandmarker → fingertip displacement
                    → β grid lookup → scene-builder.updatePositions()
                                                                        │
                                                                        ▼
                                                              Three.js render loop
```

### Key API contracts

**`solver.solve(p, beta1, beta2, L_RD2, L_LF2, initTheta, initPhi)`**
→ `{ theta, phi }` or `null`. Newton-Raphson for passive variables.

**`solver.forwardPositions(p, theta_deg, phi_deg)`**
→ Object mapping growth-step names to `[x, y, z]` arrays. Key names: `Origin`, `servo`, `servo_z`, `servo_r`, `servo_l`, `servo_arm_r`, `servo_arm_l`, `finger_base`, `pivot`, `arm_end`, `arm_ext`, `link_joint`, `plate_end`, `tip`, `bar_r`, `bar_l`. Also stores `_theta_deg`, `_phi_deg`, `_preRot` internally.

**`solver.computeGrid(p, L_RD2, L_LF2, from, to, step, onProgress?)`**
→ Promise resolving to `{ grid: Float32Array, res, from, to, step }`. Grid layout: `grid[(row * res + col) * 3 + {0:theta, 1:phi, 2:status}]`. Status 1 = valid.

**`ik-solver.solveIK(params, targetU, L_RD2, L_LF2, initB1, initB2, initT, initP)`**
→ `{ beta1, beta2, theta, phi, positions, error }` or `null`. DLS outer loop over β, inner loop reuses `solve()`.

**State object `S`** (in `state.js`):
- `S.params` — flat param object (15 keys)
- `S.mode` — `'design'` | `'grid'` | `'ik'` | `'track'`
- `S.meshes` — `{ stepName: { point, line?, plane?, circle? } }`
- `S.kinematicPositions` — output of `forwardPositions()` when in Grid/IK mode
- `S.solverResult` — `{ theta, phi }` from last solve
- `S.solverRodLengths` — `{ L_RD2, L_LF2 }` squared rod lengths (inherited from design config)
- `S.designBetas` — `{ beta1, beta2 }` saved on leaving design mode
- `S.gridData` — grid computation result (see `computeGrid` return)

## Mechanism model

8 rigid bodies, 11 joints (5 revolute, 4 spherical, 2 servo), 2 DOF.

### Skeleton (growth order)

```
O (Origin)
├── S (+X, x_e) ─── Servo plane (10×10mm)
│   └── H (+Z, z_e)
│       ├── C (+Y, y_e) ─── Right servo center + motion circle (R)
│       │   └── D (β₁ from +Z, on circle) ─── Right servo arm tip
│       └── E (-Y, y_e) ─── Left servo center + motion circle (R)
│           └── F (-β₁ from +Z, on circle) ─── Left servo arm tip
└── B (+Z, z0) ─── Finger base
    └── P (+X, L_BP) ─── Pivot
        ├── Q (+Z, L_PQ) ─── Arm extension
        │   └── U (+Z, L_QU) ─── Link-plate joint (end-effector / fingertip)
        ├── A (+X, L_PA) ─── Arm end
        │   ├── T (L_AT, α from +X) ─── Tip (angled)
        │   │   ├── R (+Y, BarHalf) ─── Bar right
        │   │   └── L (-Y, BarHalf) ─── Bar left
        │   └── K (L_AK, α+γ from +X) ─── Plate end (angled relative to TA)
```

### Rigid body decomposition

| Body | Points | Color | Description |
|------|--------|-------|-------------|
| APB | B, P, A | Red | Base, rotates about AB axis (∥X) |
| QP | Q, P | Blue | Arm extension, Rev Y at P |
| UQK | U, Q, K | Green | Rigid triangle, Rev Y at Q |
| KATLR | K, A, T, L, R | Orange | Finger plate + bar, Rev Y at A |
| LF | L, F | Purple | Left rod, spherical both ends |
| RD | R, D | Teal | Right rod, spherical both ends |
| CD | C, D | Orange | Right servo arm, Rev at C (β₁) |
| EF | E, F | Pink | Left servo arm, Rev at E (β₂) |

### Parameters

| Param | Default | Unit | Controls |
|-------|---------|------|----------|
| x_e | 16 | mm | Servo plane distance (+X) |
| z_e | 0 | mm | Servo height offset (+Z) |
| y_e | 7 | mm | Servo center offset (±Y) |
| R | 7 | mm | Servo arm radius |
| beta1 | 0 | ° | Right servo arm angle (from +Z) |
| beta2 | 0 | ° | Left servo arm angle (from +Z) |
| z0 | 36 | mm | Finger base height (+Z) |
| L_BP | 10 | mm | B → P distance (+X) |
| L_PQ | 50 | mm | P → Q distance (+Z) |
| L_QU | 40 | mm | Q → U distance (+Z) |
| L_PA | 7 | mm | P → A distance (+X) |
| L_AT | 7 | mm | A → T length |
| alpha | 35 | ° | A → T angle (from +X) |
| L_AK | 50 | mm | A → K length |
| gamma | 70 | ° | A → K angle (relative to A→T) |
| BarHalf | 7 | mm | T bar half-width (±Y) |

### Math model

- **Four-bar loop**: P-A-K-Q-P with 1 internal DOF (coupler angle at A)
- **Passive variables**: θ (AB-axis global tilt) + φ (QP body angle from +Z at P)
  - φ determines the four-bar configuration; in code it's `phi`, physically it encodes ∠KAP
- **Active inputs**: β₁, β₂ (servo angles)
- **Constraint equations**: f₁ = |R-D|² − L_RD² = 0, f₂ = |L-F|² − L_LF² = 0
- **DOF = 4 − 2 = 2**
- **Forward solving**: Newton-Raphson for (θ, φ), then analytical circle-circle for K, U, T
- **Inverse solving**: Damped Least Squares (JᵀJ + λI)Δβ = Jᵀe, outer loop over (β₁, β₂), inner loop reuses Newton-Raphson
  - λ = 0.01, ε = 0.1°, tol = 0.5mm, max 40 iterations
  - Fallback: brute-force ±3° search when Newton fails

## Four interaction modes

| Mode | Behavior | Entry action |
|------|----------|-------------|
| **Design** | Parametric editor, growth tree, annotations, inline editing | Default mode |
| **Grid** | β₁×β₂ workspace heatmap (BFS-computed), workspace surface, heatmap drag | Saves design betas, inherits rod lengths from design config, runs grid computation |
| **IK** | Drag pink target sphere in 3D, grid-search IK solves servo angles | Same rod length inheritance, auto-computes coarse grid (2° step) if no grid data, shows workspace surface |
| **Track** | MediaPipe hand tracking → fingertip displacement → β grid lookup → mechanism drive | Same rod length inheritance, opens webcam, floating widget with video + info panel + camera stop/resume |

Mode switching restores design betas when returning to Design mode. Grid, IK, and Track modes disable tree editing and annotations. Track mode requires Grid mode to have been run first (needs `S.gridData`). Save Params button only visible in Design mode.

### Physical validity filters (solver)

Newton-Raphson converges to mathematically valid solutions that may be physically impossible. Four filters reject these:

1. **C1**: K above base plane (Kz ≥ z0)
2. **C2**: QP and AK segments must intersect in XZ plane (four-bar not flipped)
3. **C3**: KA-QP acute angle ≥ 10° (near-singularity guard)
4. **C4**: θ continuity < 45° from initial guess

## Key design decisions

- **Growth-based dependency**: each step computes position from parent + params. Changing a parameter rebuilds all positions from scratch.
- **Annotations are inputs**: double-click any dimension/angle label to edit inline.
- **Dashed vs solid**: servo connections = dashed (auxiliary), finger skeleton = solid cylinders (structural).
- **Math drawer**: right-half KaTeX panel, viewport transitions to 50/50 split. SVG topology diagram.
- **Rigid body colors**: each body gets a unique color applied to points, lines, and rods.
- **Rod length inheritance**: entering Grid/IK mode computes rod lengths (L_RD, L_LF) from current design config and freezes them. This prevents param changes from breaking solver convergence.
- **Workspace surface**: U positions colored by β₂ (jet colormap), stride-based wireframe grid lines (~5° spacing), white marker sphere at current U.
- **IK RAF throttling**: pointermove only updates ball position, one IK solve per animation frame. Warm start reuses previous (β₁, β₂, θ, φ). Ball snaps to actual U after solve to stay on workspace surface.
- **Track mode hand frame**: MediaPipe world landmarks → wrist-origin local frame (Y=forward, X=spread, Z=palm normal). Fingertip displacement from calibration baseline mapped to β₁/β₂ target, then nearest grid cell lookup.
- **Track mode calibration**: Fist-in-zone (bottom-right corner) → 5s hold → 5s open-hand sampling → baseline. One Euro Filter (Casiez CHI 2012) for jitter reduction.
- **Track mode widget**: Floating card (video + info panel + Stop/Resume button) in viewport bottom-left. Stop closes camera, Resume reopens. Switching modes auto-exits and cleans up.

## Development workflow

```bash
# Run dev server
uv run app/server.py

# Static files served from app/static/
# Edit JS/CSS → refresh browser, no build step needed
```

Geometry is built incrementally — each growth step adds one named element and verifies visually.

## Conventions

- **Plot labels**: English only (matplotlib/Plotly CJK rendering issues)
- **Discussion & comments**: Chinese
- **Code identifiers**: English, snake_case for Python, camelCase for JS
- **Param naming**: pick ONE convention per rewrite, no fallback aliases

## Reference files

- `docs/rigid_body_math_model.md` — 8-body decomposition, constraint equations, Jacobian, DOF analysis
- `docs/mechanism_math_model.md` — 6-body model (earlier reference)
- `app/static/lib/` — Vendored Three.js r170 + OrbitControls

---

## Development history

### Phase 1 — Web visualization + Newton-Raphson solver (archived)
- `_archive/` — earlier iterations
- `docs/mechanism_math_model.md` — 6-body mathematical model

### Phase 2 — Parametric 3D skeleton sketch
- Growth-based point-line-plane editor with 15 parameters
- CAD-style annotations (dimension + angle + radius), editable inline
- Cross-linked hover highlighting (tree ↔ 3D ↔ annotations)
- 8 rigid bodies with color coding

### Phase 3 — Rigid body math model + KaTeX drawer
- `docs/rigid_body_math_model.md` — 8-body decomposition, constraint equations, Jacobian, DOF analysis
- KaTeX-rendered math panel: right-half slide-out drawer
- SVG topology diagram with color-coded bodies and joint types
- Joint analysis: 1 global rotation (AB axis, ∥X) + 4 local Y rotations (four-bar) + 4 spherical + 2 servo

### Phase 4 — Forward solver + workspace visualization
- Newton-Raphson solver for (θ, φ) given (β₁, β₂)
- BFS-based β₁×β₂ heatmap grid computation
- Workspace surface: 3D point cloud + wireframe of U reachable manifold
- `localStorage` parameter persistence
- Math drawer camera sync: RAF loop during CSS transition

### Phase 5 — Inverse kinematics + interactive control
- Grid-search IK: pre-compute β₁×β₂ → (θ, φ, U) lookup table, nearest-neighbor on workspace surface
- IK mode: drag target sphere, RAF-throttled grid lookup
- Auto-compute coarse workspace surface on IK entry
- Workspace surface independence: IK uses its own grid, Grid mode uses user-configured grid

### Phase 6 — Hand tracking + real-time mechanism drive
- MediaPipe HandLandmarker (WASM + WebGL, browser-side inference)
- Hand local coordinate frame: wrist origin, Y=forward, X=spread, Z=palm normal
- Index fingertip displacement → β₁/β₂ mapping → nearest grid cell lookup
- One Euro Filter (Casiez CHI 2012) for jitter reduction
- Fist-in-zone calibration: baseline sampling for displacement normalization
- Track mode: floating widget (video + info + camera stop/resume), auto-cleanup on mode switch
- Standalone experiment page: `app/static/experiments/hand-track.html`
