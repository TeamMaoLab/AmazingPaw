/**
 * 2D parameter space grid — solve (θ, ψ) for every (β₁, β₂) pair.
 *
 * Computes a grid of solve results, returns a typed array for fast rendering.
 */
import { solve } from '/static/explorer.js';
import { localCompute } from '/static/compute.js';

/**
 * Compute a β₁×β₂ grid. For each cell, try Newton-Raphson solve.
 *
 * @param {object} baseParams - growth params (theta/psi used as initial guess)
 * @param {number} L_rod2 - target rod length squared
 * @param {number} from - start angle (degrees)
 * @param {number} to - end angle (degrees)
 * @param {number} res - grid resolution (e.g. 70 for 70×70)
 * @param {function} onProgress(done, total) - optional progress callback
 * @returns {Promise<{grid: Float32Array, res: number, from: number, to: number, step: number}>}
 *   grid is row-major, res*res*3 floats per cell: [theta, psi, 0=nosol/1=ok]
 */
export function computeGrid(baseParams, L_rod2, from, to, res, onProgress) {
    return new Promise((resolve) => {
        const step = (to - from) / (res - 1);
        const grid = new Float32Array(res * res * 3);
        let row = 0;

        // use center of grid as initial guess (current params)
        const initTheta = baseParams.theta;
        const initPsi = baseParams.psi || 0;

        function processRow() {
            const end = Math.min(row + 2, res);  // 2 rows per batch
            for (; row < end; row++) {
                for (let col = 0; col < res; col++) {
                    const beta1 = from + col * step;
                    const beta2 = from + row * step;

                    // use neighboring solution as initial guess (left or above)
                    let guessT = initTheta, guessP = initPsi;
                    if (col > 0) {
                        const left = (row * res + col - 1) * 3;
                        if (grid[left + 2] > 0) { guessT = grid[left]; guessP = grid[left + 1]; }
                    } else if (row > 0) {
                        const above = ((row - 1) * res + col) * 3;
                        if (grid[above + 2] > 0) { guessT = grid[above]; guessP = grid[above + 1]; }
                    }

                    const result = solve(baseParams, beta1, beta2, L_rod2, guessT, guessP);
                    const idx = (row * res + col) * 3;
                    if (result) {
                        grid[idx] = result.theta;
                        grid[idx + 1] = result.psi;
                        grid[idx + 2] = 1;
                    } else {
                        grid[idx] = 0;
                        grid[idx + 1] = 0;
                        grid[idx + 2] = 0;
                    }
                }
            }

            if (onProgress) onProgress(row, res);

            if (row < res) {
                setTimeout(processRow, 0);
            } else {
                resolve({ grid, res, from, to, step });
            }
        }

        processRow();
    });
}

/**
 * Look up a grid cell by (β₁, β₂) and compute full mechanism state.
 *
 * @returns {{ theta, psi, data } | null}
 */
export function lookupAndCompute(baseParams, gridData, beta1, beta2) {
    const { grid, res, from, to, step } = gridData;
    const col = Math.round((beta1 - from) / step);
    const row = Math.round((beta2 - from) / step);
    if (col < 0 || col >= res || row < 0 || row >= res) return null;

    const idx = (row * res + col) * 3;
    if (grid[idx + 2] === 0) return null;  // no solution

    const theta = grid[idx];
    const psi = grid[idx + 1];
    const params = { ...baseParams, theta, psi, beta1, beta2 };
    const data = localCompute(params);
    return { theta, psi, data };
}
