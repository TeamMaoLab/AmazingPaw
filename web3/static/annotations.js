/**
 * Annotation system — CAD-style dimension/angle/radius annotations.
 * Creates 3D line geometry and HTML overlay labels.
 */
import * as THREE from '/static/lib/three.module.js';
import { S, rebuildScene } from './state.js';
import { setHover, clearHover } from './ui.js';

function bindAnnotationHover(labelEl) {
  labelEl.addEventListener('mouseenter', () => setHover(labelEl._stepName));
  labelEl.addEventListener('mouseleave', () => clearHover());
}

function makeLabel(cls, text, pos3, color) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  if (color) div.style.color = color;
  div._pos3 = pos3;
  S.containerEl.appendChild(div);
  return div;
}

export { makeLabel };

export function makeDimAnnotation(paramKey, def, from, to, stepName) {
  const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  if (len < 0.001) {
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const div = document.createElement('div');
    div.className = 'dim-label';
    div._pos3 = mid;
    div.innerHTML = `${paramKey} = <span class="dim-value">${S.params[paramKey]}${def.unit}</span>`;
    div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
    S.containerEl.appendChild(div);
    return div;
  }
  const meshIdx = S.annotationMeshes.length;
  const offset = 8;
  const perp = [-dir[2] / len, 0, dir[0] / len];

  const extFrom = [from[0] + perp[0] * offset, from[1] + perp[1] * offset, from[2] + perp[2] * offset];
  const extTo = [to[0] + perp[0] * offset, to[1] + perp[1] * offset, to[2] + perp[2] * offset];

  const annColor = 0xcc5500;
  const dimColor = 0xcc5500;
  const groupMeshes = [];

  // Extension lines
  for (const [a, b] of [[from, extFrom], [to, extTo]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
    const mat = new THREE.LineBasicMaterial({ color: annColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    S.scene.add(line);
    S.annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // Dimension line
  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute('position', new THREE.Float32BufferAttribute([...extFrom, ...extTo], 3));
  const dimMat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
  const dimLine = new THREE.Line(dimGeo, dimMat);
  S.scene.add(dimLine);
  S.annotationMeshes.push(dimLine);
  groupMeshes.push(dimLine);

  // Tick marks
  const tickLen = 2;
  const tickDir = [dir[0] / len, dir[1] / len, dir[2] / len];
  for (const pt of [extFrom, extTo]) {
    const t1 = [pt[0] - tickDir[0] * tickLen, pt[1] - tickDir[1] * tickLen, pt[2] - tickDir[2] * tickLen];
    const t2 = [pt[0] + tickDir[0] * tickLen, pt[1] + tickDir[1] * tickLen, pt[2] + tickDir[2] * tickLen];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...t1, ...t2], 3));
    const mat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    S.scene.add(line);
    S.annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // Arrows at both ends of dimension line
  const arrowSize = 2;
  const perpDir = perp;
  for (const [pt, sign] of [[extFrom, 1], [extTo, -1]]) {
    const ad = [tickDir[0] * sign, tickDir[1] * sign, tickDir[2] * sign];
    const arrowPts = [
      ...pt,
      ...[pt[0] - ad[0] * arrowSize + perpDir[0] * arrowSize * 0.4,
           pt[1] - ad[1] * arrowSize + perpDir[1] * arrowSize * 0.4,
           pt[2] - ad[2] * arrowSize + perpDir[2] * arrowSize * 0.4],
      ...pt,
      ...[pt[0] - ad[0] * arrowSize - perpDir[0] * arrowSize * 0.4,
           pt[1] - ad[1] * arrowSize - perpDir[1] * arrowSize * 0.4,
           pt[2] - ad[2] * arrowSize - perpDir[2] * arrowSize * 0.4],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
    const mat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.2 });
    const line = new THREE.Line(geo, mat);
    S.scene.add(line);
    S.annotationMeshes.push(line);
    groupMeshes.push(line);
  }

  // HTML text label
  const mid = [(extFrom[0] + extTo[0]) / 2, (extFrom[1] + extTo[1]) / 2, (extFrom[2] + extTo[2]) / 2];
  const div = document.createElement('div');
  div.className = 'dim-label';
  div._pos3 = mid;
  div.innerHTML = `${paramKey} = <span class="dim-value">${S.params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
  bindAnnotationHover(div);
  S.containerEl.appendChild(div);
  for (let i = meshIdx; i < S.annotationMeshes.length; i++) S.annotationMeshes[i]._stepName = stepName;
  return div;
}

export function makeCircleRAnnotation(paramKey, def, center, radius) {
  const labelPos = [center[0], center[1] + radius + 3, center[2]];
  const div = document.createElement('div');
  div.className = 'dim-label';
  div._pos3 = labelPos;
  div.innerHTML = `${paramKey} = <span class="dim-value">${S.params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditDim(div, paramKey, def));
  bindAnnotationHover(div);
  S.containerEl.appendChild(div);
  return div;
}

function startEditDim(div, paramKey, def) {
  if (div.classList.contains('editing')) return;
  div.classList.add('editing');

  const currentVal = S.params[paramKey];
  div.innerHTML = `${paramKey} = <input type="number" value="${currentVal}" min="${def.min}" max="${def.max}" step="${def.step}"> ${def.unit}`;
  const input = div.querySelector('input');
  input.focus();
  input.select();

  const finish = () => {
    const newVal = parseFloat(input.value);
    if (!isNaN(newVal) && newVal >= def.min && newVal <= def.max) {
      S.params[paramKey] = newVal;
    }
    div.classList.remove('editing');
    rebuildScene();
    document.getElementById('status').textContent = `${paramKey} = ${S.params[paramKey]}${def.unit}`;
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = S.params[paramKey]; input.blur(); }
  });
}

export function makeAngleAnnotation(paramKey, def, vertex, pTo, refDir, pFrom, stepName) {
  const d2 = [pTo[0] - vertex[0], pTo[1] - vertex[1], pTo[2] - vertex[2]];
  const len2 = Math.sqrt(d2[0] ** 2 + d2[1] ** 2 + d2[2] ** 2);

  const arcRadius = 8;
  const arcColor = 0x2266aa;
  const groupMeshes = [];

  let n1;
  if (refDir) {
    n1 = refDir;
  } else if (pFrom) {
    const d1 = [pFrom[0] - vertex[0], pFrom[1] - vertex[1], pFrom[2] - vertex[2]];
    const len1 = Math.sqrt(d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2);
    n1 = len1 > 0.001 ? [d1[0] / len1, d1[1] / len1, d1[2] / len1] : [1, 0, 0];
  } else {
    n1 = [1, 0, 0];
  }
  const n2 = len2 > 0.001 ? [d2[0] / len2, d2[1] / len2, d2[2] / len2] : [1, 0, 0];

  const cross = [
    n1[1] * n2[2] - n1[2] * n2[1],
    n1[2] * n2[0] - n1[0] * n2[2],
    n1[0] * n2[1] - n1[1] * n2[0],
  ];
  const crossLen = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);

  let axis;
  if (crossLen > 0.001) {
    axis = [cross[0] / crossLen, cross[1] / crossLen, cross[2] / crossLen];
  } else {
    for (const c of [[0,1,0],[0,0,1],[1,0,0]]) {
      const cx = n1[1]*c[2]-n1[2]*c[1], cy = n1[2]*c[0]-n1[0]*c[2], cz = n1[0]*c[1]-n1[1]*c[0];
      const cl = Math.sqrt(cx*cx+cy*cy+cz*cz);
      if (cl > 0.001) { axis = [cx/cl, cy/cl, cz/cl]; break; }
    }
  }

  const paramSweep = S.params[paramKey] * Math.PI / 180;
  if (!axis || Math.abs(paramSweep) < 0.001) {
    const labelPos = [vertex[0] + n1[0] * 12, vertex[1] + n1[1] * 12, vertex[2] + n1[2] * 12];
    const div = document.createElement('div');
    div.className = 'angle-label';
    div._pos3 = labelPos;
    div.innerHTML = `${paramKey} = <span class="angle-value">${S.params[paramKey]}${def.unit}</span>`;
    div.addEventListener('dblclick', () => startEditAngle(div, paramKey, def));
    S.containerEl.appendChild(div);
    return div;
  }

  const meshIdx = S.annotationMeshes.length;

  const rodrigues = (v, k, theta) => {
    const ct = Math.cos(theta), st = Math.sin(theta);
    const kxv = [k[1]*v[2]-k[2]*v[1], k[2]*v[0]-k[0]*v[2], k[0]*v[1]-k[1]*v[0]];
    const kdv = k[0]*v[0]+k[1]*v[1]+k[2]*v[2];
    return [
      v[0]*ct + kxv[0]*st + k[0]*kdv*(1-ct),
      v[1]*ct + kxv[1]*st + k[1]*kdv*(1-ct),
      v[2]*ct + kxv[2]*st + k[2]*kdv*(1-ct),
    ];
  };

  const endPlus = rodrigues(n1, axis, paramSweep);
  const endMinus = rodrigues(n1, axis, -paramSweep);
  const dotPlus = endPlus[0]*n2[0] + endPlus[1]*n2[1] + endPlus[2]*n2[2];
  const dotMinus = endMinus[0]*n2[0] + endMinus[1]*n2[1] + endMinus[2]*n2[2];
  const sweep = dotPlus >= dotMinus ? paramSweep : -paramSweep;

  // Arc
  const segments = 24;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * sweep;
    const p = rodrigues(n1, axis, angle);
    pts.push(
      vertex[0] + p[0] * arcRadius,
      vertex[1] + p[1] * arcRadius,
      vertex[2] + p[2] * arcRadius,
    );
  }
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: arcColor, transparent: true, opacity: 0.2 });
  const arcLine = new THREE.Line(arcGeo, arcMat);
  S.scene.add(arcLine);
  S.annotationMeshes.push(arcLine);
  groupMeshes.push(arcLine);

  // Reference arms
  const armLen = arcRadius + 6;
  for (const nd of [n1, n2]) {
    const armGeo = new THREE.BufferGeometry();
    armGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      ...vertex,
      vertex[0] + nd[0] * armLen, vertex[1] + nd[1] * armLen, vertex[2] + nd[2] * armLen,
    ], 3));
    const armLine = new THREE.Line(armGeo, new THREE.LineBasicMaterial({ color: arcColor, transparent: true, opacity: 0.2 }));
    S.scene.add(armLine);
    S.annotationMeshes.push(armLine);
    groupMeshes.push(armLine);
  }

  // Arrow at end of arc
  const lastPt = pts.slice(-3);
  const prevPt = pts.slice(-6, -3);
  const arcDir = [lastPt[0] - prevPt[0], lastPt[1] - prevPt[1], lastPt[2] - prevPt[2]];
  const arcDirLen = Math.sqrt(arcDir[0] ** 2 + arcDir[1] ** 2 + arcDir[2] ** 2);
  if (arcDirLen > 0.001) {
    const arrowSize = 2;
    const ad = [arcDir[0] / arcDirLen, arcDir[1] / arcDirLen, arcDir[2] / arcDirLen];
    const arcNormal = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 > 0.0001
      ? [cross[0], cross[1], cross[2]] : [0, 0, 1];
    const arcNormalLen = Math.sqrt(arcNormal[0] ** 2 + arcNormal[1] ** 2 + arcNormal[2] ** 2);
    const an = [arcNormal[0] / arcNormalLen, arcNormal[1] / arcNormalLen, arcNormal[2] / arcNormalLen];
    const wing1 = [an[1] * ad[2] - an[2] * ad[1], an[2] * ad[0] - an[0] * ad[2], an[0] * ad[1] - an[1] * ad[0]];
    const arrowPts = [
      ...lastPt,
      ...[lastPt[0] - ad[0] * arrowSize + wing1[0] * arrowSize * 0.5,
           lastPt[1] - ad[1] * arrowSize + wing1[1] * arrowSize * 0.5,
           lastPt[2] - ad[2] * arrowSize + wing1[2] * arrowSize * 0.5],
      ...lastPt,
      ...[lastPt[0] - ad[0] * arrowSize - wing1[0] * arrowSize * 0.5,
           lastPt[1] - ad[1] * arrowSize - wing1[1] * arrowSize * 0.5,
           lastPt[2] - ad[2] * arrowSize - wing1[2] * arrowSize * 0.5],
    ];
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
    const arrowLine = new THREE.Line(arrowGeo, arcMat);
    S.scene.add(arrowLine);
    S.annotationMeshes.push(arrowLine);
    groupMeshes.push(arrowLine);
  }

  // Label at arc midpoint
  const bis = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]];
  const bisLen = Math.sqrt(bis[0] ** 2 + bis[1] ** 2 + bis[2] ** 2);
  const labelOffset = arcRadius + 3;
  const labelPos = bisLen > 0.001
    ? [vertex[0] + bis[0] / bisLen * labelOffset, vertex[1] + bis[1] / bisLen * labelOffset, vertex[2] + bis[2] / bisLen * labelOffset]
    : [vertex[0] + labelOffset, vertex[1], vertex[2]];

  const div = document.createElement('div');
  div.className = 'angle-label';
  div._pos3 = labelPos;
  div.innerHTML = `${paramKey} = <span class="angle-value">${S.params[paramKey]}${def.unit}</span>`;
  div.addEventListener('dblclick', () => startEditAngle(div, paramKey, def));
  bindAnnotationHover(div);
  S.containerEl.appendChild(div);
  for (let i = meshIdx; i < S.annotationMeshes.length; i++) S.annotationMeshes[i]._stepName = stepName;
  return div;
}

function startEditAngle(div, paramKey, def) {
  if (div.classList.contains('editing')) return;
  div.classList.add('editing');

  const currentVal = S.params[paramKey];
  div.innerHTML = `${paramKey} = <input type="number" value="${currentVal}" min="${def.min}" max="${def.max}" step="${def.step}"> ${def.unit}`;
  const input = div.querySelector('input');
  input.focus();
  input.select();

  const finish = () => {
    const newVal = parseFloat(input.value);
    if (!isNaN(newVal) && newVal >= def.min && newVal <= def.max) {
      S.params[paramKey] = newVal;
    }
    div.classList.remove('editing');
    rebuildScene();
    document.getElementById('status').textContent = `${paramKey} = ${S.params[paramKey]}${def.unit}`;
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = S.params[paramKey]; input.blur(); }
  });
}

// ── Static axis labels ──

export function addStaticLabel(text, pos, color) {
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;font-size:12px;font-weight:700;pointer-events:none;font-family:"SF Mono",Menlo,monospace;`;
  div.style.color = '#' + new THREE.Color(color).getHexString();
  div.textContent = text;
  div._pos3 = pos;
  S.containerEl.appendChild(div);
  S.staticLabels.push(div);
}

// ── Label position update (called each frame) ──

export function updateAllLabelPositions() {
  const allEls = [...S.staticLabels, ...S.annotationEls];
  for (const el of allEls) {
    if (!el._pos3) continue;
    const isAnnoLabel = el.classList.contains('dim-label') || el.classList.contains('angle-label');
    if (isAnnoLabel && !S.showAnnotations) { el.style.display = 'none'; continue; }
    const v = new THREE.Vector3(...el._pos3).project(S.camera);
    const x = (v.x * 0.5 + 0.5) * S.containerEl.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * S.containerEl.clientHeight;
    el.style.left = x + 'px';
    el.style.top = (y - 8) + 'px';
    el.style.display = v.z > 1 ? 'none' : '';
  }
}
