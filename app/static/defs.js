/**
 * Growth definitions, rigid body data, and initial parameters.
 * Pure data — no THREE imports, no rendering logic.
 */

export const GROWTH = [
  {
    name: 'Origin', parent: null, label: 'O',
    params: {},
    build: () => ({ pos: [0, 0, 0] }),
  },
  {
    name: 'servo', parent: 'Origin', label: 'S', noLine: true,
    params: { x_e: { default: 16, min: 0, max: 60, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'x_e', from: 'Origin', to: 'servo' }],
    build: (p) => ({
      pos: [p.x_e, 0, 0],
      plane: { normal: [1, 0, 0], color: 0x4488ff, label: 'Servo plane', size: 10 },
    }),
  },
  {
    name: 'servo_z', parent: 'servo', label: 'H',
    dashed: true,
    params: { z_e: { default: 0, min: -20, max: 40, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'z_e', from: 'servo', to: 'servo_z' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.z_e] }),
  },
  {
    name: 'servo_r', parent: 'servo_z', label: 'C',
    dashed: true,
    params: {
      y_e: { default: 7, min: 0, max: 30, step: 0.5, unit: 'mm' },
      R: { default: 7, min: 0, max: 40, step: 0.5, unit: 'mm' },
    },
    annotations: [
      { type: 'dim', param: 'y_e', from: 'servo_z', to: 'servo_r' },
      { type: 'circle_r', param: 'R' },
    ],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] + p.y_e, parentPos[2]] }),
    circle: { param: 'R' },
  },
  {
    name: 'servo_l', parent: 'servo_z', label: 'E',
    dashed: true,
    params: {},
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] - p.y_e, parentPos[2]] }),
    circle: { param: 'R' },
  },
  {
    name: 'servo_arm_r', parent: 'servo_r', label: 'D',
    params: { beta1: { default: 0, min: 0, max: 360, step: 1, unit: '°' } },
    annotations: [{ type: 'angle', param: 'beta1', vertex: 'servo_r', refDir: [0, 0, 1], to: 'servo_arm_r' }],
    build: (p, parentPos) => {
      const rad = p.beta1 * Math.PI / 180;
      return { pos: [parentPos[0], parentPos[1] + p.R * Math.sin(rad), parentPos[2] + p.R * Math.cos(rad)] };
    },
  },
  {
    name: 'servo_arm_l', parent: 'servo_l', label: 'F',
    params: { beta2: { default: 0, min: 0, max: 360, step: 1, unit: '°' } },
    build: (p, parentPos) => {
      const rad = -p.beta2 * Math.PI / 180;
      return { pos: [parentPos[0], parentPos[1] + p.R * Math.sin(rad), parentPos[2] + p.R * Math.cos(rad)] };
    },
  },
  {
    name: 'finger_base', parent: 'Origin', label: 'B', noLine: true,
    params: { z0: { default: 36, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'z0', from: 'Origin', to: 'finger_base' }],
    build: (p) => ({ pos: [0, 0, p.z0] }),
  },
  {
    name: 'pivot', parent: 'finger_base', label: 'P',
    params: { L_BP: { default: 10, min: 0, max: 40, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_BP', from: 'finger_base', to: 'pivot' }],
    build: (p, parentPos) => ({ pos: [parentPos[0] + p.L_BP, parentPos[1], parentPos[2]] }),
  },
  {
    name: 'arm_ext', parent: 'pivot', label: 'Q',
    params: { L_PQ: { default: 50, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_PQ', from: 'pivot', to: 'arm_ext' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.L_PQ] }),
  },
  {
    name: 'link_joint', parent: 'arm_ext', label: 'U',
    params: { L_QU: { default: 40, min: 0, max: 100, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_QU', from: 'arm_ext', to: 'link_joint' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1], parentPos[2] + p.L_QU] }),
  },
  {
    name: 'arm_end', parent: 'pivot', label: 'A',
    params: { L_PA: { default: 7, min: 0, max: 30, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'L_PA', from: 'pivot', to: 'arm_end' }],
    build: (p, parentPos) => ({ pos: [parentPos[0] + p.L_PA, parentPos[1], parentPos[2]] }),
  },
  {
    name: 'tip', parent: 'arm_end', label: 'T',
    params: {
      L_AT: { default: 7, min: 0, max: 100, step: 0.5, unit: 'mm' },
      alpha: { default: 35, min: 0, max: 180, step: 1, unit: '°' },
    },
    annotations: [
      { type: 'dim', param: 'L_AT', from: 'arm_end', to: 'tip' },
      { type: 'angle', param: 'alpha', vertex: 'arm_end', refDir: [1, 0, 0], to: 'tip' },
    ],
    build: (p, parentPos) => {
      const rad = p.alpha * Math.PI / 180;
      return {
        pos: [
          parentPos[0] + p.L_AT * Math.cos(rad),
          parentPos[1],
          parentPos[2] + p.L_AT * Math.sin(rad),
        ],
      };
    },
  },
  {
    name: 'plate_end', parent: 'arm_end', label: 'K',
    params: {
      L_AK: { default: 50, min: 0, max: 100, step: 0.5, unit: 'mm' },
      gamma: { default: 70, min: 0, max: 360, step: 1, unit: '°' },
    },
    annotations: [
      { type: 'dim', param: 'L_AK', from: 'arm_end', to: 'plate_end' },
      { type: 'angle', param: 'gamma', vertex: 'arm_end', from: 'tip', to: 'plate_end' },
    ],
    build: (p, parentPos) => {
      const absAngle = p.alpha + p.gamma;
      const rad = absAngle * Math.PI / 180;
      return {
        pos: [
          parentPos[0] + p.L_AK * Math.cos(rad),
          parentPos[1],
          parentPos[2] + p.L_AK * Math.sin(rad),
        ],
      };
    },
  },
  {
    name: 'bar_r', parent: 'tip', label: 'R',
    params: { BarHalf: { default: 7, min: 0, max: 30, step: 0.5, unit: 'mm' } },
    annotations: [{ type: 'dim', param: 'BarHalf', from: 'tip', to: 'bar_r' }],
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] + p.BarHalf, parentPos[2]] }),
  },
  {
    name: 'bar_l', parent: 'tip', label: 'L',
    params: {},
    build: (p, parentPos) => ({ pos: [parentPos[0], parentPos[1] - p.BarHalf, parentPos[2]] }),
  },
];

// Passive connecting rods
export const RODS = [
  { from: 'link_joint', to: 'plate_end', body: 'UQK' },
  { from: 'arm_ext', to: 'plate_end', body: 'UQK' },
  { from: 'bar_l', to: 'servo_arm_l', body: 'LF' },
  { from: 'bar_r', to: 'servo_arm_r', body: 'RD' },
];

// Rigid body colors
export const BODY_COLORS = {
  APB:  0xe74c3c,
  QP:   0x3498db,
  UQK:  0x27ae60,
  KATLR: 0xf39c12,
  LF:   0x8e44ad,
  RD:   0x16a085,
  CD:   0xd35400,
  EF:   0xe84393,
};

// Map growth step → rigid body
export const STEP_BODY = {
  finger_base: 'APB',
  pivot: 'APB',
  arm_end: 'APB',
  arm_ext: 'QP',
  link_joint: 'UQK',
  tip: 'KATLR',
  plate_end: 'KATLR',
  bar_r: 'KATLR',
  bar_l: 'KATLR',
  servo_arm_r: 'CD',
  servo_arm_l: 'EF',
};

// Flatten default params from GROWTH definitions, override with saved file
export function flattenParams() {
  const p = {};
  for (const step of GROWTH) {
    for (const [k, v] of Object.entries(step.params)) p[k] = v.default;
  }
  return p;
}

export function applyOverrides(p, overrides) {
  for (const [k, v] of Object.entries(overrides)) {
    if (k in p) p[k] = v;
  }
  return p;
}

const STORAGE_KEY = 'hands-params';

export async function loadSavedParams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export async function saveParams(params) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch (_) { /* silently fail */ }
}
