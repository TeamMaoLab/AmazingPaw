/**
 * Grid mode — β₁×β₂ parameter space heatmap + interaction.
 */
import { S } from './state.js';
import { gridLookup } from './solver.js';
import { updatePositions } from './scene-builder.js';
import { updateWorkspaceMarker } from './workspace.js';

// Heatmap drawing area: margin for axis labels
const MARGIN = { top: 20, right: 10, bottom: 34, left: 42 };

// Color scale for solved cells: maps |theta,phi| magnitude to color
function solvedColor(theta, phi) {
  const mag = Math.sqrt(theta * theta + phi * phi);
  const t = Math.min(1, mag / 120);
  const r = Math.round(255 * Math.min(1, t * 2));
  const g = Math.round(255 * Math.min(1, 2 - t * 2));
  const b = Math.round(60 * (1 - t));
  return `rgb(${r},${g},${b})`;
}

// ── Heatmap rendering ──

export function drawGrid(gridData, beta1, beta2) {
  const canvas = document.getElementById('grid-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { grid, res, from, to } = gridData;

  const cw = canvas.width;
  const ch = canvas.height;
  const plotX = MARGIN.left;
  const plotY = MARGIN.top;
  const plotW = cw - MARGIN.left - MARGIN.right;
  const plotH = ch - MARGIN.top - MARGIN.bottom;
  const cellW = plotW / res;
  const cellH = plotH / res;

  // Clear
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);

  // Plot background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(plotX, plotY, plotW, plotH);

  // Cells — row 0 = beta2=from at bottom
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const idx = (row * res + col) * 3;
      if (grid[idx + 2] > 0) {
        ctx.fillStyle = solvedColor(grid[idx], grid[idx + 1]);
        const cy = plotY + plotH - (row + 1) * cellH;
        ctx.fillRect(plotX + col * cellW, cy, cellW + 0.5, cellH + 0.5);
      }
    }
  }

  // Current position marker
  if (beta1 !== undefined && beta2 !== undefined) {
    const cx = plotX + ((beta1 - from) / (to - from)) * plotW;
    const cy = plotY + plotH - ((beta2 - from) / (to - from)) * plotH;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 4, cy - 4, 8, 8);
  }

  // ── Axis labels ──
  ctx.fillStyle = '#444';
  ctx.font = 'bold 11px monospace';

  // X-axis label (β₁)
  ctx.textAlign = 'center';
  ctx.fillText('β₁ (right servo)', plotX + plotW / 2, ch - 2);

  // Y-axis label (β₂)
  ctx.save();
  ctx.translate(8, plotY + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('β₂ (left servo)', 0, 0);
  ctx.restore();

  // Tick marks
  ctx.font = '9px monospace';
  ctx.fillStyle = '#666';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = from + (to - from) * i / ticks;

    // X-axis ticks
    const x = plotX + (i / ticks) * plotW;
    ctx.textAlign = 'center';
    ctx.fillText(val.toFixed(0) + '°', x, plotY + plotH + 14);
    // Tick line
    ctx.beginPath();
    ctx.moveTo(x, plotY + plotH);
    ctx.lineTo(x, plotY + plotH + 3);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Y-axis ticks (flipped: 0° at bottom, max at top)
    const y = plotY + plotH - (i / ticks) * plotH;
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(0) + '°', plotX - 4, y + 3);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX - 3, y);
    ctx.stroke();
  }

  // Range summary
  ctx.fillStyle = '#999';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Range: ${from}° – ${to}°`, plotX, plotY - 4);
}

// ── Pointer interaction ──

function handleGridPointer(e) {
  if (!S.gridData || S.mode !== 'grid') return;
  const canvas = document.getElementById('grid-canvas');
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const cw = canvas.width;
  const ch = canvas.height;
  const plotX = MARGIN.left;
  const plotY = MARGIN.top;
  const plotW = cw - MARGIN.left - MARGIN.right;
  const plotH = ch - MARGIN.top - MARGIN.bottom;

  const { from, to, res } = S.gridData;
  const beta1 = from + ((px - plotX) / plotW) * (to - from);
  const beta2 = to - ((py - plotY) / plotH) * (to - from);

  if (beta1 < from || beta1 > to || beta2 < from || beta2 > to) return;

  const result = gridLookup(S.params, S.gridData, beta1, beta2);
  if (result) {
    S.params.beta1 = beta1;
    S.params.beta2 = beta2;
    S.solverResult = { theta: result.theta, phi: result.phi };
    S.kinematicPositions = result.positions;
    updatePositions(S.kinematicPositions);
    updateWorkspaceMarker();
    drawGrid(S.gridData, beta1, beta2);

    const status = document.getElementById('grid-footer');
    if (status) status.textContent = `β₁=${beta1.toFixed(1)}° β₂=${beta2.toFixed(1)}° θ=${result.theta.toFixed(2)}° φ=${result.phi.toFixed(2)}°`;
  }
}

let dragging = false;

function onPointerDown(e) {
  dragging = true;
  handleGridPointer(e);
}

function onPointerMove(e) {
  if (dragging) handleGridPointer(e);
}

function onPointerUp() {
  dragging = false;
}

// ── Public API ──

export function showGridPanel() {
  const el = document.getElementById('grid-panel');
  if (el) el.classList.remove('hidden');

  const canvas = document.getElementById('grid-canvas');
  if (canvas && !canvas._bound) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas._bound = true;
  }

  if (S.gridData) {
    drawGrid(S.gridData, S.params.beta1, S.params.beta2);
  } else {
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Computing...', canvas.width / 2, canvas.height / 2);
    }
  }
}

export function hideGridPanel() {
  const el = document.getElementById('grid-panel');
  if (el) el.classList.add('hidden');
  dragging = false;
}
