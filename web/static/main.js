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
    'base': ['base'],
    'pivot': ['pivot'],
    'rocker': ['arm', 'proximal', 'upright', 'tip', 'bar_upper', 'bar_lower'],
    'servo_r': ['servo_r', 'link_r'],
    'servo_l': ['servo_l', 'link_l'],
};
const pointToElements = {
    'base':      ['base_pivot_line'],
    'pivot':     ['base_pivot_line', 'pivot_arm_line', 'pivot_proximal_line', 'pivot_upright_line', 'rot_axis'],
    'arm':       ['pivot_arm_line', 'bar_line'],
    'proximal':  ['pivot_proximal_line'],
    'upright':   ['pivot_upright_line', 'upright_tip_line'],
    'tip':       ['upright_tip_line'],
    'bar_upper': ['bar_line', 'link_right_line'],
    'bar_lower': ['bar_line', 'link_left_line'],
    'link_r':    ['link_right_line', 'servo_r_circle'],
    'link_l':    ['link_left_line', 'servo_l_circle'],
    'servo_r':   ['servo_r_circle'],
    'servo_l':   ['servo_l_circle'],
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
