/**
 * Stateless THREE.js geometry factories.
 */
import * as THREE from './lib/three.module.js';

export function makeCylinder(from, to, radius, color) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 8);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  placeCylinder(mesh, from, to);
  return mesh;
}

export function makeDashedLine(from, to, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3));
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

export function makeDashedCircle(center, radius, color) {
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

export function placeCylinder(mesh, from, to) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  if (len < 0.001) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.scale.set(1, len, 1);
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, dir.normalize());
}

export function makePlane(center, def) {
  const size = def.size || 80;
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...center);
  const normal = new THREE.Vector3(...def.normal);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return mesh;
}

export function makePlaneBorder(center, def) {
  const size = 80, half = size / 2;
  const normal = new THREE.Vector3(...def.normal);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const corners = [[-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0], [-half, -half, 0]];
  const pts = corners.map(c => new THREE.Vector3(...c).applyQuaternion(q).add(new THREE.Vector3(...center)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.map(p => [p.x, p.y, p.z]).flat(), 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.25 }));
}
