# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Robotic hand kinematics modeling and visualization tool. A servo-driven mechanical finger with ball-link connections. Two servos (β₁, β₂) drive a rigid arm through connecting rods, with passive variables (θ, ψ) solved from rod-length constraints.

Phase 1 (2026-06-11): Web visualization + Newton-Raphson solver (reference only).
Phase 2 (2026-06-11): Parametric 3D skeleton sketch tool — **web3/** is the active tool.

## Build / run

```bash
# Active tool — parametric skeleton sketch
cd web3 && python -m http.server 8002
# → http://localhost:8002/static/index.html

# Phase 1 reference (read-only)
cd web && python server.py    # localhost:8000

# Python environment
uv sync
jupyter notebook notebook/finger_build.ipynb
```

## Active tool: web3 Parametric Skeleton Sketch

### What it does

Interactive 3D parametric skeleton editor with:
- **Point-line-plane representation**: spheres (points), cylinders (solid lines), dashed lines (servo paths), transparent planes
- **Editable dimension annotations**: double-click any distance or angle label to edit → system recalculates from growth order
- **Growth tree overlay**: floating tree diagram showing parent-child dependencies
- **Click-to-highlight**: click tree nodes or 3D points to highlight corresponding elements

### Current skeleton (growth order)

```
O (Origin)
├── S (+X, x_e) ─── Servo plane (10×10mm)
│   └── Sz (+Z, z_e)
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
        │   └── R' (L_AR, α+γ from +X) ─── Plate end (angled relative to TA)
```

### Parameters

| Param | Default | Unit | Controls |
|-------|---------|------|----------|
| x_e | 11 | mm | Servo plane distance (+X) |
| z_e | 0 | mm | Servo height offset (+Z) |
| y_e | 16 | mm | Servo center offset (±Y) |
| R | 16 | mm | Servo arm radius |
| beta1 | 60 | ° | Servo arm angle (from +Z) |
| z0 | 36 | mm | Finger base height (+Z) |
| L_BP | 10 | mm | B → P distance (+X) |
| L_PQ | 50 | mm | P → Q distance (+Z) |
| L_QU | 40 | mm | Q → U distance (+Z) |
| L_PA | 7 | mm | P → A distance (+X) |
| L_AT | 7 | mm | A → T length |
| alpha | 35 | ° | A → T angle (from +X) |
| L_AR | 50 | mm | A → R' length |
| gamma | 90 | ° | A → R' angle (relative to TA) |
| BarHalf | 7 | mm | T bar half-width (±Y) |

### Architecture

Single-page app, no build tools:
- `web3/static/main.js` — everything: growth definition, Three.js scene, annotations, interaction
- `web3/static/style.css` — styles
- `web3/static/index.html` — page layout
- `web3/static/lib/` — Three.js r170 + OrbitControls (vendored)

### Key design decisions

- **Growth-based dependency**: each step computes position from parent + params. Changing a parameter rebuilds all positions from scratch.
- **Annotations are inputs**: double-click any dimension/angle label to edit inline. The displayed value IS the parameter.
- **Dashed vs solid**: servo-related connections use dashed lines (cosmetic/auxiliary), finger skeleton uses solid cylinders (structural).

## Phase 1 reference files (read-only)

- `docs/mechanism_math_model.md` — complete mathematical model
- `docs/phase1_summary.md` — Phase 1 experience summary
- `web/mechanism.py` — parameter definitions, visualization elements, rigid bodies, joints
- `web/static/` — all Phase 1 JS/CSS/HTML
- `web2/` — Phase 2 iteration 1 (growth animation tool, superseded by web3)

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
