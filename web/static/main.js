/**
 * Entry point — coordinates scene, ui, compute, and explorer modules.
 *
 * Params from API use legacy names: alpha, gamma, L_cp.
 * compute.js accepts both (alpha/alpha0, gamma/gamma0, L_cp/L_BP) with fallbacks.
 * psi defaults to 0 (initial state); explorer solves for it.
 */
import { localCompute } from '/static/compute.js';
import * as Scene from '/static/scene.js';
import * as UI from '/static/ui.js';
import * as Explorer from '/static/explorer.js';
import { computeGrid, lookupAndCompute } from '/static/grid.js';

// ── shared state ──
let mechDef = null;
let currentParams = {};
let selectedName = null;
let previewActive = false;

// ── grid state ──
const animator = Explorer.createAnimator();
let explorerActive = false;
let L_rod2 = 0;
let gridData = null;
const TRACE_POINTS = [
    { name: 'T', color: '#cc4444' },
    { name: 'U', color: '#44aa66' },
    { name: 'Q', color: '#4488ff' },
    { name: 'A', color: '#aa44aa' },
];

const GRID_FROM = 20, GRID_TO = 160, GRID_RES = 70;

// ── highlight mapping ──
const frameChildPoints = {
    'world': [],
    'B': ['B'],
    'P': ['P'],
    'Rk': ['A', 'Q', 'U', 'T', 'R', 'L'],
    'C': ['C', 'D'],
    'E': ['E', 'F'],
};
const pointToElements = {
    'B': ['BP_line'],
    'P': ['BP_line', 'PA_line', 'PQ_line', 'PU_line', 'rot_axis'],
    'A': ['PA_line', 'RL_line', 'AQ_line'],
    'Q': ['PQ_line', 'QU_line', 'QT_line', 'AQ_line'],
    'U': ['PU_line', 'UT_line', 'QU_line'],
    'T': ['UT_line', 'QT_line'],
    'R': ['RL_line', 'RD_line'],
    'L': ['RL_line', 'LF_line'],
    'C': ['C_circle'],
    'E': ['E_circle'],
    'D': ['RD_line', 'C_circle'],
    'F': ['LF_line', 'E_circle'],
};

function getRelatedNames(name) {
    const names = new Set();
    const frameNames = mechDef.frame_names;
    const isFrame = frameNames.includes(name);
    if (isFrame) {
        names.add(name);
        for (const p of (frameChildPoints[name] || [])) {
            names.add(p);
            for (const el of (pointToElements[p] || [])) names.add(el);
        }
    } else {
        names.add(name);
        for (const el of (pointToElements[name] || [])) names.add(el);
        for (const [fn, pts] of Object.entries(frameChildPoints)) {
            if (pts.includes(name)) names.add(fn);
        }
    }
    return names;
}

// ── node selection ──
function selectNode(name) {
    if (selectedName === name) {
        selectedName = null;
        UI.clearTreeSelection();
        Scene.clearHighlight(mechDef.frame_names);
        UI.renderParamsPanel(null);
        return;
    }
    selectedName = name;
    const related = getRelatedNames(name);
    UI.updateTreeSelection(name);
    Scene.applyHighlight(related, mechDef.frame_names);

    const treeNode = UI.findTreeNode(mechDef.growth_tree, name);
    UI.renderParamsPanel(name, treeNode, mechDef.growth_params, currentParams, onParamChange, onParamCommit);
    refreshLinkLengths();
}

function onParamChange(pname, value) {
    currentParams[pname] = value;
    mechDef._paramValues = currentParams;
    const data = localCompute(currentParams);
    Scene.updateScene(data);
    refreshLinkLengths();
    if (previewActive) Scene.updatePreviewGeometry(data);
}

function onParamCommit() {
    doServerCompute();
    rebuildGrid();
}

function refreshLinkLengths() {
    const data = localCompute(currentParams);
    UI.updateLinkLengths(data.link_lengths.right, data.link_lengths.left);
}

// ── server compute ──
async function doServerCompute() {
    document.getElementById('status').textContent = 'Computing...';
    try {
        const resp = await fetch('/api/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ params: currentParams }),
        });
        const data = await resp.json();
        mechDef._paramValues = currentParams;
        Scene.updateScene(data);
        UI.updateLinkLengths(data.link_lengths.right, data.link_lengths.left);
        document.getElementById('status').textContent = 'Ready';
    } catch (err) {
        document.getElementById('status').textContent = 'Error: ' + err.message;
        document.getElementById('status').classList.add('error');
    }
}

// ── grid: compute & draw ──
function computeLrod2() {
    const data = localCompute(currentParams);
    const r = data.link_lengths.right;
    L_rod2 = r * r;
}

async function rebuildGrid() {
    computeLrod2();
    const statusEl = document.getElementById('grid-status');
    statusEl.textContent = 'Computing...';
    statusEl.className = 'grid-status computing';

    gridData = await computeGrid(currentParams, L_rod2, GRID_FROM, GRID_TO, GRID_RES,
        (done, total) => { statusEl.textContent = `Computing... ${done}/${total}`; }
    );

    statusEl.textContent = 'Ready — click/drag to explore';
    statusEl.className = 'grid-status ready';
    drawGrid();
}

function drawGrid() {
    if (!gridData) return;
    const canvas = document.getElementById('grid-canvas');
    const { grid, res, step } = gridData;
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    const cellW = size / res;
    const cellH = size / res;

    ctx.clearRect(0, 0, size, size);

    for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
            const idx = (row * res + col) * 3;
            const ok = grid[idx + 2] > 0;
            if (ok) {
                const psi = grid[idx + 1];
                const t = Math.min(Math.abs(psi) / 30, 1);
                const r = Math.round(40 + t * 160);
                const g = Math.round(160 - t * 60);
                const b = Math.round(80 + (1 - t) * 120);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
            } else {
                ctx.fillStyle = '#1a1a2e';
            }
            ctx.fillRect(col * cellW, row * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
    }

    // axis labels
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText(`β₁ ${GRID_FROM}°`, 2, size - 2);
    ctx.fillText(`${GRID_TO}°`, size - 30, size - 2);
    ctx.save();
    ctx.translate(10, 14);
    ctx.fillText(`β₂ ${GRID_FROM}°`, 0, 0);
    ctx.restore();

    // current position marker
    const curCol = Math.round((currentParams.beta1 - GRID_FROM) / step);
    const curRow = Math.round((currentParams.beta2 - GRID_FROM) / step);
    if (curCol >= 0 && curCol < res && curRow >= 0 && curRow < res) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(curCol * cellW - 1, curRow * cellH - 1, cellW + 2, cellH + 2);
    }
}

function handleGridPointer(e) {
    if (!gridData) return;
    const canvas = document.getElementById('grid-canvas');
    const { grid, res, from, step } = gridData;
    const size = canvas.width;
    const cellW = size / res;
    const cellH = size / res;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (col < 0 || col >= res || row < 0 || row >= res) return;

    const beta1 = GRID_FROM + col * step;
    const beta2 = GRID_FROM + row * step;
    const result = lookupAndCompute(currentParams, gridData, beta1, beta2);
    if (!result) return;

    const frame = result.data;
    currentParams.beta1 = beta1;
    currentParams.beta2 = beta2;
    currentParams.theta = result.theta;
    currentParams.psi = result.psi;
    mechDef._paramValues = currentParams;
    Scene.updateScene(frame);
    if (previewActive) Scene.updatePreviewGeometry(frame);

    if (explorerActive) {
        for (const tp of TRACE_POINTS) {
            if (frame.points[tp.name]) Scene.appendTracePoint(tp.name, frame.points[tp.name]);
        }
    }

    document.getElementById('grid-footer').textContent =
        `β₁=${beta1.toFixed(0)}° β₂=${beta2.toFixed(0)}° θ=${result.theta.toFixed(1)}° ψ=${result.psi.toFixed(1)}°`;
}

// ── explorer (trace mode) ──
async function toggleExplorer() {
    if (explorerActive) {
        stopExplorer();
        return;
    }

    explorerActive = true;
    const btn = document.getElementById('btn-explore');
    btn.classList.add('exploring');

    if (!previewActive) {
        previewActive = true;
        document.getElementById('btn-preview').classList.add('active');
        Scene.setPreviewMode(true);
    }

    Scene.clearTraces();
    for (const tp of TRACE_POINTS) Scene.addTrace(tp.name, tp.color, 10000);
}

function stopExplorer() {
    animator.stop();
    explorerActive = false;
    const btn = document.getElementById('btn-explore');
    btn.classList.remove('exploring');

    // Restore scene to current params
    const data = localCompute(currentParams);
    mechDef._paramValues = currentParams;
    Scene.updateScene(data);
    if (previewActive) Scene.updatePreviewGeometry(data);
}

// ── init ──
async function init() {
    try {
        const resp = await fetch('/api/mechanism/default');
        mechDef = await resp.json();
    } catch (err) {
        document.getElementById('status').textContent = 'Error: ' + err.message;
        return;
    }

    for (const [k, v] of Object.entries(mechDef.growth_params)) currentParams[k] = v.value;
    if (currentParams.psi === undefined) currentParams.psi = 0;

    UI.buildTree(mechDef.growth_tree, document.getElementById('tree-container'), selectNode);
    Scene.initScene(document.getElementById('viewport'), mechDef, selectNode);

    document.getElementById('btn-reset-cam')?.addEventListener('click', Scene.resetCamera);
    document.querySelectorAll('.view-btns button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.view;
            if (v === 'home') { Scene.resetCamera(); return; }
            const axis = v[1].toLowerCase();
            const sign = v[0] === '+' ? 1 : -1;
            Scene.setView(axis, sign);
        });
    });
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('status').textContent = 'Ready';

    document.getElementById('btn-preview')?.addEventListener('click', togglePreview);
    document.getElementById('btn-explore')?.addEventListener('click', toggleExplorer);

    // Grid interaction (always active)
    const gridCanvas = document.getElementById('grid-canvas');
    let dragging = false;
    gridCanvas.addEventListener('mousedown', (e) => { dragging = true; handleGridPointer(e); });
    gridCanvas.addEventListener('mousemove', (e) => { if (dragging) handleGridPointer(e); });
    gridCanvas.addEventListener('mouseup', () => { dragging = false; });
    gridCanvas.addEventListener('mouseleave', () => { dragging = false; });

    mechDef._paramValues = currentParams;
    Scene.updateScene(localCompute(currentParams));
    await doServerCompute();

    // Auto-compute grid after initial load
    rebuildGrid();
}

function togglePreview() {
    previewActive = !previewActive;
    const btn = document.getElementById('btn-preview');
    if (previewActive) {
        btn.classList.add('active');
        Scene.setPreviewMode(true);
        Scene.updatePreviewGeometry(localCompute(currentParams).points);
    } else {
        btn.classList.remove('active');
        Scene.setPreviewMode(false);
    }
}

init();
