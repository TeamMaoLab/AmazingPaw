/**
 * Mode manager — coordinates Design / Kinematic / Grid mode switching.
 */
import { S, rebuildScene } from './state.js';
import { solve, forwardPositions, computeGrid } from './solver.js';
import { updatePositions, computeDesignPositions as getDesignPos } from './scene-builder.js';
import { initKinematicUI, showKinematicPanel, hideKinematicPanel, syncSliders } from './kinematic-ui.js';
import { showGridPanel, hideGridPanel, drawGrid } from './grid-mode.js';

function dist(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function inheritRodLengths() {
  // Use saved design betas so rod lengths are independent of grid/kinematic exploration
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

  // ── Cleanup current mode ──
  if (S.mode === 'kinematic') {
    hideKinematicPanel();
    stopAnimation();
  }
  if (S.mode === 'grid') {
    hideGridPanel();
  }

  // ── Enter new mode ──
  if (newMode === 'design') {
    S.mode = 'design';
    S.kinematicPositions = null;
    S.solverResult = null;
    // Restore design betas — grid/kinematic may have modified them
    if (S.designBetas) {
      S.params.beta1 = S.designBetas.beta1;
      S.params.beta2 = S.designBetas.beta2;
    }
    S.designBetas = null;
    // Invalidate grid — structural params may have changed
    S.gridData = null;
    enableTreeEditing();
    enableAnnotations();
    showTree();
    rebuildScene();
    updateModeTabs('design');
  }

  if (newMode === 'kinematic') {
    // Save design betas on first exit from design mode
    if (S.mode === 'design') {
      S.designBetas = { beta1: S.params.beta1, beta2: S.params.beta2 };
    }
    inheritRodLengths();
    if (!doInitialSolve()) {
      showStatusError('Cannot solve for current parameters');
      updateModeTabs('design');
      return;
    }
    S.mode = 'kinematic';
    disableTreeEditing();
    disableAnnotations();
    hideTree();
    rebuildScene();
    showKinematicPanel();
    syncSliders();
    updateModeTabs('kinematic');
  }

  if (newMode === 'grid') {
    // Save design betas on first exit from design mode
    if (S.mode === 'design') {
      S.designBetas = { beta1: S.params.beta1, beta2: S.params.beta2 };
    }
    inheritRodLengths();
    S.mode = 'grid';
    disableTreeEditing();
    disableAnnotations();
    hideTree();
    showGridPanel();
    // Always recompute grid — params may have changed since last visit
    startGridComputation();
    updateModeTabs('grid');
  }
}

export function stopAnimation() {
  if (S.animId) {
    cancelAnimationFrame(S.animId);
    S.animId = null;
  }
}

function startGridComputation() {
  S.gridComputing = true;
  S.gridData = null; // Clear stale data
  const p = S.params;
  computeGrid(p, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, 0, 180, 70, (done, total) => {
    updateGridStatus(`Computing ${done}/${total}...`);
  }).then(data => {
    S.gridData = data;
    S.gridComputing = false;
    drawGrid(data, S.params.beta1, S.params.beta2);
    updateGridStatus('Click to explore');

    if (!doInitialSolve()) {
      updateGridStatus('No solution at current β');
    } else {
      rebuildScene();
    }
  });
}

// ── UI helpers ──

function updateModeTabs(mode) {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
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
}
