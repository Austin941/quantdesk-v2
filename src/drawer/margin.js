import { state } from '../state.js';
import { dState } from './state.js';
import { TornadoRenderer } from '../renderers/TornadoRenderer.js';
import { fetchStaticJson } from './index.js';
import { syncAllCrosshairs } from './kline.js';

export function drawOneMarginCanvas(canvasId, field, title, mX, mY, isPercentage = false) {
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
    ctx.fillText('正在同步融資券與當沖資料...', W / 2, H / 2);
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
  if (isPercentage) {
    dState.klineData.forEach(k => {
      const val = k[field] || 0;
      if (val > vMax) vMax = val;
      if (val < vMin) vMin = val;
    });
    if (vMax === 0) vMax = 100;
    vMin = 0;
  } else {
    slice.forEach(k => {
      const val = k[field] || 0;
      if (val > vMax) vMax = val;
      if (val < vMin) vMin = val;
    });
    if (vMax === 0 && vMin === 0) { vMax = 100; vMin = -100; }
  }
  
  const baseAbsMax = isPercentage ? vMax * 1.15 : Math.max(Math.abs(vMax), Math.abs(vMin)) * 1.15 || 10;
  const absMax = isPercentage ? baseAbsMax * (1 / dState.marginRatioYZoom) : baseAbsMax;
  const yZero = isPercentage ? H - 4 : H / 2;
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, yZero); ctx.lineTo(chartW, yZero); ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  if (isPercentage) {
    ctx.fillText(`${Math.round(absMax)}%`, chartW + 6, 14);
    ctx.fillText(`0%`, chartW + 6, H - 6);
  } else {
    ctx.fillText(`+${Math.round(absMax).toLocaleString()}`, chartW + 6, 14);
    ctx.fillText(`0`, chartW + 6, yZero + 3);
    ctx.fillText(`-${Math.round(absMax).toLocaleString()}`, chartW + 6, H - 6);
  }

  if (isPercentage) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    slice.forEach((k, i) => {
      const val = k[field] || 0;
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const y = Math.max(4, yZero - (val / absMax) * (H - 8));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Fill area under line
    ctx.lineTo(8 + (slice.length - 1) * bW + bW / 2, yZero);
    ctx.lineTo(8 + bW / 2, yZero);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fill();
  } else {
    slice.forEach((k, i) => {
      const val = k[field] || 0;
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const isBuy = (val >= 0);
      const barH = (Math.abs(val) / absMax) * (yZero - 12);
      
      ctx.fillStyle = isBuy ? 'rgba(240, 64, 64, 0.75)' : 'rgba(34, 197, 94, 0.75)';
      
      if (isBuy) {
        ctx.fillRect(x - bW / 2 + bp, yZero - barH, bW - bp * 2, Math.max(1, barH));
      } else {
        ctx.fillRect(x - bW / 2 + bp, yZero, bW - bp * 2, Math.max(1, barH));
      }
    });
  }

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
      const prefix = (val > 0 && !isPercentage) ? '+' : '';
      const unit = isPercentage ? '%' : ' 張';
      const valStr = prefix + (isPercentage ? val.toFixed(1) : val.toLocaleString()) + unit;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(6, 4, Math.min(chartW - 12, 380), 22);
      
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#facc15';
      ctx.fillText(dStr, 12, 19);
      const dW = ctx.measureText(dStr).width;
      ctx.fillStyle = isPercentage ? '#38bdf8' : (val >= 0 ? '#f04040' : '#22c55e');
      ctx.fillText(`${title}: ${valStr}`, 12 + dW, 19);
    }
  } else if (slice.length > 0) {
    const hk = slice[slice.length - 1];
    const dStr = hk.date ? hk.date.slice(5) + ' ' : '';
    const val = hk[field] || 0;
    const prefix = (val > 0 && !isPercentage) ? '+' : '';
    const unit = isPercentage ? '%' : ' 張';
    const valStr = prefix + (isPercentage ? val.toFixed(1) : val.toLocaleString()) + unit;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(6, 4, Math.min(chartW - 12, 380), 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${dStr}${title}: ${valStr}`, 12, 18);
  }

  // Update margin text in header on hover
  if (dState.klineHoverIdx >= dState.klineStartIdx && dState.klineHoverIdx < dState.klineEndIdx) {
    const hk = dState.klineData[dState.klineHoverIdx];
    if (hk && hk.marginBalance !== undefined) {
      const balEl = document.getElementById('drw-margin-bal');
      const ratioEl = document.getElementById('drw-margin-ratio');
      if (balEl) balEl.textContent = Number(hk.marginBalance).toLocaleString();
      if (ratioEl) ratioEl.textContent = Number(hk.marginRatio).toFixed(2) + '%';
    }
  } else if (slice.length > 0) {
    const hk = slice[slice.length - 1];
    if (hk && hk.marginBalance !== undefined) {
      const balEl = document.getElementById('drw-margin-bal');
      const ratioEl = document.getElementById('drw-margin-ratio');
      if (balEl) balEl.textContent = Number(hk.marginBalance).toLocaleString();
      if (ratioEl) ratioEl.textContent = Number(hk.marginRatio).toFixed(2) + '%';
    }
  }
}

export function drawMarginSubCanvases(mX = -1, mY = -1) {
  drawOneMarginCanvas('drw-margin-purchase-canvas', 'marginChange', '融資單日增減', mX, mY, false);
  drawOneMarginCanvas('drw-margin-short-canvas', 'shortChange', '融券單日增減', mX, mY, false);
  drawOneMarginCanvas('drw-margin-daytrade-canvas', 'dayTradeRatio', '當沖比例', mX, mY, true);
}

export function initMarginSubCanvasEvents() {
  const ids = ['drw-margin-purchase-canvas', 'drw-margin-short-canvas', 'drw-margin-daytrade-canvas'];
  ids.forEach(id => {
    const cv = document.getElementById(id);
    if (!cv) return;

    let marginIsYDragging = false;
    let marginDragStartY = -1;
    let marginDragStartZoom = 1.0;

    cv.addEventListener('pointerdown', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      const mX = e.clientX - rect.left;
      if (mX > chartW && id === 'drw-margin-daytrade-canvas') {
        marginIsYDragging = true;
        marginDragStartY = e.clientY;
        marginDragStartZoom = dState.marginRatioYZoom;
      } else {
        dState.klineIsDragging = true;
        dState.klineDragStartX = e.clientX;
        dState.klineDragStartIdx = dState.klineStartIdx;
      }
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      dState.klineMouseX = e.clientX - rect.left;
      dState.klineMouseY = e.clientY - rect.top;
      if (!dState.klineData || !dState.klineData.length) return;
      const chartW = Math.max(100, rect.width - 56);
      const count = dState.klineEndIdx - dState.klineStartIdx;
      const bW = (chartW - 16) / count;
      if (dState.klineMouseX >= 8 && dState.klineMouseX <= chartW - 8) {
        dState.klineHoverIdx = dState.klineStartIdx + Math.floor((dState.klineMouseX - 8) / bW);
      } else {
        dState.klineHoverIdx = -1;
      }

      if (marginIsYDragging) {
        const dy = e.clientY - marginDragStartY;
        const zoomFactor = Math.pow(1.01, dy);
        dState.marginRatioYZoom = Math.max(0.25, Math.min(4.0, marginDragStartZoom * zoomFactor));
      } else if (dState.klineIsDragging) {
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
      marginIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointercancel', e => {
      dState.klineIsDragging = false;
      marginIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      dState.klineHoverIdx = -1;
      dState.klineIsDragging = false;
      marginIsYDragging = false;
      dState.klineMouseX = -1;
      dState.klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!dState.klineData || !dState.klineData.length) return;
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (dState.klineMouseX > chartW && id === 'drw-margin-daytrade-canvas') {
        const zoomIn = e.deltaY < 0;
        dState.marginRatioYZoom = Math.max(0.25, Math.min(4.0, dState.marginRatioYZoom * (zoomIn ? 1.15 : 0.85)));
      } else {
        const count = dState.klineEndIdx - dState.klineStartIdx;
        if (e.deltaY < 0 && count > 10) {
          dState.klineStartIdx += 2;
        } else if (e.deltaY > 0 && count < dState.klineData.length) {
          dState.klineStartIdx = Math.max(0, dState.klineStartIdx - 2);
        }
      }
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }, { passive: false });

    cv.addEventListener('dblclick', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (e.clientX - rect.left > chartW && id === 'drw-margin-daytrade-canvas') {
        dState.marginRatioYZoom = 1.0;
        syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
      }
    });
  });
}

