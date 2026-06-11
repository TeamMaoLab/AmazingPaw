/**
 * Parametric Skeleton Sketch — entry point.
 * Orchestrates module initialization.
 */
import { S, rebuildScene } from './state.js';
import { flattenParams } from './defs.js';
import { initScene } from './scene-builder.js';
import { buildGrowthTree, bindViewportClick, bindViewButtons } from './ui.js';
import { initMathDrawer } from './math-drawer.js';

S.params = flattenParams();
initScene();
bindViewButtons();
buildGrowthTree();
bindViewportClick();
rebuildScene();
initMathDrawer();
