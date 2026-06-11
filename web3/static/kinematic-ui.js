/**
 * Kinematic mode UI — beta sliders, solve status, animation controls.
 */
import { S } from './state.js';
import { solve, forwardPositions, sweep } from './solver.js';
import { updatePositions } from './scene-builder.js';
import { stopAnimation } from './mode-manager.js';

// ── Slider-driven real-time solve ──

function onSliderInput() {
  const beta1 = parseFloat(document.getElementById('k-beta1').value);
  const beta2 = parseFloat(document.getElementById('k-beta2').value);

  document.getElementById('k-beta1-val').textContent = beta1.toFixed(0) + '°';
  document.getElementById('k-beta2-val').textContent = beta2.toFixed(0) + '°';

  // Solve using previous result as initial guess
  const prevTheta = S.solverResult ? S.solverResult.theta : 0;
  const prevPhi = S.solverResult ? S.solverResult.phi : 0;

  const result = solve(S.params, beta1, beta2, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, prevTheta, prevPhi);

  if (result) {
    S.solverResult = result;
    S.params.beta1 = beta1;
    S.params.beta2 = beta2;
    S.kinematicPositions = forwardPositions(S.params, result.theta, result.phi);
    updatePositions(S.kinematicPositions);
    updateKinematicStatus(result, beta1, beta2);
    hideSolveWarning();
  } else {
    showSolveWarning();
  }
}

function updateKinematicStatus(result, beta1, beta2) {
  const el = document.getElementById('kinematic-status');
  if (!el) return;
  el.innerHTML = `β₁=${beta1.toFixed(0)}° β₂=${beta2.toFixed(0)}° → θ=${result.theta.toFixed(2)}° φ=${result.phi.toFixed(2)}°`;
}

function showSolveWarning() {
  let el = document.getElementById('solve-warning');
  if (!el) {
    el = document.createElement('div');
    el.id = 'solve-warning';
    el.className = 'solve-warning';
    el.textContent = 'No solution';
    document.getElementById('kinematic-panel').appendChild(el);
  }
  el.style.display = 'block';
}

function hideSolveWarning() {
  const el = document.getElementById('solve-warning');
  if (el) el.style.display = 'none';
}

// ── Animation sweep ──

let sweepFrames = [];
let sweepIdx = 0;
let sweepPlaying = false;

function startSweep() {
  const driveParam = document.getElementById('anim-drive').value;
  const p = S.params;

  const driveVal = driveParam === 'beta1' ? p.beta1 : p.beta2;
  const coupledVal = driveParam === 'beta1' ? p.beta2 : p.beta1;

  // Sweep from 10 to 170
  const from = 10, to = 170, step = 2;
  document.getElementById('anim-status').textContent = 'Computing...';

  sweep(p, S.solverRodLengths.L_RD2, S.solverRodLengths.L_LF2, driveParam, from, to, step, (done, total) => {
    document.getElementById('anim-status').textContent = `Computing ${done}/${total * 1}...`;
  }).then(({ frames }) => {
    if (frames.length === 0) {
      document.getElementById('anim-status').textContent = 'No frames';
      return;
    }
    sweepFrames = frames;
    sweepIdx = 0;
    sweepPlaying = true;
    document.getElementById('anim-status').textContent = `Playing ${frames.length} frames`;
    playNextFrame();
  });
}

function playNextFrame() {
  if (!sweepPlaying || sweepIdx >= sweepFrames.length) {
    sweepPlaying = false;
    document.getElementById('anim-status').textContent = sweepIdx >= sweepFrames.length ? 'Done' : 'Stopped';
    return;
  }

  const frame = sweepFrames[sweepIdx];
  S.params.beta1 = frame.beta1;
  S.params.beta2 = frame.beta2;
  S.solverResult = { theta: frame.theta, phi: frame.phi };
  S.kinematicPositions = frame.positions;
  updatePositions(S.kinematicPositions);

  document.getElementById('k-beta1').value = frame.beta1;
  document.getElementById('k-beta2').value = frame.beta2;
  document.getElementById('k-beta1-val').textContent = frame.beta1.toFixed(0) + '°';
  document.getElementById('k-beta2-val').textContent = frame.beta2.toFixed(0) + '°';
  updateKinematicStatus(S.solverResult, frame.beta1, frame.beta2);

  sweepIdx++;
  S.animId = requestAnimationFrame(playNextFrame);
}

function stopSweep() {
  sweepPlaying = false;
  stopAnimation();
  document.getElementById('anim-status').textContent = 'Stopped';
}

// ── Public API ──

export function initKinematicUI() {
  const b1 = document.getElementById('k-beta1');
  const b2 = document.getElementById('k-beta2');
  if (b1) b1.addEventListener('input', onSliderInput);
  if (b2) b2.addEventListener('input', onSliderInput);

  const playBtn = document.getElementById('anim-play');
  const stopBtn = document.getElementById('anim-stop');
  if (playBtn) playBtn.addEventListener('click', startSweep);
  if (stopBtn) stopBtn.addEventListener('click', stopSweep);
}

export function showKinematicPanel() {
  const el = document.getElementById('kinematic-panel');
  if (el) el.classList.remove('hidden');
}

export function hideKinematicPanel() {
  const el = document.getElementById('kinematic-panel');
  if (el) el.classList.add('hidden');
  stopSweep();
}

export function syncSliders() {
  const b1 = document.getElementById('k-beta1');
  const b2 = document.getElementById('k-beta2');
  if (b1) { b1.value = S.params.beta1; }
  if (b2) { b2.value = S.params.beta2; }
  document.getElementById('k-beta1-val').textContent = S.params.beta1.toFixed(0) + '°';
  document.getElementById('k-beta2-val').textContent = S.params.beta2.toFixed(0) + '°';

  if (S.solverResult) {
    updateKinematicStatus(S.solverResult, S.params.beta1, S.params.beta2);
  }
}
