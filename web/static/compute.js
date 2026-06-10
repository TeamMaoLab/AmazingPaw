/**
 * Pure math — JS mirror of Python compute() for instant slider preview.
 */
export function localCompute(params) {
    const deg = Math.PI / 180;
    const z0 = params.z0, L_cp = params.L_cp, L_A = params.L_A, L_Q = params.L_Q, L_U = params.L_U, L_T = params.L_T, L_B = params.L_B;
    const theta = params.theta * deg, alpha = params.alpha * deg, gamma = params.gamma * deg;
    const x_e = params.x_e, y_e = params.y_e, z_e = params.z_e;
    const R = params.R, beta1 = params.beta1 * deg, beta2 = params.beta2 * deg;

    const B_pos = [0, 0, z0];
    const P_pos = [L_cp, 0, z0];

    const ct = Math.cos(theta), st = Math.sin(theta);
    const xA = L_A * Math.sin(alpha), zA = L_A * Math.cos(alpha);

    const mul = (m, v) => [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
    const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
    const Rx = [1,0,0, 0,ct,-st, 0,st,ct];

    const A_world = add(P_pos, mul(Rx, [xA, 0, zA]));
    const xQ = L_Q * Math.sin(gamma), zQ = L_Q * Math.cos(gamma);
    const Q_world = add(P_pos, mul(Rx, [xQ, 0, zQ]));
    const U_world = add(P_pos, mul(Rx, [0, 0, L_U]));
    const T_world = add(P_pos, mul(Rx, [0, 0, L_U + L_T]));
    const R_world = add(P_pos, mul(Rx, [xA, L_B/2, zA]));
    const L_world = add(P_pos, mul(Rx, [xA, -L_B/2, zA]));

    const C_pos = [x_e, y_e, z_e];
    const E_pos = [x_e, -y_e, z_e];
    const D_pos = add(C_pos, [0, R*Math.cos(beta1), R*Math.sin(beta1)]);
    const F_pos = add(E_pos, [0, R*Math.cos(beta2), R*Math.sin(beta2)]);

    const dist = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
    const I3 = [[1,0,0],[0,1,0],[0,0,1]];
    const RxT = [1,0,0, 0,ct,st, 0,-st,ct];
    const axesMat = (m) => [[m[0],m[1],m[2]],[m[3],m[4],m[5]],[m[6],m[7],m[8]]];

    return {
        points: {
            origin: [0,0,0], B: B_pos, P: P_pos,
            A: A_world, Q: Q_world, U: U_world, T: T_world,
            R: R_world, L: L_world,
            C: C_pos, E: E_pos, D: D_pos, F: F_pos,
            rot_axis_start: add(P_pos, [-25, 0, 0]),
            rot_axis_end: add(P_pos, [25, 0, 0]),
        },
        frames: {
            world: { origin: [0,0,0], axes: I3 },
            B: { origin: B_pos, axes: I3 },
            P: { origin: P_pos, axes: I3 },
            Rk: { origin: P_pos, axes: axesMat(RxT) },
            C: { origin: C_pos, axes: I3 },
            E: { origin: E_pos, axes: I3 },
        },
        link_lengths: {
            right: Math.round(dist(R_world, D_pos) * 10000) / 10000,
            left: Math.round(dist(L_world, F_pos) * 10000) / 10000,
        },
    };
}
