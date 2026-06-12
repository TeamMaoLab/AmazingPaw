/**
 * IK mode — draggable target sphere + grid-based nearest-neighbor tracking.
 * User drags a pink sphere freely in 3D; white ball (U) snaps to the nearest
 * reachable point on the workspace surface via pre-computed grid lookup.
 * No iterative IK solving during drag — instant, stable, smooth.
 */
import * as THREE from './lib/three.module.js';
import { S } from './state.js';
import { findNearestU } from './workspace.js';
import { updatePositions } from './scene-builder.js';
import { updateWorkspaceMarker } from './workspace.js';

let _target = null;      // target sphere mesh (pink)
let _errorLine = null;    // line from U (white) to pink target
let _dragging = false;
let _lastGoodU = null;    // last reachable U position
let _pendingTarget = null; // target position to process on next RAF
let _rafId = null;        // RAF handle

const _dragPlane = new THREE.Plane();
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _offset = new THREE.Vector3();
const _intersection = new THREE.Vector3();

export function enterIKMode() {
  const U = S.kinematicPositions?.link_joint || [10, 0, 80];
  _lastGoodU = [...U];

  // Target sphere
  const tGeo = new THREE.SphereGeometry(2, 16, 16);
  _target = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({
    color: 0xff3366, transparent: true, opacity: 0.85,
  }));
  _target.position.set(U[0], U[1], U[2]);
  _target.renderOrder = 2;
  S.scene.add(_target);

  // Error line (initially zero-length)
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute([...U, ...U], 3));
  _errorLine = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({
    color: 0xff3366, transparent: true, opacity: 0.5,
  }));
  S.scene.add(_errorLine);

  // Bind drag events
  const canvas = S.renderer.domElement;
  canvas.addEventListener('pointerdown', _onDown);
  canvas.addEventListener('pointermove', _onMove);
  canvas.addEventListener('pointerup', _onUp);

  _showPanel();
  _updatePanel();
}

export function exitIKMode() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

  for (const obj of [_target, _errorLine]) {
    if (obj) {
      S.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }
  _target = _errorLine = null;
  _dragging = false;
  _pendingTarget = null;

  const canvas = S.renderer.domElement;
  canvas.removeEventListener('pointerdown', _onDown);
  canvas.removeEventListener('pointermove', _onMove);
  canvas.removeEventListener('pointerup', _onUp);

  _hidePanel();
}

// ── Drag handlers ──

function _onDown(e) {
  if (!_target) return;
  const rect = S.renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, S.camera);
  if (_raycaster.intersectObject(_target).length > 0) {
    _dragging = true;
    S.controls.enabled = false;
    const camDir = new THREE.Vector3();
    S.camera.getWorldDirection(camDir);
    _dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), _target.position);
    _raycaster.ray.intersectPlane(_dragPlane, _intersection);
    _offset.copy(_target.position).sub(_intersection);
    _startIKLoop();
  }
}

function _onMove(e) {
  if (!_dragging) return;
  const rect = S.renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, S.camera);
  if (_raycaster.ray.intersectPlane(_dragPlane, _intersection)) {
    const newPos = _intersection.add(_offset);
    _target.position.copy(newPos);
    _pendingTarget = [newPos.x, newPos.y, newPos.z];
  }
}

function _onUp() {
  if (_dragging) {
    _dragging = false;
    S.controls.enabled = true;
    // Snap pink ball to last reachable U on release
    if (_lastGoodU) {
      _target.position.set(_lastGoodU[0], _lastGoodU[1], _lastGoodU[2]);
    }
  }
}

// ── RAF loop ──

function _startIKLoop() {
  if (_rafId) return;
  const tick = () => {
    if (_pendingTarget) {
      _runLookup(_pendingTarget);
      _pendingTarget = null;
    }
    if (_dragging) {
      _rafId = requestAnimationFrame(tick);
    } else {
      _rafId = null;
    }
  };
  _rafId = requestAnimationFrame(tick);
}

// ── Grid lookup (replaces iterative IK) ──

function _runLookup(targetU) {
  const result = findNearestU(targetU);
  if (result) {
    _lastGoodU = result.U;
    S.params.beta1 = result.beta1;
    S.params.beta2 = result.beta2;
    S.solverResult = { theta: result.theta, phi: result.phi };
    S.kinematicPositions = result.positions;

    updatePositions(result.positions);
    _updateErrorLine(result.U);
    updateWorkspaceMarker();
    _updatePanel(result);
  } else {
    _setStatus('No workspace data');
  }
}

function _updateErrorLine(U) {
  if (!_errorLine || !_target) return;
  const tp = _target.position;
  _errorLine.geometry.setAttribute('position',
    new THREE.Float32BufferAttribute([tp.x, tp.y, tp.z, U[0], U[1], U[2]], 3));
  _errorLine.geometry.attributes.position.needsUpdate = true;
}

// ── Panel ──

function _showPanel() {
  document.getElementById('ik-panel')?.classList.remove('hidden');
}

function _hidePanel() {
  document.getElementById('ik-panel')?.classList.add('hidden');
}

function _updatePanel(result) {
  if (!_target) return;
  const tp = _target.position;
  _setText('ik-target', `${tp.x.toFixed(1)}, ${tp.y.toFixed(1)}, ${tp.z.toFixed(1)}`);

  if (result) {
    _setText('ik-beta1', result.beta1.toFixed(2) + '°');
    _setText('ik-beta2', result.beta2.toFixed(2) + '°');
    _setText('ik-error', result.error.toFixed(3) + ' mm');
    _setStatus('Tracking');
  }
}

function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _setStatus(msg) {
  const el = document.getElementById('ik-status');
  if (el) el.textContent = msg;
}
