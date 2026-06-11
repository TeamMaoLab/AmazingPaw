# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Robotic hand kinematics modeling and visualization tool. A servo-driven mechanical finger with ball-link connections. Two servos (β₁, β₂) drive a rigid arm through connecting rods, with passive variables (θ, ∠KAP) solved from rod-length constraints.

## Build / run

```bash
# Active tool — web3 parametric skeleton + math model
cd web3 && python -m http.server 8002
# → http://localhost:8002/static/index.html

# Python environment
uv sync
jupyter notebook notebook/finger_build.ipynb
```

## Progress summary

### Phase 1 — Web visualization + Newton-Raphson solver (read-only)
- `web/` — interactive 2-DOF solver, parameter space grid
- `docs/mechanism_math_model.md` — 6-body mathematical model (reference)

### Phase 2 — Parametric 3D skeleton sketch (web3, completed)
- Growth-based point-line-plane editor with 15 parameters
- CAD-style annotations (dimension + angle + radius), editable inline
- Cross-linked hover highlighting (tree ↔ 3D ↔ annotations)
- 8 rigid bodies with color coding: APB, QP, UQK, KATLR, LF, RD, CD, EF
- Modular architecture: 7 JS modules (state, defs, geometry, ui, annotations, scene-builder, main)
- **Branch**: `refactor/modular-split` (ready to merge into master)

### Phase 3 — Rigid body math model + KaTeX drawer (current)
- `docs/rigid_body_math_model.md` — 8-body decomposition, constraint equations, Jacobian, DOF analysis
- KaTeX-rendered math panel: right-half slide-out drawer, viewport shrinks to left 50%
- SVG topology diagram with color-coded bodies and joint types
- Joint analysis: 1 global rotation (AB axis, ∥X) + 4 local Y rotations (four-bar) + 4 spherical + 2 servo

### Phase 4 — Solver + parameter visualization (next)
- Implement Newton-Raphson solver for (θ, ∠KAP) given (β₁, β₂)
- Parameter space visualization matrix (like web2's grid):
  - Rows/columns: different parameter pairs (β₁ vs β₂, θ vs ∠KAP, etc.)
  - Cells: 2D contour plots of constraint residual or mechanism pose
- Real-time mechanism animation: drag servo angles, see finger move
- Compare with Phase 1 solver results for validation

## Active tool: web3

### Architecture

Single-page app, no build tools. Modular ES modules:

| Module | Responsibility |
|--------|---------------|
| `main.js` | Thin orchestrator (~10 lines) |
| `state.js` | Shared mutable state object S, rebuild callback |
| `defs.js` | Growth definitions, parameters, rigid body data (pure data, no THREE) |
| `geometry.js` | Stateless THREE.js geometry factories |
| `ui.js` | Selection, hover highlighting, growth tree, view controls |
| `annotations.js` | CAD-style dim/angle/radius annotations, KaTeX rendering |
| `scene-builder.js` | Three.js scene lifecycle, rebuild logic |
| `math-drawer.js` | Right-half KaTeX panel with SVG topology diagram |
| `style.css` | Layout + drawer transition + annotation styles |
| `index.html` | Page structure, KaTeX CDN, MATH/DIM toggle buttons |
| `lib/` | Three.js r170 + OrbitControls (vendored) |

### Current skeleton (growth order)

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
        │   └── U (+Z, L_QU) ─── Link-plate joint
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
| x_e | 11 | mm | Servo plane distance (+X) |
| z_e | 0 | mm | Servo height offset (+Z) |
| y_e | 16 | mm | Servo center offset (±Y) |
| R | 16 | mm | Servo arm radius |
| beta1 | 70 | ° | Right servo arm angle (from +Z) |
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

### Key design decisions

- **Growth-based dependency**: each step computes position from parent + params. Changing a parameter rebuilds all positions from scratch.
- **Annotations are inputs**: double-click any dimension/angle label to edit inline.
- **Dashed vs solid**: servo connections = dashed (auxiliary), finger skeleton = solid cylinders (structural).
- **Math drawer**: right-half KaTeX panel, viewport transitions to 50/50 split. SVG topology diagram replaces ASCII art.
- **Rigid body colors**: each body gets a unique color applied to points, lines, and rods.

### Math model summary

- **8 rigid bodies**, 11 joints (5 revolute, 4 spherical, 2 servo)
- **Four-bar loop**: P-A-K-Q-P with 1 internal DOF (∠KAP)
- **Passive variables**: θ (AB-axis global tilt) + ∠KAP (coupler angle at joint A)
- **Active inputs**: β₁, β₂ (servo angles)
- **Constraint equations**: f₁, f₂ = rod-length preservation (RD, LF)
- **DOF = 4 − 2 = 2**
- **Solving**: Newton-Raphson for (θ, ∠KAP), then analytical for remaining positions

## Reference files

- `docs/mechanism_math_model.md` — Phase 1 math model (6-body, reference)
- `docs/rigid_body_math_model.md` — Phase 3 math model (8-body, current)
- `docs/phase1_summary.md` — Phase 1 experience summary
- `web/` — Phase 1 web visualization (read-only)
- `web2/` — Phase 2 iteration 1 (superseded by web3)

## Design workflow

Geometry built incrementally — each step adds one named geometric element and verifies visually before moving on.

1. Define named parameters
2. Compute named points from parameters
3. Visualize in 3D with interactive annotations
4. User inspects, then requests next element

## Conventions

- **Plot labels**: English only (matplotlib/Plotly CJK rendering issues)
- **Discussion & comments**: Chinese
- **Code identifiers**: English, snake_case for Python, camelCase for JS
- **Param naming**: pick ONE convention per rewrite, no fallback aliases
