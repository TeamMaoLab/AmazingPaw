/**
 * Parametric Skeleton Sketch — entry point.
 * Orchestrates module initialization.
 */
import { S, rebuildScene } from './state.js';
import { flattenParams, applyOverrides, loadSavedParams, saveParams } from './defs.js';
import { initScene } from './scene-builder.js';
import { buildGrowthTree, bindViewportClick, bindViewButtons } from './ui.js';
import { initMathDrawer } from './math-drawer.js';
import { bindModeTabs } from './mode-manager.js';
import { initKinematicUI } from './kinematic-ui.js';

async function init() {
  S.params = flattenParams();
  const saved = await loadSavedParams();
  if (saved) applyOverrides(S.params, saved);

  initScene();
  bindViewButtons();
  buildGrowthTree();
  bindViewportClick();
  bindModeTabs();
  initKinematicUI();
  bindSaveButton();
  rebuildScene();
  initMathDrawer();
}

function bindSaveButton() {
  const btn = document.getElementById('save-params-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await saveParams(S.params);
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save Params'; }, 1500);
  });
}

init();
