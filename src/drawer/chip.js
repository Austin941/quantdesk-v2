import { state } from '../state.js';
import { dState } from './state.js';
import { TornadoRenderer } from '../renderers/TornadoRenderer.js';
import { fetchStaticJson } from './index.js';
import { syncAllCrosshairs } from './kline.js';

export function initChipSubCanvasEvents() {
  const ids = ['drw-chip-total-canvas', 'drw-chip-foreign-canvas', 'drw-chip-trust-canvas', 'drw-chip-dealer-canvas'];
  ids.forEach(id => {
    const cv = document.getElementById(id);
    if (!cv) return;

    cv.addEventListener('pointerdown', e => {
      dState.klineIsDragging = true;
      dState.klineDragStartX = e.clientX;
      dState.klineDragStartIdx = dState.klineStartIdx;
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      dState.klineMouseX = e.clientX - rect.left;
      dState.klineMouseY = e.clientY - rect.top;
      if (!dState.klineData || !dState.klineData.length) return;
      const count = dState.klineEndIdx - dState.klineStartIdx;
      const chartW = Math.max(100, rect.width - 56);
      const bW = (chartW - 16) / count;
      const idxFloat = dState.klineStartIdx + (dState.klineMouseX - 8) / bW;
    dState.klineHoverIdx = Math.max(0, Math.min(dState.klineData.length - 1, Math.round(idxFloat)));

      if (dState.klineIsDragging) {
        const dx = e.clientX - dState.klineDragStartX;
        const shiftBars = -dx / bW;
        const newStart = Math.max(0, Math.min(dState.klineData.length - count, dState.klineDragStartIdx + shiftBars));
        dState.klineStartIdx = newStart;
        dState.klineEndIdx = newStart + count;
      }
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    });

    cv.addEventListener('pointerup', e => {
      dState.klineIsDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      dState.klineHoverIdx = -1;
      dState.klineIsDragging = false;
      dState.klineMouseX = -1;
      dState.klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!dState.klineData || !dState.klineData.length) return;
      const count = dState.klineEndIdx - dState.klineStartIdx;
      if (e.deltaY < 0 && count > 10) {
        dState.klineStartIdx += 2;
      } else if (e.deltaY > 0 && count < dState.klineData.length) {
        dState.klineStartIdx = Math.max(0, dState.klineStartIdx - 2);
      }
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }, { passive: false });
  });
}

export function drawOneChipCanvas(canvasId, field, maField, title, mX, mY) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const box = cv.parentElement;
  const dpr = window.devicePixelRatio || 1;
  cv.width = box.clientWidth * dpr;
  cv.height = box.clientHeight * dpr;
  cv.style.width = box.clientWidth + 'px';
  cv.style.height = box.clientHeight + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.clientWidth, H = box.clientHeight;
  const padRight = 56;
  const chartW = Math.max(100, W - padRight);

  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, W, H);

  if (!dState.klineData || !dState.klineData.length || dState.klineStartIdx >= dState.klineEndIdx) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('正在同步法人籌碼資料...', W / 2, H / 2);
    return;
  }

  const count = dState.klineEndIdx - dState.klineStartIdx;
  const startIdx = Math.floor(dState.klineStartIdx);
  const endIdx = Math.min(dState.klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = dState.klineData.slice(startIdx, endIdx);
  const bW = (chartW - 16) / count;
  const pixelOffset = (dState.klineStartIdx - startIdx) * bW;
  const bp = Math.max(1, Math.floor(bW * 0.15));

  let vMax = 0, vMin = 0;
  slice.forEach(k => {
    const val = k[field] || 0;
    if (val > vMax) vMax = val;
    if (val < vMin) vMin = val;
  });
  if (vMax === 0 && vMin === 0) { vMax = 100; vMin = -100; }
  const absMax = Math.max(Math.abs(vMax), Math.abs(vMin)) * 1.15 || 10;

  const yZero = H / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, yZero); ctx.lineTo(chartW, yZero); ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`+${Math.round(absMax).toLocaleString()}`, chartW + 6, 14);
  ctx.fillText(`0`, chartW + 6, yZero + 3);
  ctx.fillText(`-${Math.round(absMax).toLocaleString()}`, chartW + 6, H - 6);

  slice.forEach((k, i) => {
    const val = k[field] || 0;
    const x = 8 + i * bW - pixelOffset + bW / 2;
    const barH = (Math.abs(val) / absMax) * (yZero - 12);
    const isBuy = val >= 0;
    ctx.fillStyle = isBuy ? 'rgba(240, 64, 64, 0.75)' : 'rgba(34, 197, 94, 0.75)';
    if (isBuy) {
      ctx.fillRect(x - bW / 2 + bp, yZero - barH, bW - bp * 2, Math.max(1, barH));
    } else {
      ctx.fillRect(x - bW / 2 + bp, yZero, bW - bp * 2, Math.max(1, barH));
    }
  });

  if (dState.klineHoverIdx >= dState.klineStartIdx && dState.klineHoverIdx < dState.klineEndIdx && mX >= 0) {
    const relIdx = dState.klineHoverIdx - dState.klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = dState.klineData[dState.klineHoverIdx];
    if (hk) {
      const dStr = hk.date ? hk.date.slice(5) + ' ' : '';
      const val = hk[field] || 0;
      const valStr = (val >= 0 ? '+' : '') + val.toLocaleString() + ' 張';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(6, 4, Math.min(chartW - 12, 380), 22);
      
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#facc15';
      ctx.fillText(dStr, 12, 19);
      const dW = ctx.measureText(dStr).width;
      ctx.fillStyle = val >= 0 ? '#f04040' : '#22c55e';
      ctx.fillText(`${title}: ${valStr}`, 12 + dW, 19);
    }
  } else if (slice.length > 0) {
    const hk = slice[slice.length - 1];
    const dStr = hk.date ? hk.date.slice(5) + ' ' : '';
    const val = hk[field] || 0;
    const valStr = (val >= 0 ? '+' : '') + val.toLocaleString() + ' 張';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(6, 4, Math.min(chartW - 12, 380), 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${dStr}${title}: ${valStr}`, 12, 18);
  }
}

export function drawChipSubCanvases(mX = -1, mY = -1) {
  drawOneChipCanvas('drw-chip-total-canvas',   'total',   'ma5_total',   '三大法人合計', mX, mY);
  drawOneChipCanvas('drw-chip-foreign-canvas', 'foreign', 'ma5_foreign', '外資買賣超', mX, mY);
  drawOneChipCanvas('drw-chip-trust-canvas',   'trust',   'ma5_trust',   '投信買賣超', mX, mY);
  drawOneChipCanvas('drw-chip-dealer-canvas',  'dealer',  'ma5_dealer',  '自營商買賣超', mX, mY);
}

