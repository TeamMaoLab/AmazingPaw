/**
 * Motion explorer — 2×2 Newton-Raphson constraint solver + sweep + animation.
 *
 * The mechanism is 2-DOF: β₁, β₂ drive two servos.
 * Passive variables (θ, ψ) are solved from rod-length constraints f₁=0, f₂=0.
 */
import { localCompute, constraintErrors, constraintJacobian } from '/static/compute.js';

/**
 * Solve (θ, ψ) from f₁=0, f₂=0 given (β₁, β₂).
 */
export function solve(baseParams, beta1, beta2, L_rod2, initTheta, initPsi) {
    const tol = 1e-4;
    const maxIter = 50;
    let theta = initTheta;
    let psi = initPsi;

    for (let i = 0; i < maxIter; i++) {
        const p = { ...baseParams, theta, psi, beta1, beta2 };
        const f = constraintErrors(p, L_rod2);
        const err = Math.abs(f[0]) + Math.abs(f[1]);
        if (err < tol) return { theta, psi };

        const J = constraintJacobian(p, L_rod2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) < 1e-12) return null;

        const dTheta = -(J[1][1] * f[0] - J[0][1] * f[1]) / det;
        const dPsi   = -(-J[1][0] * f[0] + J[0][0] * f[1]) / det;

        theta += dTheta;
        psi += dPsi;

        if (Math.abs(theta) > 180 || Math.abs(psi) > 180) return null;
    }

    const pFinal = { ...baseParams, theta, psi, beta1, beta2 };
    const fFinal = constraintErrors(pFinal, L_rod2);
    if (Math.abs(fFinal[0]) + Math.abs(fFinal[1]) < 0.05) return { theta, psi };

    return null;
}

/**
 * Async sweep — computes frames in batches, calls onProgress between batches.
 * Returns a promise that resolves with { frames, failedAt }.
 *
 * @param {object} baseParams
 * @param {number} L_rod2
 * @param {string} driveParam - 'beta1' or 'beta2'
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @param {function} onProgress(framesSoFar, totalSteps, currentVal) - called between batches
 * @returns {Promise<{frames: Array, failedAt: number|null}>}
 */
export function sweep(baseParams, L_rod2, driveParam, from, to, step, onProgress) {
    return new Promise((resolve) => {
        const frames = [];
        let prevTheta = baseParams.theta;
        let prevPsi = baseParams.psi || 0;
        const coupledParam = driveParam === 'beta1' ? 'beta2' : 'beta1';

        // build step list (handles both positive and negative step)
        const steps = [];
        const positive = step > 0;
        for (let val = from; positive ? val <= to + step * 0.01 : val >= to + step * 0.01; val += step) {
            steps.push(Math.abs(val - to) < Math.abs(step) * 0.01 ? to : val);
        }
        const total = steps.length;
        const batchSize = 5;  // frames per batch
        let idx = 0;

        function processBatch() {
            const end = Math.min(idx + batchSize, total);
            for (; idx < end; idx++) {
                const v = steps[idx];
                const beta1 = driveParam === 'beta1' ? v : baseParams[coupledParam];
                const beta2 = driveParam === 'beta1' ? baseParams[coupledParam] : v;

                const result = solve(baseParams, beta1, beta2, L_rod2, prevTheta, prevPsi);
                if (!result) continue;  // skip unsolvable points

                prevTheta = result.theta;
                prevPsi = result.psi;

                const finalParams = { ...baseParams, theta: result.theta, psi: result.psi, beta1, beta2 };
                const data = localCompute(finalParams);
                frames.push({
                    paramValue: v,
                    driveParam,
                    solvedTheta: result.theta,
                    solvedPsi: result.psi,
                    ...data,
                });
            }

            const currentVal = idx < total ? steps[idx] : steps[total - 1];
            if (onProgress) onProgress(frames.length, total, currentVal);

            if (idx < total) {
                setTimeout(processBatch, 0);
            } else {
                resolve({ frames, failedAt: null });
            }
        }

        processBatch();
    });
}

/**
 * Animator — plays frames via requestAnimationFrame.
 */
export function createAnimator() {
    let animId = null;
    let playing = false;
    let frameIdx = 0;
    let frames = [];
    let onFrame = null;

    function step() {
        if (!playing) return;
        if (frameIdx >= frames.length) frameIdx = 0;
        onFrame(frames[frameIdx], frameIdx);
        frameIdx++;
        animId = requestAnimationFrame(step);
    }

    return {
        start(f, callback) {
            frames = f;
            onFrame = callback;
            frameIdx = 0;
            playing = true;
            step();
        },
        stop() {
            playing = false;
            if (animId) cancelAnimationFrame(animId);
            animId = null;
        },
        isPlaying() { return playing; },
        setFrame(i) { frameIdx = i; },
    };
}
