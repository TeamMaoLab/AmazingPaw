import * as Scene from '/static/scene.js';
import { GrowthAnimator, growthSteps, getAllDefaults } from '/static/growth.js';

let animator;
let params = getAllDefaults();
let editingStep = -1;     // which step's params are expanded (-1 = none)
let fullyGrown = true;    // initial state: everything visible

// ── Init ──
function init() {
  Scene.initScene(document.getElementById('viewport'));
  animator = new GrowthAnimator(Scene);

  buildStepList();
  bindControls();
  bindViewButtons();

  // Start fully grown
  animator.gotoStep(growthSteps.length - 1, params);
  updateUI();
}

// ── Accordion step list ──
function buildStepList() {
  const list = document.getElementById('step-list');
  list.innerHTML = '';

  growthSteps.forEach((step, i) => {
    const item = document.createElement('div');
    item.className = 'step-item';
    item.dataset.index = i;

    const header = document.createElement('div');
    header.className = 'step-header';
    header.innerHTML = `
      <span class="step-num">${i}</span>
      <span class="step-label">${step.label || step.name}</span>
      <span class="step-desc">${step.description}</span>
      <span class="step-arrow">▸</span>
    `;
    header.addEventListener('click', () => toggleStep(i));

    const body = document.createElement('div');
    body.className = 'step-body';
    body.id = `step-body-${i}`;

    const paramKeys = Object.keys(step.params);
    if (paramKeys.length === 0) {
      body.innerHTML = '<div class="no-params">No parameters</div>';
    } else {
      for (const [key, def] of Object.entries(step.params)) {
        const row = document.createElement('div');
        row.className = 'param-row';
        row.innerHTML = `
          <label>${key}</label>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${params[key]}" data-param="${key}">
          <span class="val">${params[key]}${def.unit}</span>
        `;
        const input = row.querySelector('input');
        const valSpan = row.querySelector('.val');
        input.addEventListener('input', () => {
          params[key] = parseFloat(input.value);
          valSpan.textContent = params[key] + def.unit;
          // Real-time preview: show only up to this step
          animator.gotoStep(i, params);
        });
        body.appendChild(row);
      }
    }

    item.appendChild(header);
    item.appendChild(body);
    list.appendChild(item);
  });
}

function toggleStep(i) {
  if (editingStep === i) {
    // Collapse: done editing, regrow everything
    editingStep = -1;
    fullyGrown = true;
    animator.gotoStep(growthSteps.length - 1, params);
  } else {
    // Expand this step, collapse others
    // If we were editing another step, first regrow fully
    if (editingStep >= 0) {
      animator.gotoStep(growthSteps.length - 1, params);
    }
    editingStep = i;
    fullyGrown = false;
    // Show only up to this step (later steps depend on this one being finalized)
    animator.gotoStep(i, params);
  }
  updateUI();
}

function updateUI() {
  // Accordion state
  document.querySelectorAll('.step-item').forEach((el, i) => {
    const body = document.getElementById(`step-body-${i}`);
    const arrow = el.querySelector('.step-arrow');
    const isActive = i === editingStep;
    const isReached = i <= animator.getCurrentStep();

    el.classList.toggle('active', isActive);
    el.classList.toggle('reached', isReached);
    el.classList.toggle('future', !isReached);
    body.classList.toggle('open', isActive);
    arrow.textContent = isActive ? '▾' : '▸';
  });

  // Update slider values (in case params changed externally)
  if (editingStep >= 0) {
    const step = growthSteps[editingStep];
    for (const [key] of Object.entries(step.params)) {
      const row = document.querySelector(`#step-body-${editingStep} input[data-param="${key}"]`);
      if (row) {
        row.value = params[key];
        row.nextElementSibling.textContent = params[key] + step.params[key].unit;
      }
    }
  }

  // Status
  document.getElementById('btn-play').textContent = animator.isPlaying() ? '⏸' : '▶';
  const current = animator.getCurrentStep();
  document.getElementById('btn-next').disabled = current >= growthSteps.length - 1;

  if (editingStep >= 0) {
    document.getElementById('status').textContent = `Editing step ${editingStep}: ${growthSteps[editingStep].label}`;
  } else {
    document.getElementById('status').textContent = fullyGrown ? 'Fully grown' : 'Ready';
  }
}

// ── Controls ──
function bindControls() {
  document.getElementById('btn-play').addEventListener('click', async () => {
    if (animator.isPlaying()) {
      animator.pause();
      updateUI();
      return;
    }
    editingStep = -1;
    fullyGrown = false;
    animator.reset();
    updateUI();
    // Small delay so user sees the empty scene before growth starts
    await new Promise(r => setTimeout(r, 200));
    await animator.play(params);
    fullyGrown = true;
    updateUI();
  });

  document.getElementById('btn-next').addEventListener('click', async () => {
    if (editingStep >= 0) {
      // Collapse current edit first
      editingStep = -1;
      fullyGrown = true;
      animator.gotoStep(growthSteps.length - 1, params);
    }
    await animator.nextStep(params);
    updateUI();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    editingStep = -1;
    fullyGrown = true;
    animator.gotoStep(growthSteps.length - 1, params);
    updateUI();
  });
}

function bindViewButtons() {
  document.querySelectorAll('.view-btns button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'home') { Scene.resetCamera(); return; }
      const axis = v[1].toLowerCase();
      const sign = v[0] === '+' ? 1 : -1;
      Scene.setView(axis, sign);
    });
  });
}

init();
