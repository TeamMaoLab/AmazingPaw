/**
 * Three.js scene — rendering, element creation, highlight, labels.
 */
import * as THREE from '/static/lib/three.module.js';
import { OrbitControls } from '/static/lib/OrbitControls.js';

const SPHERE_SEG = 16;
const AXIS_LENGTH = 8;
const DEFAULT_CAM_POS = [50, -60, 60];
const DEFAULT_CAM_TARGET = [10, 0, 20];

let scene, camera, renderer, controls, raycaster, mouse;
let viewport;
let mechDef;

const pointMeshes = {};
const lineObjects = {};
const circleObjects = {};
const labelDivs = {};
const frameAxes = {};
const frameLabelDivs = {};

export function initScene(containerEl, definition, onNodeClick) {
    viewport = containerEl;
    mechDef = definition;

    const w = containerEl.clientWidth, h = containerEl.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    camera.position.set(...DEFAULT_CAM_POS);
    camera.up.set(0, 0, 1);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerEl.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...DEFAULT_CAM_TARGET);
    controls.update();

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const axLen = 25;
    addWorldAxis([0,0,0], [axLen,0,0], 0xee4444, 'X');
    addWorldAxis([0,0,0], [0,axLen,0], 0x44bb44, 'Y');
    addWorldAxis([0,0,0], [0,0,axLen], 0x4488ee, 'Z');

    const grid = new THREE.GridHelper(100, 20, 0xe0e0e0, 0xefefef);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    for (const el of mechDef.visualization) createEl(el);
    for (const fname of mechDef.frame_names) createFrameAxes(fname);

    renderer.domElement.addEventListener('click', (e) => onCanvasClick(e, onNodeClick));
    window.addEventListener('resize', onResize);
    animate();
}

export function updateScene(data) {
    const pts = data.points;
    for (const [name, mesh] of Object.entries(pointMeshes)) {
        if (pts[name] && mesh.position && mesh.position.set) mesh.position.set(...pts[name]);
    }
    for (const el of mechDef.visualization) {
        if (el.type === 'line') {
            const line = lineObjects[el.id];
            if (!line || !pts[el.from] || !pts[el.to]) continue;
            const p = line.geometry.attributes.position.array;
            p[0]=pts[el.from][0]; p[1]=pts[el.from][1]; p[2]=pts[el.from][2];
            p[3]=pts[el.to][0];   p[4]=pts[el.to][1];   p[5]=pts[el.to][2];
            line.geometry.attributes.position.needsUpdate = true;
            if (el.dash) line.computeLineDistances();
        }
        else if (el.type === 'circle') {
            const line = circleObjects[el.id];
            if (!line) continue;
            const c = pts[el.center]; const r = mechDef._paramValues?.[el.radius_param] || 16;
            if (!c) continue;
            const p = line.geometry.attributes.position.array;
            const n = (p.length / 3) - 1;
            for (let i = 0; i <= n; i++) {
                const a = (i / n) * Math.PI * 2; const j = i * 3;
                p[j]=c[0]; p[j+1]=c[1]+r*Math.cos(a); p[j+2]=c[2]+r*Math.sin(a);
            }
            line.geometry.attributes.position.needsUpdate = true;
            if (el.dash) line.computeLineDistances();
        }
    }
    const frames = data.frames || {};
    for (const fname of mechDef.frame_names) {
        const fa = frameAxes[fname]; const fd = frames[fname];
        if (!fa || !fd) continue;
        fa.group.position.set(...fd.origin);
        const axes = fd.axes;
        [new THREE.Vector3(...axes[0]).normalize(),
         new THREE.Vector3(...axes[1]).normalize(),
         new THREE.Vector3(...axes[2]).normalize()
        ].forEach((dir, i) => {
            fa.arrows[i].setDirection(dir);
            fa.arrows[i].setLength(AXIS_LENGTH, 2, 1.2);
        });
    }
    updateLabels();
}

export function applyHighlight(relatedNames, frameNames) {
    for (const [pname, mesh] of Object.entries(pointMeshes)) {
        if (pname.startsWith('_')) continue;
        setObjOpacity(mesh, relatedNames.has(pname) ? 1.0 : 0.08);
    }
    for (const [eid, line] of Object.entries(lineObjects)) setObjOpacity(line, relatedNames.has(eid) ? 1.0 : 0.08);
    for (const [eid, line] of Object.entries(circleObjects)) setObjOpacity(line, relatedNames.has(eid) ? 1.0 : 0.08);
    for (const fname of frameNames) {
        const fa = frameAxes[fname];
        if (!fa) continue;
        const op = relatedNames.has(fname) ? 1.0 : 0.08;
        fa.arrows.forEach(a => { setObjOpacity(a.line, op); setObjOpacity(a.cone, op); });
    }
}

export function clearHighlight(frameNames) {
    for (const [n, m] of Object.entries(pointMeshes)) { if (!n.startsWith('_')) setObjOpacity(m, 1.0); }
    for (const l of Object.values(lineObjects)) setObjOpacity(l, 1.0);
    for (const l of Object.values(circleObjects)) setObjOpacity(l, 1.0);
    for (const fname of frameNames) {
        const fa = frameAxes[fname];
        if (!fa) continue;
        fa.arrows.forEach(a => { setObjOpacity(a.line, 1.0); setObjOpacity(a.cone, 1.0); });
    }
}

export function resetCamera() {
    camera.position.set(...DEFAULT_CAM_POS);
    camera.up.set(0, 0, 1);
    controls.target.set(...DEFAULT_CAM_TARGET);
    controls.update();
}

const VIEW_DIST = 80;
const VIEW_TARGET = new THREE.Vector3(10, 0, 20);

export function setView(axis, sign) {
    const pos = VIEW_TARGET.clone();
    if (axis === 'x') { pos.x += sign * VIEW_DIST; camera.up.set(0, 0, 1); }
    if (axis === 'y') { pos.y += sign * VIEW_DIST; camera.up.set(0, 0, 1); }
    if (axis === 'z') { pos.z += sign * VIEW_DIST; camera.up.set(0, sign, 0); }
    camera.position.copy(pos);
    controls.target.copy(VIEW_TARGET);
    controls.update();
}

// ── internal ──

function setObjOpacity(obj, op) {
    if (!obj || !obj.material) return;
    obj.material.transparent = op < 1.0;
    obj.material.opacity = op;
    if (obj.material.isLineDashedMaterial && op >= 1.0) obj.material.transparent = false;
}

function addWorldAxis(a, b, color, label) {
    const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    scene.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color })));
    const div = document.createElement('div');
    div.className = 'frame-label';
    div.textContent = label;
    div.style.color = '#' + color.toString(16).padStart(6, '0');
    viewport.appendChild(div);
    labelDivs['_world_' + label] = div;
    pointMeshes['_world_' + label] = { position: new THREE.Vector3(...b) };
}

function createFrameAxes(name) {
    const group = new THREE.Group();
    const colors = [0xee4444, 0x44bb44, 0x4488ee];
    const dirs = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
    const arrows = dirs.map((dir, i) => {
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), AXIS_LENGTH, colors[i], 2, 1.2);
        arrow.line.material.transparent = true; arrow.line.material.opacity = 1.0;
        arrow.cone.material.transparent = true; arrow.cone.material.opacity = 1.0;
        group.add(arrow);
        return arrow;
    });
    scene.add(group);

    const div = document.createElement('div');
    div.className = 'frame-label';
    div.textContent = name;
    viewport.appendChild(div);
    frameLabelDivs[name] = div;
    frameAxes[name] = { group, arrows };
}

function createEl(el) {
    if (el.type === 'sphere') {
        const geom = new THREE.SphereGeometry(el.radius, SPHERE_SEG, SPHERE_SEG);
        const mat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 1.0, depthWrite: true });
        const mesh = new THREE.Mesh(geom, mat);
        scene.add(mesh);
        pointMeshes[el.point] = mesh;
        if (el.label) {
            const div = document.createElement('div');
            div.className = 'label';
            div.textContent = el.label;
            viewport.appendChild(div);
            labelDivs[el.point] = div;
        }
    }
    else if (el.type === 'line') {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        let mat;
        if (el.dash) mat = new THREE.LineDashedMaterial({ color: el.color, transparent: true, opacity: 1.0, dashSize: 2, gapSize: 1.5 });
        else mat = new THREE.LineBasicMaterial({ color: el.color, transparent: true, opacity: 1.0 });
        const line = new THREE.Line(geom, mat);
        if (el.dash) line.computeLineDistances();
        scene.add(line);
        lineObjects[el.id] = line;
    }
    else if (el.type === 'circle') {
        const seg = 64;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((seg+1)*3), 3));
        const mat = el.dash
            ? new THREE.LineDashedMaterial({ color: el.color, transparent: true, opacity: 1.0, dashSize: 2, gapSize: 1.5 })
            : new THREE.LineBasicMaterial({ color: el.color, transparent: true, opacity: 1.0 });
        const line = new THREE.Line(geom, mat);
        scene.add(line);
        circleObjects[el.id] = line;
    }
}

function onCanvasClick(event, onNodeClick) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = Object.entries(pointMeshes).filter(([n]) => !n.startsWith('_')).map(([,m]) => m);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0) return;
    const hitName = Object.entries(pointMeshes).find(([,m]) => m === hits[0].object)?.[0];
    if (hitName) onNodeClick(hitName);
}

function updateLabels() {
    const rect = renderer.domElement.getBoundingClientRect();
    for (const [name, div] of Object.entries(labelDivs)) {
        const mesh = pointMeshes[name];
        if (!mesh || !mesh.position || !mesh.position.clone) continue;
        const v = mesh.position.clone().project(camera);
        div.style.left = ((v.x * 0.5 + 0.5) * rect.width + 8) + 'px';
        div.style.top = ((-v.y * 0.5 + 0.5) * rect.height - 6) + 'px';
        div.style.display = v.z < 1 ? '' : 'none';
    }
    for (const fname of mechDef.frame_names) {
        const fa = frameAxes[fname]; const div = frameLabelDivs[fname];
        if (!fa || !div) continue;
        const v = fa.group.position.clone().project(camera);
        div.style.left = ((v.x * 0.5 + 0.5) * rect.width + 12) + 'px';
        div.style.top = ((-v.y * 0.5 + 0.5) * rect.height + 2) + 'px';
        div.style.display = v.z < 1 ? '' : 'none';
    }
}

function onResize() {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
}
