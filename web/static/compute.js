/**
 * Pure math — JS mirror of Python compute() for instant slider preview.
 */
export function localCompute(params) {
    const deg = Math.PI / 180;
    const z0 = params.z0, L_cp = params.L_cp, L_A = params.L_A, L_P = params.L_P, L_U = params.L_U, L_B = params.L_B;
    const theta = params.theta * deg, alpha = params.alpha * deg, gamma = params.gamma * deg;
    const x_e = params.x_e, y_e = params.y_e, z_e = params.z_e;
    const R = params.R, beta1 = params.beta1 * deg, beta2 = params.beta2 * deg;

    const base_pos = [0, 0, z0];
    const pivot_pos = [L_cp, 0, z0];

    const ct = Math.cos(theta), st = Math.sin(theta);
    const xA = L_A * Math.sin(alpha), zA = L_A * Math.cos(alpha);

    const mul = (m, v) => [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
    const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
    const Rx = [1,0,0, 0,ct,-st, 0,st,ct];

    const arm_local = [xA, 0, zA];
    const bar_upper_local = [xA, L_B/2, zA];
    const bar_lower_local = [xA, -L_B/2, zA];

    const arm_world = add(pivot_pos, mul(Rx, arm_local));
    const xP = L_P * Math.sin(gamma), zP = L_P * Math.cos(gamma);
    const proximal_world = add(pivot_pos, mul(Rx, [xP, 0, zP]));
    const upright_world = add(pivot_pos, mul(Rx, [0, 0, L_U]));
    const bar_upper_world = add(pivot_pos, mul(Rx, bar_upper_local));
    const bar_lower_world = add(pivot_pos, mul(Rx, bar_lower_local));

    const servo_r_pos = [x_e, y_e, z_e];
    const servo_l_pos = [x_e, -y_e, z_e];
    const link_r_pos = add(servo_r_pos, [0, R*Math.cos(beta1), R*Math.sin(beta1)]);
    const link_l_pos = add(servo_l_pos, [0, R*Math.cos(beta2), R*Math.sin(beta2)]);

    const axis_half = 25;
    const rot_axis_start = add(pivot_pos, [-axis_half, 0, 0]);
    const rot_axis_end = add(pivot_pos, [axis_half, 0, 0]);

    const dist = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
    const I3 = [[1,0,0],[0,1,0],[0,0,1]];
    const RxT = [1,0,0, 0,ct,st, 0,-st,ct];
    const axesMat = (m) => [[m[0],m[1],m[2]],[m[3],m[4],m[5]],[m[6],m[7],m[8]]];

    return {
        points: {
            origin: [0,0,0], base: base_pos, pivot: pivot_pos,
            arm: arm_world, proximal: proximal_world, upright: upright_world,
            bar_upper: bar_upper_world, bar_lower: bar_lower_world,
            servo_r: servo_r_pos, servo_l: servo_l_pos,
            link_r: link_r_pos, link_l: link_l_pos,
            rot_axis_start, rot_axis_end,
        },
        frames: {
            world: { origin: [0,0,0], axes: I3 },
            base: { origin: base_pos, axes: I3 },
            pivot: { origin: pivot_pos, axes: I3 },
            rocker: { origin: pivot_pos, axes: axesMat(RxT) },
            servo_r: { origin: servo_r_pos, axes: I3 },
            servo_l: { origin: servo_l_pos, axes: I3 },
        },
        link_lengths: {
            right: Math.round(dist(bar_upper_world, link_r_pos) * 10000) / 10000,
            left: Math.round(dist(bar_lower_world, link_l_pos) * 10000) / 10000,
        },
    };
}
