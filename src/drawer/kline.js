import { state } from '../state.js';
import { dState } from './state.js';
import { TornadoRenderer } from '../renderers/TornadoRenderer.js';
import { renderTab } from './index.js';
import { drawChipSubCanvases } from './chip.js';
import { drawMarginSubCanvases } from './margin.js';

export function initKlineBoxResizer() {
  const resizer = document.getElementById('drw-kline-resizer');
  const kbox = document.getElementById('drw-kline-box');
  const drawer = document.getElementById('stock-360-drawer');
  if (!resizer || !kbox || !drawer) return;

  let isResizingBox = false;
  let startY = 0;
  let startH = 0;

  resizer.addEventListener('pointerdown', e => {
    isResizingBox = true;
    startY = e.clientY;
    startH = kbox.clientHeight;
    drawer.classList.add('resizing');
    resizer.classList.add('is-resizing');
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', e => {
    if (!isResizingBox) return;
    const dy = e.clientY - startY;
    const maxH = window.innerHeight * 0.85;
    const newH = Math.max(180, Math.min(maxH, startH + dy));
    kbox.style.height = newH + 'px';
    if (dState.klineData && dState.klineData.length > 0) {
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  });

  const stopBoxResize = e => {
    if (!isResizingBox) return;
    isResizingBox = false;
    drawer.classList.remove('resizing');
    resizer.classList.remove('is-resizing');
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (dState.klineData && dState.klineData.length > 0) {
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  };

  resizer.addEventListener('pointerup', stopBoxResize);
  resizer.addEventListener('pointercancel', stopBoxResize);

  resizer.addEventListener('dblclick', () => {
    kbox.style.height = '320px';
    if (dState.klineData && dState.klineData.length > 0) {
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  });
}

export function initKlineCanvasEvents() {
  if (dState.klineCanvasInited) return;
  const cv = document.getElementById('drw-kline-canvas');
  if (!cv) return;
  dState.klineCanvasInited = true;

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!dState.klineData || !dState.klineData.length) return;
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);

    // Scrolling over right scale axis OR holding Ctrl/Shift -> adjust vertical scale (上下振幅比例)
    if (mX >= chartW || e.ctrlKey || e.shiftKey) {
      const zoomIn = e.deltaY < 0;
      dState.klinePriceZoom = Math.max(0.25, Math.min(4.0, dState.klinePriceZoom * (zoomIn ? 1.15 : 0.85)));
    } else {
      // Otherwise adjust horizontal time zoom (左右 K 線週期縮放)
      const count = dState.klineEndIdx - dState.klineStartIdx;
      const zoomIn = e.deltaY < 0;
      const newCount = zoomIn ? Math.max(10, count - 6) : Math.min(dState.klineData.length, count + 6);
      dState.klineStartIdx = Math.max(0, dState.klineEndIdx - newCount);
    }
    syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
  }, { passive: false });

  cv.addEventListener('dblclick', e => {
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);
    if (mX >= chartW) {
      dState.klinePriceZoom = 1.0;
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  });

  cv.addEventListener('pointerdown', e => {
    if (!dState.klineData || !dState.klineData.length) return;
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);
    if (mX >= chartW) {
      dState.klineIsYDragging = true;
      dState.klineDragStartY = e.clientY;
      dState.klineDragStartZoom = dState.klinePriceZoom;
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
    const count = dState.klineEndIdx - dState.klineStartIdx;
    const chartW = Math.max(100, rect.width - 56);
    const bW = (chartW - 16) / count;
    const idxFloat = dState.klineStartIdx + (dState.klineMouseX - 8) / bW;
    dState.klineHoverIdx = Math.max(0, Math.min(dState.klineData.length - 1, Math.round(idxFloat)));

    if (dState.klineIsYDragging) {
      const dy = e.clientY - dState.klineDragStartY;
      const zoomFactor = Math.pow(1.01, dy);
      dState.klinePriceZoom = Math.max(0.1, Math.min(10.0, dState.klineDragStartZoom * zoomFactor));
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
    dState.klineIsYDragging = false;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  cv.addEventListener('pointercancel', e => {
    dState.klineIsDragging = false;
    dState.klineIsYDragging = false;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  cv.addEventListener('pointerleave', () => {
    dState.klineHoverIdx = -1;
    dState.klineIsDragging = false;
    dState.klineMouseX = -1;
    dState.klineMouseY = -1;
    drawKlineCanvas();
  });
}

export async function fetchAndDrawKline(symbol, currentPrice) {
  const cv = document.getElementById('drw-kline-canvas');
  if (!cv) return;
  
  const box = cv.parentElement;
  cv.width = box.clientWidth * (window.devicePixelRatio || 1);
  cv.height = box.clientHeight * (window.devicePixelRatio || 1);
  const ctx = cv.getContext('2d');
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, box.clientWidth, box.clientHeight);
  ctx.fillStyle = '#64748b';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('正在載入真實 K 線行情與三大法人均量數據...', box.clientWidth / 2, box.clientHeight / 2);

  // Check session cache for dState.klineData
  if (dState._sessionCache.symbol === symbol && dState._sessionCache.klineData && dState._sessionCache.klineData.length > 0) {
    dState.klineData = dState._sessionCache.klineData;
    dState.klineEndIdx = dState.klineData.length;
    dState.klineStartIdx = Math.max(0, dState.klineEndIdx - 40);
    dState.klineHoverIdx = -1;
    drawKlineCanvas();
    renderTab(dState.currentTab);
    return;
  }

  let kd = [];
  let chipMap = {};
  let marginMap = {};
  let holdersMap = {};
  let daytradeMap = {};

  try {
    // 1. Kick off fast K-line and attempt static stock dataset fetch (/data/stocks/${symbol}.json)
    const klinePromise = fetch(`/api/kline?symbol=${symbol}&range=6mo`).then(r => r.json()).catch(() => null);
    
    // Attempt fetching static per-stock comprehensive JSON from GitHub CDN or local public (10~25ms instant load)
    const staticStockPromise = fetch(`https://raw.githubusercontent.com/Austin941/bubble-chart-2/master/data/stocks/${symbol}.json?_t=${Date.now()}`)
      .then(r => r.ok ? r.json() : fetch(`/data/stocks/${symbol}.json?_t=${Date.now()}`).then(r2 => r2.ok ? r2.json() : null))
      .catch(() => null);

    // 2. Render fast K-line immediately once it arrives (typically < 0.5s)
    klinePromise.then(klineRes => {
      // If full data somehow finished first or cache was used, don't overwrite it
      if (dState._sessionCache.symbol === symbol && dState._sessionCache.klineData && dState._sessionCache.klineData.length > 0) return;
      if (klineRes && klineRes.success && klineRes.data && klineRes.data.length > 0) {
        let kdFast = klineRes.data.map(k => ({
          date: k.date || k.time, o: k.o !== undefined ? k.o : k.open, c: k.c !== undefined ? k.c : k.close, h: k.h !== undefined ? k.h : k.high, l: k.l !== undefined ? k.l : k.low, v: k.v !== undefined ? k.v : k.volume,
          foreign: 0, trust: 0, dealer: 0, total: 0,
          marginChange: 0, shortChange: 0, dayTradeRatio: 0,
          marginBalance: 0, shortBalance: 0, marginRatio: 0,
          holdersRatio: null  // null = 沒有 TDCC 公佈實題，不預先填入
        }));
        
        for (let i = 0; i < kdFast.length; i++) {
          let sum5 = 0, c5 = 0, sum20 = 0, c20 = 0;
          for (let j = Math.max(0, i - 4); j <= i; j++) { sum5 += kdFast[j].c; c5++; }
          kdFast[i].ma5 = c5 === 5 ? sum5 / 5 : null;
          for (let j = Math.max(0, i - 19); j <= i; j++) { sum20 += kdFast[j].c; c20++; }
          kdFast[i].ma20 = c20 === 20 ? sum20 / 20 : null;
        }

        dState.klineData = kdFast;
        dState.klineEndIdx = dState.klineData.length;
        dState.klineStartIdx = Math.max(0, dState.klineEndIdx - 40);
        dState.klineHoverIdx = -1;
        drawKlineCanvas();
      }
    });

    // Check if static stock dataset exists; if not, fallback to serverless /api/drawer_data
    let staticStockData = await staticStockPromise;
    let unifiedRes = null;

    if (staticStockData && (staticStockData.chipHistory || staticStockData.marginHistory || staticStockData.holdersHistory)) {
      // Format static data directly into unified structure
      const cMap = {};
      (staticStockData.chipHistory || []).forEach(item => {
        cMap[item.date] = {
          foreignNet: (item.foreign || 0) * 1000,
          trustNet:   (item.trust || 0) * 1000,
          dealerNet:  (item.dealer || 0) * 1000,
          totalNet:   (item.total || 0) * 1000
        };
      });

      const mMap = {};
      (staticStockData.marginHistory || []).forEach(item => {
        mMap[item.date] = {
          marginBalance: item.marginBalance || 0,
          marginChange:  item.marginChange || 0,
          shortBalance:  item.shortBalance || 0,
          shortChange:   item.shortChange || 0,
          ratio:         item.shortMarginRatio || 0
        };
      });

      const hMap = {};
      (staticStockData.holdersHistory || []).forEach(item => {
        hMap[item.date] = {
          ratio: item.majorHoldersRatio || 0,
          signalText: ''
        };
      });

      const dtMap = {};
      (staticStockData.daytradeHistory || []).forEach(item => {
        dtMap[item.date] = {
          volume: item.volume || 0,
          marketRatio: item.marketRatio || 0
        };
      });

      const lastHolder = (staticStockData.holdersHistory && staticStockData.holdersHistory.length > 0)
        ? staticStockData.holdersHistory[staticStockData.holdersHistory.length - 1]
        : null;

      unifiedRes = {
        success: true,
        chipMap: cMap,
        marginMap: mMap,
        holdersMap: hMap,
        daytradeMap: dtMap,
        usingTdccHistory: true,
        whalePct: lastHolder ? lastHolder.majorHoldersRatio : null,
        tdccDate: lastHolder ? lastHolder.date : null,
        baseForeignRatio: lastHolder ? lastHolder.foreignOwnershipRatio : 0,
        topBrokers: staticStockData.topBrokers || null
      };

      // Store topBrokers for branches tab
      dState._sessionCache.topBrokers = staticStockData.topBrokers || null;
    } else {
      // 3. Fallback: Await serverless unified drawer_data API (typically 1-3s)
      unifiedRes = await fetch(`/api/drawer_data?symbol=${symbol}&days=120`).then(r => r.json()).catch(() => null);
    }
    
    // Race condition guard: if user clicked another stock while waiting
    if (dState._sessionCache.symbol !== symbol) return;

    if (unifiedRes && unifiedRes.success) {
      // Build sessionCache-compatible response objects for renderTab
      const cDates = Object.keys(unifiedRes.chipMap || {}).sort();
      dState._sessionCache.chipRes = {
        data: cDates.map(d => ({
          date: d,
          foreign_net: (unifiedRes.chipMap[d].foreignNet || 0),
          trust_net:   (unifiedRes.chipMap[d].trustNet   || 0),
          dealer_net:  (unifiedRes.chipMap[d].dealerNet  || 0)
        }))
      };

      const mDates = Object.keys(unifiedRes.marginMap || {}).sort();
      dState._sessionCache.marginRes = {
        data: mDates.map(d => ({
          date: d,
          marginBalance:           unifiedRes.marginMap[d].marginBalance,
          marginChange:            unifiedRes.marginMap[d].marginChange,
          shortBalance:            unifiedRes.marginMap[d].shortBalance,
          shortChange:             unifiedRes.marginMap[d].shortChange,
          shortMarginRatioPercent: unifiedRes.marginMap[d].ratio
        }))
      };

      const hDates = Object.keys(unifiedRes.holdersMap || {}).sort();
      dState._sessionCache.holdersRes = {
        usingTdccHistory: unifiedRes.usingTdccHistory,
        data: hDates.map(d => ({
          date: d,
          dailyEstMajorHoldersRatioPercent: unifiedRes.holdersMap[d].ratio,
          signalText: unifiedRes.holdersMap[d].signalText
        }))
      };

      dState._sessionCache.daytradeRes = {
        data: [{ marketDayTradeRatioPct: unifiedRes.daytrade?.marketRatio || 0 }]
      };

      // 顯示外資持股比 + TDCC 千張大戶持股比
      const shBanner  = document.getElementById('drw-shareholders');
      const shForeign = document.getElementById('sh-foreign');
      const shWhale   = document.getElementById('sh-whale');
      const shTdccDate = document.getElementById('sh-tdcc-date');
      
      if (shBanner && shForeign) {
        const foreignPct = unifiedRes.baseForeignRatio || 0;
        shForeign.textContent = foreignPct > 0 ? foreignPct.toFixed(2) : '--';
        
        if (shWhale) {
          shWhale.textContent = unifiedRes.whalePct != null ? unifiedRes.whalePct.toFixed(2) : '--';
        }
        if (shTdccDate) {
          shTdccDate.textContent = unifiedRes.tdccDate ? `(${unifiedRes.tdccDate})` : '';
        }
        shBanner.classList.remove('hidden');
      }

      // Build lookup maps for K-line merging
      if (unifiedRes.chipMap) {
        Object.keys(unifiedRes.chipMap).forEach(d => {
          const item = unifiedRes.chipMap[d];
          chipMap[d] = {
            foreign: Math.round((item.foreignNet || 0) / 1000),
            trust:   Math.round((item.trustNet   || 0) / 1000),
            dealer:  Math.round((item.dealerNet  || 0) / 1000),
            total:   Math.round((item.totalNet   || 0) / 1000)
          };
        });
      }
      if (unifiedRes.marginMap) {
        Object.keys(unifiedRes.marginMap).forEach(d => { marginMap[d] = unifiedRes.marginMap[d]; });
      }
      if (unifiedRes.holdersMap) {
        Object.keys(unifiedRes.holdersMap).forEach(d => { holdersMap[d] = unifiedRes.holdersMap[d]; });
      }
      if (unifiedRes.daytradeMap) {
        Object.keys(unifiedRes.daytradeMap).forEach(d => { daytradeMap[d] = unifiedRes.daytradeMap[d]; });
      }
      daytradeMap[new Date().toISOString().slice(0, 10)] = { 
        ...daytradeMap[new Date().toISOString().slice(0, 10)], 
        marketRatio: unifiedRes?.daytrade?.marketRatio || 0 
      };

      const klineArr = unifiedRes?.kline || [];
      // Use fresh K-line data (dState.klineData or kdFast) as base if available
      const baseKlineArr = (dState.klineData && dState.klineData.length > 0) ? dState.klineData : klineArr;
      if (baseKlineArr.length > 0) {
        const hasRealChip = Object.keys(chipMap).length > 0;

        // Initialize holdersRatio – only use actual TDCC data, NEVER foreign ownership ratio
        // hData.ratio will be null on non-publish days, which is correct behaviour
        const hDates = Object.keys(holdersMap).sort();
        let lastHRatio = null; // null = no TDCC data published yet
        let lastMarginBalance = 0;
        let lastShortBalance = 0;
        let lastMarginRatio = 0;

        kd = baseKlineArr.map((k, idx) => {
          const kDate = k.time || k.date;
          let cData = chipMap[kDate];
          const volZhang = Math.max(10, Math.round(((k.volume || k.v) || 10000) / 1000));

          if (!cData || !hasRealChip) {
            cData = { foreign: 0, trust: 0, dealer: 0, total: 0 };
          }

          let mData = marginMap[kDate];
          if (!mData) {
            mData = { marginChange: 0, shortChange: 0, marginBalance: lastMarginBalance, shortBalance: lastShortBalance, ratio: lastMarginRatio };
          } else {
            lastMarginBalance = mData.marginBalance || 0;
            lastShortBalance = mData.shortBalance || 0;
            lastMarginRatio = mData.ratio || 0;
          }

          // dayTradeRatio: only use REAL data from TWSE or FinMind.
          let dayTradeRatio = 0;
          const dtData = daytradeMap[kDate];
          if (dtData) {
            if (dtData.volume > 0 && k.v > 0) {
              dayTradeRatio = (dtData.volume / k.v) * 100;
            } else if (dtData.marketRatio > 0) {
              dayTradeRatio = dtData.marketRatio; // fallback to market average if specific stock volume is missing
            }
          }
          // Removed: hash-based fake simulation was here and has been deleted.

          let hData = holdersMap[kDate];
          if (!hData || !hData.ratio) {
            // 前向填充 (Forward-fill)：若當日無公佈，或公佈值異常(為 0)，沿用上一次有效比例補齊空缺
            hData = { ratio: lastHRatio, signalText: '' };
          } else {
            lastHRatio = hData.ratio;
          }

          return {
            date: kDate,
            o: k.o !== undefined ? k.o : k.open,
            c: k.c !== undefined ? k.c : k.close,
            h: k.h !== undefined ? k.h : k.high,
            l: k.l !== undefined ? k.l : k.low,
            v: k.v !== undefined ? k.v : k.volume,
            foreign: cData.foreign, trust: cData.trust, dealer: cData.dealer, total: cData.total,
            marginChange: mData.marginChange, shortChange: mData.shortChange, dayTradeRatio,
            marginBalance: mData.marginBalance || 0, shortBalance: mData.shortBalance || 0, marginRatio: mData.ratio || 0,
            holdersRatio: hData.ratio
          };
        });
      }
    }
  } catch (e) {
    console.warn('[Drawer] Kline/Chip API error:', e.message);
  }

  // If no market data available (or market closed/off-market with no history), DO NOT generate fake random data!
  if (!kd || kd.length === 0) {
    dState.klineData = [];
    drawKlineCanvas();
    return;
  }

  // Precompute MA5 and MA20 for Price & MA5 for Institutional Net Buy/Sell
  for (let i = 0; i < kd.length; i++) {
    let sum5 = 0, c5 = 0;
    let sumF = 0, cF = 0;
    let sumT = 0, cT = 0;
    let sumD = 0, cD = 0;
    let sumTot = 0, cTot = 0;
    for (let j = Math.max(0, i - 4); j <= i; j++) {
      sum5 += kd[j].c; c5++;
      sumF += (kd[j].foreign || 0); cF++;
      sumT += (kd[j].trust   || 0); cT++;
      sumD += (kd[j].dealer  || 0); cD++;
      sumTot += (kd[j].total || 0); cTot++;
    }
    kd[i].ma5 = c5 === 5 ? sum5 / 5 : null;
    kd[i].ma5_foreign = cF === 5 ? sumF / 5 : null;
    kd[i].ma5_trust   = cT === 5 ? sumT / 5 : null;
    kd[i].ma5_dealer  = cD === 5 ? sumD / 5 : null;
    kd[i].ma5_total   = cTot === 5 ? sumTot / 5 : null;

    let sum20 = 0, c20 = 0;
    for (let j = Math.max(0, i - 19); j <= i; j++) { sum20 += kd[j].c; c20++; }
    kd[i].ma20 = c20 === 20 ? sum20 / 20 : null;
  }

  dState.klineData = kd;
  dState._sessionCache.klineData = kd; // Save to session cache (used for VWAP + tab switch dedup)
  dState.klineEndIdx = dState.klineData.length;
  dState.klineStartIdx = Math.max(0, dState.klineEndIdx - 40);
  dState.klineHoverIdx = -1;
  drawKlineCanvas();
  
  // Re-render current tab once all data is fully loaded
  renderTab(dState.currentTab);
}

export function getNiceTicks(min, max, targetCount) {
  const range = max - min;
  if (range <= 0) return [min];
  const roughStep = range / (targetCount - 1);
  const stepPower = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normStep = roughStep / stepPower;
  let niceNormStep;
  if (normStep < 1.5) niceNormStep = 1;
  else if (normStep < 3) niceNormStep = 2;
  else if (normStep < 7) niceNormStep = 5;
  else niceNormStep = 10;
  const step = niceNormStep * stepPower;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let val = niceMin; val <= niceMax; val += step) {
    ticks.push(val);
  }
  return { ticks, step, niceMin, niceMax };
}

export function drawKlineCanvas(mX = -1, mY = -1) {
  const cv = document.getElementById('drw-kline-canvas');
  if (!cv) return;
  const box = cv.parentElement;
  const dpr = window.devicePixelRatio || 1;
  cv.width  = box.clientWidth  * dpr;
  cv.height = box.clientHeight * dpr;
  cv.style.width  = box.clientWidth  + 'px';
  cv.style.height = box.clientHeight + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.clientWidth, H = box.clientHeight;
  const KH = H * 0.70;
  const padRight = 56;
  const chartW = Math.max(100, W - padRight);

  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, W, H);

  if (!dState.klineData || !dState.klineData.length || dState.klineStartIdx >= dState.klineEndIdx) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('目前無 K 線交易資料（或休市中未提供行情）', W / 2, H / 2);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('本系統嚴格執行真實數據展示，絕不以亂數假資料填補。', W / 2, H / 2 + 24);
    drawChipSubCanvases(mX, mY);
    return;
  }

  const count = dState.klineEndIdx - dState.klineStartIdx;
  const startIdx = Math.floor(dState.klineStartIdx);
  const endIdx = Math.min(dState.klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = dState.klineData.slice(startIdx, endIdx);
  const ps = slice.flatMap(k => [k.h, k.l, k.ma5, k.ma20].filter(v => v !== null && !isNaN(v)));
  const rawMin = Math.min(...ps), rawMax = Math.max(...ps);
  const pCenter = (rawMax + rawMin) / 2 || 1;
  const halfR = Math.max(0.1, ((rawMax - rawMin) / 2 || pCenter * 0.05) * (1 / (dState.klinePriceZoom || 1.0))) * 1.02;
  const pMin = pCenter - halfR, pMax = pCenter + halfR;
  const pR = (pMax - pMin) || 1;
  const vMax = Math.max(...slice.map(k => k.v)) || 1;
  const bW = (chartW - 16) / count;
  const pixelOffset = (dState.klineStartIdx - startIdx) * bW;
  const bp = Math.max(1, bW * 0.18);

  // Draw right scale column background & vertical separator line
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(chartW, 0, padRight, H);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();

  // Draw grid lines & right price scale labels
  ctx.font = '11px JetBrains Mono, monospace';
  const { ticks, step } = getNiceTicks(pMin, pMax, 6);
  
  ticks.forEach(gp => {
    const gy = 10 + (KH - 20) * (1 - (gp - pMin) / pR);
    if (gy < -10 || gy > KH + 10) return; // Allow slightly off-screen to clip naturally
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(chartW, gy); ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath(); ctx.moveTo(chartW, gy); ctx.lineTo(chartW + 4, gy); ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    let text = gp.toFixed(gp >= 100 ? 1 : 2).replace(/\.0$/, '');
    if (text.endsWith('.00')) text = text.slice(0, -3);
    ctx.fillText(text, chartW + 8, gy + 4);
  });

  // Draw Candles & Volume inside main chart area (0 to chartW)
  slice.forEach((k, i) => {
    const x = 8 + i * bW - pixelOffset + bW / 2;
    const u = k.c >= k.o;
    const col = u ? '#f04040' : '#22c55e';
    const yH = Math.max(2, Math.min(KH - 2, (1 - (k.h - pMin) / pR) * KH));
    const yL = Math.max(2, Math.min(KH - 2, (1 - (k.l - pMin) / pR) * KH));
    const yO = Math.max(2, Math.min(KH - 2, (1 - (k.o - pMin) / pR) * KH));
    const yC = Math.max(2, Math.min(KH - 2, (1 - (k.c - pMin) / pR) * KH));

    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();

    ctx.fillStyle = col;
    ctx.fillRect(x - bW / 2 + bp, Math.min(yO, yC), bW - bp * 2, Math.max(1.5, Math.abs(yC - yO)));

    const xAxisHeight = 16;
    const vH = (k.v / vMax) * (H - KH - 12 - xAxisHeight);
    ctx.fillStyle = u ? 'rgba(240, 64, 64, 0.45)' : 'rgba(34, 197, 94, 0.45)';
    ctx.fillRect(x - bW / 2 + bp, H - xAxisHeight - vH - 4, bW - bp * 2, vH);
  });

  // Draw MA5 curve (Yellow)
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started5 = false;
  slice.forEach((k, i) => {
    if (k.ma5 !== null) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const y = Math.max(2, Math.min(KH - 2, (1 - (k.ma5 - pMin) / pR) * KH));
      if (!started5) { ctx.moveTo(x, y); started5 = true; } else ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Draw MA20 curve (Blue)
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started20 = false;
  slice.forEach((k, i) => {
    if (k.ma20 !== null) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const y = Math.max(2, Math.min(KH - 2, (1 - (k.ma20 - pMin) / pR) * KH));
      if (!started20) { ctx.moveTo(x, y); started20 = true; } else ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.stroke();

  // Draw X-axis Dates
  ctx.fillStyle = '#64748b';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  const xStep = Math.max(1, Math.floor(slice.length / 6));
  slice.forEach((k, i) => {
    if (i % xStep === 0 || i === slice.length - 1) {
      const x = 8 + i * bW - pixelOffset + bW / 2;
      const dStr = k.date ? k.date.slice(5).replace('-', '/') : '';
      ctx.fillText(dStr, x, H - 4);
    }
  });

  // TradingView Latest Close Price Badge on Right Scale
  if (slice.length > 0) {
    const lastK = slice[slice.length - 1];
    const yLast = (1 - (lastK.c - pMin) / pR) * KH;
    if (yLast >= 0 && yLast <= KH) {
      const isUp = lastK.c >= lastK.o;
      const badgeCol = isUp ? '#f04040' : '#22c55e';
      ctx.strokeStyle = badgeCol;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(0, yLast); ctx.lineTo(chartW, yLast); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = badgeCol;
      ctx.fillRect(chartW + 1, yLast - 10, padRight - 2, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Number(lastK.c.toFixed(2)).toString(), chartW + padRight / 2, yLast + 4);
    }
  }

  // Crosshair & Interactive Hover Badge
  if (dState.klineHoverIdx >= dState.klineStartIdx && dState.klineHoverIdx < dState.klineEndIdx && mX >= 0 && mY >= 0) {
    const relIdx = dState.klineHoverIdx - dState.klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    if (mY <= KH) {
      ctx.beginPath(); ctx.moveTo(0, mY); ctx.lineTo(chartW, mY); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Hover Price Badge on Right Scale
    if (mY <= KH) {
      let hoverPrice = pMax - (mY / KH) * pR;
      hoverPrice = Math.round(hoverPrice / step) * step;
      ctx.fillStyle = '#0284c7'; // TradingView blue
      ctx.fillRect(chartW + 1, mY - 10, padRight - 2, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      let text = hoverPrice.toFixed(hoverPrice >= 100 ? 1 : 2).replace(/\.0$/, '');
      if (text.endsWith('.00')) text = text.slice(0, -3);
      ctx.fillText(text, chartW + padRight / 2, mY + 4);
    }

    const hk = dState.klineData[dState.klineHoverIdx];
    if (hk) {
      // Hover Date Badge on X Scale
      if (hk.date) {
        const fullDate = hk.date.replace(/-/g, '/');
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        const tw = ctx.measureText(fullDate).width + 12;
        ctx.fillStyle = '#0284c7'; // TradingView blue
        ctx.fillRect(x - tw / 2, H - 16, tw, 16);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(fullDate, x, H - 4);
      }

      const dStr = hk.date ? hk.date.slice(5) : '';
      const ma5Str = hk.ma5 ? `MA5:${hk.ma5.toFixed(1)}` : '';
      const ma20Str = hk.ma20 ? `MA20:${hk.ma20.toFixed(1)}` : '';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(6, 6, Math.min(chartW - 12, 450), 24);
      
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#facc15'; // yellow date
      ctx.fillText(dStr + ' ', 12, 22);
      const dW = ctx.measureText(dStr + ' ').width;
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`開:${hk.o} 高:${hk.h} 低:${hk.l} 收:${hk.c} 量:${Number(hk.v).toLocaleString()} ${ma5Str} ${ma20Str}`, 12 + dW, 22);
    }
  } else if (slice.length > 0) {
    const hk = slice[slice.length - 1];
    const dStr = hk.date ? hk.date.slice(5) : '最新';
    const ma5Str = hk.ma5 ? `MA5:${hk.ma5.toFixed(1)}` : '';
    const ma20Str = hk.ma20 ? `MA20:${hk.ma20.toFixed(1)}` : '';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(6, 6, Math.min(chartW - 12, 460), 22);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${dStr} 收:${hk.c} ${ma5Str} ${ma20Str} (滾輪主圖:左右縮放|滾輪右軸:上下振幅|雙擊右軸:還原)`, 12, 21);
  }
}

export function syncAllCrosshairs(mX = -1, mY = -1) {
  if (dState.syncRAF) cancelAnimationFrame(dState.syncRAF);
  dState.syncRAF = requestAnimationFrame(() => {
    drawKlineCanvas(mX, mY);
    drawChipSubCanvases(mX, mY);
    drawMarginSubCanvases(mX, mY);
    drawHoldersSubCanvases(mX, mY);
    
    if (dState.currentTab === 'branches') {
      if (branchesDebounceTimer) clearTimeout(branchesDebounceTimer);
      branchesDebounceTimer = setTimeout(() => {
        drawBranchesSubCanvases(mX, mY);
      }, 50);
    }
  });
}

