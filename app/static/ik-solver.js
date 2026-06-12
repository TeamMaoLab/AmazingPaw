/**
 * Inverse kinematics — Damped Least Squares for (β₁, β₂).
 * Given target U position, iteratively solves servo angles.
 * Inner loop reuses Newton-Raphson solve() for (θ, φ).
 */
import { solve, forwardPositions } from './solver.js';

export function solveIK(params, targetU, L_RD2, L_LF2, initB1, initB2, initT, initP) {
  let beta1 = initB1;
  let beta2 = initB2;
  let theta = initT || 0;
  let phi = initP || 0;

  const maxIter = 40;
  const tol = 0.5;       // mm (loose enough for responsive drag)
  const eps = 0.1;       // degrees for numerical Jacobian
  const lambda = 0.01;   // light damping — let Newton step freely

  for (let iter = 0; iter < maxIter; iter++) {
    // Forward solve at current (β₁, β₂)
    const result = solve({ ...params, beta1, beta2 }, beta1, beta2, L_RD2, L_LF2, theta, phi);
    if (!result) return _fallback(params, targetU, L_RD2, L_LF2, beta1, beta2, theta, phi);
    theta = result.theta;
    phi = result.phi;

    const pos = forwardPositions({ ...params, beta1, beta2 }, theta, phi);
    const U = pos.link_joint;

    // Error vector e = U_target - U_actual
    const ex = targetU[0] - U[0];
    const ey = targetU[1] - U[1];
    const ez = targetU[2] - U[2];
    const err = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (err < tol) {
      return { beta1, beta2, theta, phi, error: err, positions: pos };
    }

    // Numerical Jacobian (3×2): perturb each β independently
    const r1 = solve({ ...params, beta1: beta1 + eps, beta2 }, beta1 + eps, beta2, L_RD2, L_LF2, theta, phi);
    if (!r1) return _fallback(params, targetU, L_RD2, L_LF2, beta1, beta2, theta, phi);
    const U1 = forwardPositions({ ...params, beta1: beta1 + eps, beta2 }, r1.theta, r1.phi).link_joint;
    const J11 = (U1[0] - U[0]) / eps, J21 = (U1[1] - U[1]) / eps, J31 = (U1[2] - U[2]) / eps;

    const r2 = solve({ ...params, beta1, beta2: beta2 + eps }, beta1, beta2 + eps, L_RD2, L_LF2, theta, phi);
    if (!r2) return _fallback(params, targetU, L_RD2, L_LF2, beta1, beta2, theta, phi);
    const U2 = forwardPositions({ ...params, beta1, beta2: beta2 + eps }, r2.theta, r2.phi).link_joint;
    const J12 = (U2[0] - U[0]) / eps, J22 = (U2[1] - U[1]) / eps, J32 = (U2[2] - U[2]) / eps;

    // Normal equations: (JᵀJ + λI) Δβ = Jᵀe  — 2×2 system
    const JtJ00 = J11 * J11 + J21 * J21 + J31 * J31 + lambda;
    const JtJ01 = J11 * J12 + J21 * J22 + J31 * J32;
    const JtJ11 = J12 * J12 + J22 * J22 + J32 * J32 + lambda;
    const Jte0 = J11 * ex + J21 * ey + J31 * ez;
    const Jte1 = J12 * ex + J22 * ey + J32 * ez;

    const det = JtJ00 * JtJ11 - JtJ01 * JtJ01;
    if (Math.abs(det) < 1e-12) return null;

    beta1 += (JtJ11 * Jte0 - JtJ01 * Jte1) / det;
    beta2 += (JtJ00 * Jte1 - JtJ01 * Jte0) / det;
    beta1 = Math.max(0, Math.min(180, beta1));
    beta2 = Math.max(0, Math.min(180, beta2));
  }

  return null; // did not converge
}

// If Newton gets stuck (inner solve fails), try a coarse search around current β
function _fallback(params, targetU, L_RD2, L_LF2, beta1, beta2, theta, phi) {
  let bestErr = Infinity, bestResult = null;
  for (let db1 = -3; db1 <= 3; db1 += 3) {
    for (let db2 = -3; db2 <= 3; db2 += 3) {
      const b1 = Math.max(0, Math.min(180, beta1 + db1));
      const b2 = Math.max(0, Math.min(180, beta2 + db2));
      const r = solve({ ...params, beta1: b1, beta2: b2 }, b1, b2, L_RD2, L_LF2, theta, phi);
      if (!r) continue;
      const pos = forwardPositions({ ...params, beta1: b1, beta2: b2 }, r.theta, r.phi);
      const U = pos.link_joint;
      const err = Math.sqrt((targetU[0]-U[0])**2 + (targetU[1]-U[1])**2 + (targetU[2]-U[2])**2);
      if (err < bestErr) { bestErr = err; bestResult = { beta1: b1, beta2: b2, theta: r.theta, phi: r.phi, error: err, positions: pos }; }
    }
  }
  return bestResult;
}
