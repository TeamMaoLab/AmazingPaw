/**
 * Forward kinematics + constraint equations for the finger mechanism.
 *
 * Arm is a rigid body at P with 2 rotational DOFs:
 *   θ (X-axis, from bearing at B via BP bar)
 *   ψ (Y-axis, whole arm body rotates)
 *
 * Effective angles: α = α₀ + ψ,  γ = γ₀ + ψ
 * PA-PQ angle δ = α₀ - γ₀ is constant (rigid body).
 */
const deg = Math.PI / 180;

// 3x3 matrix × 3-vector (flat array [row0, row1, row2])
function mul(m, v) {
    return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
            m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
            m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
}
function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function dist2(a, b) { const d=sub(a,b); return d[0]*d[0]+d[1]*d[1]+d[2]*d[2]; }

function Rx(t) {
    const c=Math.cos(t), s=Math.sin(t);
    return [1,0,0, 0,c,-s, 0,s,c];
}
function Ry(a) {
    const c=Math.cos(a), s=Math.sin(a);
    return [c,0,s, 0,1,0, -s,0,c];
}

export function localCompute(params) {
    const z0 = params.z0;
    const L_BP = params.L_BP ?? params.L_cp;
    const L_A = params.L_A, L_Q = params.L_Q;
    const L_U = params.L_U, L_T = params.L_T, L_B = params.L_B;
    const alpha0 = (params.alpha0 ?? params.alpha) * deg;
    const gamma0 = (params.gamma0 ?? params.gamma) * deg;
    const theta = params.theta * deg;
    const psi = (params.psi ?? 0) * deg;
    const beta1 = params.beta1 * deg, beta2 = params.beta2 * deg;
    const x_e = params.x_e, y_e = params.y_e, z_e = params.z_e, R = params.R;

    // effective angles
    const alpha = alpha0 + psi;
    const gamma = gamma0 + psi;

    // fixed points
    const P_pos = [L_BP, 0, z0];
    const B_pos = [0, 0, z0];

    // arm local coords (before Rx)
    const sa = Math.sin(alpha), ca = Math.cos(alpha);
    const sg = Math.sin(gamma), cg = Math.cos(gamma);
    const a0 = [L_A*sa, 0, L_A*ca];
    const q0 = [L_Q*sg, 0, L_Q*cg];
    const r0 = [L_A*sa,  L_B/2, L_A*ca];
    const l0 = [L_A*sa, -L_B/2, L_A*ca];

    // U and T: initial local coords rotated by Ry(psi)
    const u0 = Ry(psi);  // Ry applied to (0,0,L_U)
    const u_local = mul(u0, [0, 0, L_U]);
    const t_local = mul(u0, [0, 0, L_U + L_T]);

    // world positions
    const Rmat = Rx(theta);
    const A_world = add(P_pos, mul(Rmat, a0));
    const Q_world = add(P_pos, mul(Rmat, q0));
    const U_world = add(P_pos, mul(Rmat, u_local));
    const T_world = add(P_pos, mul(Rmat, t_local));
    const R_world = add(P_pos, mul(Rmat, r0));
    const L_world = add(P_pos, mul(Rmat, l0));

    const C_pos = [x_e,  y_e, z_e];
    const E_pos = [x_e, -y_e, z_e];
    const D_pos = add(C_pos, [0, R*Math.cos(beta1), R*Math.sin(beta1)]);
    const F_pos = add(E_pos, [0, R*Math.cos(beta2), R*Math.sin(beta2)]);

    const I3 = [[1,0,0],[0,1,0],[0,0,1]];
    const ct = Math.cos(theta), st = Math.sin(theta);
    const RxT = [1,0,0, 0,ct,st, 0,-st,ct];
    const axesMat = (m) => [[m[0],m[1],m[2]],[m[3],m[4],m[5]],[m[6],m[7],m[8]]];

    return {
        points: {
            origin: [0,0,0], B: B_pos, P: P_pos,
            A: A_world, Q: Q_world, U: U_world, T: T_world,
            R: R_world, L: L_world,
            C: C_pos, E: E_pos, D: D_pos, F: F_pos,
            rot_axis_start: add(P_pos, [-25, 0, 0]),
            rot_axis_end:   add(P_pos, [ 25, 0, 0]),
        },
        frames: {
            world: { origin: [0,0,0], axes: I3 },
            B:     { origin: B_pos,   axes: I3 },
            P:     { origin: P_pos,   axes: I3 },
            Rk:    { origin: P_pos,   axes: axesMat(RxT) },
            C:     { origin: C_pos,   axes: I3 },
            E:     { origin: E_pos,   axes: I3 },
        },
        link_lengths: {
            right: Math.round(Math.sqrt(dist2(R_world, D_pos)) * 10000) / 10000,
            left:  Math.round(Math.sqrt(dist2(L_world, F_pos)) * 10000) / 10000,
        },
    };
}

/**
 * Constraint errors: f1 = |R-D|² - Lrod²,  f2 = |L-F|² - Lrod²
 * Returns [f1, f2].
 */
export function constraintErrors(params, L_rod2) {
    const data = localCompute(params);
    const pts = data.points;
    return [
        dist2(pts.R, pts.D) - L_rod2,
        dist2(pts.L, pts.F) - L_rod2,
    ];
}

/**
 * Jacobian of [f1, f2] w.r.t. [theta, psi] (both in degrees).
 * Uses central finite differences.
 * Returns [[df1/dtheta, df1/dpsi], [df2/dtheta, df2/dpsi]].
 */
export function constraintJacobian(params, L_rod2) {
    const eps_t = 0.001;  // degrees
    const eps_p = 0.001;
    const J = [[0,0],[0,0]];

    // df/dtheta
    const p_t1 = {...params, theta: params.theta + eps_t};
    const p_t2 = {...params, theta: params.theta - eps_t};
    const f_t1 = constraintErrors(p_t1, L_rod2);
    const f_t2 = constraintErrors(p_t2, L_rod2);
    J[0][0] = (f_t1[0] - f_t2[0]) / (2 * eps_t);
    J[1][0] = (f_t1[1] - f_t2[1]) / (2 * eps_t);

    // df/dpsi
    const p_p1 = {...params, psi: params.psi + eps_p};
    const p_p2 = {...params, psi: params.psi - eps_p};
    const f_p1 = constraintErrors(p_p1, L_rod2);
    const f_p2 = constraintErrors(p_p2, L_rod2);
    J[0][1] = (f_p1[0] - f_p2[0]) / (2 * eps_p);
    J[1][1] = (f_p1[1] - f_p2[1]) / (2 * eps_p);

    return J;
}
