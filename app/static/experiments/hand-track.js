/**
 * Hand tracking experiment — MediaPipe HandLandmarker → hand local frame → joint angles → β mapping.
 * Standalone page, no dependency on main app modules.
 */

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
function smooth(prev, raw, alpha) {
  if (prev === null) return raw;
  return prev * (1 - alpha) + raw * alpha;
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

// Smoothing state
let sMcp = null, sPip = null, sDip = null;
let sTipX = null, sTipY = null, sTipZ = null;
const ALPHA = 0.4;

// ─── DOM refs ───

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const frameCanvas = document.getElementById('frame-canvas');
const betaCanvas = document.getElementById('beta-canvas');
const loadingEl = document.getElementById('loading');

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
      numHands: 1,
      runningMode: 'VIDEO',
    });
  } catch {
    // Fallback to CPU if GPU fails
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'CPU',
      },
      numHands: 1,
      runningMode: 'VIDEO',
    });
  }

  loadingEl.textContent = 'Starting camera...';

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  await new Promise(r => { video.onloadedmetadata = r; });
  await video.play();

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  loadingEl.style.display = 'none';
  document.getElementById('status').textContent = 'Tracking';

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

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
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

  if (!result.landmarks || result.landmarks.length === 0) {
    resetDisplay();
    return;
  }

  const lm = result.landmarks[0];
  const wl = result.worldLandmarks[0];

  // Handedness
  if (result.handednesses && result.handednesses[0] && result.handednesses[0][0]) {
    const h = result.handednesses[0][0];
    document.getElementById('handedness').textContent = `${h.categoryName} (${(h.score * 100).toFixed(0)}%)`;
  }

  document.getElementById('status').textContent = 'Tracking';

  drawLandmarks(ctx, lm);
  const frame = buildHandFrame(wl);
  drawLocalFrame(wl, frame);

  const raw = extractIndexAngles(wl, frame);

  // Smooth
  sMcp = smooth(sMcp, raw.mcpAngle, ALPHA);
  sPip = smooth(sPip, raw.pipAngle, ALPHA);
  sDip = smooth(sDip, raw.dipAngle, ALPHA);
  sTipX = smooth(sTipX, raw.tipPos.x, ALPHA);
  sTipY = smooth(sTipY, raw.tipPos.y, ALPHA);
  sTipZ = smooth(sTipZ, raw.tipPos.z, ALPHA);

  // Display angles
  document.getElementById('mcp-angle').textContent = sMcp.toFixed(1) + '°';
  document.getElementById('pip-angle').textContent = sPip.toFixed(1) + '°';
  document.getElementById('dip-angle').textContent = sDip.toFixed(1) + '°';

  // Display fingertip position (mm)
  document.getElementById('tip-x').textContent = (sTipX * 1000).toFixed(1) + ' mm';
  document.getElementById('tip-y').textContent = (sTipY * 1000).toFixed(1) + ' mm';
  document.getElementById('tip-z').textContent = (sTipZ * 1000).toFixed(1) + ' mm';

  // β mapping: MCP flexion → β₁, PIP flexion → β₂
  // MCP range ~0-90° → scale to 0-180
  // PIP range ~0-110° → scale to 0-180
  const b1 = Math.max(0, Math.min(180, sMcp * 2));
  const b2 = Math.max(0, Math.min(180, sPip * (180 / 110)));

  document.getElementById('beta1').textContent = b1.toFixed(1) + '°';
  document.getElementById('beta2').textContent = b2.toFixed(1) + '°';

  drawBetaSpace(b1, b2);
}

function resetDisplay() {
  for (const id of ['mcp-angle', 'pip-angle', 'dip-angle', 'tip-x', 'tip-y', 'tip-z', 'beta1', 'beta2']) {
    document.getElementById(id).textContent = '--';
  }
  sMcp = sPip = sDip = null;
  sTipX = sTipY = sTipZ = null;
  document.getElementById('handedness').textContent = 'No hand';
  document.getElementById('status').textContent = 'Searching...';
}

// ─── Drawing: video overlay ───

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

// ─── Drawing: hand local frame ───

function drawLocalFrame(wl, frame) {
  const ctx = frameCanvas.getContext('2d');
  const W = frameCanvas.width, H = frameCanvas.height;
  const cx = W / 2, cy = H / 2;
  const scale = 1800; // 1m = 1800px (hand ~0.1m → ~180px)

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1;
  for (let g = -5; g <= 5; g++) {
    const p = g * 0.02 * scale; // 20mm grid
    ctx.beginPath();
    ctx.moveTo(cx + p, 0); ctx.lineTo(cx + p, H);
    ctx.moveTo(0, cy + p); ctx.lineTo(W, cy + p);
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy); ctx.lineTo(W, cy);
  ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
  ctx.stroke();

  ctx.fillStyle = '#444';
  ctx.font = '10px monospace';
  ctx.fillText('+X (pinky)', W - 65, cy - 4);
  ctx.fillText('+Y (fwd)', cx + 4, 12);

  const local = wl.map(p => toLocal(p, frame));
  function toCanvas(p) {
    return { x: cx + p.x * scale, y: cy - p.y * scale };
  }

  // Skeleton connections
  for (const group of FINGER_GROUPS) {
    ctx.strokeStyle = group.color;
    ctx.lineWidth = 2;
    for (const [i, j] of group.edges) {
      const a = toCanvas(local[i]), b = toCanvas(local[j]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  for (const [i, j] of PALM_EDGES) {
    const a = toCanvas(local[i]), b = toCanvas(local[j]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Points
  for (let i = 0; i < 21; i++) {
    let color = '#fff';
    for (const g of FINGER_GROUPS) {
      if (g.idx.includes(i)) { color = g.color; break; }
    }
    const p = toCanvas(local[i]);
    const r = (i === 8) ? 5 : 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Local frame axes at wrist
  const o = toCanvas(local[0]);
  const aLen = 30;

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + aLen, o.y); ctx.stroke();
  ctx.fillStyle = '#ff4444';
  ctx.fillText('X', o.x + aLen + 3, o.y + 4);

  ctx.strokeStyle = '#44ff44';
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y - aLen); ctx.stroke();
  ctx.fillStyle = '#44ff44';
  ctx.fillText('Y', o.x + 3, o.y - aLen - 3);
}

// ─── Drawing: β space ───

function drawBetaSpace(b1, b2) {
  const ctx = betaCanvas.getContext('2d');
  const W = betaCanvas.width, H = betaCanvas.height;
  const m = 30;
  const pw = W - m * 2, ph = H - m * 2;

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Grid lines every 30°
  ctx.strokeStyle = '#1a1a2e';
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
  ctx.strokeStyle = '#333';
  ctx.strokeRect(m, m, pw, ph);

  // Labels
  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('0°', m, m + ph + 14);
  ctx.fillText('180°', m + pw, m + ph + 14);
  ctx.fillText('β₁ →', m + pw / 2, m + ph + 14);
  ctx.textAlign = 'right';
  ctx.fillText('0°', m - 4, m + 4);
  ctx.fillText('180°', m - 4, m + ph + 4);
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
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
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
