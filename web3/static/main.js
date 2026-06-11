/**
 * Parametric Skeleton Sketch — 3D parametric geometry with editable annotations.
 * Double-click a dimension/angle to edit → system recalculates from growth order.
 */
import * as THREE from '/static/lib/three.module.js';
import { OrbitControls } from '/static/lib/OrbitControls.js';

// ══════════════════════════════════════════
// Growth definition (implicit dependency)
// ══════════════════════════════════════════

const GROWTH = [
  {
    name: 'Origin', parent: null, label: 'O',
    params: {},
    build: () => ({ pos: [0, 0, 0] }),
  },
  {
    name: 'servo', parent: 'Origin', label: 'S',
    params: { x_e: { default: 11, min: 0, max: 60, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'x_e', from: 'Origin', to: 'servo' }],
    build: (p) => ({
      pos: [p.x_e, 0, 0],
      plane: { normal: [1, 0, 0], color: 0x4488ff, label: 'Servo plane', size: 10 },
    }),
  },
  {
    name: 'servo_z', parent: 'servo', label: 'H',
    dashed: true,
    params: { z_e: { default: 0, min: -20, max: 40, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'z_e', from: 'servo', to: 'servo_z' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.z_e] }),
  },
  {
    name: 'servo_r', parent: 'servo_z', label: 'C',
    dashed: true,
    params: {
      y_e: { default: 16, min: 0, max: 30, step: 0.5, unit: 'mm' },
      R: { default: 16, min: 0, max: 40, step: 0.5, unit: 'mm' },
    },
    annotations: [
      { type: 'dim', param: 'y_e', from: 'servo_z', to: 'servo_r' },
      { type: 'circle_r', param: 'R' },
    ],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] + p.y_e, parentPos[2]] }),
    circle: { param: 'R' },
  },
  {
    name: 'servo_l', parent: 'servo_z', label: 'E',
    dashed: true,
    params: {},
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] - p.y_e, parentPos[2]] }),
    circle: { param: 'R' },
  },
  {
    name: 'servo_arm_r', parent: 'servo_r', label: 'D',
    params: { beta1: { default: 70, min: 0, max: 360, step: 1, unit: '°' } },
    annotations: [{ type: 'angle', param: 'beta1', vertex: 'servo_r', refDir: [0, 0, 1], to: 'servo_arm_r' }],
    build: (p, parentPos) => {
      const rad = p.beta1 * Math.PI / 180;
      return { pos: [parentPos[0], parentPos[1] + p.R * Math.sin(rad), parentPos[2] + p.R * Math.cos(rad)] };
    },
  },
  {
    name: 'servo_arm_l', parent: 'servo_l', label: 'F',
    params: {},
    build: (p, parentPos) => {
      const rad = -p.beta1 * Math.PI / 180;
      return { pos: [parentPos[0], parentPos[1] + p.R * Math.sin(rad), parentPos[2] + p.R * Math.cos(rad)] };
    },
  },
  {
    name: 'finger_base', parent: 'Origin', label: 'B',
    params: { z0: { default: 36, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'z0', from: 'Origin', to: 'finger_base' }],
    build: (p) => ({ pos: [0, 0, p.z0] }),
  },
  {
    name: 'pivot', parent: 'finger_base', label: 'P',
    params: { L_BP: { default: 10, min: 0, max: 40, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_BP', from: 'finger_base', to: 'pivot' }],
    build: (p, parentPos) => ({ pos: [parentPos[0] + p.L_BP, parentPos[1], parentPos[2]] }),
  },
  {
    name: 'arm_ext', parent: 'pivot', label: 'Q',
    params: { L_PQ: { default: 50, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_PQ', from: 'pivot', to: 'arm_ext' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.L_PQ] }),
  },
  {
    name: 'link_joint', parent: 'arm_ext', label: 'U',
    params: { L_QU: { default: 40, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_QU', from: 'arm_ext', to: 'link_joint' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.L_QU] }),
  },
  {
    name: 'arm_end', parent: 'pivot', label: 'A',
    params: { L_PA: { default: 7, min: 0, max: 30, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_PA', from: 'pivot', to: 'arm_end' }],
    build: (p, parentPos) => ({ pos: [parentPos[0] + p.L_PA, parentPos[1], parentPos[2]] }),
  },
  {
    name: 'tip', parent: 'arm_end', label: 'T',
    params: {
      L_AT: { default: 7, min: 0, max: 100, step: 0.5, unit: 'mm' },
      alpha: { default: 35, min: 0, max: 180, step: 1, unit: '°' },
    },
    annotations: [
      { type: 'dim', param: 'L_AT', from: 'arm_end', to: 'tip' },
      { type: 'angle', param: 'alpha', vertex: 'arm_end', refDir: [1, 0, 0], to: 'tip' },
    ],
    build: (p, parentPos) => {
      const rad = p.alpha * Math.PI / 180;
      return {
        pos: [
          parentPos[0] + p.L_AT * Math.cos(rad),
          parentPos[1],
          parentPos[2] + p.L_AT * Math.sin(rad),
        ],
      };
    },
  },
  {
    name: 'plate_end', parent: 'arm_end', label: 'K',
    params: {
      L_AR: { default: 50, min: 0, max: 100, step: 0.5, unit: 'mm' },
      gamma: { default: 70, min: 0, max: 360, step: 1, unit: '°' },
    },
    annotations: [
      { type: 'dim', param: 'L_AR', from: 'arm_end', to: 'plate_end' },
      { type: 'angle', param: 'gamma', vertex: 'arm_end', from: 'tip', to: 'plate_end' },
    ],
    build: (p, parentPos) => {
      const absAngle = p.alpha + p.gamma;
      const rad = absAngle * Math.PI / 180;
      return {
        pos: [
          parentPos[0] + p.L_AR * Math.cos(rad),
          parentPos[1],
          parentPos[2] + p.L_AR * Math.sin(rad),
        ],
      };
    },
  },
  {
    name: 'bar_r', parent: 'tip', label: 'R',
    params: { BarHalf: { default: 7, min: 0, max: 30, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'BarHalf', from: 'tip', to: 'bar_r' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] + p.BarHalf, parentPos[2]] }),
  },
  {
    name: 'bar_l', parent: 'tip', label: 'L',
    params: {},
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] - p.BarHalf, parentPos[2]] }),
  },
];

// Flatten params
let params = {};
for (const step of GROWTH) {
  for (const [k, v] of Object.entries(step.params)) params[k] = v.default;
}

// ══════════════════════════════════════════
// Three.js scene
// ══════════════════════════════════════════

let scene, renderer, camera, controls;
let containerEl;
const PT_R = 1.5, LINE_R = 0.4;
let meshes = {};   // name -> { point, line? }
let rodMeshes = [];
let annotationMeshes = [];
let annotationEls = [];
let showAnnotations = true;

const RODS = [
  ['link_joint', 'plate_end'],  // U → K
  ['arm_ext', 'plate_end'],     // Q → K
  ['bar_l', 'servo_arm_l'],     // L → F
  ['bar_r', 'servo_arm_r'],     // R → D
];
const ROD_COLOR = 0x44aa88;
const ROD_R = 0.3;

function initScene() {
  containerEl = document.getElementById('viewport');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(150, -200, 150);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  containerEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(15, 0, 35);
  controls.update();

  // World axes with labels
  addAxis(0xff4444, [1, 0, 0], 'X');
  addAxis(0x44cc44, [0, 1, 0], 'Y');
  addAxis(0x4444ff, [0, 0, 1], 'Z');

  // Grid
  const grid = new THREE.GridHelper(200, 20, 0xcccccc, 0xe0e0e0);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  onResize();
  window.addEventListener('resize', onResize);
  animate();
}

function addAxis(color, dir, text) {
  const len = 30;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, dir[0] * len, dir[1] * len, dir[2] * len], 3));
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
  addStaticLabel(text, [dir[0] * (len + 3), dir[1] * (len + 3), dir[2] * (len + 3)], color);
}

function onResize() {
  const w = containerEl.clientWidth, h = containerEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateAllLabelPositions();
  renderer.render(scene, camera);
}

// ══════════════════════════════════════════
// Geometry rendering
// ══════════════════════════════════════════

function rebuildScene() {
  // Clear old growth meshes
  for (const m of Object.values(meshes)) {
    if (m.point) { scene.remove(m.point); m.point.geometry.dispose(); m.point.material.dispose(); }
    if (m.line) { scene.remove(m.line); m.line.geometry.dispose(); m.line.material.dispose(); }
    if (m.plane) { scene.remove(m.plane); m.plane.geometry.dispose(); m.plane.material.dispose(); }
    if (m.circle) { scene.remove(m.circle); m.circle.geometry.dispose(); m.circle.material.dispose(); }
  }
  meshes = {};

  // Clear old rod meshes
  for (const m of rodMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  rodMeshes = [];

  // Clear annotation HTML elements and 3D geometry
  for (const el of annotationEls) el.remove();
  annotationEls = [];
  for (const m of annotationMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  annotationMeshes = [];

  // Build all steps
  const positions = {};
  for (const step of GROWTH) {
    const parentPos = step.parent ? positions[step.parent] : [0, 0, 0];
    const result = step.build(params, parentPos);
    positions[step.name] = result.pos;

    const entry = {};

    // Point (sphere)
    const ptGeo = new THREE.SphereGeometry(PT_R, 16, 16);
    const ptColor = step.parent === null ? 0x333333 : 0x4488ff;
    entry.point = new THREE.Mesh(ptGeo, new THREE.MeshBasicMaterial({ color: ptColor }));
    entry.point.position.set(...result.pos);
    scene.add(entry.point);

    // Point label
    const ptLabel = makeLabel('pt-label', step.label, result.pos);
    annotationEls.push(ptLabel);

    // Line from parent: dashed or solid
    if (step.parent) {
      if (step.dashed) {
        entry.line = makeDashedLine(positions[step.parent], result.pos, 0xaa8844);
      } else {
        entry.line = makeCylinder(positions[step.parent], result.pos, LINE_R, 0x888888);
      }
      scene.add(entry.line);
    }

    // Servo circle
    if (step.circle) {
      entry.circle = makeDashedCircle(result.pos, params[step.circle.param], 0xddaa44);
      scene.add(entry.circle);
    }

    // Plane
    if (result.plane) {
      entry.plane = makePlane(result.pos, result.plane);
      scene.add(entry.plane);
      const planeLabel = makeLabel('pt-label', result.plane.label, [
        result.pos[0], result.pos[1], result.pos[2] - 5,
      ], '#888');
      annotationEls.push(planeLabel);
    }

    // Annotations (dimensions, angles)
    if (step.annotations) {
      for (const ann of step.annotations) {
        if (ann.type === 'dim') {
          const from = positions[ann.from];
          const to = positions[ann.to];
          const def = step.params[ann.param];
          const el = makeDimAnnotation(ann.param, def, from, to);
          annotationEls.push(el);
        }
        if (ann.type === 'angle') {
          const vertex = positions[ann.vertex];
          const pTo = positions[ann.to];
          const def = step.params[ann.param];
          let refDir = null;
          if (ann.refDir) {
            const rLen = Math.sqrt(ann.refDir[0]**2 + ann.refDir[1]**2 + ann.refDir[2]**2);
            if (rLen > 0.001) refDir = [ann.refDir[0]/rLen, ann.refDir[1]/rLen, ann.refDir[2]/rLen];
          }
          const pFrom = ann.from ? positions[ann.from] : null;
          const el = makeAngleAnnotation(ann.param, def, vertex, pTo, refDir, pFrom);
          annotationEls.push(el);
        }
        if (ann.type === 'circle_r') {
          const def = step.params[ann.param];
          const center = result.pos;
          const radius = params[ann.param];
          const el = makeCircleRAnnotation(ann.param, def, center, radius);
          annotationEls.push(el);
        }
      }
    }

    meshes[step.name] = entry;
  }

  // ── Passive connecting rods ──
  rodMeshes = [];
  for (const [fromName, toName] of RODS) {
    if (positions[fromName] && positions[toName]) {
      const rod = makeCylinder(positions[fromName], positions[toName], ROD_R, ROD_COLOR);
      scene.add(rod);
      rodMeshes.push(rod);
    }
  }

  updateRodLengths(positions);

  // Re-apply highlight and annotation visibility
  if (selectedName) applyHighlight();
  applyAnnotationVisibility();
}

function applyAnnotationVisibility() {
  for (const m of annotationMeshes) m.visible = showAnnotations;
  for (const el of annotationEls) {
    if (el.classList.contains('dim-label') || el.classList.contains('angle-label')) {
      el.style.display = showAnnotations ? '' : 'none';
    }
  }
}

// ── Cylinder between two points ──
function makeCylinder(from, to, radius, color) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 8);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  placeCylinder(mesh, from, to);
  return mesh;
}

// ── Dashed line between two points ──
function makeDashedLine(from, to, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3));
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

// ── Dashed circle in YZ plane ──
function makeDashedCircle(center, radius, color) {
  const segments = 64;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push(center[0], center[1] + radius * Math.cos(theta), center[2] + radius * Math.sin(theta));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

function placeCylinder(mesh, from, to) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  if (len < 0.001) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.scale.set(1, len, 1);
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, dir.normalize());
}

// ── Plane ──
function makePlane(center, def) {
  const size = def.size || 80;
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...center);
  const normal = new THREE.Vector3(...def.normal);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return mesh;
}

function makePlaneBorder(center, def) {
  const size = 80, half = size / 2;
  const normal = new THREE.Vector3(...def.normal);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const corners = [[-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0], [-half, -half, 0]];
  const pts = corners.map(c => new THREE.Vector3(...c).applyQuaternion(q).add(new THREE.Vector3(...center)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.map(p => [p.x, p.y, p.z]).flat(), 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.25 }));
}

// ══════════════════════════════════════════
// Annotation system
// ══════════════════════════════════════════

function bindAnnotationHover(labelEl, linkedMeshes) {
  const highlight = () => {
    labelEl.classList.add('highlight');
    for (const m of linkedMeshes) {
      m.material.opacity = 1;
    }
  };
  const unhighlight = () => {
    labelEl.classList.remove('highlight');
    for (const m of linkedMeshes) {
      m.material.opacity = 0.2;
    }
  };
  labelEl.addEventListener('mouseenter', highlight);
  labelEl.addEventListener('mouseleave', unhighlight);
  // Store for 3D hover later if needed
  labelEl._linkedMeshes = linkedMeshes;
  for (const m of linkedMeshes) {
    m._linkedLabel = labelEl;
  }
}

function makeLabel(cls, text, pos3, color) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  if (color) div.style.color = color;
  div._pos3 = pos3;
  containerEl.appendChild(div);
  return div;
}

function makeDimAnnotation(paramKey, def, from, to) {
  const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  if (len < 0.001) {
    // Degenerate — just place label at midpoint
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const div = document.createElement('div');
    div.className = 'dim-label';
    div._pos3 = mid;
    div.innerHTML = `${paramKey} = <span class="dim-value">${params[paramKey]}${def.unit}</span>`;
    div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
    containerEl.appendChild(div);
    return div;
  }
  const offset = 8;
  const perp = [-dir[2] / len, 0, dir[0] / len];

  const extFrom = [from[0] + perp[0] * offset, from[1] + perp[1] * offset, from[2] + perp[2] * offset];
  const extTo = [to[0] + perp[0] * offset, to[1] + perp[1] * offset, to[2] + perp[2] * offset];

  const annColor = 0xcc5500;
  const dimColor = 0xcc5500;
  const groupMeshes = [];

  // Extension lines
  for (const [a, b] of [[from, extFrom], [to, extTo]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
    const mat = new THREE.LineBasicMaterial({ color: annColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // Dimension line
  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute('position', new THREE.Float32BufferAttribute([...extFrom, ...extTo], 3));
  const dimMat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
  const dimLine = new THREE.Line(dimGeo, dimMat);
  scene.add(dimLine);
  annotationMeshes.push(dimLine);
  groupMeshes.push(dimLine);

  // Tick marks
  const tickLen = 2;
  const tickDir = [dir[0] / len, dir[1] / len, dir[2] / len];
  for (const pt of [extFrom, extTo]) {
    const t1 = [pt[0] - tickDir[0] * tickLen, pt[1] - tickDir[1] * tickLen, pt[2] - tickDir[2] * tickLen];
    const t2 = [pt[0] + tickDir[0] * tickLen, pt[1] + tickDir[1] * tickLen, pt[2] + tickDir[2] * tickLen];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...t1, ...t2], 3));
    const mat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // Arrows at both ends of dimension line (pointing inward toward center)
  const arrowSize = 2;
  const perpDir = perp;
  for (const [pt, sign] of [[extFrom, 1], [extTo, -1]]) {
    // Arrow points along dimension line toward center
    const ad = [tickDir[0] * sign, tickDir[1] * sign, tickDir[2] * sign];
    const arrowPts = [
      ...pt,
      ...[pt[0] - ad[0] * arrowSize + perpDir[0] * arrowSize * 0.4,
           pt[1] - ad[1] * arrowSize + perpDir[1] * arrowSize * 0.4,
           pt[2] - ad[2] * arrowSize + perpDir[2] * arrowSize * 0.4],
      ...pt,
      ...[pt[0] - ad[0] * arrowSize - perpDir[0] * arrowSize * 0.4,
           pt[1] - ad[1] * arrowSize - perpDir[1] * arrowSize * 0.4,
           pt[2] - ad[2] * arrowSize - perpDir[2] * arrowSize * 0.4],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
    const mat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // HTML text label
  const mid = [(extFrom[0] + extTo[0]) / 2, (extFrom[1] + extTo[1]) / 2, (extFrom[2] + extTo[2]) / 2];
  const div = document.createElement('div');
  div.className = 'dim-label';
  div._pos3 = mid;
  div.innerHTML = `${paramKey} = <span class="dim-value">${params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
  bindAnnotationHover(div, groupMeshes);
  containerEl.appendChild(div);
  return div;
}

// ── Circle radius annotation ──
function makeCircleRAnnotation(paramKey, def, center, radius) {
  // Place label at the right edge of the circle
  const labelPos = [center[0], center[1] + radius + 3, center[2]];
  const div = document.createElement('div');
  div.className = 'dim-label';
  div._pos3 = labelPos;
  div.innerHTML = `${paramKey} = <span class="dim-value">${params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
  containerEl.appendChild(div);
  return div;
}

function startEditDim(div, paramKey, def) {
  if (div.classList.contains('editing')) return;
  div.classList.add('editing');

  const currentVal = params[paramKey];
  div.innerHTML = `${paramKey} = <input type="number" value="${currentVal}" min="${def.min}" max="${def.max}" step="${def.step}"> ${def.unit}`;
  const input = div.querySelector('input');
  input.focus();
  input.select();

  const finish = () => {
    const newVal = parseFloat(input.value);
    if (!isNaN(newVal) && newVal >= def.min && newVal <= def.max) {
      params[paramKey] = newVal;
    }
    div.classList.remove('editing');
    rebuildScene();
    document.getElementById('status').textContent = `${paramKey} = ${params[paramKey]}${def.unit}`;
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = params[paramKey]; input.blur(); }
  });
}

function makeAngleAnnotation(paramKey, def, vertex, pTo, refDir, pFrom) {
  const d2 = [pTo[0] - vertex[0], pTo[1] - vertex[1], pTo[2] - vertex[2]];
  const len2 = Math.sqrt(d2[0] ** 2 + d2[1] ** 2 + d2[2] ** 2);

  const arcRadius = 8;
  const arcColor = 0x2266aa;
  const groupMeshes = [];

  // n1: reference direction (either explicit refDir or from pFrom→vertex direction)
  let n1;
  if (refDir) {
    n1 = refDir;
  } else if (pFrom) {
    const d1 = [pFrom[0] - vertex[0], pFrom[1] - vertex[1], pFrom[2] - vertex[2]];
    const len1 = Math.sqrt(d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2);
    n1 = len1 > 0.001 ? [d1[0] / len1, d1[1] / len1, d1[2] / len1] : [1, 0, 0];
  } else {
    n1 = [1, 0, 0];
  }
  const n2 = len2 > 0.001 ? [d2[0] / len2, d2[1] / len2, d2[2] / len2] : [1, 0, 0];

  const cross = [
    n1[1] * n2[2] - n1[2] * n2[1],
    n1[2] * n2[0] - n1[0] * n2[2],
    n1[0] * n2[1] - n1[1] * n2[0],
  ];
  const crossLen = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);

  // Rotation axis from cross product
  let axis;
  if (crossLen > 0.001) {
    axis = [cross[0] / crossLen, cross[1] / crossLen, cross[2] / crossLen];
  } else {
    // Vectors nearly parallel — find a perpendicular axis
    for (const c of [[0,1,0],[0,0,1],[1,0,0]]) {
      const cx = n1[1]*c[2]-n1[2]*c[1], cy = n1[2]*c[0]-n1[0]*c[2], cz = n1[0]*c[1]-n1[1]*c[0];
      const cl = Math.sqrt(cx*cx+cy*cy+cz*cz);
      if (cl > 0.001) { axis = [cx/cl, cy/cl, cz/cl]; break; }
    }
  }

  const paramSweep = params[paramKey] * Math.PI / 180;
  if (!axis || Math.abs(paramSweep) < 0.001) {
    // Degenerate angle — skip arc, just place label
    const labelPos = [vertex[0] + n1[0] * 12, vertex[1] + n1[1] * 12, vertex[2] + n1[2] * 12];
    const div = document.createElement('div');
    div.className = 'angle-label';
    div._pos3 = labelPos;
    div.innerHTML = `${paramKey} = <span class="angle-value">${params[paramKey]}${def.unit}</span>`;
    div.addEventListener('dblclick', () => startEditAngle(div, paramKey, def));
    containerEl.appendChild(div);
    return div;
  }

  // Rodrigues rotation helper
  const rodrigues = (v, k, theta) => {
    const ct = Math.cos(theta), st = Math.sin(theta);
    const kxv = [k[1]*v[2]-k[2]*v[1], k[2]*v[0]-k[0]*v[2], k[0]*v[1]-k[1]*v[0]];
    const kdv = k[0]*v[0]+k[1]*v[1]+k[2]*v[2];
    return [
      v[0]*ct + kxv[0]*st + k[0]*kdv*(1-ct),
      v[1]*ct + kxv[1]*st + k[1]*kdv*(1-ct),
      v[2]*ct + kxv[2]*st + k[2]*kdv*(1-ct),
    ];
  };

  // Test which sweep direction brings n1 closer to n2
  const endPlus = rodrigues(n1, axis, paramSweep);
  const endMinus = rodrigues(n1, axis, -paramSweep);
  const dotPlus = endPlus[0]*n2[0] + endPlus[1]*n2[1] + endPlus[2]*n2[2];
  const dotMinus = endMinus[0]*n2[0] + endMinus[1]*n2[1] + endMinus[2]*n2[2];
  const sweep = dotPlus >= dotMinus ? paramSweep : -paramSweep;

  // Generate arc points
  const segments = 24;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * sweep;
    const p = rodrigues(n1, axis, angle);
    pts.push(
      vertex[0] + p[0] * arcRadius,
      vertex[1] + p[1] * arcRadius,
      vertex[2] + p[2] * arcRadius,
    );
  }
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: arcColor, transparent: true, opacity: 0.2 });
  const arcLine = new THREE.Line(arcGeo, arcMat);
  scene.add(arcLine);
  annotationMeshes.push(arcLine);
  groupMeshes.push(arcLine);

  // Reference arms extending from vertex in n1 and n2 directions
  const armLen = arcRadius + 6;
  for (const nd of [n1, n2]) {
    const armGeo = new THREE.BufferGeometry();
    armGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      ...vertex,
      vertex[0] + nd[0] * armLen, vertex[1] + nd[1] * armLen, vertex[2] + nd[2] * armLen,
    ], 3));
    const armLine = new THREE.Line(armGeo, new THREE.LineBasicMaterial({ color: arcColor, transparent: true, opacity: 0.2 }));
    scene.add(armLine);
    annotationMeshes.push(armLine);
    groupMeshes.push(armLine);
  }

  // Arrow at end of arc (pointing toward n2 direction)
  const lastPt = pts.slice(-3);
  const prevPt = pts.slice(-6, -3);
  const arcDir = [lastPt[0] - prevPt[0], lastPt[1] - prevPt[1], lastPt[2] - prevPt[2]];
  const arcDirLen = Math.sqrt(arcDir[0] ** 2 + arcDir[1] ** 2 + arcDir[2] ** 2);
  if (arcDirLen > 0.001) {
    const arrowSize = 2;
    const ad = [arcDir[0] / arcDirLen, arcDir[1] / arcDirLen, arcDir[2] / arcDirLen];
    // Perpendicular in arc plane (cross with cross-product of n1,n2)
    const arcNormal = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 > 0.0001
      ? [cross[0], cross[1], cross[2]] : [0, 0, 1];
    const arcNormalLen = Math.sqrt(arcNormal[0] ** 2 + arcNormal[1] ** 2 + arcNormal[2] ** 2);
    const an = [arcNormal[0] / arcNormalLen, arcNormal[1] / arcNormalLen, arcNormal[2] / arcNormalLen];
    // Arrow wings: perpendicular to arc direction in arc plane
    const wing1 = [an[1] * ad[2] - an[2] * ad[1], an[2] * ad[0] - an[0] * ad[2], an[0] * ad[1] - an[1] * ad[0]];
    const arrowPts = [
      ...lastPt,
      ...[lastPt[0] - ad[0] * arrowSize + wing1[0] * arrowSize * 0.5,
           lastPt[1] - ad[1] * arrowSize + wing1[1] * arrowSize * 0.5,
           lastPt[2] - ad[2] * arrowSize + wing1[2] * arrowSize * 0.5],
      ...lastPt,
      ...[lastPt[0] - ad[0] * arrowSize - wing1[0] * arrowSize * 0.5,
           lastPt[1] - ad[1] * arrowSize - wing1[1] * arrowSize * 0.5,
           lastPt[2] - ad[2] * arrowSize - wing1[2] * arrowSize * 0.5],
    ];
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
    const arrowLine = new THREE.Line(arrowGeo, arcMat);
    scene.add(arrowLine);
    annotationMeshes.push(arrowLine);
    groupMeshes.push(arrowLine);
  }

  // Label at arc midpoint
  const bis = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]];
  const bisLen = Math.sqrt(bis[0] ** 2 + bis[1] ** 2 + bis[2] ** 2);
  const labelOffset = arcRadius + 3;
  const labelPos = bisLen > 0.001
    ? [vertex[0] + bis[0] / bisLen * labelOffset, vertex[1] + bis[1] / bisLen * labelOffset, vertex[2] + bis[2] / bisLen * labelOffset]
    : [vertex[0] + labelOffset, vertex[1], vertex[2]];

  const div = document.createElement('div');
  div.className = 'angle-label';
  div._pos3 = labelPos;
  div.innerHTML = `${paramKey} = <span class="angle-value">${params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditAngle(div, paramKey, def));
  bindAnnotationHover(div, groupMeshes);
  containerEl.appendChild(div);
  return div;
}

function startEditAngle(div, paramKey, def) {
  if (div.classList.contains('editing')) return;
  div.classList.add('editing');

  const currentVal = params[paramKey];
  div.innerHTML = `${paramKey} = <input type="number" value="${currentVal}" min="${def.min}" max="${def.max}" step="${def.step}"> ${def.unit}`;
  const input = div.querySelector('input');
  input.focus();
  input.select();

  const finish = () => {
    const newVal = parseFloat(input.value);
    if (!isNaN(newVal) && newVal >= def.min && newVal <= def.max) {
      params[paramKey] = newVal;
    }
    div.classList.remove('editing');
    rebuildScene();
    document.getElementById('status').textContent = `${paramKey} = ${params[paramKey]}${def.unit}`;
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = params[paramKey]; input.blur(); }
  });
}

// Static axis labels
const staticLabels = [];
function addStaticLabel(text, pos, color) {
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;font-size:12px;font-weight:700;pointer-events:none;font-family:"SF Mono",Menlo,monospace;`;
  div.style.color = '#' + new THREE.Color(color).getHexString();
  div.textContent = text;
  div._pos3 = pos;
  containerEl.appendChild(div);
  staticLabels.push(div);
}

// Update all label positions each frame
function updateAllLabelPositions() {
  const allEls = [...staticLabels, ...annotationEls];
  for (const el of allEls) {
    if (!el._pos3) continue;
    const isAnnoLabel = el.classList.contains('dim-label') || el.classList.contains('angle-label');
    if (isAnnoLabel && !showAnnotations) { el.style.display = 'none'; continue; }
    const v = new THREE.Vector3(...el._pos3).project(camera);
    const x = (v.x * 0.5 + 0.5) * containerEl.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * containerEl.clientHeight;
    el.style.left = x + 'px';
    el.style.top = (y - 8) + 'px';
    el.style.display = v.z > 1 ? 'none' : '';
  }
}

// ══════════════════════════════════════════
// View controls
// ══════════════════════════════════════════

function bindViewButtons() {
  document.querySelectorAll('.view-btns button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'home') {
        camera.position.set(150, -200, 150);
        camera.up.set(0, 0, 1);
        controls.target.set(15, 0, 35);
        controls.update();
        return;
      }
      const axis = v[1].toLowerCase();
      const sign = v[0] === '+' ? 1 : -1;
      const pos = [0, 0, 0];
      pos['xyz'.indexOf(axis)] = sign * 250;
      camera.position.set(...pos);
      camera.up.set(0, 0, axis === 'z' ? -sign : 1);
      controls.target.set(15, 0, 35);
      controls.update();
    });
  });

  // DIM toggle
  const dimBtn = document.getElementById('dim-toggle');
  if (dimBtn) {
    dimBtn.addEventListener('click', () => {
      showAnnotations = !showAnnotations;
      dimBtn.classList.toggle('active', showAnnotations);
      applyAnnotationVisibility();
    });
  }
}

// ══════════════════════════════════════════
// Growth tree overlay + selection
// ══════════════════════════════════════════

let selectedName = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function selectNode(name) {
  if (selectedName === name) { selectedName = null; }  // toggle off
  else { selectedName = name; }
  applyHighlight();
  updateTreeSelection();
}

function applyHighlight() {
  for (const step of GROWTH) {
    const m = meshes[step.name];
    if (!m) continue;
    const isSelected = step.name === selectedName;
    // Highlight point
    if (m.point) {
      m.point.material.opacity = selectedName === null ? 1.0 : (isSelected ? 1.0 : 0.2);
      m.point.material.transparent = selectedName !== null;
      m.point.scale.setScalar(isSelected ? 2.0 : 1.0);
    }
    // Highlight line
    if (m.line) {
      m.line.material.opacity = selectedName === null ? 1.0 : (isSelected ? 1.0 : 0.15);
      m.line.material.transparent = true;
      if (isSelected) m.line.material.color.set(0xff8844);
      else m.line.material.color.set(0x888888);
    }
  }
}

function updateTreeSelection() {
  document.querySelectorAll('.tree-node').forEach(el => {
    el.classList.toggle('selected', el._stepName === selectedName);
  });
}

function buildGrowthTree() {
  const container = document.getElementById('growth-tree');
  container.innerHTML = '';

  const childrenOf = {};
  for (const step of GROWTH) {
    const p = step.parent || '__root__';
    if (!childrenOf[p]) childrenOf[p] = [];
    childrenOf[p].push(step);
  }

  function renderNode(step) {
    const frag = document.createDocumentFragment();

    const node = document.createElement('div');
    node.className = 'tree-node';
    node._stepName = step.name;
    const paramTag = Object.keys(step.params).length > 0
      ? Object.keys(step.params).join(', ')
      : '';
    node.innerHTML = `
      <span class="dot${step.parent === null ? ' root' : ''}"></span>
      <span class="name">${step.label}</span>
      ${paramTag ? `<span class="tag">${paramTag}</span>` : ''}
    `;
    node.addEventListener('click', (e) => { e.stopPropagation(); selectNode(step.name); });
    frag.appendChild(node);

    const kids = childrenOf[step.name];
    if (kids && kids.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      for (const kid of kids) {
        childContainer.appendChild(renderNode(kid));
      }
      frag.appendChild(childContainer);
    }

    return frag;
  }

  const roots = GROWTH.filter(s => s.parent === null);
  for (const root of roots) {
    container.appendChild(renderNode(root));
  }

  // Rod lengths section
  const rodSection = document.createElement('div');
  rodSection.className = 'rod-section';
  rodSection.id = 'rod-lengths';
  container.appendChild(rodSection);
}

function getLabelFor(name) {
  const step = GROWTH.find(s => s.name === name);
  return step ? step.label : name;
}

function updateRodLengths(positions) {
  const el = document.getElementById('rod-lengths');
  if (!el) return;
  el.innerHTML = '';
  for (const [from, to] of RODS) {
    if (!positions[from] || !positions[to]) continue;
    const dx = positions[to][0] - positions[from][0];
    const dy = positions[to][1] - positions[from][1];
    const dz = positions[to][2] - positions[from][2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const row = document.createElement('div');
    row.className = 'rod-row';
    row.innerHTML = `<span class="rod-dot"></span><span class="rod-name">${getLabelFor(from)}→${getLabelFor(to)}</span><span class="rod-val">${len.toFixed(1)}mm</span>`;
    el.appendChild(row);
  }
}

// Click on 3D viewport to select point
function bindViewportClick() {
  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const pointMeshList = Object.entries(meshes)
      .filter(([_, m]) => m.point)
      .map(([_, m]) => m.point);
    const hits = raycaster.intersectObjects(pointMeshList);
    if (hits.length > 0) {
      const hit = hits[0].object;
      // Find which step this belongs to
      const entry = Object.entries(meshes).find(([_, m]) => m.point === hit);
      if (entry) selectNode(entry[0]);
    } else {
      selectNode(null);  // click empty space to deselect
    }
  });
}

// ══════════════════════════════════════════
// Init
// ══════════════════════════════════════════

initScene();
bindViewButtons();
buildGrowthTree();
bindViewportClick();
rebuildScene();
