/**
 * DOM UI — growth tree, params panel, tree selection.
 */

const nodeSpans = {};

export function buildTree(treeData, container, onSelect) {
    buildNode(treeData, container, onSelect);
}

export function updateTreeSelection(name) {
    clearTreeSelection();
    const span = nodeSpans[name];
    if (span) span.classList.add('selected');
}

export function clearTreeSelection() {
    document.querySelectorAll('.tree .node').forEach(n => n.classList.remove('selected'));
}

export function renderParamsPanel(name, treeNode, growthParams, currentParams, onChange, onCommit) {
    const panel = document.getElementById('panel-params');
    if (!name) {
        panel.innerHTML = '<p class="no-selection">Select a step to view its parameters</p>';
        return;
    }
    if (!treeNode) {
        panel.innerHTML = '<p class="no-selection">Unknown node</p>';
        return;
    }

    let html = '<div class="step-info">';
    html += `<div class="step-title">${name}</div>`;
    html += `<div class="step-type">${treeNode.type === 'frame' ? 'Coordinate Frame' : 'Point'}</div>`;
    if (treeNode.step) html += `<div class="step-type" style="margin-top:2px">Step ${treeNode.step}</div>`;
    if (treeNode.relation) html += `<div class="step-relation">${treeNode.relation}</div>`;
    html += '</div>';

    const paramNames = treeNode.params || [];
    if (paramNames.length > 0) {
        html += '<div class="param-group"><h3>Parameters</h3>';
        for (const pname of paramNames) {
            const spec = growthParams[pname];
            if (!spec) continue;
            const val = currentParams[pname];
            const unitStr = spec.unit === 'deg' ? '°' : '';
            html += `<div class="param-row">
                <label>${spec.label}</label>
                <input type="range" min="${spec.min}" max="${spec.max}" step="1" value="${val}" data-param="${pname}">
                <span class="val" id="val-${pname}">${val}${unitStr}</span>
            </div>`;
        }
        html += '</div>';
    }

    html += `<div class="auto-computed">
        <h3>Auto-computed</h3>
        <div class="val-row"><span>link_right (bar_upper → link_r)</span><span class="v" id="ac-link-r">--</span></div>
        <div class="val-row"><span>link_left (bar_lower → link_l)</span><span class="v" id="ac-link-l">--</span></div>
    </div>`;

    panel.innerHTML = html;

    panel.querySelectorAll('input[data-param]').forEach(inp => {
        inp.addEventListener('input', () => {
            const pname = inp.dataset.param;
            const v = parseFloat(inp.value);
            const spec = growthParams[pname];
            const unitStr = spec.unit === 'deg' ? '°' : '';
            document.getElementById('val-' + pname).textContent = v + unitStr;
            onChange(pname, v);
        });
        inp.addEventListener('change', () => {
            onCommit();
        });
    });
}

export function updateLinkLengths(rightVal, leftVal) {
    const el1 = document.getElementById('ac-link-r');
    const el2 = document.getElementById('ac-link-l');
    if (el1) el1.textContent = rightVal.toFixed(2) + ' mm';
    if (el2) el2.textContent = leftVal.toFixed(2) + ' mm';
}

export function findTreeNode(node, name) {
    if (node.name === name) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findTreeNode(child, name);
            if (found) return found;
        }
    }
    return null;
}

// ── internal ──

function buildNode(node, container, onSelect) {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'node';
    const ic = node.type === 'frame' ? 'frame' : 'point';
    span.innerHTML = `<span class="icon ${ic}">${node.type === 'frame' ? '■' : '●'}</span>`;
    span.appendChild(document.createTextNode(node.name));
    if (node.step) {
        const badge = document.createElement('span');
        badge.className = 'step-badge';
        badge.textContent = 'S' + node.step;
        span.appendChild(badge);
    }
    nodeSpans[node.name] = span;
    span.addEventListener('click', (e) => { e.stopPropagation(); onSelect(node.name); });

    li.appendChild(span);

    if (node.relation) {
        const rel = document.createElement('div');
        rel.className = 'relation';
        rel.textContent = node.relation;
        li.appendChild(rel);
    }

    if (node.children) {
        for (const child of node.children) buildNode(child, li, onSelect);
    }
    ul.appendChild(li);
    container.appendChild(ul);
}
