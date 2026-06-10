/**
 * Entry point — coordinates scene, ui, and compute modules.
 */
import { localCompute } from '/static/compute.js';
import * as Scene from '/static/scene.js';
import * as UI from '/static/ui.js';

// ── shared state ──
let mechDef = null;
let currentParams = {};
let selectedName = null;

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
    Scene.updateScene(localCompute(currentParams));
    refreshLinkLengths();
}

function onParamCommit() {
    doServerCompute();
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

    UI.buildTree(mechDef.growth_tree, document.getElementById('tree-container'), selectNode);
    Scene.initScene(document.getElementById('viewport'), mechDef, selectNode);

    document.getElementById('btn-reset-cam')?.addEventListener('click', Scene.resetCamera);
    document.querySelectorAll('.view-btns button').forEach(btn => {
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
    document.getElementById('footer').textContent = 'Ready';

    mechDef._paramValues = currentParams;
    Scene.updateScene(localCompute(currentParams));
    await doServerCompute();
}

init();
