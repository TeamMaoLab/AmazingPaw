/**
 * Three.js scene lifecycle — init, rebuild, animate.
 */
import * as THREE from '/static/lib/three.module.js';
import { OrbitControls } from '/static/lib/OrbitControls.js';
import { S, setRebuildCallback } from './state.js';
import { GROWTH, RODS, BODY_COLORS, STEP_BODY } from './defs.js';
import { makeCylinder, makeDashedLine, makeDashedCircle, makePlane, placeCylinder } from './geometry.js';
import { makeLabel, makeDimAnnotation, makeAngleAnnotation, makeCircleRAnnotation, addStaticLabel, updateAllLabelPositions } from './annotations.js';
import { applyHighlight, applyAnnotationVisibility, updateRodLengths } from './ui.js';

export function initScene() {
  S.containerEl = document.getElementById('viewport');
  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0xf5f5f5);

  S.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  S.camera.position.set(150, -200, 150);
  S.camera.up.set(0, 0, 1);

  S.renderer = new THREE.WebGLRenderer({ antialias: true });
  S.renderer.setPixelRatio(window.devicePixelRatio);
  S.containerEl.appendChild(S.renderer.domElement);

  S.controls = new OrbitControls(S.camera, S.renderer.domElement);
  S.controls.target.set(15, 0, 35);
  S.controls.update();

  // World axes
  addAxis(0xff4444, [1, 0, 0], 'X');
  addAxis(0x44cc44, [0, 1, 0], 'Y');
  addAxis(0x4444ff, [0, 0, 1], 'Z');

  // Grid (XY plane since Z-up)
  const grid = new THREE.GridHelper(200, 20, 0xcccccc, 0xe0e0e0);
  grid.rotation.x = Math.PI / 2;
  S.scene.add(grid);

  onResize();
  window.addEventListener('resize', onResize);
  animate();
}

function addAxis(color, dir, text) {
  const len = 30;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, dir[0] * len, dir[1] * len, dir[2] * len], 3));
  S.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
  addStaticLabel(text, [dir[0] * (len + 3), dir[1] * (len + 3), dir[2] * (len + 3)], color);
}

export function onResize() {
  const w = S.containerEl.clientWidth, h = S.containerEl.clientHeight;
  if (w === 0 || h === 0) return;
  S.renderer.setSize(w, h);
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  S.controls.update();
  updateAllLabelPositions();
  S.renderer.render(S.scene, S.camera);
}

// ── Position computation (mode-dependent) ──

// Store build results (for plane info etc.) alongside positions
let _buildExtras = {};

function computeDesignPositions() {
  const positions = {};
  _buildExtras = {};
  for (const step of GROWTH) {
    const parentPos = step.parent ? positions[step.parent] : [0, 0, 0];
    const result = step.build(S.params, parentPos);
    positions[step.name] = result.pos;
    if (result.plane) _buildExtras[step.name] = { plane: result.plane };
  }
  return positions;
}

function computePositions() {
  if (S.mode !== 'design' && S.kinematicPositions) {
    // Compute build extras for servo plane in kinematic mode
    _buildExtras = {};
    for (const step of GROWTH) {
      if (step.name === 'servo') {
        const result = step.build(S.params, [0, 0, 0]);
        if (result.plane) _buildExtras[step.name] = { plane: result.plane };
      }
    }
    return S.kinematicPositions;
  }
  return computeDesignPositions();
}

// ── Scene cleanup ──

function clearScene() {
  for (const m of Object.values(S.meshes)) {
    if (m.point) { S.scene.remove(m.point); m.point.geometry.dispose(); m.point.material.dispose(); }
    if (m.line) { S.scene.remove(m.line); m.line.geometry.dispose(); m.line.material.dispose(); }
    if (m.plane) { S.scene.remove(m.plane); m.plane.geometry.dispose(); m.plane.material.dispose(); }
    if (m.circle) { S.scene.remove(m.circle); m.circle.geometry.dispose(); m.circle.material.dispose(); }
  }
  S.meshes = {};

  for (const m of S.rodMeshes) { S.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  S.rodMeshes = [];

  for (const el of S.annotationEls) el.remove();
  S.annotationEls = [];
  for (const m of S.annotationMeshes) { S.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  S.annotationMeshes = [];
}

// ── Render from positions (mode-independent) ──

function renderFromPositions(positions) {
  const isDesign = S.mode === 'design';

  for (const step of GROWTH) {
    const pos = positions[step.name];
    if (!pos) continue;
    const entry = {};

    // Point (sphere)
    const body = STEP_BODY[step.name];
    const ptGeo = new THREE.SphereGeometry(S.PT_R, 16, 16);
    const ptColor = body ? BODY_COLORS[body] : (step.parent === null ? 0x333333 : 0x999999);
    entry.point = new THREE.Mesh(ptGeo, new THREE.MeshBasicMaterial({ color: ptColor }));
    entry.point.position.set(...pos);
    S.scene.add(entry.point);

    // Point label
    const ptLabel = makeLabel('pt-label', step.label, pos);
    S.annotationEls.push(ptLabel);

    // Line from parent
    if (step.parent && !step.noLine && positions[step.parent]) {
      const lineBody = STEP_BODY[step.name];
      if (step.dashed) {
        entry.line = makeDashedLine(positions[step.parent], pos, 0xaa8844);
      } else if (lineBody) {
        entry.line = makeCylinder(positions[step.parent], pos, S.LINE_R, BODY_COLORS[lineBody]);
      } else {
        entry.line = makeCylinder(positions[step.parent], pos, S.LINE_R, 0x999999);
      }
      S.scene.add(entry.line);
    }

    // Servo circle
    if (step.circle) {
      entry.circle = makeDashedCircle(pos, S.params[step.circle.param], 0xddaa44);
      S.scene.add(entry.circle);
    }

    // Plane
    const extras = _buildExtras[step.name];
    if (extras && extras.plane) {
      entry.plane = makePlane(pos, extras.plane);
      S.scene.add(entry.plane);
      const planeLabel = makeLabel('pt-label', extras.plane.label, [
        pos[0], pos[1], pos[2] - 5,
      ], '#888');
      S.annotationEls.push(planeLabel);
    }

    // Annotations (Design mode only)
    if (isDesign && step.annotations) {
      for (const ann of step.annotations) {
        if (ann.type === 'dim') {
          const from = positions[ann.from];
          const to = positions[ann.to];
          const def = step.params[ann.param];
          const el = makeDimAnnotation(ann.param, def, from, to, step.name);
          el._stepName = step.name;
          S.annotationEls.push(el);
        }
        if (ann.type === 'angle') {
          const vertex = positions[ann.vertex];
          const pTo = positions[ann.to];
          const def = step.params[ann.param];
          let refDir = null;
          if (ann.refDir) {
            const rLen = Math.sqrt(ann.refDir[0] ** 2 + ann.refDir[1] ** 2 + ann.refDir[2] ** 2);
            if (rLen > 0.001) refDir = [ann.refDir[0] / rLen, ann.refDir[1] / rLen, ann.refDir[2] / rLen];
          }
          const pFrom = ann.from ? positions[ann.from] : null;
          const el = makeAngleAnnotation(ann.param, def, vertex, pTo, refDir, pFrom, step.name);
          el._stepName = step.name;
          S.annotationEls.push(el);
        }
        if (ann.type === 'circle_r') {
          const def = step.params[ann.param];
          const center = pos;
          const radius = S.params[ann.param];
          const el = makeCircleRAnnotation(ann.param, def, center, radius);
          el._stepName = step.name;
          S.annotationEls.push(el);
        }
      }
    }

    S.meshes[step.name] = entry;
  }

  // Passive connecting rods
  S.rodMeshes = [];
  for (const r of RODS) {
    if (positions[r.from] && positions[r.to]) {
      const mesh = makeCylinder(positions[r.from], positions[r.to], S.ROD_R, BODY_COLORS[r.body]);
      S.scene.add(mesh);
      S.rodMeshes.push(mesh);
    }
  }

  updateRodLengths(positions);

  if (S.selectedName) applyHighlight();
  applyAnnotationVisibility();
}

// ── Fast position update (for animation) ──

export function updatePositions(positions) {
  for (const step of GROWTH) {
    const pos = positions[step.name];
    if (!pos) continue;
    const entry = S.meshes[step.name];
    if (!entry) continue;

    if (entry.point) entry.point.position.set(...pos);

    if (entry.line && step.parent && positions[step.parent]) {
      if (step.dashed) {
        // Dashed lines need position update
        const geo = entry.line.geometry;
        const pp = positions[step.parent];
        geo.setAttribute('position', new THREE.Float32BufferAttribute([...pp, ...pos], 3));
        geo.attributes.position.needsUpdate = true;
        entry.line.computeLineDistances();
      } else {
        placeCylinder(entry.line, positions[step.parent], pos);
      }
    }

    if (entry.circle) {
      const radius = S.params[step.circle ? step.circle.param : 'R'];
      // Update circle position
      const segments = 64;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        pts.push(pos[0], pos[1] + radius * Math.cos(t), pos[2] + radius * Math.sin(t));
      }
      entry.circle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      entry.circle.geometry.attributes.position.needsUpdate = true;
      entry.circle.computeLineDistances();
    }
  }

  // Update rods
  for (let i = 0; i < RODS.length; i++) {
    const r = RODS[i];
    if (positions[r.from] && positions[r.to] && S.rodMeshes[i]) {
      placeCylinder(S.rodMeshes[i], positions[r.from], positions[r.to]);
    }
  }

  updateRodLengths(positions);
}

// ── Rebuild entry point ──

function rebuildSceneImpl() {
  clearScene();
  const positions = computePositions();
  renderFromPositions(positions);
}

setRebuildCallback(rebuildSceneImpl);

// Export for mode manager to get design positions
export { computeDesignPositions };
