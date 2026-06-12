/**
 * Track mode — MediaPipe HandLandmarker → fingertip displacement → β grid lookup → mechanism drive.
 * Migrated from experiments/hand-track.js, integrated with main app state (S) and scene.
 */

import { S } from './state.js';
import { forwardPositions } from './solver.js';
import { findNearestU, updateWorkspaceMarker } from './workspace.js';
import { updatePositions } from './scene-builder.js';

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

// ─── Hand frame + local transform ───

function buildHandFrame(wl) {
  const wrist = wl[0];
  const mcpMid = wl[9];
  const mcpIdx = wl[5];
  const mcpPnk = wl[17];
  const y = norm(sub(mcpMid, wrist));
  const rawX = norm(sub(mcpPnk, mcpIdx));
  const z = norm(cross(y, rawX));
  const x = norm(cross(y, z));
  return { origin: wrist, x, y, z };
}

function toLocal(p, frame) {
  const d = sub(p, frame.origin);
  return { x: dot(d, frame.x), y: dot(d, frame.y), z: dot(d, frame.z) };
}

function angleDeg(a, b) {
  const la = len(a), lb = len(b);
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb || 1)))) * 180 / Math.PI;
}

// ─── Calibration helpers ───

const CALIB_ZONE = { rx: 0.13, ry: 0.83, r: 0.09 };

function isFist(wl) {
  const palm = [0, 5, 9, 13, 17];
  const cx = palm.reduce((s, i) => s + wl[i].x, 0) / palm.length;
  const cy = palm.reduce((s, i) => s + wl[i].y, 0) / palm.length;
  const cz = palm.reduce((s, i) => s + wl[i].z, 0) / palm.length;
  const tips = [8, 12, 16, 20];
  return tips.every(i => {
    const dx = wl[i].x - cx, dy = wl[i].y - cy, dz = wl[i].z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.06;
  });
}

function inCalibZone(lm) {
  const wz = lm[0];
  const dx = wz.x - CALIB_ZONE.rx, dy = wz.y - CALIB_ZONE.ry;
  return Math.sqrt(dx * dx + dy * dy) < CALIB_ZONE.r;
}

// ─── Module state ───

let _handLandmarker = null;
let _videoEl = null;
let _overlayEl = null;
let _stream = null;
let _rafId = null;
let _lastVideoTime = -1;
let _fpsFrames = 0, _fpsStart = 0, _fps = 0;

const _oef = {
  tipX: new OneEuroFilter(1.0, 0.007),
  tipY: new OneEuroFilter(1.0, 0.007),
  tipZ: new OneEuroFilter(1.0, 0.007),
};

let _calibBase = null;
const _calibState = { phase: 'idle', t0: 0, samples: [] };
let _stopped = false;

// Finger skeleton for overlay drawing
const FINGER_GROUPS = [
  { name: 'thumb',  color: '#888888', idx: [1, 2, 3, 4],     edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { name: 'index',  color: '#ff6b6b', idx: [5, 6, 7, 8],     edges: [[5, 6], [6, 7], [7, 8]] },
  { name: 'middle', color: '#ffd93d', idx: [9, 10, 11, 12],  edges: [[9, 10], [10, 11], [11, 12]] },
  { name: 'ring',   color: '#6bcb77', idx: [13, 14, 15, 16], edges: [[13, 14], [14, 15], [15, 16]] },
  { name: 'pinky',  color: '#4d96ff', idx: [17, 18, 19, 20], edges: [[17, 18], [18, 19], [19, 20]] },
];
const PALM_EDGES = [[0, 5], [5, 9], [9, 13], [13, 17], [0, 17]];

// ─── MediaPipe init (lazy, cached) ───

async function _initMediaPipe() {
  if (_handLandmarker) return;

  let HandLandmarker, FilesetResolver;
  try {
    const mod = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
    );
    HandLandmarker = mod.HandLandmarker;
    FilesetResolver = mod.FilesetResolver;
  } catch {
    const mod = await import(
      'https://esm.sh/@mediapipe/tasks-vision@0.10.35'
    );
    HandLandmarker = mod.HandLandmarker;
    FilesetResolver = mod.FilesetResolver;
  }

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  try {
    _handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
    });
  } catch {
    _handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'CPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
    });
  }
}

// ─── DOM: create floating track widget (video + panel) ───

function _createVideoOverlay() {
  const viewport = document.getElementById('viewport');

  // Outer container — holds video and info panel side by side
  const container = document.createElement('div');
  container.id = 'track-widget';
  container.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:10;display:flex;gap:0;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.25);';

  // Video wrapper
  const videoWrap = document.createElement('div');
  videoWrap.style.cssText = 'position:relative;line-height:0;';

  const video = document.createElement('video');
  video.id = 'track-video';
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'width:320px;height:240px;transform:scaleX(-1);background:#000;display:block;';
  _videoEl = video;

  const overlay = document.createElement('canvas');
  overlay.id = 'track-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:320px;height:240px;transform:scaleX(-1);pointer-events:none;';
  _overlayEl = overlay;

  videoWrap.appendChild(video);
  videoWrap.appendChild(overlay);

  // Info panel
  const panel = document.createElement('div');
  panel.id = 'track-panel';
  panel.className = 'track-panel';
  panel.style.cssText = 'position:static;min-width:140px;';
  panel.innerHTML = `
    <div class="track-header">
      <span class="track-title">Hand Tracking</span>
      <span class="track-status" id="track-status">--</span>
    </div>
    <div class="track-body">
      <div class="track-row"><span class="track-label">Hand</span><span class="track-value" id="track-hand">--</span></div>
      <div class="track-row"><span class="track-label">FPS</span><span class="track-value" id="track-fps">--</span></div>
      <div class="track-row"><span class="track-label">β₁</span><span class="track-value" id="track-beta1">--</span></div>
      <div class="track-row"><span class="track-label">β₂</span><span class="track-value" id="track-beta2">--</span></div>
    </div>
    <button class="track-stop-btn" id="track-stop-btn">Stop</button>
  `;

  container.appendChild(videoWrap);
  container.appendChild(panel);
  viewport.appendChild(container);
}

function _removeVideoOverlay() {
  const el = document.getElementById('track-widget');
  if (el) el.remove();
  _videoEl = null;
  _overlayEl = null;
}

// ─── Camera start/stop ───

async function _startCamera() {
  _stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  _videoEl.srcObject = _stream;
  await new Promise(r => { _videoEl.onloadedmetadata = r; });
  await _videoEl.play();
  _overlayEl.width = _videoEl.videoWidth;
  _overlayEl.height = _videoEl.videoHeight;
}

function _stopCamera() {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  if (_videoEl) _videoEl.srcObject = null;
}

// ─── Calibration state machine ───

function _extractIndexAngles(wl, frame) {
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

function _updateCalib(wl, lm, raw) {
  const now = performance.now();
  const fist = isFist(wl);
  const inCZ = inCalibZone(lm);

  switch (_calibState.phase) {
    case 'idle':
      if (fist && inCZ) { _calibState.phase = 'fistHold'; _calibState.t0 = now; }
      break;
    case 'fistHold':
      if (!fist || !inCZ) { _calibState.phase = 'idle'; break; }
      if (now - _calibState.t0 >= 5000) {
        _calibState.phase = 'calibrating'; _calibState.t0 = now; _calibState.samples = [];
      }
      break;
    case 'calibrating': {
      if (now - _calibState.t0 >= 4000) {
        _calibState.samples.push({
          tipX: raw.tipPos.x, tipY: raw.tipPos.y, tipZ: raw.tipPos.z,
        });
      }
      if (now - _calibState.t0 >= 5000) {
        const n = _calibState.samples.length || 1;
        _calibBase = {
          tipX: _calibState.samples.reduce((s, v) => s + v.tipX, 0) / n,
          tipY: _calibState.samples.reduce((s, v) => s + v.tipY, 0) / n,
          tipZ: _calibState.samples.reduce((s, v) => s + v.tipZ, 0) / n,
        };
        _calibState.phase = 'calibrated';
      }
      break;
    }
    case 'calibrated':
      if (fist && inCZ) { _calibState.phase = 'fistHold'; _calibState.t0 = now; }
      break;
  }
}

// ─── Overlay drawing ───

function _overlayText(ctx, text, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  const a = ctx.textAlign;
  if (a === 'left') ctx.textAlign = 'right';
  else if (a === 'right') ctx.textAlign = 'left';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function _drawGuide(ctx, x, y, w, h, valid) {
  const r = 12;
  const color = valid ? 'rgba(76, 175, 80, 0.7)' : 'rgba(255, 152, 0, 0.5)';
  const bgColor = valid ? 'rgba(76, 175, 80, 0.06)' : 'rgba(255, 152, 0, 0.04)';

  ctx.fillStyle = bgColor;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();

  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke();
  ctx.setLineDash([]);

  const bLen = 20;
  ctx.lineWidth = 3; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - bLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + h - bLen); ctx.lineTo(x, y + h); ctx.lineTo(x + bLen, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - bLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - bLen); ctx.stroke();

  ctx.fillStyle = color; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  _overlayText(ctx, valid ? 'OK' : 'Place palm here', x + w / 2, y - 8);
  ctx.textAlign = 'left';
}

function _drawLandmarks(ctx, lm) {
  const w = _overlayEl.width, h = _overlayEl.height;
  for (const group of FINGER_GROUPS) {
    ctx.strokeStyle = group.color; ctx.lineWidth = 2;
    for (const [i, j] of group.edges) {
      ctx.beginPath(); ctx.moveTo(lm[i].x * w, lm[i].y * h); ctx.lineTo(lm[j].x * w, lm[j].y * h); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
  for (const [i, j] of PALM_EDGES) {
    ctx.beginPath(); ctx.moveTo(lm[i].x * w, lm[i].y * h); ctx.lineTo(lm[j].x * w, lm[j].y * h); ctx.stroke();
  }
  for (let i = 0; i < 21; i++) {
    let color = '#fff';
    for (const g of FINGER_GROUPS) { if (g.idx.includes(i)) { color = g.color; break; } }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lm[i].x * w, lm[i].y * h, i === 8 ? 6 : 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(lm[8].x * w, lm[8].y * h, 10, 0, Math.PI * 2); ctx.stroke();
}

function _drawCalibZone(ctx, W, H, active) {
  const cx = CALIB_ZONE.rx * W, cy = CALIB_ZONE.ry * H;
  const r = CALIB_ZONE.r * Math.min(W, H);
  const calibrated = _calibState.phase === 'calibrated';

  ctx.fillStyle = active ? 'rgba(255, 193, 7, 0.15)' : 'rgba(0,0,0,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = active ? '#ffc107' : (calibrated ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.3)');
  ctx.lineWidth = active ? 2.5 : 1.5;
  ctx.setLineDash(active ? [] : [6, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = active ? '#ffc107' : (calibrated ? '#4caf50' : 'rgba(255,255,255,0.5)');
  ctx.font = `${active ? 'bold ' : ''}9px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  _overlayText(ctx, calibrated ? 'CALIB' : 'CALIB', cx, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function _drawCalibProgress(ctx, W, H) {
  if (_calibState.phase === 'idle' || _calibState.phase === 'calibrated') return;
  const now = performance.now();
  const cx = W / 2, cy = 36;
  const barW = 260, barH = 10;
  const bx = cx - barW / 2;
  const isFistPhase = _calibState.phase === 'fistHold';
  const progress = Math.min(1, (now - _calibState.t0) / 5000);

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(bx - 14, cy - 20, barW + 28, 52, 8); ctx.fill();

  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = isFistPhase ? '#ffc107' : 'rgba(255,255,255,0.35)';
  _overlayText(ctx, isFistPhase ? '1. Hold fist' : '1. Hold fist done', bx + barW * 0.25, cy - 5);
  ctx.fillStyle = !isFistPhase ? '#4caf50' : 'rgba(255,255,255,0.35)';
  _overlayText(ctx, !isFistPhase ? (progress >= 0.8 ? '2. Sampling...' : '2. Open hand') : '2. Calibrate', bx + barW * 0.75, cy - 5);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(bx, cy + 8, barW, barH, 4); ctx.fill();

  ctx.fillStyle = isFistPhase ? '#ffc107' : '#4caf50';
  ctx.beginPath(); ctx.roundRect(bx, cy + 8, barW * progress, barH, 4); ctx.fill();

  if (!isFistPhase && progress > 0.8) {
    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.beginPath(); ctx.roundRect(bx + barW * 0.8, cy + 8, barW * 0.2, barH, 4); ctx.fill();
  }

  ctx.textAlign = 'left';
}

// ─── Panel helpers ───

function _showPanel() {}

function _hidePanel() {}

function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─── Detection loop ───

function _detectLoop() {
  const now = performance.now();

  if (!_stopped) {
    _fpsFrames++;
    if (now - _fpsStart >= 1000) {
      _fps = _fpsFrames;
      _fpsFrames = 0;
      _fpsStart = now;
      _setText('track-fps', `${_fps} FPS`);
    }

    if (_videoEl && _videoEl.readyState >= 2 && _videoEl.currentTime !== _lastVideoTime) {
      _lastVideoTime = _videoEl.currentTime;
      try {
        const result = _handLandmarker.detectForVideo(_videoEl, now);
        _processResult(result);
      } catch (e) {
        _setText('track-status', `Error: ${e.message}`);
      }
    }
  }

  _rafId = requestAnimationFrame(_detectLoop);
}

function _processResult(result) {
  const ctx = _overlayEl.getContext('2d');
  ctx.clearRect(0, 0, _overlayEl.width, _overlayEl.height);

  const W = _overlayEl.width, H = _overlayEl.height;
  const gw = W * 0.4, gh = H * 0.5;
  const gx = (W - gw) / 2, gy = (H - gh) / 2;

  if (!result.landmarks || result.landmarks.length === 0) {
    _drawGuide(ctx, gx, gy, gw, gh, false);
    _drawCalibZone(ctx, W, H, false);
    _setText('track-status', 'No hand');
    _setText('track-hand', '--');
    return;
  }

  const rhIdx = result.handednesses?.[0]?.findIndex(h => h.categoryName === 'Right') ?? -1;
  const idx = rhIdx >= 0 ? rhIdx : 0;
  const isRight = rhIdx >= 0;
  const lm = result.landmarks[idx];
  const wl = result.worldLandmarks[idx];

  _setText('track-hand', isRight ? 'Right' : 'Left (show right)');

  const PALM_LM = [0, 5, 9, 13, 17];
  const bx0 = gx / W, bx1 = (gx + gw) / W;
  const by0 = gy / H, by1 = (gy + gh) / H;
  const inBox = PALM_LM.every(i => lm[i].x > bx0 && lm[i].x < bx1 && lm[i].y > by0 && lm[i].y < by1);

  const frame = buildHandFrame(wl);
  const palmFacing = frame.z.z < -0.5;
  const valid = inBox && palmFacing;

  _drawGuide(ctx, gx, gy, gw, gh, valid);
  _drawLandmarks(ctx, lm);

  const raw = _extractIndexAngles(wl, frame);
  const inCZ = inCalibZone(lm);
  _updateCalib(wl, lm, raw);
  _drawCalibZone(ctx, W, H, inCZ && isFist(wl));
  _drawCalibProgress(ctx, W, H);

  if (!valid) {
    _setText('track-status', !inBox ? 'Move into box' : 'Face palm to camera');
    _setText('track-beta1', '--');
    _setText('track-beta2', '--');
    return;
  }

  if (_calibState.phase === 'fistHold') {
    const remain = Math.ceil((5000 - (performance.now() - _calibState.t0)) / 1000);
    _setText('track-status', `Hold fist... ${remain}s`);
    return;
  }
  if (_calibState.phase === 'calibrating') {
    const remain = Math.ceil((5000 - (performance.now() - _calibState.t0)) / 1000);
    _setText('track-status', `Calibrating... ${remain}s`);
    return;
  }

  if (!_calibBase) {
    _setText('track-status', 'Tracking (uncalibrated)');
    _setText('track-beta1', '--');
    _setText('track-beta2', '--');
    return;
  }

  _setText('track-status', 'Tracking');

  const t = performance.now() / 1000;
  const sTipX = _oef.tipX.filter(raw.tipPos.x, t);
  const sTipY = _oef.tipY.filter(raw.tipPos.y, t);
  const sTipZ = _oef.tipZ.filter(raw.tipPos.z, t);

  const dx = sTipX - _calibBase.tipX;
  const dy = sTipY - _calibBase.tipY;
  const dz = sTipZ - _calibBase.tipZ;

  const bend = -(dy + dz * 0.3) * 1000;
  const spread = dx * 1000;

  const bendScale = 1.5;
  const spreadScale = 2.0;

  let b1Target = bend * bendScale / 2 + spread * spreadScale / 2;
  let b2Target = bend * bendScale / 2 - spread * spreadScale / 2;
  b1Target = Math.max(0, Math.min(180, b1Target));
  b2Target = Math.max(0, Math.min(180, b2Target));

  // Use workspace.js grid lookup
  const lookup = findNearestU([b1Target, b2Target, 80]);
  if (lookup) {
    // lookup gives actual β from grid, but we need to translate β target to grid cell
    // findNearestU works in U-space (xyz positions), not β-space
    // So we do a direct grid cell search instead
  }

  // Direct grid search in β-space using S.gridData
  const gd = S.gridData;
  if (!gd) {
    _setText('track-beta1', '--');
    _setText('track-beta2', '--');
    _setText('track-status', 'No grid data');
    return;
  }

  const col = Math.round((b1Target - gd.from) / gd.step);
  const row = Math.round((b2Target - gd.from) / gd.step);
  let bestDist = Infinity, bestCol = 0, bestRow = 0;
  const searchR = 5;
  for (let dr = -searchR; dr <= searchR; dr++) {
    for (let dc = -searchR; dc <= searchR; dc++) {
      const c = col + dc, r = row + dr;
      if (c < 0 || c >= gd.res || r < 0 || r >= gd.res) continue;
      if (gd.grid[(r * gd.res + c) * 3 + 2] === 0) continue;
      const d = dc * dc + dr * dr;
      if (d < bestDist) { bestDist = d; bestCol = c; bestRow = r; }
    }
  }

  const b1 = gd.from + bestCol * gd.step;
  const b2 = gd.from + bestRow * gd.step;
  const gi = (bestRow * gd.res + bestCol) * 3;
  const theta = gd.grid[gi];
  const phi = gd.grid[gi + 1];

  _setText('track-beta1', b1.toFixed(0) + '°');
  _setText('track-beta2', b2.toFixed(0) + '°');

  // Update mechanism
  S.params.beta1 = b1;
  S.params.beta2 = b2;
  S.solverResult = { theta, phi };
  const pos = forwardPositions(S.params, theta, phi);
  S.kinematicPositions = pos;
  updatePositions(pos);
  updateWorkspaceMarker();
}

// ─── Public API ───

export async function enterTrackMode() {
  _showPanel();
  _setText('track-status', 'Loading MediaPipe...');

  try {
    await _initMediaPipe();
  } catch (e) {
    _setText('track-status', `MediaPipe error: ${e.message}`);
    return;
  }

  _createVideoOverlay();
  _setText('track-status', 'Starting camera...');

  try {
    await _startCamera();
  } catch (e) {
    _setText('track-status', `Camera error: ${e.message}`);
    _removeVideoOverlay();
    return;
  }

  // Check grid data exists
  if (!S.gridData) {
    _setText('track-status', 'No grid data — switch to Grid mode first');
  }

  // Bind Stop/Resume button after DOM is created
  const stopBtn = document.getElementById('track-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', toggleTrackPause);

  _setText('track-status', 'Tracking');
  _fpsStart = performance.now();
  _rafId = requestAnimationFrame(_detectLoop);
}

export function exitTrackMode() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  _stopCamera();
  _removeVideoOverlay();

  // Reset state
  _stopped = false;
  _calibState.phase = 'idle';
  _calibState.t0 = 0;
  _calibState.samples = [];
  _calibBase = null;
  for (const f of Object.values(_oef)) f.reset();
  _lastVideoTime = -1;

  _hidePanel();
}

export async function toggleTrackPause() {
  const btn = document.getElementById('track-stop-btn');
  if (!_stopped) {
    // Stop camera
    _stopped = true;
    _stopCamera();
    btn.textContent = 'Resume';
    btn.classList.add('stopped');
    _setText('track-status', 'Camera off');
    _setText('track-fps', '--');
  } else {
    // Resume camera
    btn.textContent = 'Starting...';
    btn.disabled = true;
    try {
      await _startCamera();
      _stopped = false;
      _lastVideoTime = -1;
      btn.textContent = 'Stop';
      btn.classList.remove('stopped');
      btn.disabled = false;
      _setText('track-status', 'Tracking');
      _fpsFrames = 0;
      _fpsStart = performance.now();
    } catch (e) {
      _setText('track-status', `Camera error: ${e.message}`);
      btn.textContent = 'Resume';
      btn.classList.add('stopped');
      btn.disabled = false;
    }
  }
}

export function bindTrackControls() {
  const btn = document.getElementById('track-stop-btn');
  if (btn) btn.addEventListener('click', toggleTrackPause);
}
