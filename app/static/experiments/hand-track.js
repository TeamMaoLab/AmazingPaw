/**
 * Hand tracking experiment — MediaPipe HandLandmarker → hand local frame → fingertip displacement → IK lookup → β.
 * Imports solver.js for mechanism kinematics and grid computation.
 */

import { computeDesignPositions, forwardPositions, solve, computeGrid } from '../solver.js';

// ─── One Euro Filter (Casiez et al. CHI 2012) ───

class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }

  _alpha(cutoff, te) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }

  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      return x;
    }
    const te = t - this.tPrev;
    if (te <= 0) return this.xPrev;

    const ad = this._alpha(this.dCutoff, te);
    const dx = (x - this.xPrev) / te;
    const edx = ad * dx + (1 - ad) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this._alpha(cutoff, te);
    const ex = a * x + (1 - a) * this.xPrev;

    this.xPrev = ex;
    this.dxPrev = edx;
    this.tPrev = t;
    return ex;
  }

  reset() { this.xPrev = null; this.dxPrev = null; this.tPrev = null; }
}

// ─── Vector math ───

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(a) { return Math.sqrt(dot(a, a)); }
function norm(a) { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function angleDeg(a, b) {
  const la = len(a), lb = len(b);
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb || 1)))) * 180 / Math.PI;
}

// ─── Hand skeleton connections ───

const FINGER_GROUPS = [
  { name: 'thumb',  color: '#888888', idx: [1, 2, 3, 4],     edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { name: 'index',  color: '#ff6b6b', idx: [5, 6, 7, 8],     edges: [[5, 6], [6, 7], [7, 8]] },
  { name: 'middle', color: '#ffd93d', idx: [9, 10, 11, 12],  edges: [[9, 10], [10, 11], [11, 12]] },
  { name: 'ring',   color: '#6bcb77', idx: [13, 14, 15, 16], edges: [[13, 14], [14, 15], [15, 16]] },
  { name: 'pinky',  color: '#4d96ff', idx: [17, 18, 19, 20], edges: [[17, 18], [18, 19], [19, 20]] },
];
const PALM_EDGES = [[0, 5], [5, 9], [9, 13], [13, 17], [0, 17]];

// ─── Hand local coordinate frame ───

function buildHandFrame(wl) {
  const wrist = wl[0];
  const mcpMid = wl[9];
  const mcpIdx = wl[5];
  const mcpPnk = wl[17];

  // Y: forward (wrist → middle finger base)
  const y = norm(sub(mcpMid, wrist));
  // Raw spread: index MCP → pinky MCP
  const rawX = norm(sub(mcpPnk, mcpIdx));
  // Z: palm normal
  const z = norm(cross(y, rawX));
  // X: corrected spread (orthogonal to Y and Z)
  const x = norm(cross(y, z));

  return { origin: wrist, x, y, z };
}

function toLocal(p, frame) {
  const d = sub(p, frame.origin);
  return { x: dot(d, frame.x), y: dot(d, frame.y), z: dot(d, frame.z) };
}

// ─── Index finger angle extraction ───

function extractIndexAngles(wl, frame) {
  const local = wl.map(p => toLocal(p, frame));
  const [wrist, mcp, pip, dip, tip] = [local[0], local[5], local[6], local[7], local[8]];

  const meta = sub(mcp, wrist);
  const prox = sub(pip, mcp);
  const mid = sub(dip, pip);
  const dist = sub(tip, dip);

  return {
    mcpAngle: angleDeg(meta, prox),
    pipAngle: angleDeg(prox, mid),
    dipAngle: angleDeg(mid, dist),
    tipPos: tip,
  };
}

// ─── State ───

let handLandmarker = null;
let lastVideoTime = -1;
let fpsFrames = 0, fpsStart = performance.now(), fps = 0;

// ─── Mechanism solver state ───

// Default mechanism params (from defs.js GROWTH defaults)
const MECH_PARAMS = {
  x_e: 16, z_e: 0, y_e: 7, R: 7, beta1: 0, beta2: 0,
  z0: 36, L_BP: 10, L_PQ: 50, L_QU: 40, L_PA: 7,
  L_AT: 7, alpha: 35, L_AK: 50, gamma: 70, BarHalf: 7,
};

let gridData = null;   // { grid, res, from, to, step }
let uMap = null;        // Array of [x,y,z] or null, indexed by row*res+col
let U0 = null;          // initial U position [x,y,z] at design config
let rodLengths = null;  // { L_RD2, L_LF2 }

function distMM(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function initMechSolver() {
  // Compute rod lengths from design config
  const pos = computeDesignPositions(MECH_PARAMS);
  rodLengths = {
    L_RD2: distMM(pos.bar_r, pos.servo_arm_r) ** 2,
    L_LF2: distMM(pos.bar_l, pos.servo_arm_l) ** 2,
  };
  U0 = pos.link_joint;

  // Compute grid (0-180°, 5° step = 37×37)
  return computeGrid(MECH_PARAMS, rodLengths.L_RD2, rodLengths.L_LF2, 0, 180, 5).then(gd => {
    gridData = gd;
    // Build U lookup map
    const n = gd.res * gd.res;
    uMap = new Array(n);
    for (let row = 0; row < gd.res; row++) {
      for (let col = 0; col < gd.res; col++) {
        const idx = row * gd.res + col;
        const gi = idx * 3;
        if (gd.grid[gi + 2] === 0) continue;
        const b1 = gd.from + col * gd.step;
        const b2 = gd.from + row * gd.step;
        const p = { ...MECH_PARAMS, beta1: b1, beta2: b2 };
        const fp = forwardPositions(p, gd.grid[gi], gd.grid[gi + 1]);
        uMap[idx] = fp.link_joint;
      }
    }
  });
}

// Find nearest reachable U on workspace grid
function findNearestU(target) {
  if (!uMap || !gridData) return null;
  let bestDist = Infinity, bestIdx = -1;
  for (let i = 0; i < uMap.length; i++) {
    const u = uMap[i];
    if (!u) continue;
    const dx = u[0] - target[0], dy = u[1] - target[1], dz = u[2] - target[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  const row = Math.floor(bestIdx / gridData.res);
  const col = bestIdx % gridData.res;
  const b1 = gridData.from + col * gridData.step;
  const b2 = gridData.from + row * gridData.step;
  const gi = bestIdx * 3;
  return { beta1: b1, beta2: b2, theta: gridData.grid[gi], phi: gridData.grid[gi + 1], U: uMap[bestIdx], error: Math.sqrt(bestDist) };
}

// Smoothing: One Euro Filter instances
const oef = {
  mcp: new OneEuroFilter(1.0, 0.007),
  pip: new OneEuroFilter(1.0, 0.007),
  dip: new OneEuroFilter(1.0, 0.007),
  tipX: new OneEuroFilter(1.0, 0.007),
  tipY: new OneEuroFilter(1.0, 0.007),
  tipZ: new OneEuroFilter(1.0, 0.007),
};

// Calibration baseline: { mcp, pip, dip, tipX, tipY, tipZ } (tip in hand local frame)
let calibBase = null;

// ─── Calibration state machine ───
// idle → fistHold (5s in calib zone) → calibrating (5s, last 1s = sample) → calibrated
const calibState = { phase: 'idle', t0: 0, samples: [] };

// Calibration zone: bottom-right on screen (= bottom-left in mirrored overlay coords)
const CALIB_ZONE = { rx: 0.13, ry: 0.83, r: 0.09 }; // relative to video size

function isFist(wl) {
  const palm = [0, 5, 9, 13, 17];
  const cx = palm.reduce((s, i) => s + wl[i].x, 0) / palm.length;
  const cy = palm.reduce((s, i) => s + wl[i].y, 0) / palm.length;
  const cz = palm.reduce((s, i) => s + wl[i].z, 0) / palm.length;
  const tips = [8, 12, 16, 20];
  const threshold = 0.06;
  return tips.every(i => {
    const dx = wl[i].x - cx, dy = wl[i].y - cy, dz = wl[i].z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < threshold;
  });
}

function inCalibZone(lm) {
  const wz = lm[0]; // wrist position
  const dx = wz.x - CALIB_ZONE.rx, dy = wz.y - CALIB_ZONE.ry;
  return Math.sqrt(dx * dx + dy * dy) < CALIB_ZONE.r;
}

function updateCalib(wl, lm, raw) {
  const now = performance.now();
  const fist = isFist(wl);
  const inCZ = inCalibZone(lm);

  switch (calibState.phase) {
    case 'idle':
      if (fist && inCZ) { calibState.phase = 'fistHold'; calibState.t0 = now; }
      break;
    case 'fistHold':
      if (!fist || !inCZ) { calibState.phase = 'idle'; break; }
      if (now - calibState.t0 >= 5000) {
        calibState.phase = 'calibrating'; calibState.t0 = now; calibState.samples = [];
      }
      break;
    case 'calibrating': {
      if (now - calibState.t0 >= 4000) {
        calibState.samples.push({
          mcp: raw.mcpAngle, pip: raw.pipAngle, dip: raw.dipAngle,
          tipX: raw.tipPos.x, tipY: raw.tipPos.y, tipZ: raw.tipPos.z,
        });
      }
      if (now - calibState.t0 >= 5000) {
        const n = calibState.samples.length || 1;
        calibBase = {
          mcp: calibState.samples.reduce((s, v) => s + v.mcp, 0) / n,
          pip: calibState.samples.reduce((s, v) => s + v.pip, 0) / n,
          dip: calibState.samples.reduce((s, v) => s + v.dip, 0) / n,
          tipX: calibState.samples.reduce((s, v) => s + v.tipX, 0) / n,
          tipY: calibState.samples.reduce((s, v) => s + v.tipY, 0) / n,
          tipZ: calibState.samples.reduce((s, v) => s + v.tipZ, 0) / n,
        };
        calibState.phase = 'calibrated';
      }
      break;
    }
    case 'calibrated':
      if (fist && inCZ) { calibState.phase = 'fistHold'; calibState.t0 = now; }
      break;
  }
}

// ─── DOM refs ───

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const betaCanvas = document.getElementById('beta-canvas');
const frameXY = document.getElementById('frame-xy');
const frame3D = document.getElementById('frame-3d');
const loadingEl = document.getElementById('loading');
const camBtn = document.getElementById('cam-btn');

// ─── Camera toggle (start/stop stream) ───

let stream = null;
let detecting = false;

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  await new Promise(r => { video.onloadedmetadata = r; });
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  detecting = true;
  camBtn.textContent = 'Stop Camera';
  camBtn.classList.remove('off');
}

function stopCamera() {
  detecting = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  resetDisplay();
  camBtn.textContent = 'Start Camera';
  camBtn.classList.add('off');
}

camBtn.addEventListener('click', () => {
  if (detecting) stopCamera(); else startCamera();
});

// ─── Init ───

async function init() {
  loadingEl.textContent = 'Downloading MediaPipe WASM...';

  let HandLandmarker, FilesetResolver;
  try {
    const mod = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
    );
    HandLandmarker = mod.HandLandmarker;
    FilesetResolver = mod.FilesetResolver;
  } catch {
    // Fallback: try esm.sh CDN
    const mod = await import(
      'https://esm.sh/@mediapipe/tasks-vision@0.10.35'
    );
    HandLandmarker = mod.HandLandmarker;
    FilesetResolver = mod.FilesetResolver;
  }

  loadingEl.textContent = 'Loading hand detection model...\n(~10 MB, first load only)';
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
    });
  } catch {
    // Fallback to CPU if GPU fails
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'CPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
    });
  }

  loadingEl.textContent = 'Computing mechanism workspace...';

  await initMechSolver();

  loadingEl.textContent = 'Starting camera...';

  await startCamera();

  loadingEl.style.display = 'none';
  document.getElementById('status').textContent = 'Tracking';
  camBtn.disabled = false;

  requestAnimationFrame(detectLoop);
}

// ─── Detection loop ───

function detectLoop() {
  const now = performance.now();

  fpsFrames++;
  if (now - fpsStart >= 1000) {
    fps = fpsFrames;
    fpsFrames = 0;
    fpsStart = now;
    document.getElementById('fps').textContent = `${fps} FPS`;
  }

  if (detecting && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = handLandmarker.detectForVideo(video, now);
      processResult(result);
    } catch (e) {
      document.getElementById('status').textContent = `Error: ${e.message}`;
    }
  }

  requestAnimationFrame(detectLoop);
}

function processResult(result) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Guide box: center of frame, ~40% of video size
  const gw = overlay.width * 0.4;
  const gh = overlay.height * 0.5;
  const gx = (overlay.width - gw) / 2;
  const gy = (overlay.height - gh) / 2;

  if (!result.landmarks || result.landmarks.length === 0) {
    drawGuide(ctx, gx, gy, gw, gh, false);
    drawCalibZone(ctx, overlay.width, overlay.height, false);
    resetDisplay();
    document.getElementById('status').textContent = 'No hand — place palm in box';
    return;
  }

  // Find right hand
  const rhIdx = result.handednesses?.[0]?.findIndex(h => h.categoryName === 'Right') ?? -1;
  const idx = rhIdx >= 0 ? rhIdx : 0;
  const isRight = rhIdx >= 0;

  const lm = result.landmarks[idx];
  const wl = result.worldLandmarks[idx];

  if (result.handednesses?.[idx]?.[0]) {
    const h = result.handednesses[idx][0];
    document.getElementById('handedness').textContent = `${h.categoryName} (${(h.score * 100).toFixed(0)}%)`;
  }
  if (!isRight) {
    document.getElementById('handedness').innerHTML += ' <span class="warn">(showing left)</span>';
  }

  // ── Region check: all 5 palm keypoints inside guide box ──
  const PALM_LM = [0, 5, 9, 13, 17];
  const bx0 = gx / overlay.width, bx1 = (gx + gw) / overlay.width;
  const by0 = gy / overlay.height, by1 = (gy + gh) / overlay.height;
  const inBox = PALM_LM.every(i => lm[i].x > bx0 && lm[i].x < bx1 && lm[i].y > by0 && lm[i].y < by1);

  // ── Palm facing check: palm normal Z < -0.5 in world coords (toward camera) ──
  const frame = buildHandFrame(wl);
  const palmFacing = frame.z.z < -0.5;

  const valid = inBox && palmFacing;

  drawGuide(ctx, gx, gy, gw, gh, valid);

  // Always draw landmarks for visual feedback
  drawLandmarks(ctx, lm);

  // Calibration zone + state machine (works independently of tracking zone)
  const raw = extractIndexAngles(wl, frame);
  const inCZ = inCalibZone(lm);
  updateCalib(wl, lm, raw);
  drawCalibZone(ctx, overlay.width, overlay.height, inCZ && isFist(wl));
  drawCalibProgress(ctx, overlay.width, overlay.height);

  if (!valid) {
    let hint = '';
    if (!inBox) hint = 'Move hand into box';
    else if (!palmFacing) hint = 'Face palm toward camera';
    document.getElementById('status').textContent = hint;
    drawDisconnect(frameXY, hint);
    drawDisconnect(frame3D, hint);
    return;
  }

  // Draw calibration progress on overlay
  drawCalibProgress(ctx, overlay.width, overlay.height);

  drawFrameXY(wl, frame);
  drawFrame3D(wl, frame);

  // During fistHold / calibrating, show status but don't output angles
  if (calibState.phase === 'fistHold') {
    const remain = Math.ceil((5000 - (performance.now() - calibState.t0)) / 1000);
    document.getElementById('status').textContent = `Hold fist... ${remain}s`;
    for (const id of ['mcp-angle', 'pip-angle', 'dip-angle', 'tip-x', 'tip-y', 'tip-z', 'beta1', 'beta2']) {
      document.getElementById(id).textContent = '--';
    }
    return;
  }
  if (calibState.phase === 'calibrating') {
    const remain = Math.ceil((5000 - (performance.now() - calibState.t0)) / 1000);
    document.getElementById('status').textContent = `Calibrating... open hand straight (${remain}s)`;
    for (const id of ['mcp-angle', 'pip-angle', 'dip-angle', 'tip-x', 'tip-y', 'tip-z', 'beta1', 'beta2']) {
      document.getElementById(id).textContent = '--';
    }
    return;
  }

  if (calibState.phase === 'calibrated') {
    document.getElementById('status').textContent = 'Tracking (calibrated)';
  } else {
    document.getElementById('status').textContent = 'Tracking (uncalibrated)';
  }

  // One Euro Filter smoothing on raw angles (for display)
  const t = performance.now() / 1000;
  const sMcp = oef.mcp.filter(Math.max(0, raw.mcpAngle - (calibBase?.mcp ?? 0)), t);
  const sPip = oef.pip.filter(Math.max(0, raw.pipAngle - (calibBase?.pip ?? 0)), t);
  const sDip = oef.dip.filter(Math.max(0, raw.dipAngle - (calibBase?.dip ?? 0)), t);
  const sTipX = oef.tipX.filter(raw.tipPos.x, t);
  const sTipY = oef.tipY.filter(raw.tipPos.y, t);
  const sTipZ = oef.tipZ.filter(raw.tipPos.z, t);

  // Display calibrated angles
  document.getElementById('mcp-angle').textContent = sMcp.toFixed(1) + '°';
  document.getElementById('pip-angle').textContent = sPip.toFixed(1) + '°';
  document.getElementById('dip-angle').textContent = sDip.toFixed(1) + '°';
  document.getElementById('tip-x').textContent = (sTipX * 1000).toFixed(1) + ' mm';
  document.getElementById('tip-y').textContent = (sTipY * 1000).toFixed(1) + ' mm';
  document.getElementById('tip-z').textContent = (sTipZ * 1000).toFixed(1) + ' mm';

  // ── Fingertip displacement → β grid diagonal mapping ──
  if (!calibBase || !gridData) {
    document.getElementById('beta1').textContent = '--';
    document.getElementById('beta2').textContent = '--';
    return;
  }

  // Displacement from calibrated baseline (hand local frame, meters)
  const dx = sTipX - calibBase.tipX;
  const dy = sTipY - calibBase.tipY;  // -Y when finger bends (retracts)
  const dz = sTipZ - calibBase.tipZ;

  // Map to β space:
  //   finger bend (-Y) → β₁+β₂ increase (diagonal on grid)
  //   finger depth (Z) → same as bend contribution
  //   finger spread (X) → β₁−β₂ differential
  const bend = -(dy + dz * 0.3) * 1000; // mm, positive when bending
  const spread = dx * 1000;              // mm

  const bendScale = 1.5;   // mm of finger bend → ° of β
  const spreadScale = 2.0; // mm of spread → ° differential

  // Target β (before grid validation)
  let b1Target = bend * bendScale / 2 + spread * spreadScale / 2;
  let b2Target = bend * bendScale / 2 - spread * spreadScale / 2;
  b1Target = Math.max(0, Math.min(180, b1Target));
  b2Target = Math.max(0, Math.min(180, b2Target));

  // Find nearest valid grid point
  const col = Math.round((b1Target - gridData.from) / gridData.step);
  const row = Math.round((b2Target - gridData.from) / gridData.step);
  const res = gridData.res;

  // BFS from (col,row) to find nearest valid cell
  let bestDist = Infinity, bestCol = 0, bestRow = 0;
  const searchR = 5;
  for (let dr = -searchR; dr <= searchR; dr++) {
    for (let dc = -searchR; dc <= searchR; dc++) {
      const c = col + dc, r = row + dr;
      if (c < 0 || c >= res || r < 0 || r >= res) continue;
      if (gridData.grid[(r * res + c) * 3 + 2] === 0) continue;
      const d = dc * dc + dr * dr;
      if (d < bestDist) { bestDist = d; bestCol = c; bestRow = r; }
    }
  }

  const b1 = gridData.from + bestCol * gridData.step;
  const b2 = gridData.from + bestRow * gridData.step;

  document.getElementById('beta1').textContent = b1.toFixed(0) + '°';
  document.getElementById('beta2').textContent = b2.toFixed(0) + '°';
  const ikEl = document.getElementById('ik-info');
  if (ikEl) ikEl.textContent =
    `target: (${b1Target.toFixed(0)}°, ${b2Target.toFixed(0)}°)  ` +
    `grid: (${b1.toFixed(0)}°, ${b2.toFixed(0)}°)`;
  drawBetaSpace(b1, b2);
}

function resetDisplay() {
  for (const id of ['mcp-angle', 'pip-angle', 'dip-angle', 'tip-x', 'tip-y', 'tip-z', 'beta1', 'beta2']) {
    document.getElementById(id).textContent = '--';
  }
  for (const f of Object.values(oef)) f.reset();
  document.getElementById('handedness').textContent = 'No hand';
  document.getElementById('status').textContent = 'Searching...';
  for (const c of [frameXY, frame3D]) {
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
}

// ─── Drawing: calibration zone circle on overlay ───

function drawCalibZone(ctx, W, H, active) {
  const cx = CALIB_ZONE.rx * W;
  const cy = CALIB_ZONE.ry * H;
  const r = CALIB_ZONE.r * Math.min(W, H);
  const calibrated = calibState.phase === 'calibrated';

  // Fill
  ctx.fillStyle = active ? 'rgba(255, 193, 7, 0.15)' : 'rgba(0,0,0,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // Border
  ctx.strokeStyle = active ? '#ffc107' : (calibrated ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.3)');
  ctx.lineWidth = active ? 2.5 : 1.5;
  ctx.setLineDash(active ? [] : [6, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = active ? '#ffc107' : (calibrated ? '#4caf50' : 'rgba(255,255,255,0.5)');
  ctx.font = `${active ? 'bold ' : ''}9px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  overlayText(ctx, calibrated ? 'CALIB ✓' : 'CALIB', cx, cy);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── Drawing: calibration progress on overlay ───

function drawCalibProgress(ctx, W, H) {
  if (calibState.phase === 'idle' || calibState.phase === 'calibrated') return;

  const now = performance.now();
  const cx = W / 2, cy = 36;
  const barW = 260, barH = 10;
  const bx = cx - barW / 2;

  // Background pill
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(bx - 14, cy - 20, barW + 28, 52, 8); ctx.fill();

  // Phase indicator: [1] Fist Hold  [2] Calibrate
  const isFist = calibState.phase === 'fistHold';
  const progress = Math.min(1, (now - calibState.t0) / 5000);

  // Step labels
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  // Step 1
  ctx.fillStyle = isFist ? '#ffc107' : 'rgba(255,255,255,0.35)';
  overlayText(ctx, isFist ? '1. Hold fist' : '1. Hold fist ✓', bx + barW * 0.25, cy - 5);
  // Step 2
  ctx.fillStyle = !isFist ? '#4caf50' : 'rgba(255,255,255,0.35)';
  const calibText = progress >= 0.8 ? '2. Sampling...' : '2. Open hand straight';
  overlayText(ctx, !isFist ? calibText : '2. Calibrate', bx + barW * 0.75, cy - 5);

  // Progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(bx, cy + 8, barW, barH, 4); ctx.fill();

  if (isFist) {
    // Yellow bar growing left → right
    ctx.fillStyle = '#ffc107';
    ctx.beginPath(); ctx.roundRect(bx, cy + 8, barW * progress, barH, 4); ctx.fill();
  } else {
    // Green bar growing left → right
    ctx.fillStyle = '#4caf50';
    ctx.beginPath(); ctx.roundRect(bx, cy + 8, barW * progress, barH, 4); ctx.fill();
    // Mark last 1s sampling zone
    if (progress > 0.8) {
      ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
      ctx.beginPath(); ctx.roundRect(bx + barW * 0.8, cy + 8, barW * 0.2, barH, 4); ctx.fill();
    }
  }

  ctx.textAlign = 'left';
}

// ─── Drawing: disconnect overlay on canvas ───

function drawDisconnect(canvas, hint) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Light dim — keep tracking visible
  ctx.fillStyle = 'rgba(230, 235, 240, 0.4)';
  ctx.fillRect(0, 0, W, H);

  // Diagonal NO SIGNAL banner
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 6);
  const bw = W * 1.2, bh = 26;
  ctx.fillStyle = '#e53935';
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO SIGNAL', 0, 1);
  ctx.restore();

  // Hint
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(hint, W / 2, H - 12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── Drawing: guide box on overlay ───

function drawGuide(ctx, x, y, w, h, valid) {
  const r = 12;
  const color = valid ? 'rgba(76, 175, 80, 0.7)' : 'rgba(255, 152, 0, 0.5)';
  const bgColor = valid ? 'rgba(76, 175, 80, 0.06)' : 'rgba(255, 152, 0, 0.04)';

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner brackets
  const bLen = 20;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  // Top-left
  ctx.beginPath(); ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(x + w - bLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bLen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(x, y + h - bLen); ctx.lineTo(x, y + h); ctx.lineTo(x + bLen, y + h); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(x + w - bLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - bLen); ctx.stroke();

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  overlayText(ctx, valid ? 'OK' : 'Place palm here, face camera', x + w / 2, y - 8);
  ctx.textAlign = 'left';
}

// ─── Drawing: video overlay ───

// Helper: draw text on mirrored overlay so it reads normally on screen
function overlayText(ctx, text, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  const a = ctx.textAlign;
  if (a === 'left') ctx.textAlign = 'right';
  else if (a === 'right') ctx.textAlign = 'left';
  ctx.textBaseline = ctx.textBaseline; // keep as-is
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawLandmarks(ctx, lm) {
  const w = overlay.width, h = overlay.height;

  // Connections
  for (const group of FINGER_GROUPS) {
    ctx.strokeStyle = group.color;
    ctx.lineWidth = 2;
    for (const [i, j] of group.edges) {
      ctx.beginPath();
      ctx.moveTo(lm[i].x * w, lm[i].y * h);
      ctx.lineTo(lm[j].x * w, lm[j].y * h);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  for (const [i, j] of PALM_EDGES) {
    ctx.beginPath();
    ctx.moveTo(lm[i].x * w, lm[i].y * h);
    ctx.lineTo(lm[j].x * w, lm[j].y * h);
    ctx.stroke();
  }

  // Points
  for (let i = 0; i < 21; i++) {
    let color = '#fff';
    for (const g of FINGER_GROUPS) {
      if (g.idx.includes(i)) { color = g.color; break; }
    }
    const r = (i === 8) ? 6 : 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Index tip highlight ring
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lm[8].x * w, lm[8].y * h, 10, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHandSkeleton(ctx, local, project) {
  for (const group of FINGER_GROUPS) {
    ctx.strokeStyle = group.color;
    ctx.lineWidth = 2;
    for (const [i, j] of group.edges) {
      const a = project(local[i]), b = project(local[j]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.5;
  for (const [i, j] of PALM_EDGES) {
    const a = project(local[i]), b = project(local[j]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let i = 0; i < 21; i++) {
    let color = '#333';
    for (const g of FINGER_GROUPS) {
      if (g.idx.includes(i)) { color = g.color; break; }
    }
    const p = project(local[i]);
    const r = (i === 8) ? 5 : 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Drawing: XY palm view (fixed view, no per-frame refit) ───

function drawFrameXY(wl, frame) {
  const ctx = frameXY.getContext('2d');
  const W = frameXY.width, H = frameXY.height;
  const cx = W / 2, cy = H / 2;

  // Fixed view: ±0.12m, centered on hand centroid (shifted slightly from origin)
  const local = wl.map(p => toLocal(p, frame));
  const handCx = local.reduce((s, p) => s + p.x, 0) / local.length;
  const handCy = local.reduce((s, p) => s + p.y, 0) / local.length;
  const viewScale = (Math.min(W, H) - 40) / 0.24; // fit ±0.12m
  const vx = cx - handCx * viewScale;
  const vy = cy + handCy * viewScale;

  ctx.fillStyle = '#fafbfc';
  ctx.fillRect(0, 0, W, H);

  // Grid: fixed 20mm spacing
  ctx.strokeStyle = '#e8eaed';
  ctx.lineWidth = 1;
  const gridStep = 0.02;
  for (let g = -6; g <= 6; g++) {
    const px = vx + g * gridStep * viewScale;
    const py = vy - g * gridStep * viewScale;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }

  // Axes through wrist origin
  const ox = vx;
  const oy = vy;
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, oy); ctx.lineTo(W, oy);
  ctx.moveTo(ox, 0); ctx.lineTo(ox, H);
  ctx.stroke();
  ctx.moveTo(ox, 0); ctx.lineTo(ox, H);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#999';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('XY (palm)', W / 2, H - 6);
  ctx.textAlign = 'left';

  drawHandSkeleton(ctx, local, p => ({
    x: vx - p.x * viewScale,  // flip X: mirror to match video display (thumb on left)
    y: vy - p.y * viewScale,
  }));

  // Frame axes at wrist
  const o = { x: vx, y: vy };
  const aLen = 25;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x - aLen, o.y); ctx.stroke();
  ctx.strokeStyle = '#43a047'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y - aLen); ctx.stroke();
  ctx.fillStyle = '#e53935'; ctx.font = '9px monospace';
  ctx.fillText('X', o.x - aLen - 8, o.y + 3);
  ctx.fillStyle = '#43a047';
  ctx.fillText('Y', o.x + 3, o.y - aLen - 2);
}

// ─── Drawing: 3D isometric view (camera at (1,1,1) → origin) ───

// Precomputed lookAt basis: eye=(1,1,1), target=(0,0,0), worldUp=(0,1,0)
const S3 = 1 / Math.sqrt(3);
const S2 = 1 / Math.sqrt(2);
const S6 = 1 / Math.sqrt(6);
// forward = normalize(eye - target) = (1,1,1)/√3
// right = normalize(forward × worldUp) = (1/√2, 0, -1/√2)
// up = right × forward = (1/√6, -2/√6, 1/√6), flipped for screen → (-1/√6, 2/√6, -1/√6)
const CAM_RIGHT = { x: S2, y: 0, z: -S2 };
const CAM_UP    = { x: -S6, y: 2 * S6, z: -S6 };

function project3D(p) {
  return {
    x: p.x * CAM_RIGHT.x + p.y * CAM_RIGHT.y + p.z * CAM_RIGHT.z,
    y: p.x * CAM_UP.x + p.y * CAM_UP.y + p.z * CAM_UP.z,
  };
}

function drawFrame3D(wl, frame) {
  const ctx = frame3D.getContext('2d');
  const W = frame3D.width, H = frame3D.height;
  const cx = W / 2, cy = H / 2;

  const local = wl.map(p => toLocal(p, frame));

  // Fixed view: project hand centroid, center on it, fixed scale
  const projected = local.map(p => project3D(p));
  const pcx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
  const pcy = projected.reduce((s, p) => s + p.y, 0) / projected.length;
  // ±0.12m in 3D → projected range is smaller, scale accordingly
  const viewScale = (Math.min(W, H) - 40) / 0.24;

  ctx.fillStyle = '#fafbfc';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#999';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('3D (isometric)', W / 2, H - 6);
  ctx.textAlign = 'left';

  const vx = cx - pcx * viewScale;
  const vy = cy + pcy * viewScale;

  function toCanvas(p) {
    return { x: vx - p.x * viewScale, y: vy - p.y * viewScale };
  }

  drawHandSkeleton(ctx, projected, toCanvas);

  // Frame axes at wrist
  const o = toCanvas(projected[0]);
  const axisLen = 0.03;
  const axes = [
    { dir: { x: axisLen, y: 0, z: 0 }, color: '#e53935', label: 'X' },
    { dir: { x: 0, y: axisLen, z: 0 }, color: '#43a047', label: 'Y' },
    { dir: { x: 0, y: 0, z: axisLen }, color: '#1e88e5', label: 'Z' },
  ];
  ctx.lineWidth = 2;
  for (const a of axes) {
    const ap = project3D(a.dir);
    const end = toCanvas(ap);
    ctx.strokeStyle = a.color;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.fillStyle = a.color;
    ctx.font = '9px monospace';
    ctx.fillText(a.label, end.x + 2, end.y - 2);
  }
}

// ─── Drawing: β space ───

function drawBetaSpace(b1, b2) {
  const ctx = betaCanvas.getContext('2d');
  const W = betaCanvas.width, H = betaCanvas.height;
  const m = 30;
  const pw = W - m * 2, ph = H - m * 2;

  ctx.fillStyle = '#fafbfc';
  ctx.fillRect(0, 0, W, H);

  // Grid lines every 30°
  ctx.strokeStyle = '#e8eaed';
  ctx.lineWidth = 1;
  for (let d = 0; d <= 180; d += 30) {
    const x = m + (d / 180) * pw;
    const y = m + (d / 180) * ph;
    ctx.beginPath();
    ctx.moveTo(x, m); ctx.lineTo(x, m + ph);
    ctx.moveTo(m, y); ctx.lineTo(m + pw, y);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = '#bbb';
  ctx.strokeRect(m, m, pw, ph);

  // Labels
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('0°', m, m + ph + 14);
  ctx.fillText('180°', m + pw, m + ph + 14);
  ctx.fillText('β₁ →', m + pw / 2, m + ph + 14);
  ctx.textAlign = 'right';
  ctx.fillText('180°', m - 4, m + 4);
  ctx.fillText('0°', m - 4, m + ph + 4);
  ctx.save();
  ctx.translate(m - 18, m + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('β₂ →', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // Crosshair
  const px = m + (b1 / 180) * pw;
  const py = m + (1 - b2 / 180) * ph;

  ctx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px, m); ctx.lineTo(px, m + ph);
  ctx.moveTo(m, py); ctx.lineTo(m + pw, py);
  ctx.stroke();
  ctx.setLineDash([]);

  // Target
  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(21, 101, 192, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.stroke();
}

// ─── Start ───

init().catch(err => {
  loadingEl.textContent = `Error: ${err.message}\n\nCheck console for details.`;
  loadingEl.style.whiteSpace = 'pre-wrap';
  console.error('Hand tracking init failed:', err);
});
