/**
 * Mode manager — coordinates Design / Grid / IK mode switching.
 */
import { S, rebuildScene } from './state.js';
import { solve, forwardPositions, computeGrid } from './solver.js';
import { updatePositions, computeDesignPositions as getDesignPos } from './scene-builder.js';
import { showGridPanel, hideGridPanel, drawGrid } from './grid-mode.js';
import { buildWorkspaceSurface, removeWorkspaceSurface } from './workspace.js';
import { enterIKMode, exitIKMode } from './ik-mode.js';
import { enterTrackMode, exitTrackMode } from './hand-track-mode.js';

function dist(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function inheritRodLengths() {
  const savedB1 = S.params.beta1, savedB2 = S.params.beta2;
  S.params.beta1 = S.designBetas.beta1;
  S.params.beta2 = S.designBetas.beta2;
  const pos = getDesignPos();
  S.params.beta1 = savedB1;
  S.params.beta2 = savedB2;
  S.solverRodLengths = {
    L_RD2: dist(pos.bar_r, pos.servo_arm_r) ** 2,
    L_LF2: dist(pos.bar_l, pos.servo_arm_l) ** 2,
  };
}

function doInitialSolve() {
  const p = S.params;
  const result = solve(p, p.beta1, p.beta2, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, 0, 0);
  if (!result) return false;

  S.solverResult = result;
  S.kinematicPositions = forwardPositions(p, result.theta, result.phi);
  return true;
}

export function switchMode(newMode) {
  if (S.mode === newMode) return;
  const prevMode = S.mode;

  // ── Cleanup current mode ──
  if (prevMode === 'grid') {
    hideGridPanel();
    stopAnimation();
    removeWorkspaceSurface();
  }
  if (prevMode === 'ik') {
    exitIKMode();
  }
  if (prevMode === 'track') {
    exitTrackMode();
  }

  // ── Enter new mode ──
  if (newMode === 'design') {
    removeWorkspaceSurface();
    S.mode = 'design';
    S.kinematicPositions = null;
    S.solverResult = null;
    if (S.designBetas) {
      S.params.beta1 = S.designBetas.beta1;
      S.params.beta2 = S.designBetas.beta2;
    }
    S.designBetas = null;
    S.gridData = null;
    enableTreeEditing();
    enableAnnotations();
    showTree();
    rebuildScene();
    updateModeTabs('design');
  }

  if (newMode === 'grid') {
    if (prevMode === 'design') {
      S.designBetas = { beta1: S.params.beta1, beta2: S.params.beta2 };
    }
    inheritRodLengths();
    S.mode = 'grid';
    disableTreeEditing();
    disableAnnotations();
    hideTree();
    showGridPanel();
    startGridComputation();
    updateModeTabs('grid');
  }

  if (newMode === 'ik') {
    if (prevMode === 'design') {
      S.designBetas = { beta1: S.params.beta1, beta2: S.params.beta2 };
      inheritRodLengths();
    }
    S.mode = 'ik';
    disableTreeEditing();
    disableAnnotations();
    hideTree();
    if (!S.kinematicPositions && !doInitialSolve()) {
      showStatusError('IK: no solution at current β');
      S.mode = prevMode;
      return;
    }
    rebuildScene();
    // IK always uses its own coarse grid for workspace surface
    startIKGridComputation();
    enterIKMode();
    updateModeTabs('ik');
  }

  if (newMode === 'track') {
    if (prevMode === 'design') {
      S.designBetas = { beta1: S.params.beta1, beta2: S.params.beta2 };
      inheritRodLengths();
    }
    S.mode = 'track';
    disableTreeEditing();
    disableAnnotations();
    hideTree();
    if (!S.kinematicPositions && !doInitialSolve()) {
      showStatusError('Track: no solution at current β');
      S.mode = prevMode;
      return;
    }
    rebuildScene();
    // Track reuses existing grid or computes a coarse one
    if (!S.gridData) {
      startIKGridComputation();
    } else {
      buildWorkspaceSurface();
    }
    enterTrackMode();
    updateModeTabs('track');
  }
}

export function stopAnimation() {
  if (S.animId) {
    cancelAnimationFrame(S.animId);
    S.animId = null;
  }
}

function getGridParams() {
  const from = parseFloat(document.getElementById('grid-from').value) || 0;
  const to = parseFloat(document.getElementById('grid-to').value) || 180;
  const step = parseFloat(document.getElementById('grid-step').value) || 1;
  return { from, to: Math.max(from + step, to), step: Math.max(0.5, step) };
}

function startIKGridComputation() {
  const p = S.params;

  computeGrid(p, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, 0, 180, 2).then(data => {
    S.gridData = data;
    buildWorkspaceSurface(data);
  });
}

function startGridComputation() {
  S.gridComputing = true;
  S.gridData = null;
  removeWorkspaceSurface();
  const p = S.params;
  const { from, to, step } = getGridParams();
  const res = Math.round((to - from) / step) + 1;
  updateGridStatus(`Computing ${res}×${res}...`);

  computeGrid(p, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, from, to, step, (done, total) => {
    updateGridStatus(`Computing ${done}/${total}...`);
  }).then(data => {
    S.gridData = data;
    S.gridComputing = false;
    drawGrid(data, S.params.beta1, S.params.beta2);
    updateGridStatus(`${res}×${res} (${step}° step) — Click to explore`);

    if (!doInitialSolve()) {
      updateGridStatus('No solution at current β');
    } else {
      rebuildScene();
    }
    buildWorkspaceSurface();
  });
}

// ── UI helpers ──

function updateModeTabs(mode) {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const saveBtn = document.getElementById('save-params-btn');
  if (saveBtn) saveBtn.style.display = mode === 'design' ? '' : 'none';
}

function hideTree() {
  const tree = document.getElementById('growth-tree');
  if (tree) tree.style.display = 'none';
}

function showTree() {
  const tree = document.getElementById('growth-tree');
  if (tree) tree.style.display = '';
}

function disableTreeEditing() {
  const tree = document.getElementById('growth-tree');
  if (tree) tree.classList.add('mode-locked');
}

function enableTreeEditing() {
  const tree = document.getElementById('growth-tree');
  if (tree) tree.classList.remove('mode-locked');
}

function disableAnnotations() {
  S.showAnnotations = false;
  const dimBtn = document.getElementById('dim-toggle');
  if (dimBtn) dimBtn.style.display = 'none';
}

function enableAnnotations() {
  S.showAnnotations = true;
  const dimBtn = document.getElementById('dim-toggle');
  if (dimBtn) dimBtn.style.display = '';
}

function showStatusError(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function updateGridStatus(msg) {
  const el = document.getElementById('grid-status');
  if (el) el.textContent = msg;
}

// ── Bind mode tabs ──

export function bindModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
  const recomputeBtn = document.getElementById('grid-recompute');
  if (recomputeBtn) recomputeBtn.addEventListener('click', () => {
    if (S.mode === 'grid') startGridComputation();
  });
}
