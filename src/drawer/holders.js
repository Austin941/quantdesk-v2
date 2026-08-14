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

  // 繪製背景格線與右側刻度 (Grid & Ticks)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();

  // 繪製 5 條水平格線
  const tickCount = 5;
  for (let t = 0; t <= tickCount; t++) {
    const frac = t / tickCount;
    const y = 14 + frac * (H - 28);
    const tickVal = vMax - frac * range;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "SF Pro TC", "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(tickVal)}`, chartW + 8, y + 4);
  }

  // 準備雙曲線數據點
  const majorPoints = [];
  const retailPoints = [];

  slice.forEach((k, i) => {
    const x = 8 + i * bW - pixelOffset + bW / 2;
    const majorVal = k[field];
    if (majorVal !== null && majorVal !== undefined && !isNaN(majorVal)) {
      const yMajor = Math.max(10, Math.min(H - 10, 14 + (1 - (majorVal - vMin) / range) * (H - 28)));
      majorPoints.push({ x, y: yMajor, val: majorVal });

      const foreignVal = k.foreignRatio || 0;
      const retailVal = Math.max(0, 100 - majorVal - (foreignVal > 0 ? foreignVal : 15.2));
      const yRetail = Math.max(10, Math.min(H - 10, 14 + (1 - (retailVal - vMin) / range) * (H - 28)));
      retailPoints.push({ x, y: yRetail, val: retailVal });
    }
  });

  // 輔助函式：繪製平滑樣條曲線 (Smooth Spline / Catmull-Rom)
  function drawSpline(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i != points.length - 2 ? points[i + 2] : p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  // 1. 繪製散戶持股 (綠線 + 漸層底色)
  if (retailPoints.length > 0) {
    // 漸層填充
    ctx.save();
    drawSpline(retailPoints);
    ctx.lineTo(retailPoints[retailPoints.length - 1].x, H);
    ctx.lineTo(retailPoints[0].x, H);
    ctx.closePath();
    const retailGrad = ctx.createLinearGradient(0, 0, 0, H);
    retailGrad.addColorStop(0, 'rgba(74, 222, 128, 0.18)');
    retailGrad.addColorStop(1, 'rgba(74, 222, 128, 0.02)');
    ctx.fillStyle = retailGrad;
    ctx.fill();
    ctx.restore();

    // 曲線線條
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.2;
    drawSpline(retailPoints);
    ctx.stroke();
  }

  // 2. 繪製大戶持股 (橘黃線 + 漸層底色)
  if (majorPoints.length > 0) {
    // 漸層填充
    ctx.save();
    drawSpline(majorPoints);
    ctx.lineTo(majorPoints[majorPoints.length - 1].x, H);
    ctx.lineTo(majorPoints[0].x, H);
    ctx.closePath();
    const majorGrad = ctx.createLinearGradient(0, 0, 0, H);
    majorGrad.addColorStop(0, 'rgba(251, 191, 36, 0.22)');
    majorGrad.addColorStop(1, 'rgba(251, 191, 36, 0.02)');
    ctx.fillStyle = majorGrad;
    ctx.fill();
    ctx.restore();

    // 曲線線條
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.2;
    drawSpline(majorPoints);
    ctx.stroke();
  }

  // 3. 繪製 X 軸日期標籤
  const step = Math.max(1, Math.floor(slice.length / 8));
  ctx.fillStyle = '#64748b';
  ctx.font = '10px "SF Pro TC", monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < slice.length; i += step) {
    const k = slice[i];
    if (k && k.date) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const dStr = k.date.slice(5).replace('-', '/');
      ctx.fillText(dStr, x, H - 4);
    }
  }

  // 4. 十字游標與即時數據連動 (Real-time Hover & Card Sync)
  if (dState.klineHoverIdx >= dState.klineStartIdx && dState.klineHoverIdx < dState.klineEndIdx && mX >= 0) {
    const relIdx = dState.klineHoverIdx - dState.klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = dState.klineData[dState.klineHoverIdx];
    if (hk) {
      const curMajor = hk[field];
      if (curMajor !== null && curMajor !== undefined && !isNaN(curMajor)) {
        const curForeign = hk.foreignRatio || 0;
        const curRetail = Math.max(0, parseFloat((100 - curMajor - (curForeign > 0 ? curForeign : 15.2)).toFixed(2)));
        const curDiff = parseFloat((curMajor - curRetail).toFixed(2));
        const diffSign = curDiff >= 0 ? '+' : '';
        const diffColor = curDiff >= 0 ? '#ef4444' : '#22c55e';

        // 局部更新卡片數值 (保持 0 jank 順暢)
        const mEl = document.getElementById('drw-holder-major-val');
        const rEl = document.getElementById('drw-holder-retail-val');
        const dEl = document.getElementById('drw-holder-diff-val');
        if (mEl) mEl.textContent = curMajor.toFixed(2) + '%';
        if (rEl) rEl.textContent = curRetail.toFixed(2) + '%';
        if (dEl) {
          dEl.textContent = diffSign + curDiff.toFixed(2) + '%';
          dEl.style.color = diffColor;
        }

        // 在十字線交點繪製圓點
        const yM = 14 + (1 - (curMajor - vMin) / range) * (H - 28);
        const yR = 14 + (1 - (curRetail - vMin) / range) * (H - 28);
        
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(x, yM, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#07090f'; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.arc(x, yR, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.stroke();
      }
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

