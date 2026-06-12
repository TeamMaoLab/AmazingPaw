/**
 * Kinematic solver for the 8-body finger mechanism.
 *
 * Passive variables: θ (AB-axis rotation), φ (QP-body angle at P)
 * Active inputs:    β₁ (right servo), β₂ (left servo)
 * Constraints:      f₁ = |R-D|² - L_RD² = 0,  f₂ = |L-F|² - L_LF² = 0
 *
 * φ is the angle of PQ from +Z at P (φ=0 → Q directly above P).
 * The four-bar P-A-K-Q-P is closed by construction:
 *   Q from φ → K from circle-circle(A, L_AK)∩(Q, L_QK) → T from KATLR body
 */

const DEG = Math.PI / 180;

// ── Vector helpers ──

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dist2(a, b) { const d = sub(a, b); return d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; }
function dist(a, b) { return Math.sqrt(dist2(a, b)); }

// Rotate point about AB axis (through B, parallel to X) by theta radians.
function rotAboutAB(p, z0, theta) {
  const dy = p[1];
  const dz = p[2] - z0;
  const ct = Math.cos(theta), st = Math.sin(theta);
  return [p[0], dy * ct - dz * st, dy * st + dz * ct + z0];
}

// ── Precompute rigid body lengths from design configuration ──

function dist2D(a, b) { const dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }

function rigidBodyLengths(p) {
  const Ax = p.L_BP + p.L_PA;
  const z0 = p.z0;
  const designAngle = (p.alpha + p.gamma) * DEG;
  const Kx = Ax + p.L_AK * Math.cos(designAngle);
  const Kz = z0 + p.L_AK * Math.sin(designAngle);
  const Qx = p.L_BP;
  const Qz = z0 + p.L_PQ;
  const Ux = p.L_BP;
  const Uz = z0 + p.L_PQ + p.L_QU;
  return {
    L_QK: dist2D([Qx, Qz], [Kx, Kz]),
    L_UK: dist2D([Ux, Uz], [Kx, Kz]),
    designAngleAK: designAngle,
    angleKAT: p.gamma * DEG,  // ∠KAT = gamma, AT is clockwise from AK
    designCrossSign: (Kx - Qx) * (Uz - Qz) - (Kz - Qz) * (Ux - Qx) > 0,
  };
}

// ── Circle-circle intersection in 2D ──
// Returns both solutions, or null if no intersection.

function circleCircle2D(c1, r1, c2, r2) {
  const dx = c2[0] - c1[0];
  const dz = c2[1] - c1[1];
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.001 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, hSq));
  const mx = c1[0] + a * dx / d;
  const mz = c1[1] + a * dz / d;
  return [
    [mx + h * dz / d, mz - h * dx / d],
    [mx - h * dz / d, mz + h * dx / d],
  ];
}

// ── Design-position helper (used to inherit rod lengths) ──

export function computeDesignPositions(p) {
  const positions = {};
  positions.Origin = [0, 0, 0];
  positions.servo = [p.x_e, 0, 0];
  positions.servo_z = [p.x_e, 0, p.z_e];
  positions.servo_r = [p.x_e, p.y_e, p.z_e];
  positions.servo_l = [p.x_e, -p.y_e, p.z_e];

  const b1 = p.beta1 * DEG;
  positions.servo_arm_r = [p.x_e, p.y_e + p.R * Math.sin(b1), p.z_e + p.R * Math.cos(b1)];
  const b2 = p.beta2 * DEG;
  positions.servo_arm_l = [p.x_e, -p.y_e - p.R * Math.sin(b2), p.z_e + p.R * Math.cos(b2)];

  positions.finger_base = [0, 0, p.z0];
  positions.pivot = [p.L_BP, 0, p.z0];
  const Ax = p.L_BP + p.L_PA;
  positions.arm_end = [Ax, 0, p.z0];

  const aRad = p.alpha * DEG;
  positions.tip = [Ax + p.L_AT * Math.cos(aRad), 0, p.z0 + p.L_AT * Math.sin(aRad)];
  const absAngle = (p.alpha + p.gamma) * DEG;
  positions.plate_end = [Ax + p.L_AK * Math.cos(absAngle), 0, p.z0 + p.L_AK * Math.sin(absAngle)];

  positions.bar_r = [positions.tip[0], p.BarHalf, positions.tip[2]];
  positions.bar_l = [positions.tip[0], -p.BarHalf, positions.tip[2]];

  positions.arm_ext = [p.L_BP, 0, p.z0 + p.L_PQ];
  positions.link_joint = [p.L_BP, 0, p.z0 + p.L_PQ + p.L_QU];
  return positions;
}

// ── Forward kinematics ──
// Passive variables: theta_deg (AB rotation), phi_deg (QP body angle from +Z at P)

export function forwardPositions(p, theta_deg, phi_deg) {
  const theta = theta_deg * DEG;
  const phi = phi_deg * DEG;
  const z0 = p.z0;
  const Ax = p.L_BP + p.L_PA;
  const rbd = rigidBodyLengths(p);

  // Fixed points (on AB axis)
  const positions = {};
  positions.Origin = [0, 0, 0];
  positions.servo = [p.x_e, 0, 0];
  positions.servo_z = [p.x_e, 0, p.z_e];
  positions.servo_r = [p.x_e, p.y_e, p.z_e];
  positions.servo_l = [p.x_e, -p.y_e, p.z_e];
  positions.finger_base = [0, 0, z0];
  positions.pivot = [p.L_BP, 0, z0];
  positions.arm_end = [Ax, 0, z0];

  // Servo arm tips (independent of theta)
  const b1 = p.beta1 * DEG;
  positions.servo_arm_r = [p.x_e, p.y_e + p.R * Math.sin(b1), p.z_e + p.R * Math.cos(b1)];
  const b2 = p.beta2 * DEG;
  positions.servo_arm_l = [p.x_e, -p.y_e - p.R * Math.sin(b2), p.z_e + p.R * Math.cos(b2)];

  // Q from phi: angle of PQ from +Z at P
  const Qx = p.L_BP + p.L_PQ * Math.sin(phi);
  const Qz = z0 + p.L_PQ * Math.cos(phi);

  // K from four-bar closure: circle-circle(A, L_AK) ∩ (Q, L_QK) in XZ plane
  const A2d = [Ax, z0];
  const Q2d = [Qx, Qz];
  const kk = circleCircle2D(A2d, p.L_AK, Q2d, rbd.L_QK);

  let Kx, Kz, Ux, Uz;
  if (kk) {
    // Pick the K solution closest to design angle_AK
    const designAK = rbd.designAngleAK;
    const angle0 = Math.atan2(kk[0][1] - z0, kk[0][0] - Ax);
    const angle1 = Math.atan2(kk[1][1] - z0, kk[1][0] - Ax);
    const diff0 = Math.abs(angle0 - designAK);
    const diff1 = Math.abs(angle1 - designAK);
    // Handle angle wrapping
    const d0 = Math.min(diff0, 2 * Math.PI - diff0);
    const d1 = Math.min(diff1, 2 * Math.PI - diff1);
    const K2d = d0 <= d1 ? kk[0] : kk[1];
    Kx = K2d[0];
    Kz = K2d[1];

    // U from UQK rigid body: circle-circle(Q, L_QU) ∩ (K, L_UK)
    const uu = circleCircle2D(Q2d, p.L_QU, K2d, rbd.L_UK);
    if (uu) {
      // Pick U with same cross(QK, QU) sign as design — prevents branch flip
      const qkx = K2d[0] - Q2d[0], qkz = K2d[1] - Q2d[1];
      const cross0 = qkx * (uu[0][1] - Q2d[1]) - qkz * (uu[0][0] - Q2d[0]);
      const cross1 = qkx * (uu[1][1] - Q2d[1]) - qkz * (uu[1][0] - Q2d[0]);
      const U2d = (cross0 > 0) === rbd.designCrossSign ? uu[0] : uu[1];
      Ux = U2d[0];
      Uz = U2d[1];
    } else {
      // UQK can't close — shouldn't happen if QK closed
      Ux = Qx;
      Uz = Qz + p.L_QU;
    }
  } else {
    // Four-bar can't close — return positions with large error
    // Use design-like positions so rendering doesn't crash
    const designAngle = (p.alpha + p.gamma) * DEG;
    Kx = Ax + p.L_AK * Math.cos(designAngle);
    Kz = z0 + p.L_AK * Math.sin(designAngle);
    Ux = Qx;
    Uz = Qz + p.L_QU;
  }

  // KATLR body: T is at fixed angle from AK
  const angleAK = Math.atan2(Kz - z0, Kx - Ax);
  const angleAT = angleAK - rbd.angleKAT; // ∠KAT = gamma, AT is gamma clockwise from AK
  const Tx = Ax + p.L_AT * Math.cos(angleAT);
  const Tz = z0 + p.L_AT * Math.sin(angleAT);

  // Apply theta rotation to all non-fixed finger points
  positions.arm_ext = rotAboutAB([Qx, 0, Qz], z0, theta);
  positions.link_joint = rotAboutAB([Ux, 0, Uz], z0, theta);
  positions.plate_end = rotAboutAB([Kx, 0, Kz], z0, theta);
  positions.tip = rotAboutAB([Tx, 0, Tz], z0, theta);
  positions.bar_r = rotAboutAB([Tx, p.BarHalf, Tz], z0, theta);
  positions.bar_l = rotAboutAB([Tx, -p.BarHalf, Tz], z0, theta);

  // Stash passive variables and pre-rotation 2D points for physical validity check
  positions._theta_deg = theta_deg;
  positions._phi_deg = phi_deg;
  positions._preRot = {
    P: [p.L_BP, z0], A: [Ax, z0], Q: [Qx, Qz], K: [Kx, Kz],
  };

  return positions;
}

// ── Physical validity check ──
// Filters out mathematically valid but physically impossible configurations
// (e.g. four-bar flipped to wrong branch).

function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
  const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const dx = p3[0] - p1[0], dy = p3[1] - p1[1];
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function isPhysicallyValid(p, positions, initTheta, initPhi) {
  const z0 = p.z0;

  // 1. Plate end (K) must be above base plane
  const K = positions.plate_end;
  if (K[2] < z0) return false;

  // 2. QP and AK segments must intersect in XZ plane — four-bar not flipped
  const pre = positions._preRot;
  if (pre && !segmentsIntersect(pre.Q, pre.P, pre.A, pre.K)) return false;

  // 3. Acute angle between KA and QP lines >= 10° — near-singularity guard
  if (pre) {
    const kax = pre.K[0] - pre.A[0], kaz = pre.K[1] - pre.A[1];
    const qpx = pre.Q[0] - pre.P[0], qpz = pre.Q[1] - pre.P[1];
    const dot = kax * qpx + kaz * qpz;
    const mka = Math.sqrt(kax * kax + kaz * kaz);
    const mqp = Math.sqrt(qpx * qpx + qpz * qpz);
    if (mka > 0.001 && mqp > 0.001) {
      const cosA = Math.abs(dot) / (mka * mqp);
      const acute = Math.acos(Math.min(1, cosA)) / DEG;
      if (acute < 10) return false;
    }
  }

  // 4. theta continuity — reject if too far from initial guess
  const theta = positions._theta_deg;
  if (initTheta !== undefined && Math.abs(theta - initTheta) > 45) return false;

  return true;
}

// ── Constraint equations ──

export function constraintErrors(p, theta_deg, phi_deg, L_RD2, L_LF2) {
  const pos = forwardPositions(p, theta_deg, phi_deg);
  return [
    dist2(pos.bar_r, pos.servo_arm_r) - L_RD2,
    dist2(pos.bar_l, pos.servo_arm_l) - L_LF2,
  ];
}

// ── Numerical Jacobian ──

function constraintJacobian(p, theta_deg, phi_deg, L_RD2, L_LF2) {
  const eps = 0.001; // degrees
  const J = [[0, 0], [0, 0]];

  const f_t1 = constraintErrors(p, theta_deg + eps, phi_deg, L_RD2, L_LF2);
  const f_t2 = constraintErrors(p, theta_deg - eps, phi_deg, L_RD2, L_LF2);
  J[0][0] = (f_t1[0] - f_t2[0]) / (2 * eps);
  J[1][0] = (f_t1[1] - f_t2[1]) / (2 * eps);

  const f_p1 = constraintErrors(p, theta_deg, phi_deg + eps, L_RD2, L_LF2);
  const f_p2 = constraintErrors(p, theta_deg, phi_deg - eps, L_RD2, L_LF2);
  J[0][1] = (f_p1[0] - f_p2[0]) / (2 * eps);
  J[1][1] = (f_p1[1] - f_p2[1]) / (2 * eps);

  return J;
}

// ── Newton-Raphson solver ──

function solveConverge(p, beta1, beta2, L_RD2, L_LF2, initTheta, initPhi) {
  const tol = 1e-4;
  const maxIter = 50;
  let theta = initTheta;
  let phi = initPhi;

  const params = { ...p, beta1, beta2 };

  for (let i = 0; i < maxIter; i++) {
    const f = constraintErrors(params, theta, phi, L_RD2, L_LF2);
    const err = Math.abs(f[0]) + Math.abs(f[1]);
    if (err < tol) return { theta, phi };

    const J = constraintJacobian(params, theta, phi, L_RD2, L_LF2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (Math.abs(det) < 1e-12) return null;

    const dTheta = -(J[1][1] * f[0] - J[0][1] * f[1]) / det;
    const dPhi   = -(-J[1][0] * f[0] + J[0][0] * f[1]) / det;

    theta += dTheta;
    phi += dPhi;

    if (Math.abs(theta) > 180 || Math.abs(phi) > 180) return null;
  }

  // Loose acceptance for edge cases
  const fFinal = constraintErrors(params, theta, phi, L_RD2, L_LF2);
  if (Math.abs(fFinal[0]) + Math.abs(fFinal[1]) < 0.05) return { theta, phi };
  return null;
}

export function solve(p, beta1, beta2, L_RD2, L_LF2, initTheta, initPhi) {
  const params = { ...p, beta1, beta2 };
  const result = solveConverge(params, beta1, beta2, L_RD2, L_LF2, initTheta, initPhi);
  if (!result) return null;

  const pos = forwardPositions(params, result.theta, result.phi);
  if (!isPhysicallyValid(params, pos, initTheta, initPhi)) return null;

  return result;
}

// ── Sweep (batch frames for animation) ──

export function sweep(p, L_RD2, L_LF2, driveParam, from, to, step, onProgress) {
  return new Promise((resolve) => {
    const frames = [];
    let prevTheta = 0;
    let prevPhi = 0;
    const coupledParam = driveParam === 'beta1' ? 'beta2' : 'beta1';

    const steps = [];
    const positive = step > 0;
    for (let val = from; positive ? val <= to + step * 0.01 : val >= to + step * 0.01; val += step) {
      steps.push(Math.abs(val - to) < Math.abs(step) * 0.01 ? to : val);
    }
    const total = steps.length;
    const batchSize = 5;
    let idx = 0;

    function processBatch() {
      const end = Math.min(idx + batchSize, total);
      for (; idx < end; idx++) {
        const v = steps[idx];
        const beta1 = driveParam === 'beta1' ? v : p[coupledParam];
        const beta2 = driveParam === 'beta1' ? p[coupledParam] : v;

        const result = solve(p, beta1, beta2, L_RD2, L_LF2, prevTheta, prevPhi);
        if (!result) continue;

        prevTheta = result.theta;
        prevPhi = result.phi;

        const frameParams = { ...p, beta1, beta2 };
        const positions = forwardPositions(frameParams, result.theta, result.phi);
        frames.push({ beta1, beta2, theta: result.theta, phi: result.phi, positions });
      }

      if (onProgress) onProgress(frames.length, total);
      if (idx < total) {
        setTimeout(processBatch, 0);
      } else {
        resolve({ frames, failedAt: null });
      }
    }

    processBatch();
  });
}

// ── Grid computation ──
// Strategy: seed from design beta point, then spiral outward for good initial guesses,
// then fill remaining cells row-by-row using neighbor propagation.

export function computeGrid(p, L_RD2, L_LF2, from, to, gridStep, onProgress) {
  return new Promise((resolve) => {
    const res = Math.round((to - from) / gridStep) + 1;
    const step = (to - from) / (res - 1);
    const grid = new Float32Array(res * res * 3); // [theta, phi, status]

    // Seed: solve at design beta values
    const seedCol = Math.round((p.beta1 - from) / step);
    const seedRow = Math.round((p.beta2 - from) / step);
    const seedResult = solveConverge({ ...p, beta1: p.beta1, beta2: p.beta2 }, p.beta1, p.beta2, L_RD2, L_LF2, 0, 0);

    if (seedResult && isPhysicallyValid(p, forwardPositions({ ...p, beta1: p.beta1, beta2: p.beta2 }, seedResult.theta, seedResult.phi))) {
      const seedIdx = (seedRow * res + seedCol) * 3;
      grid[seedIdx] = seedResult.theta;
      grid[seedIdx + 1] = seedResult.phi;
      grid[seedIdx + 2] = 1;

      // BFS outward from seed
      const visited = new Uint8Array(res * res);
      visited[seedRow * res + seedCol] = 1;
      const queue = [[seedCol, seedRow]];
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      let qi = 0;

      while (qi < queue.length) {
        const [cc, cr] = queue[qi++];
        const curIdx = (cr * res + cc) * 3;
        if (grid[curIdx + 2] === 0) continue;
        const guessT = grid[curIdx], guessP = grid[curIdx + 1];

        for (const [dc, dr] of dirs) {
          const nc = cc + dc, nr = cr + dr;
          if (nc < 0 || nc >= res || nr < 0 || nr >= res) continue;
          if (visited[nr * res + nc]) continue;
          visited[nr * res + nc] = 1;

          const b1 = from + nc * step, b2 = from + nr * step;
          const result = solve(p, b1, b2, L_RD2, L_LF2, guessT, guessP);
          const nIdx = (nr * res + nc) * 3;
          if (result) {
            grid[nIdx] = result.theta;
            grid[nIdx + 1] = result.phi;
            grid[nIdx + 2] = 1;
          }
          queue.push([nc, nr]);
        }
      }
    }

    if (onProgress) onProgress(res, res);
    resolve({ grid, res, from, to, step });
  });
}

// ── Grid lookup ──

export function gridLookup(p, gridData, beta1, beta2) {
  const { grid, res, from, to, step } = gridData;
  const col = Math.round((beta1 - from) / step);
  const row = Math.round((beta2 - from) / step);
  if (col < 0 || col >= res || row < 0 || row >= res) return null;

  const idx = (row * res + col) * 3;
  if (grid[idx + 2] === 0) return null;

  const theta = grid[idx];
  const phi = grid[idx + 1];
  return { theta, phi, positions: forwardPositions({ ...p, beta1, beta2 }, theta, phi) };
}
