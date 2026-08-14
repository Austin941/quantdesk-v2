import { state } from '../state.js';
import { dState } from './state.js';
import { fetchStaticJson } from './index.js';
import { syncAllCrosshairs } from './kline.js';

export function drawOneHoldersCanvas(canvasId, field, title, mX, mY) {
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
    ctx.fillText('正在同步大戶持股資料...', W / 2, H / 2);
    return;
  }

  const count = dState.klineEndIdx - dState.klineStartIdx;
  const startIdx = Math.floor(dState.klineStartIdx);
  const endIdx = Math.min(dState.klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = dState.klineData.slice(startIdx, endIdx);
  const bW = (chartW - 16) / count;
  const pixelOffset = (dState.klineStartIdx - startIdx) * bW;

  // 動態自適應刻度 (Dynamic Adaptive Scale)
  let actualMin = Infinity, actualMax = -Infinity;
  slice.forEach(k => {
    const val = k[field];
    if (val !== null && val !== undefined && !isNaN(val)) {
      if (val < actualMin) actualMin = val;
      if (val > actualMax) actualMax = val;
    }
  });

  // 若 slice 內無資料，從全域 klineData 找
  if (actualMin === Infinity || actualMax === -Infinity) {
    dState.klineData.forEach(k => {
      const val = k[field];
      if (val !== null && val !== undefined && !isNaN(val)) {
        if (val < actualMin) actualMin = val;
        if (val > actualMax) actualMax = val;
      }
    });
  }

  let vMin = 0, vMax = 100;
  if (actualMin !== Infinity && actualMax !== -Infinity) {
    const span = actualMax - actualMin;
    const padding = span > 0 ? span * 0.25 : Math.max(1, actualMax * 0.1);
    vMin = Math.max(0, actualMin - padding);
    vMax = Math.min(100, actualMax + padding);
  }

  // 若使用者有進行 Y 軸縮放
  const center = (vMax + vMin) / 2;
  const halfRange = ((vMax - vMin) / 2) * (1 / dState.holdersYZoom);
  vMin = Math.max(0, center - halfRange);
  vMax = Math.min(100, center + halfRange);
  
  const range = Math.max(0.1, vMax - vMin);

  // 繪製格線與刻度 (Apple 精緻排版)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
  
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px "SF Pro TC", "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${vMax.toFixed(1)}%`, chartW + 6, 14);
  const vMid = (vMax + vMin) / 2;
  ctx.fillText(`${vMid.toFixed(1)}%`, chartW + 6, H / 2 + 4);
  ctx.fillText(`${vMin.toFixed(1)}%`, chartW + 6, H - 6);

  // 中間基準參考線
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath(); ctx.moveTo(8, H / 2); ctx.lineTo(chartW, H / 2); ctx.stroke();

  const bp = Math.max(1, Math.floor(bW * 0.15));

  // 畫階梯柱狀圖 (配合前向填充，以平滑漸層呈現)
  slice.forEach((k, i) => {
    const val = k[field];
    if (val !== null && val !== undefined && !isNaN(val)) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const barH = Math.max(2, Math.min(H, ((val - vMin) / range) * H));
      
      // 主體柱狀 (iOS 玻璃漸層)
      const grad = ctx.createLinearGradient(0, H - barH, 0, H);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.15)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - bW / 2 + bp, H - barH, Math.max(1, bW - bp * 2), barH, [3, 3, 0, 0]);
      ctx.fill();
      
      // 頂部高亮邊緣 (強化階梯層次感)
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x - bW / 2 + bp, H - barH, Math.max(1, bW - bp * 2), 2);
    }
  });

  if (dState.klineHoverIdx >= dState.klineStartIdx && dState.klineHoverIdx < dState.klineEndIdx && mX >= 0) {
    const relIdx = dState.klineHoverIdx - dState.klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = dState.klineData[dState.klineHoverIdx];
    if (hk) {
      const val = hk[field];
      if (val === null || val === undefined || isNaN(val)) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.roundRect(6, 4, Math.min(chartW - 12, 340), 22, 4);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.font = '11px "SF Pro TC", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${title}: 本日無 TDCC 公佈資料`, 12, 19);
      } else {
        const valStr = val.toFixed(2) + '%';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.roundRect(6, 4, Math.min(chartW - 12, 340), 22, 4);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px "SF Pro TC", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`千張大戶持股比例 (TDCC 當週): ${valStr}`, 12, 19);
      }
    }
  } else if (slice.length > 0) {
    const lastVal = slice[slice.length - 1][field];
    if (lastVal !== null && lastVal !== undefined && !isNaN(lastVal)) {
      const valStr = lastVal.toFixed(2) + '%';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.roundRect(6, 4, Math.min(chartW - 12, 340), 20, 4);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '11px "SF Pro TC", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`千張大戶持股比例 (TDCC 最新): ${valStr}`, 12, 18);
    }
  }
}

export function drawHoldersSubCanvases(mX = -1, mY = -1) {
  drawOneHoldersCanvas('drw-holders-canvas', 'holdersRatio', '千張大戶持股比例', mX, mY);
}

export function initHoldersSubCanvasEvents() {
  const ids = ['drw-holders-canvas'];
  ids.forEach(id => {
    const cv = document.getElementById(id);
    if (!cv) return;

    let holdersIsYDragging = false;
    let holdersDragStartY = -1;
    let holdersDragStartZoom = 1.0;

    cv.addEventListener('pointerdown', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      const mX = e.clientX - rect.left;
      if (mX > chartW) {
        holdersIsYDragging = true;
        holdersDragStartY = e.clientY;
        holdersDragStartZoom = dState.holdersYZoom;
      } else {
        dState.klineIsDragging = true;
        dState.klineDragStartX = e.clientX;
        dState.klineDragStartIdx = dState.klineStartIdx;
      }
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      const mX = e.clientX - rect.left;
      const mY = e.clientY - rect.top;
      dState.klineMouseX = mX;
      dState.klineMouseY = mY;
      if (!dState.klineData || !dState.klineData.length) return;
      const chartW = Math.max(100, rect.width - 56);
      const count = dState.klineEndIdx - dState.klineStartIdx;
      const bW = (chartW - 16) / count;
      if (mX >= 8 && mX <= chartW - 8) {
        dState.klineHoverIdx = dState.klineStartIdx + Math.floor((mX - 8) / bW);
      } else {
        dState.klineHoverIdx = -1;
      }

      if (holdersIsYDragging) {
        const dy = e.clientY - holdersDragStartY;
        const zoomFactor = Math.pow(1.01, dy);
        dState.holdersYZoom = Math.max(0.25, Math.min(4.0, holdersDragStartZoom * zoomFactor));
      } else if (dState.klineIsDragging) {
        const dx = e.clientX - dState.klineDragStartX;
        const shiftBars = -dx / bW;
        const newStart = Math.max(0, Math.min(dState.klineData.length - count, dState.klineDragStartIdx + shiftBars));
        dState.klineStartIdx = newStart;
        dState.klineEndIdx = newStart + count;
      }
      syncAllCrosshairs(dState.klineMouseX, -1);
    });

    cv.addEventListener('pointerup', e => {
      dState.klineIsDragging = false;
      holdersIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointercancel', e => {
      dState.klineIsDragging = false;
      holdersIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      dState.klineHoverIdx = -1;
      dState.klineIsDragging = false;
      holdersIsYDragging = false;
      dState.klineMouseX = -1;
      dState.klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!dState.klineData || !dState.klineData.length) return;
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (dState.klineMouseX > chartW) {
        const zoomIn = e.deltaY < 0;
        dState.holdersYZoom = Math.max(0.25, Math.min(4.0, dState.holdersYZoom * (zoomIn ? 1.15 : 0.85)));
      } else {
        const count = dState.klineEndIdx - dState.klineStartIdx;
        const zoomIn = e.deltaY < 0;
        const newCount = zoomIn ? Math.max(10, count - 6) : Math.min(dState.klineData.length, count + 6);
        dState.klineStartIdx = Math.max(0, dState.klineEndIdx - newCount);
      }
      syncAllCrosshairs(dState.klineMouseX, -1);
    }, { passive: false });

    cv.addEventListener('dblclick', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (e.clientX - rect.left > chartW) {
        dState.holdersYZoom = 1.0;
        syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
      }
    });
  });
}

