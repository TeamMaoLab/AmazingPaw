# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Robotic hand kinematics modeling and visualization tool. The project helps iteratively build, parameterize, and visualize the coordinate-frame relationships of a servo-driven mechanical finger with ball-link connections.

## Build / run

```bash
uv sync                # install dependencies
jupyter notebook notebook/finger_build.ipynb
```

## Architecture

The core library (`src/hands/`) provides kinematic primitives: homogeneous transforms, joint/link definitions, and forward kinematics chains. The notebook `notebook/finger_build.ipynb` is the primary working surface — it uses Plotly for 3D interactive visualization with ipywidgets sliders for parameter adjustment.

**Plot rule:** matplotlib has poor CJK support, so all figure text must be English only. The notebook already follows this.

## Design workflow

The geometry is built incrementally in the notebook — each step adds one named geometric element (point, line, plane) and verifies visually before moving on. Every element has a meaningful name (e.g. `left_servo`, `core_pivot`) so it can be referenced and controlled precisely. The pattern is:

1. Define named parameters
2. Compute named points from parameters
3. Visualize in 3D with interactive sliders
4. User inspects, then requests next element
