/**
 * Workspace surface — visualizes U (link_joint) reachable manifold.
 * Point cloud colored by β₂ (jet colormap) + stride-based wireframe grid lines.
 */
import * as THREE from '/static/lib/three.module.js';
import { S } from './state.js';
import { forwardPositions } from './solver.js';

let _pointCloud = null;
let _wireframe = null;
let _marker = null;

function jetColor(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (t < 0.25)      { r = 0;           g = t / 0.25;       b = 1; }
  else if (t < 0.5)  { r = 0;           g = 1;              b = 1 - (t - 0.25) / 0.25; }
  else if (t < 0.75) { r = (t - 0.5) / 0.25; g = 1;        b = 0; }
  else                { r = 1;           g = 1 - (t - 0.75) / 0.25; b = 0; }
  return [r, g, b];
}

export function buildWorkspaceSurface() {
  removeWorkspaceSurface();
  if (!S.gridData) return;

  const { grid, res, from, to, step } = S.gridData;
  const p = S.params;

  // Compute U positions for all valid cells
  const uMap = new Array(res * res).fill(null);
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const idx = (row * res + col) * 3;
      if (grid[idx + 2] === 0) continue;
      const theta = grid[idx], phi = grid[idx + 1];
      const beta1 = from + col * step, beta2 = from + row * step;
      const pos = forwardPositions({ ...p, beta1, beta2 }, theta, phi);
      uMap[row * res + col] = pos.link_joint;
    }
  }

  // Point cloud — one colored dot per valid cell
  const ptArr = [], colArr = [];
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const U = uMap[row * res + col];
      if (!U) continue;
      ptArr.push(U[0], U[1], U[2]);
      const [r, g, b] = jetColor(row / (res - 1));
      colArr.push(r, g, b);
    }
  }

  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(ptArr, 3));
  ptGeo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  _pointCloud = new THREE.Points(ptGeo, new THREE.PointsMaterial({
    size: 0.8, vertexColors: true, sizeAttenuation: true, depthWrite: false,
  }));
  S.scene.add(_pointCloud);

  // Wireframe — stride-based grid lines on the surface (~5° spacing)
  const stride = Math.max(1, Math.round(5 / step));
  const lineArr = [];

  // Horizontal grid lines (constant β₂)
  for (let row = 0; row < res; row += stride) {
    for (let col = 0; col < res - 1; col++) {
      const a = uMap[row * res + col], b = uMap[row * res + col + 1];
      if (a && b) lineArr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
  // Vertical grid lines (constant β₁)
  for (let col = 0; col < res; col += stride) {
    for (let row = 0; row < res - 1; row++) {
      const a = uMap[row * res + col], b = uMap[(row + 1) * res + col];
      if (a && b) lineArr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineArr, 3));
  _wireframe = new THREE.LineSegments(wGeo, new THREE.LineBasicMaterial({
    color: 0x4488ff, opacity: 0.18, transparent: true,
  }));
  S.scene.add(_wireframe);

  // Current position marker — white sphere at U
  const mGeo = new THREE.SphereGeometry(1.8, 16, 16);
  _marker = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  _marker.renderOrder = 1;
  S.scene.add(_marker);
  updateWorkspaceMarker();
}

export function updateWorkspaceMarker() {
  if (!_marker) return;
  const U = S.kinematicPositions?.link_joint;
  if (U) _marker.position.set(U[0], U[1], U[2]);
}

export function removeWorkspaceSurface() {
  for (const obj of [_pointCloud, _wireframe, _marker]) {
    if (obj) {
      S.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }
  _pointCloud = _wireframe = _marker = null;
}
