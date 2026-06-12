/**
 * Selection, hover highlighting, growth tree overlay, view controls, viewport click.
 */
import * as THREE from './lib/three.module.js';
import { S } from './state.js';
import { GROWTH, RODS, BODY_COLORS, STEP_BODY } from './defs.js';

// ── Selection ──

export function selectNode(name) {
  if (S.selectedName === name) { S.selectedName = null; }
  else { S.selectedName = name; }
  applyHighlight();
  updateTreeSelection();
}

export function applyHighlight() {
  for (const step of GROWTH) {
    const m = S.meshes[step.name];
    if (!m) continue;
    const isSelected = step.name === S.selectedName;
    const body = STEP_BODY[step.name];
    const defaultPtColor = body ? BODY_COLORS[body] : (step.parent === null ? 0x333333 : 0x999999);
    const defaultLineColor = body ? BODY_COLORS[body] : (step.dashed ? 0xaa8844 : 0x999999);
    if (m.point) {
      m.point.material.opacity = S.selectedName === null ? 1.0 : (isSelected ? 1.0 : 0.2);
      m.point.material.transparent = S.selectedName !== null;
      m.point.scale.setScalar(isSelected ? 2.0 : 1.0);
      m.point.material.color.set(isSelected ? 0xff8844 : defaultPtColor);
    }
    if (m.line) {
      m.line.material.opacity = S.selectedName === null ? 1.0 : (isSelected ? 1.0 : 0.15);
      m.line.material.transparent = true;
      if (isSelected) m.line.material.color.set(0xff8844);
      else m.line.material.color.set(defaultLineColor);
    }
  }
}

// ── Hover ──

export function setHover(stepName) {
  if (!stepName || S.hoveredStep === stepName) return;
  clearHover();
  S.hoveredStep = stepName;

  document.querySelectorAll('.tree-node').forEach(el => {
    if (el._stepName === stepName) el.classList.add('hover');
  });

  const m = S.meshes[stepName];
  if (m) {
    if (m.point) {
      m.point.scale.setScalar(2.0);
      m.point.material.color.set(0xff8844);
    }
    if (m.line) {
      m.line.material.opacity = 1.0;
      m.line.material.transparent = false;
      m.line.material.color.set(0xff8844);
    }
  }

  for (const el of S.annotationEls) {
    if (el._stepName === stepName && (el.classList.contains('dim-label') || el.classList.contains('angle-label'))) {
      el.classList.add('highlight');
    }
  }

  for (const mesh of S.annotationMeshes) {
    if (mesh._stepName === stepName) mesh.material.opacity = 1;
  }
}

export function clearHover() {
  if (S.hoveredStep === null) return;
  S.hoveredStep = null;

  document.querySelectorAll('.tree-node.hover').forEach(el => el.classList.remove('hover'));

  for (const el of S.annotationEls) {
    if (el.classList.contains('dim-label') || el.classList.contains('angle-label')) {
      el.classList.remove('highlight');
    }
  }

  for (const m of S.annotationMeshes) m.material.opacity = 0.2;

  applyHighlight();
}

// ── Tree ──

function updateTreeSelection() {
  document.querySelectorAll('.tree-node').forEach(el => {
    el.classList.toggle('selected', el._stepName === S.selectedName);
  });
}

export function buildGrowthTree() {
  const container = document.getElementById('growth-tree');
  container.innerHTML = '';

  const childrenOf = {};
  for (const step of GROWTH) {
    const p = step.parent || '__root__';
    if (!childrenOf[p]) childrenOf[p] = [];
    childrenOf[p].push(step);
  }

  function renderNode(step) {
    const frag = document.createDocumentFragment();

    const node = document.createElement('div');
    node.className = 'tree-node';
    node._stepName = step.name;
    const paramTag = Object.keys(step.params).length > 0
      ? Object.keys(step.params).join(', ')
      : '';
    node.innerHTML = `
      <span class="dot${step.parent === null ? ' root' : ''}"></span>
      <span class="name">${step.label}</span>
      ${paramTag ? `<span class="tag">${paramTag}</span>` : ''}
    `;
    node.addEventListener('click', (e) => { e.stopPropagation(); selectNode(step.name); });
    node.addEventListener('mouseenter', () => setHover(step.name));
    node.addEventListener('mouseleave', () => clearHover());
    frag.appendChild(node);

    const kids = childrenOf[step.name];
    if (kids && kids.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      for (const kid of kids) {
        childContainer.appendChild(renderNode(kid));
      }
      frag.appendChild(childContainer);
    }

    return frag;
  }

  const roots = GROWTH.filter(s => s.parent === null);
  for (const root of roots) {
    container.appendChild(renderNode(root));
  }

  // Rod lengths section
  const rodSection = document.createElement('div');
  rodSection.className = 'rod-section';
  rodSection.id = 'rod-lengths';
  container.appendChild(rodSection);
}

export function getLabelFor(name) {
  const step = GROWTH.find(s => s.name === name);
  return step ? step.label : name;
}

export function updateRodLengths(positions) {
  const el = document.getElementById('rod-lengths');
  if (!el) return;
  el.innerHTML = '';
  for (const r of RODS) {
    if (!positions[r.from] || !positions[r.to]) continue;
    const dx = positions[r.to][0] - positions[r.from][0];
    const dy = positions[r.to][1] - positions[r.from][1];
    const dz = positions[r.to][2] - positions[r.from][2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const hex = '#' + new THREE.Color(BODY_COLORS[r.body]).getHexString();
    const row = document.createElement('div');
    row.className = 'rod-row';
    row.innerHTML = `<span class="rod-dot" style="background:${hex}"></span><span class="rod-name" style="color:${hex}">${getLabelFor(r.from)}→${getLabelFor(r.to)}</span><span class="rod-val">${len.toFixed(1)}mm</span>`;
    el.appendChild(row);
  }
}

// ── View controls ──

export function bindViewButtons() {
  document.querySelectorAll('.view-btns button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'home') {
        S.camera.position.set(150, -200, 150);
        S.camera.up.set(0, 0, 1);
        S.controls.target.set(15, 0, 35);
        S.controls.update();
        return;
      }
      const axis = v[1].toLowerCase();
      const sign = v[0] === '+' ? 1 : -1;
      const pos = [0, 0, 0];
      pos['xyz'.indexOf(axis)] = sign * 250;
      S.camera.position.set(...pos);
      S.camera.up.set(0, 0, axis === 'z' ? -sign : 1);
      S.controls.target.set(15, 0, 35);
      S.controls.update();
    });
  });

  // DIM toggle
  const dimBtn = document.getElementById('dim-toggle');
  if (dimBtn) {
    dimBtn.addEventListener('click', () => {
      S.showAnnotations = !S.showAnnotations;
      dimBtn.classList.toggle('active', S.showAnnotations);
      applyAnnotationVisibility();
    });
  }
}

export function applyAnnotationVisibility() {
  for (const m of S.annotationMeshes) m.visible = S.showAnnotations;
  for (const el of S.annotationEls) {
    if (el.classList.contains('dim-label') || el.classList.contains('angle-label')) {
      el.style.display = S.showAnnotations ? '' : 'none';
    }
  }
}

// ── Viewport click ──

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function bindViewportClick() {
  S.renderer.domElement.addEventListener('click', (e) => {
    const rect = S.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, S.camera);

    const pointMeshList = Object.entries(S.meshes)
      .filter(([_, m]) => m.point)
      .map(([_, m]) => m.point);
    const hits = raycaster.intersectObjects(pointMeshList);
    if (hits.length > 0) {
      const hit = hits[0].object;
      const entry = Object.entries(S.meshes).find(([_, m]) => m.point === hit);
      if (entry) selectNode(entry[0]);
    } else {
      selectNode(null);
    }
  });
}
