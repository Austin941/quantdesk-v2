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

  // Use ABSOLUTE values (entire dataset) for Y-axis instead of dynamic slice
  let vMax = -Infinity, vMin = Infinity;
  dState.klineData.forEach(k => {
    const val = k[field];
    if (val !== null && val !== undefined && !isNaN(val)) {
      if (val > vMax) vMax = val;
      if (val < vMin) vMin = val;
    }
  });
  
  if (vMax === -Infinity || vMin === Infinity) {
    vMax = 100;
    vMin = 0;
  }
  
  if (vMax === vMin) { vMax += 5; vMin -= 5; }
  const padding = (vMax - vMin) * 0.15;
  vMax += padding;
  vMin -= padding;
  
  const mid = (vMax + vMin) / 2;
  const halfRange = ((vMax - vMin) / 2) * (1 / dState.holdersYZoom);
  vMax = mid + halfRange;
  vMin = mid - halfRange;
  const range = vMax - vMin;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${vMax.toFixed(2)}%`, chartW + 6, 14);
  ctx.fillText(`${vMin.toFixed(2)}%`, chartW + 6, H - 6);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  ctx.strokeStyle = '#60a5fa'; // Blue
  ctx.setLineDash([5, 5]); // Dashed line
  
  let hasStarted = false;
  let prevY = -1;
  slice.forEach((k, i) => {
    let val = k[field];
    
    // If we have a valid value, draw the point
    if (val !== null && val !== undefined && !isNaN(val)) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const y = H - ((val - vMin) / range) * H;
      
      if (!hasStarted) {
         ctx.moveTo(x, y);
         hasStarted = true;
      } else {
         // Step line: draw horizontally to current X, then vertically to current Y
         ctx.lineTo(x, prevY);
         ctx.lineTo(x, y);
      }
      prevY = y;
    } else if (hasStarted) {
      // If we encounter null AFTER starting, we can just draw horizontally using prevY
      const x = 8 + i * bW - pixelOffset + bW / 2;
      ctx.lineTo(x, prevY);
    }
  });
  
  if (hasStarted) {
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineTo(8 + (count - 1) * bW + bW / 2, H);
    // Find the first valid x to close the path properly
    let firstX = 8 - pixelOffset + bW / 2; 
    const firstValidIdx = slice.findIndex(k => k[field] !== null && k[field] !== undefined);
    if (firstValidIdx >= 0) {
       firstX = 8 + firstValidIdx * bW - pixelOffset + bW / 2;
    }
    ctx.lineTo(firstX, H);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, 'rgba(250, 204, 21, 0.25)');
    gradient.addColorStop(1, 'rgba(250, 204, 21, 0.01)');
    ctx.fillStyle = gradient;
    ctx.fill();
  } else {
    ctx.stroke();
    ctx.setLineDash([]);
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
      const val = hk[field] || 0;
      const valStr = val.toFixed(2) + '%';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(6, 4, Math.min(chartW - 12, 340), 22);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${title}: ${valStr}`, 12, 19);
      
      const y = H - ((val - vMin) / range) * H;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#07090f';
      ctx.fill();
      ctx.stroke();
    }
  } else if (slice.length > 0) {
    const hk = slice[slice.length - 1];
    const val = hk[field] || 0;
    const valStr = val.toFixed(2) + '%';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(6, 4, Math.min(chartW - 12, 340), 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${title} 最新: ${valStr}`, 12, 18);
  }
}

export function drawHoldersSubCanvases(mX = -1, mY = -1) {
  drawOneHoldersCanvas('drw-holders-canvas', 'holdersRatio', '大戶比例', mX, mY);
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
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
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
      if (e.clientX - rect.left > chartW) {
        dState.holdersYZoom = 1.0;
        syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
      }
    });
  });
}

