/**
 * Shared mutable state + constants.
 * All modules import S and read/write properties on this stable object reference.
 */
import * as THREE from './lib/three.module.js';

export const S = {
  // Growth parameters (flattened from GROWTH defs)
  params: {},

  // Three.js globals (set by scene-builder init)
  scene: null,
  renderer: null,
  camera: null,
  controls: null,
  containerEl: null,

  // Growth meshes: name -> { point, line?, plane?, circle? }
  meshes: {},
  // Passive rod meshes
  rodMeshes: [],
  // Annotation 3D geometry (Lines)
  annotationMeshes: [],
  // Annotation HTML overlay elements
  annotationEls: [],
  // Static axis labels
  staticLabels: [],

  // Interaction state
  selectedName: null,
  hoveredStep: null,
  showAnnotations: true,

  // Mode system
  mode: 'design',            // 'design' | 'kinematic' | 'grid'
  solverResult: null,         // { theta, kappa } from Newton-Raphson
  kinematicPositions: null,   // positions computed by solver
  solverRodLengths: null,     // { L_RD2, L_LF2 } squared rod lengths
  designBetas: null,           // { beta1, beta2 } saved from design mode
  gridData: null,             // { grid: Float32Array, res, from, to, step }
  gridComputing: false,
  animId: null,               // requestAnimationFrame id

  // Geometry constants
  PT_R: 1.5,
  LINE_R: 0.4,
  ROD_R: 0.3,
};

// Rebuild callback — breaks circular dependency between scene-builder and annotations
let _rebuildFn = null;
export function setRebuildCallback(fn) { _rebuildFn = fn; }
export function rebuildScene() { if (_rebuildFn) _rebuildFn(); }
