/**
 * Three.js scene — rendering, element creation, highlight, labels.
 * Dual camera: perspective for orbit, orthographic for axis views.
 */
import * as THREE from '/static/lib/three.module.js';
import { OrbitControls } from '/static/lib/OrbitControls.js';

const SPHERE_SEG = 16;
const AXIS_LENGTH = 8;
const DEFAULT_CAM_POS = [130, 140, 150];
const DEFAULT_CAM_TARGET = [10, 0, 66];
const ORTHO_SIZE = 160;
const VIEW_DIST = 160;
const VIEW_TARGET = new THREE.Vector3(10, 0, 66);

let scene, renderer, controls, raycaster, mouse;
let perspCam, orthoCam, activeCam;
let viewport;
let mechDef;
let previewMode = false;

const pointMeshes = {};
const lineObjects = {};
const circleObjects = {};
const labelDivs = {};
const frameAxes = {};
const frameLabelDivs = {};

const bodyMeshes = [];
const jointMeshes = [];

const traceObjects = {};   // pointName → { line, buf, count, max }

export function initScene(containerEl, definition, onNodeClick) {
    viewport = containerEl;
    mechDef = definition;

    const w = containerEl.clientWidth, h = containerEl.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    perspCam = new THREE.PerspectiveCamera(50, w / h, 0.01, 5000);
    perspCam.position.set(...DEFAULT_CAM_POS);
    perspCam.up.set(0, 0, 1);

    const aspect = w / h;
    orthoCam = new THREE.OrthographicCamera(
        -ORTHO_SIZE * aspect / 2, ORTHO_SIZE * aspect / 2,
        ORTHO_SIZE / 2, -ORTHO_SIZE / 2, 0.01, 5000
    );
    orthoCam.up.set(0, 0, 1);

    activeCam = perspCam;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerEl.appendChild(renderer.domElement);

    controls = new OrbitControls(activeCam, renderer.domElement);
    controls.target.set(...DEFAULT_CAM_TARGET);
    controls.update();

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const axLen = 25;
    addWorldAxis([0,0,0], [axLen,0,0], 0xcc4444, 'X');
    addWorldAxis([0,0,0], [0,axLen,0], 0x44aa44, 'Y');
    addWorldAxis([0,0,0], [0,0,axLen], 0x4488cc, 'Z');

    const grid = new THREE.GridHelper(100, 20, 0xe0e0e0, 0xefefef);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    for (const el of mechDef.visualization) createEl(el);
    for (const fname of mechDef.frame_names) createFrameAxes(fname);

    renderer.domElement.addEventListener('click', (e) => onCanvasClick(e, onNodeClick));
    window.addEventListener('resize', onResize);
    animate();
}

function switchCamera(cam) {
    if (activeCam === cam) return;
    cam.position.copy(activeCam.position);
    cam.up.copy(activeCam.up);
    activeCam = cam;
    controls.object = activeCam;
    activeCam.updateProjectionMatrix();
    controls.update();
}

export function resetCamera() {
    switchCamera(perspCam);
    activeCam.position.set(...DEFAULT_CAM_POS);
    activeCam.up.set(0, 0, 1);
    controls.target.set(...DEFAULT_CAM_TARGET);
    controls.update();
}

export function setView(axis, sign) {
    switchCamera(orthoCam);
    orthoCam.zoom = 1;
    const pos = VIEW_TARGET.clone();
    if (axis === 'x') { pos.x += sign * VIEW_DIST; activeCam.up.set(0, 0, 1); }
    if (axis === 'y') { pos.y += sign * VIEW_DIST; activeCam.up.set(0, 0, 1); }
    if (axis === 'z') { pos.z += sign * VIEW_DIST; activeCam.up.set(0, sign, 0); }
    activeCam.position.copy(pos);
    controls.target.copy(VIEW_TARGET);
    activeCam.updateProjectionMatrix();
    controls.update();
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
            if (el.style === 'passive' || el.style === 'ref') line.computeLineDistances();
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
            if (el.style === 'passive' || el.style === 'ref') line.computeLineDistances();
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
            const end = dir.clone().multiplyScalar(AXIS_LENGTH);
            const pos = fa.lines[i].geometry.attributes.position.array;
            pos[0]=0; pos[1]=0; pos[2]=0;
            pos[3]=end.x; pos[4]=end.y; pos[5]=end.z;
            fa.lines[i].geometry.attributes.position.needsUpdate = true;
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
        fa.lines.forEach(l => { setObjOpacity(l, op); });
    }
}

export function clearHighlight(frameNames) {
    for (const [n, m] of Object.entries(pointMeshes)) { if (!n.startsWith('_')) setObjOpacity(m, 1.0); }
    for (const l of Object.values(lineObjects)) setObjOpacity(l, 1.0);
    for (const l of Object.values(circleObjects)) setObjOpacity(l, 1.0);
    for (const fname of frameNames) {
        const fa = frameAxes[fname];
        if (!fa) continue;
        fa.lines.forEach(l => { setObjOpacity(l, 1.0); });
    }
}

export function setPreviewMode(on) {
    previewMode = on;
    // Toggle visibility of frame axes, world axis labels, and reference lines
    const show = !on;
    for (const fname of mechDef.frame_names) {
        const fa = frameAxes[fname];
        if (fa) fa.lines.forEach(l => { l.visible = show; });
        const div = frameLabelDivs[fname];
        if (div) div.style.display = show ? '' : 'none';
    }
    for (const [n, div] of Object.entries(labelDivs)) {
        if (n.startsWith('_world_')) div.style.display = show ? '' : 'none';
    }
    // Hide ref-style and passive lines in preview
    for (const el of mechDef.visualization) {
        if (el.type === 'line' && (el.style === 'ref' || el.style === 'passive')) {
            const obj = lineObjects[el.id];
            if (obj) obj.visible = show;
        }
        if (el.type === 'circle') {
            const obj = circleObjects[el.id];
            if (obj) obj.visible = show;
        }
    }
    rebuildPreviewObjects();
}

export function updatePreviewGeometry(data) {
    if (!previewMode) return;
    rebuildPreviewObjects(data.points);
}

export function addTrace(pointName, color, maxPoints) {
    if (traceObjects[pointName]) return;
    const buf = new Float32Array(maxPoints * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    geom.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.8 });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    scene.add(line);
    traceObjects[pointName] = { line, buf, count: 0, max: maxPoints };
}

export function appendTracePoint(pointName, pos) {
    const t = traceObjects[pointName];
    if (!t || t.count >= t.max) return;
    const i = t.count * 3;
    t.buf[i] = pos[0]; t.buf[i+1] = pos[1]; t.buf[i+2] = pos[2];
    t.count++;
    t.line.geometry.setDrawRange(0, t.count);
    t.line.geometry.attributes.position.needsUpdate = true;
}

export function clearTraces() {
    for (const [, t] of Object.entries(traceObjects)) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
    }
    for (const k of Object.keys(traceObjects)) delete traceObjects[k];
}

export function showTraces(visible) {
    for (const [, t] of Object.entries(traceObjects)) t.line.visible = visible;
}

function rebuildPreviewObjects(pts) {
    clearPreviewObjects();
    if (!previewMode || !mechDef.rigid_bodies) return;

    const points = pts || (mechDef._paramValues ? collectCurrentPoints() : null);
    if (!points) return;

    for (const body of mechDef.rigid_bodies) {
        const color = new THREE.Color(body.color);
        const faces = body.faces;   // explicit triangles e.g. [["P","A","Q"]]
        const edges = body.edges;   // extra line segments e.g. [["R","L"]]

        if (faces && faces.length > 0) {
            // Explicit face list
            const verts = [];
            for (const tri of faces) {
                const c = tri.map(p => points[p]).filter(Boolean);
                if (c.length === 3) verts.push(...c[0], ...c[1], ...c[2]);
            }
            if (verts.length > 0) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
                geom.computeVertexNormals();
                const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.renderOrder = -1;
                scene.add(mesh);
                bodyMeshes.push(mesh);
            }
            // Edge outlines for each face
            for (const tri of faces) {
                const c = tri.map(p => points[p]).filter(Boolean);
                if (c.length < 2) continue;
                const ev = [];
                for (const p of c) ev.push(...p);
                ev.push(...c[0]); // close
                const eg = new THREE.BufferGeometry();
                eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ev), 3));
                const el = new THREE.Line(eg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
                el.frustumCulled = false;
                scene.add(el);
                bodyMeshes.push(el);
            }
        } else {
            // No explicit faces — auto render
            const coords = body.points.map(p => points[p]).filter(Boolean);
            if (coords.length === 2) {
                const [a, b] = coords;
                const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
                const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
                const cylGeom = new THREE.CylinderGeometry(1.5, 1.5, len, 12);
                const cylMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
                const cyl = new THREE.Mesh(cylGeom, cylMat);
                cyl.position.set((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2);
                const dir = new THREE.Vector3(dx, dy, dz).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                cyl.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, dir));
                scene.add(cyl);
                bodyMeshes.push(cyl);
            } else if (coords.length >= 3) {
                const verts = [];
                for (let i = 1; i < coords.length - 1; i++) verts.push(...coords[0], ...coords[i], ...coords[i+1]);
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
                geom.computeVertexNormals();
                const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.renderOrder = -1;
                scene.add(mesh);
                bodyMeshes.push(mesh);
                const ev = [];
                for (const c of coords) ev.push(...c);
                ev.push(...coords[0]);
                const eg = new THREE.BufferGeometry();
                eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ev), 3));
                const el = new THREE.Line(eg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
                el.frustumCulled = false;
                scene.add(el);
                bodyMeshes.push(el);
            }
        }

        // Extra edges (e.g. bar R-L) — render as cylinders
        if (edges) {
            for (const pair of edges) {
                const c = pair.map(p => points[p]).filter(Boolean);
                if (c.length !== 2) continue;
                const [a, b] = c;
                const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
                const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
                const cylGeom = new THREE.CylinderGeometry(1.2, 1.2, len, 12);
                const cylMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
                const cyl = new THREE.Mesh(cylGeom, cylMat);
                cyl.position.set((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2);
                // CylinderGeometry default axis is Y, rotate to align with direction
                const dir = new THREE.Vector3(dx, dy, dz).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
                cyl.quaternion.copy(quat);
                scene.add(cyl);
                bodyMeshes.push(cyl);
            }
        }

        // Body label — centroid of all points, same color as body
        const allCoords = body.points.map(p => points[p]).filter(Boolean);
        if (allCoords.length > 0) {
            const cx = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
            const cy = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
            const cz = allCoords.reduce((s, c) => s + c[2], 0) / allCoords.length;
            const div = document.createElement('div');
            div.className = 'body-label';
            div.textContent = body.name;
            div.style.color = body.color;
            div.style.borderColor = body.color;
            viewport.appendChild(div);
            bodyMeshes.push({ _labelDiv: div, _pos: [cx, cy, cz] });
        }
    }

    // Joint markers
    if (mechDef.joints) {
        for (const joint of mechDef.joints) {
            const p = points[joint.point];
            if (!p) continue;

            if (joint.type === 'ball') {
                // Ball joint: small cyan sphere
                const jGeom = new THREE.SphereGeometry(1.8, 12, 12);
                const jMat = new THREE.MeshBasicMaterial({ color: 0x22aacc, transparent: true, opacity: 0.8 });
                const jMesh = new THREE.Mesh(jGeom, jMat);
                jMesh.position.set(...p);
                scene.add(jMesh);
                jointMeshes.push(jMesh);
            } else {
                // Revolute: just a red line through the joint point
                const ax = (joint.axis || 'Y').toUpperCase();
                const axisLen = 10;
                const a0 = [p[0], p[1], p[2]], a1 = [p[0], p[1], p[2]];
                const idx = ax === 'X' ? 0 : ax === 'Y' ? 1 : 2;
                a1[idx] += axisLen;
                const axisGeom = new THREE.BufferGeometry();
                axisGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a0, ...a1]), 3));
                const axisMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 });
                const axisLine = new THREE.Line(axisGeom, axisMat);
                axisLine.frustumCulled = false;
                scene.add(axisLine);
                jointMeshes.push(axisLine);
            }

            // Joint label
            const div = document.createElement('div');
            div.className = 'joint-label';
            div.textContent = joint.name + ' ' + joint.desc;
            viewport.appendChild(div);
            jointMeshes.push({ _labelDiv: div, _pos: p });
        }
    }
}

function clearPreviewObjects() {
    for (const obj of bodyMeshes) {
        if (obj._labelDiv) { obj._labelDiv.remove(); continue; }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        scene.remove(obj);
    }
    bodyMeshes.length = 0;
    for (const obj of jointMeshes) {
        if (obj._labelDiv) { obj._labelDiv.remove(); continue; }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        scene.remove(obj);
    }
    jointMeshes.length = 0;
}

function collectCurrentPoints() {
    // Fallback: reconstruct from mesh positions
    const pts = {};
    for (const [name, mesh] of Object.entries(pointMeshes)) {
        if (name.startsWith('_') || !mesh.position) continue;
        pts[name] = [mesh.position.x, mesh.position.y, mesh.position.z];
    }
    return pts;
}

// ── internal ──

function makeLineMat(el) {
    if (el.style === 'passive')
        return new THREE.LineDashedMaterial({ color: el.color, transparent: true, opacity: 1.0, dashSize: 2, gapSize: 1.5 });
    if (el.style === 'ref')
        return new THREE.LineDashedMaterial({ color: el.color, transparent: true, opacity: 1.0, dashSize: 1, gapSize: 2 });
    return new THREE.LineBasicMaterial({ color: el.color, transparent: true, opacity: 1.0 });
}

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
    const colors = [0xcc4444, 0x44aa44, 0x4488cc];
    const dirs = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
    const lines = dirs.map((dir, i) => {
        const end = dir.clone().multiplyScalar(AXIS_LENGTH);
        const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), end]);
        const mat = new THREE.LineBasicMaterial({ color: colors[i], transparent: true, opacity: 1.0 });
        const line = new THREE.Line(geom, mat);
        line.frustumCulled = false;
        group.add(line);
        return line;
    });
    scene.add(group);

    const div = document.createElement('div');
    div.className = 'frame-label';
    div.textContent = name;
    viewport.appendChild(div);
    frameLabelDivs[name] = div;
    frameAxes[name] = { group, lines };
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
        const mat = makeLineMat(el);
        const line = new THREE.Line(geom, mat);
        line.frustumCulled = false;
        if (el.style === 'passive' || el.style === 'ref') line.computeLineDistances();
        scene.add(line);
        lineObjects[el.id] = line;
    }
    else if (el.type === 'circle') {
        const seg = 64;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((seg+1)*3), 3));
        const mat = makeLineMat(el);
        const line = new THREE.Line(geom, mat);
        line.frustumCulled = false;
        if (el.style === 'passive' || el.style === 'ref') line.computeLineDistances();
        scene.add(line);
        circleObjects[el.id] = line;
    }
}

function onCanvasClick(event, onNodeClick) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, activeCam);
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
        const v = mesh.position.clone().project(activeCam);
        div.style.left = ((v.x * 0.5 + 0.5) * rect.width + 8) + 'px';
        div.style.top = ((-v.y * 0.5 + 0.5) * rect.height - 6) + 'px';
        div.style.display = v.z < 1 ? '' : 'none';
    }
    for (const fname of mechDef.frame_names) {
        const fa = frameAxes[fname]; const div = frameLabelDivs[fname];
        if (!fa || !div) continue;
        const v = fa.group.position.clone().project(activeCam);
        div.style.left = ((v.x * 0.5 + 0.5) * rect.width + 12) + 'px';
        div.style.top = ((-v.y * 0.5 + 0.5) * rect.height + 2) + 'px';
        div.style.display = v.z < 1 ? '' : 'none';
    }
    // Body & joint labels
    const allPreview = [...bodyMeshes, ...jointMeshes];
    for (const obj of allPreview) {
        if (!obj._labelDiv) continue;
        const v = new THREE.Vector3(...obj._pos).project(activeCam);
        obj._labelDiv.style.left = ((v.x * 0.5 + 0.5) * rect.width + 10) + 'px';
        obj._labelDiv.style.top = ((-v.y * 0.5 + 0.5) * rect.height - 8) + 'px';
        obj._labelDiv.style.display = v.z < 1 ? '' : 'none';
    }
}

function onResize() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    perspCam.aspect = w / h;
    perspCam.updateProjectionMatrix();
    const aspect = w / h;
    orthoCam.left = -ORTHO_SIZE * aspect / 2;
    orthoCam.right = ORTHO_SIZE * aspect / 2;
    orthoCam.top = ORTHO_SIZE / 2;
    orthoCam.bottom = -ORTHO_SIZE / 2;
    orthoCam.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateLabels();
    renderer.render(scene, activeCam);
}
