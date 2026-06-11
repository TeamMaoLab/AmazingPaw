/**
 * Three.js scene manager for skeleton growth visualization.
 * Z-up coordinate system, OrbitControls, dual camera.
 */
import * as THREE from '/static/lib/three.module.js';
import { OrbitControls } from '/static/lib/OrbitControls.js';

let scene, renderer, activeCam, controls;
let perspCam, orthoCam;
let growthGroup;        // Group for all growth elements
let pointMeshes = {};   // name -> Mesh
let lineObjects = {};   // id -> Line
let planeObjects = {};  // id -> Mesh
let circleObjects = {}; // name -> Line
let labels = [];        // HTML label elements
let staticLabels = [];  // Axis labels, not cleared with growth
let containerEl;

const DEFAULT_CAM_POS = [80, -120, 80];
const DEFAULT_CAM_TARGET = [15, 0, 35];
const POINT_RADIUS = 1.5;
const LINE_RADIUS = 0.4;
const AXIS_LEN = 30;

// ── Init ──
export function initScene(container) {
  containerEl = container;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  // Cameras (Z-up)
  perspCam = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  perspCam.position.set(...DEFAULT_CAM_POS);
  perspCam.up.set(0, 0, 1);

  orthoCam = new THREE.OrthographicCamera(-80, 80, 80, -80, 0.1, 2000);
  orthoCam.position.set(...DEFAULT_CAM_POS);
  orthoCam.up.set(0, 0, 1);

  activeCam = perspCam;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(activeCam, renderer.domElement);
  controls.target.set(...DEFAULT_CAM_TARGET);
  controls.update();

  // Growth group
  growthGroup = new THREE.Group();
  scene.add(growthGroup);

  // World axes
  addWorldAxes();

  // Grid (XY plane since Z-up)
  const grid = new THREE.GridHelper(200, 20, 0xcccccc, 0xe0e0e0);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  handleResize();
  window.addEventListener('resize', handleResize);
  animate();
}

function handleResize() {
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  renderer.setSize(w, h);
  perspCam.aspect = w / h;
  perspCam.updateProjectionMatrix();
  const s = Math.max(w, h) * 0.5;
  orthoCam.left = -s;
  orthoCam.right = s;
  orthoCam.top = s;
  orthoCam.bottom = -s;
  orthoCam.updateProjectionMatrix();
}

function addWorldAxes() {
  const colors = [0xff4444, 0x44cc44, 0x4444ff];
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const names = ['X', 'Y', 'Z'];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BufferGeometry();
    const end = dirs[i].map(d => d * AXIS_LEN);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, ...end], 3));
    const mat = new THREE.LineBasicMaterial({ color: colors[i] });
    scene.add(new THREE.Line(geo, mat));
    // Axis label at the tip
    addStaticLabel(names[i], end, colors[i]);
  }
}

// ── Animation loop ──
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLabels();
  renderer.render(scene, activeCam);
}

// ── Camera controls ──
export function resetCamera() {
  activeCam.position.set(...DEFAULT_CAM_POS);
  activeCam.up.set(0, 0, 1);
  controls.target.set(...DEFAULT_CAM_TARGET);
  controls.update();
}

export function setView(axis, sign) {
  const dist = 150;
  const pos = [0, 0, 0];
  pos['xyz'.indexOf(axis)] = sign * dist;
  activeCam.position.set(...pos);
  activeCam.up.set(0, 0, axis === 'z' ? -sign : 1);
  controls.target.set(15, 0, 35);
  controls.update();
}

export function toggleCamera() {
  if (activeCam === perspCam) {
    activeCam = orthoCam;
  } else {
    activeCam = perspCam;
  }
  // Copy position
  activeCam.position.copy(perspCam.position);
  activeCam.up.copy(perspCam.up);
  controls.object = activeCam;
  controls.update();
}

// ── Growth element management ──

export function clearGrowth() {
  while (growthGroup.children.length > 0) {
    const child = growthGroup.children[0];
    growthGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
  pointMeshes = {};
  lineObjects = {};
  planeObjects = {};
  circleObjects = {};
  clearLabels();
}

export function showOrigin(pos) {
  // Origin: small dark sphere, no label
  addPoint('Origin', pos, '');
}

export function addPoint(name, pos, label) {
  if (pointMeshes[name]) return;
  const geo = new THREE.SphereGeometry(POINT_RADIUS, 16, 16);
  const color = name === 'Origin' ? 0x333333 : 0x4488ff;
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.scale.set(0, 0, 0);
  growthGroup.add(mesh);
  pointMeshes[name] = mesh;

  addLabel(label || name, pos);
}

export function setPointScale(name, s) {
  if (pointMeshes[name]) {
    pointMeshes[name].scale.set(s, s, s);
  }
}

export function addLine(id, from, to) {
  if (lineObjects[id]) return;
  const mesh = createCylinderMesh(from, to, LINE_RADIUS, 0x888888);
  growthGroup.add(mesh);
  lineObjects[id] = mesh;
}

export function updateLine(id, from, to) {
  const mesh = lineObjects[id];
  if (!mesh) return;
  updateCylinderMesh(mesh, from, to);
}

// ── Cylinder helpers ──
function createCylinderMesh(from, to, radius, color) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 8);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  updateCylinderMesh(mesh, from, to);
  return mesh;
}

function updateCylinderMesh(mesh, from, to) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  if (len < 0.001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.scale.set(1, len, 1);
  // Position at midpoint
  mesh.position.set(
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  );
  // Rotate: cylinder default is along Y, we need to align with dir
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
  mesh.quaternion.copy(quat);
}

export function addPlane(id, center, planeDef, params) {
  if (planeObjects[id]) return;
  const size = 100;
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({
    color: planeDef.color || 0x4488ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...center);

  // Orient plane: normal defines which way it faces
  const normal = new THREE.Vector3(...planeDef.normal);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), normal
  );
  mesh.quaternion.copy(quaternion);

  growthGroup.add(mesh);
  planeObjects[id] = mesh;

  // Draw plane border
  const borderGeo = new THREE.BufferGeometry();
  const half = size / 2;
  // Create a rectangle in local XY, then rotate
  const corners = [
    [-half, -half, 0], [half, -half, 0], [half, half, 0],
    [-half, half, 0], [-half, -half, 0],
  ];
  const worldCorners = corners.map(c => {
    const v = new THREE.Vector3(...c).applyQuaternion(quaternion).add(new THREE.Vector3(...center));
    return [v.x, v.y, v.z];
  });
  const flat = worldCorners.flat();
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  const borderMat = new THREE.LineBasicMaterial({ color: planeDef.color || 0x4488ff, transparent: true, opacity: 0.3 });
  growthGroup.add(new THREE.Line(borderGeo, borderMat));

  addLabel(planeDef.label || '', center, true);
}

export function addServoCircle(name, center, radius, angle) {
  if (circleObjects[name]) return;
  const segments = 64;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions[i * 3] = center[0] + radius * Math.cos(theta);
    positions[i * 3 + 1] = center[1] + radius * Math.sin(theta);
    positions[i * 3 + 2] = center[2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xddaa44, transparent: true, opacity: 0.6 });
  growthGroup.add(new THREE.Line(geo, mat));

  // Current angle indicator
  const rad = angle * Math.PI / 180;
  const tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...center,
    center[0] + radius * Math.cos(rad),
    center[1] + radius * Math.sin(rad),
    center[2],
  ], 3));
  const tipMat = new THREE.LineBasicMaterial({ color: 0xddaa44 });
  growthGroup.add(new THREE.Line(tipGeo, tipMat));

  circleObjects[name] = true;
}

// ── HTML Labels ──
function clearLabels() {
  for (const el of labels) el.remove();
  labels = [];
}

function addLabel(text, pos, isPlane) {
  if (!text) return;
  const div = document.createElement('div');
  div.className = isPlane ? 'viewport frame-label' : 'viewport label';
  div.textContent = text;
  div.style.cssText = isPlane
    ? 'position:absolute;color:#888;font-size:10px;pointer-events:none;font-style:italic;'
    : 'position:absolute;color:#555;font-size:11px;pointer-events:none;font-weight:500;white-space:nowrap;';
  containerEl.appendChild(div);
  labels.push({ el: div, pos: [...pos] });
}

function updateLabels() {
  const allLabels = [...labels, ...staticLabels];
  for (const { el, pos } of allLabels) {
    const v = new THREE.Vector3(...pos).project(activeCam);
    const x = (v.x * 0.5 + 0.5) * containerEl.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * containerEl.clientHeight;
    el.style.left = x + 'px';
    el.style.top = (y - 10) + 'px';
    el.style.display = v.z > 1 ? 'none' : '';
  }
}

function addStaticLabel(text, pos, color) {
  const div = document.createElement('div');
  const hex = '#' + new THREE.Color(color).getHexString();
  div.style.cssText = `position:absolute;color:${hex};font-size:12px;font-weight:700;pointer-events:none;font-family:"SF Mono",Menlo,monospace;`;
  div.textContent = text;
  containerEl.appendChild(div);
  staticLabels.push({ el: div, pos: [...pos] });
}

// ── Export for external state ──
export function getScene() { return scene; }
export function getRenderer() { return renderer; }
