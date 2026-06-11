/**
 * Growth tree — each step owns its parameters.
 * Selecting a step shows its params; adjusting recalculates the whole tree.
 */

// Per-step parameter definitions: { key: { default, min, max, step, unit } }
export const growthSteps = [
  {
    name: 'Origin',
    parent: null,
    label: 'O',
    description: 'World origin',
    params: {},
    build: () => ({ pos: [0, 0, 0] }),
  },
  {
    name: 'servo',
    parent: 'Origin',
    label: 'S',
    description: '+X → servo center point',
    params: {
      x_e: { default: 11, min: 0, max: 40, step: 0.5, unit: 'mm' },
    },
    build: (params) => ({
      pos: [params.x_e, 0, 0],
      plane: { normal: [1, 0, 0], color: 0x4488ff, label: 'Servo plane (∥ YZ)' },
    }),
  },
  {
    name: 'finger_base',
    parent: 'Origin',
    label: 'B',
    description: '+Z → finger skeleton base',
    params: {
      z0: { default: 36, min: 0, max: 80, step: 0.5, unit: 'mm' },
    },
    build: (params) => ({
      pos: [0, 0, params.z0],
    }),
  },
];

// Flatten all params with defaults
export function getAllDefaults() {
  const p = {};
  for (const step of growthSteps) {
    for (const [k, v] of Object.entries(step.params)) {
      p[k] = v.default;
    }
  }
  return p;
}

// ── Ease-out ──
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

const LINE_DURATION = 500;
const POINT_DURATION = 200;
const STEP_PAUSE = 300;

export class GrowthAnimator {
  constructor(scene) {
    this.scene = scene;
    this.steps = growthSteps;
    this.currentStep = -1;
    this.nodePositions = {};
    this.playing = false;
    this._animating = false;
  }

  computeAll(params) {
    this.nodePositions = {};
    for (const step of this.steps) {
      const parentPos = step.parent ? this.nodePositions[step.parent] : [0, 0, 0];
      if (!parentPos) continue;
      const result = step.build(params, parentPos);
      this.nodePositions[step.name] = result.pos;
    }
  }

  reset() {
    this.playing = false;
    this._animating = false;
    this.currentStep = -1;
    this.nodePositions = {};
    this.scene.clearGrowth();
  }

  async nextStep(params) {
    if (this._animating) return;
    const nextIdx = this.currentStep + 1;
    if (nextIdx >= this.steps.length) return;

    this._animating = true;
    this.computeAll(params);
    const step = this.steps[nextIdx];
    const parentPos = step.parent ? this.nodePositions[step.parent] : [0, 0, 0];
    const childPos = this.nodePositions[step.name];

    if (nextIdx === 0) {
      // Origin: just show the point with a small pop
      this.scene.addPoint(step.name, childPos, '');
      await this._animatePointPop(step.name, POINT_DURATION);
      this.currentStep = nextIdx;
      this._animating = false;
      return;
    }

    const lineId = `${step.parent}-${step.name}`;
    this.scene.addLine(lineId, parentPos, parentPos);
    await this._animateLine(lineId, parentPos, childPos, LINE_DURATION);

    this.scene.addPoint(step.name, childPos, step.label);
    await this._animatePointPop(step.name, POINT_DURATION);

    const result = step.build(params, parentPos);
    if (result.plane) {
      this.scene.addPlane(step.name + '_plane', childPos, result.plane, params);
    }

    this.currentStep = nextIdx;
    this._animating = false;
  }

  async play(params) {
    if (this.playing) return;
    this.playing = true;
    while (this.playing && this.currentStep < this.steps.length - 1) {
      await this.nextStep(params);
      if (this.playing) await this._delay(STEP_PAUSE);
    }
    this.playing = false;
  }

  pause() { this.playing = false; }
  isPlaying() { return this.playing; }
  getCurrentStep() { return this.currentStep; }
  getStepCount() { return this.steps.length; }

  // Recompute and redraw all visible steps (no animation)
  refresh(params) {
    const upTo = this.currentStep;
    if (upTo < 0) return;
    this._rebuildUpTo(upTo, params);
  }

  // Jump to step n instantly
  gotoStep(n, params) {
    this.playing = false;
    this._animating = false;
    if (n < 0) { this.reset(); return; }
    this._rebuildUpTo(n, params);
    this.currentStep = Math.min(n, this.steps.length - 1);
  }

  _rebuildUpTo(n, params) {
    this.scene.clearGrowth();
    this.nodePositions = {};

    for (let i = 0; i <= Math.min(n, this.steps.length - 1); i++) {
      const step = this.steps[i];
      const parentPos = step.parent ? this.nodePositions[step.parent] : [0, 0, 0];
      const result = step.build(params, parentPos);
      this.nodePositions[step.name] = result.pos;

      if (i === 0) {
        this.scene.addPoint(step.name, result.pos, '');
      } else {
        const lineId = `${step.parent}-${step.name}`;
        this.scene.addLine(lineId, this.nodePositions[step.parent], result.pos);
        this.scene.addPoint(step.name, result.pos, step.label);
        if (result.plane) {
          this.scene.addPlane(step.name + '_plane', result.pos, result.plane, params);
        }
      }
    }
  }

  _animateLine(lineId, from, to, duration) {
    return new Promise(resolve => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const et = easeOut(t);
        const cur = [
          from[0] + (to[0] - from[0]) * et,
          from[1] + (to[1] - from[1]) * et,
          from[2] + (to[2] - from[2]) * et,
        ];
        this.scene.updateLine(lineId, from, cur);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  _animatePointPop(name, duration) {
    return new Promise(resolve => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const s = t < 0.6 ? (t / 0.6) * 1.2 : 1.2 - 0.2 * ((t - 0.6) / 0.4);
        this.scene.setPointScale(name, s);
        if (t < 1) requestAnimationFrame(tick);
        else { this.scene.setPointScale(name, 1); resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
