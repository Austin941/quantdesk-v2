// ============================================================
// DRAWER — 360° Stock Chip & K-Line Analysis Module
// Optimized: session cache, single API fan-out, O(n) MA, VWAP
// ============================================================
import { TornadoRenderer } from './renderers/TornadoRenderer.js';
import { state } from './state.js';

let currentStock = null;
let currentTab   = 'chip';

// Session-level data cache (cleared when switching symbols)
// Prevents redundant API calls when switching between tabs
const _sessionCache = {
  symbol:     null,
  klineData:  null,
  chipRes:    null,
  marginRes:  null,
  holdersRes: null,
  daytradeRes: null,
  stockInfo:  null,
};

function _clearSessionCache() {
  Object.keys(_sessionCache).forEach(k => { _sessionCache[k] = null; });
}

// Interactive K-line state
let klineData = [];
let klineStartIdx = 0;
let klineEndIdx = 0;
let klineHoverIdx = -1;
let klineIsDragging = false;
let klineDragStartX = -1;
let klineDragStartIdx = 0;
let klineIsYDragging = false;
let klineDragStartY = -1;
let klineDragStartZoom = 1.0;
let klineCanvasInited = false;
let klineMouseX = -1;
let klineMouseY = -1;
let klinePriceZoom = 1.0;
const staticDataCache = { holders: {}, brokers: {} };
async function fetchStaticJson(type, dateStr) {
  if(!dateStr) return null;
  const yyyymmdd = dateStr.replace(/-/g, '');
  if (staticDataCache[type][yyyymmdd] !== undefined) return staticDataCache[type][yyyymmdd];
  try {
     const res = await fetch(`./data/${type}/${yyyymmdd}.json`);
     if (!res.ok) throw new Error('Not found');
     const data = await res.json();
     staticDataCache[type][yyyymmdd] = data;
     return data;
  } catch (e) {
     staticDataCache[type][yyyymmdd] = null;
     return null;
  }
}
let marginRatioYZoom = 1.0;
let holdersYZoom = 1.0;
let syncRAF = null;
let trackedBrokerName = null;
let currentBranchesLabels = [];

export function initDrawer() {
  const closeBtn = document.getElementById('drw-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  const tabs = document.querySelectorAll('#drw-tabs .dtab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('act'));
      tab.classList.add('act');
      currentTab = tab.getAttribute('data-tab') || 'chip';
      if (currentStock) renderTab(currentTab);
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });

  // Outside click detection to close drawer
  document.addEventListener('pointerdown', e => {
    const drawer = document.getElementById('stock-360-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    if (Date.now() - (drawer._lastOpenTime || 0) < 800) return;
    if (!drawer.contains(e.target)) {
      closeDrawer();
    }
  });

  initKlineCanvasEvents();
  initDrawerResizer();
  initKlineBoxResizer();
}

function initKlineBoxResizer() {
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
    if (klineData && klineData.length > 0) {
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  });

  const stopBoxResize = e => {
    if (!isResizingBox) return;
    isResizingBox = false;
    drawer.classList.remove('resizing');
    resizer.classList.remove('is-resizing');
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (klineData && klineData.length > 0) {
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  };

  resizer.addEventListener('pointerup', stopBoxResize);
  resizer.addEventListener('pointercancel', stopBoxResize);

  resizer.addEventListener('dblclick', () => {
    kbox.style.height = '320px';
    if (klineData && klineData.length > 0) {
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  });
}

function initDrawerResizer() {
  const resizer = document.getElementById('drw-resizer');
  const drawer = document.getElementById('stock-360-drawer');
  if (!resizer || !drawer) return;

  let isResizing = false;

  resizer.addEventListener('pointerdown', e => {
    isResizing = true;
    drawer.classList.add('resizing');
    resizer.classList.add('active');
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', e => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    const clamped = Math.max(380, Math.min(window.innerWidth * 0.95, newWidth));
    drawer.style.width = clamped + 'px';
    if (klineData && klineData.length > 0) {
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  });

  const stopResize = e => {
    if (!isResizing) return;
    isResizing = false;
    drawer.classList.remove('resizing');
    resizer.classList.remove('active');
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (klineData && klineData.length > 0) {
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  };

  resizer.addEventListener('pointerup', stopResize);
  resizer.addEventListener('pointercancel', stopResize);
}

function initKlineCanvasEvents() {
  if (klineCanvasInited) return;
  const cv = document.getElementById('drw-kline-canvas');
  if (!cv) return;
  klineCanvasInited = true;

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!klineData || !klineData.length) return;
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);

    // Scrolling over right scale axis OR holding Ctrl/Shift -> adjust vertical scale (上下振幅比例)
    if (mX >= chartW || e.ctrlKey || e.shiftKey) {
      const zoomIn = e.deltaY < 0;
      klinePriceZoom = Math.max(0.25, Math.min(4.0, klinePriceZoom * (zoomIn ? 1.15 : 0.85)));
    } else {
      // Otherwise adjust horizontal time zoom (左右 K 線週期縮放)
      const count = klineEndIdx - klineStartIdx;
      const zoomIn = e.deltaY < 0;
      const newCount = zoomIn ? Math.max(10, count - 6) : Math.min(klineData.length, count + 6);
      klineStartIdx = Math.max(0, klineEndIdx - newCount);
    }
    syncAllCrosshairs(klineMouseX, klineMouseY);
  }, { passive: false });

  cv.addEventListener('dblclick', e => {
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);
    if (mX >= chartW) {
      klinePriceZoom = 1.0;
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }
  });

  cv.addEventListener('pointerdown', e => {
    if (!klineData || !klineData.length) return;
    const rect = cv.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const chartW = Math.max(100, rect.width - 56);
    if (mX >= chartW) {
      klineIsYDragging = true;
      klineDragStartY = e.clientY;
      klineDragStartZoom = klinePriceZoom;
    } else {
      klineIsDragging = true;
      klineDragStartX = e.clientX;
      klineDragStartIdx = klineStartIdx;
    }
    cv.setPointerCapture(e.pointerId);
  });

  cv.addEventListener('pointermove', e => {
    const rect = cv.getBoundingClientRect();
    klineMouseX = e.clientX - rect.left;
    klineMouseY = e.clientY - rect.top;

    if (!klineData || !klineData.length) return;
    const count = klineEndIdx - klineStartIdx;
    const chartW = Math.max(100, rect.width - 56);
    const bW = (chartW - 16) / count;
    const idxFloat = klineStartIdx + (klineMouseX - 8) / bW;
    klineHoverIdx = Math.max(0, Math.min(klineData.length - 1, Math.round(idxFloat)));

    if (klineIsYDragging) {
      const dy = e.clientY - klineDragStartY;
      const zoomFactor = Math.pow(1.01, dy);
      klinePriceZoom = Math.max(0.1, Math.min(10.0, klineDragStartZoom * zoomFactor));
    } else if (klineIsDragging) {
      const dx = e.clientX - klineDragStartX;
      const shiftBars = -dx / bW;
      const newStart = Math.max(0, Math.min(klineData.length - count, klineDragStartIdx + shiftBars));
      klineStartIdx = newStart;
      klineEndIdx = newStart + count;
    }
    syncAllCrosshairs(klineMouseX, klineMouseY);
  });

  cv.addEventListener('pointerup', e => {
    klineIsDragging = false;
    klineIsYDragging = false;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  cv.addEventListener('pointercancel', e => {
    klineIsDragging = false;
    klineIsYDragging = false;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  cv.addEventListener('pointerleave', () => {
    klineHoverIdx = -1;
    klineIsDragging = false;
    klineMouseX = -1;
    klineMouseY = -1;
    drawKlineCanvas();
  });
}

export function openDrawer(stockData) {
  if (!stockData || !stockData.symbol) return;
  currentStock = stockData;

  const drawer = document.getElementById('stock-360-drawer');
  if (!drawer) return;
  drawer._lastOpenTime = Date.now();

  const symbol = stockData.symbol;
  let name   = stockData.name || stockData.stock?.['股票名稱'] || symbol;
  name = name.replace(/立\uFFFD\uFFFD|立\?\?|立$/g, '立碁').replace(/\uFFFD\uFFFD|\?\?/g, '');
  if (symbol === '8111' && (name === '立' || name.includes('立'))) name = '立碁';

  const mkt    = (stockData.stock?.['市場別'] || '').includes('上市') ? '👑 上市' : '💎 上櫃';
  const isTWSE  = (stockData.stock?.['市場別'] || '').includes('上市');
  const sector  = stockData.stock?.['產業別'] || '台股個股';
  const price  = stockData.price || 0;
  const ret    = stockData.dailyReturn || 0;
  let change   = stockData.change;
  if (change === undefined || change === 0) {
    if (stockData.prevClose && stockData.prevClose > 0) {
      change = price - stockData.prevClose;
    } else if (price > 0 && ret !== 0) {
      change = price - (price / (1 + ret / 100));
    } else {
      change = 0;
    }
  }
  const isUp   = ret >= 0;

  const nameEl = document.getElementById('drw-name');
  const metaEl = document.getElementById('drw-meta');
  const prcEl  = document.getElementById('drw-prc');
  const chgEl  = document.getElementById('drw-chg');
  const shBanner = document.getElementById('drw-shareholders');

  if (nameEl) nameEl.textContent = name;
  if (shBanner) shBanner.classList.add('hidden');

  // ① 換股時先清快取，確保 capital badge 不殘留舊資料
  if (_sessionCache.symbol !== symbol) {
    _clearSessionCache();
    _sessionCache.symbol = symbol;
  }

  if (metaEl) {
    metaEl.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-top:4px;">
        <span style="color:#94a3b8;font-size:0.82rem;font-family:monospace">${symbol}</span>
        <span style="background:${isTWSE ? 'rgba(250,204,21,0.15)' : 'rgba(56,189,248,0.15)'};color:${isTWSE ? '#facc15' : '#38bdf8'};border:1px solid ${isTWSE ? 'rgba(250,204,21,0.4)' : 'rgba(56,189,248,0.4)'};padding:1px 6px;border-radius:4px;font-size:0.75rem;font-weight:600;white-space:nowrap;">${mkt}</span>
        <span style="color:#64748b;font-size:0.75rem;">·</span>
        <span id="drw-sector-badge" style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 6px;border-radius:4px;font-size:0.75rem;white-space:nowrap;">${sector}</span>
        <span id="drw-capital-badge" style="color:#64748b;font-size:0.75rem;">載入中...</span>
      </div>
    `;
    _fetchAndSetCapital(symbol);
  }

  if (prcEl) {
    prcEl.textContent = price ? Number(price.toFixed(2)).toString() : '—';
    prcEl.style.color = isUp ? 'var(--positive-color)' : 'var(--negative-color)';
  }
  if (chgEl) {
    const sign = ret > 0 ? '+' : '';
    const chgStr = change ? (change > 0 ? '+' : '') + Number(change.toFixed(2)).toString() : '';
    chgEl.textContent = `${chgStr} (${sign}${ret.toFixed(2)}%)`;
    chgEl.style.color = isUp ? 'var(--positive-color)' : 'var(--negative-color)';
  }

  const yahooBtn = document.getElementById('drw-yahoo-btn');
  if (yahooBtn) {
    yahooBtn.href = `https://tw.stock.yahoo.com/quote/${symbol}/technical-analysis`;
  }

  drawer.classList.add('open');
  initKlineCanvasEvents();
  fetchAndDrawKline(symbol, price);
  renderTab(currentTab);
}

// Use /api/stock_info (backend-cached, 24hr) — NOT the 1800-company TWSE list
async function _fetchAndSetCapital(symbol) {
  const el = document.getElementById('drw-capital-badge');
  if (!el) return;

  // Return immediately if already fetched this session
  if (_sessionCache.stockInfo) {
    _applyCapitalBadge(el, _sessionCache.stockInfo);
    return;
  }

  try {
    const info = await fetch(`/api/stock_info?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .catch(() => null);
    if (info && info.success) {
      _sessionCache.stockInfo = info;
      _applyCapitalBadge(el, info);
    } else {
      el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
    }
  } catch (e) {
    el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
  }
}

function _applyCapitalBadge(el, info) {
  const sc = {
    large: { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.3)',  label: '🔴 大型股' },
    mid:   { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', border: 'rgba(234,179,8,0.3)',   label: '🟡 中型股' },
    small: { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', border: 'rgba(34,197,94,0.3)',   label: '🟢 小型股' },
  }[info.sizeCode] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)', label: '' };
  el.innerHTML = `資本額 ${info.capitalDisplay} <span style="background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">${sc.label}</span>`;
  el.style.color = '#94a3b8';
  el.style.fontSize = '0.75rem';
}

export function closeDrawer() {
  const drawer = document.getElementById('stock-360-drawer');
  if (drawer) drawer.classList.remove('open');
  const box = document.getElementById('drw-tv-widget');
  if (box) box.innerHTML = '';
}

async function renderTab(tab) {
  const c = document.getElementById('drw-content');
  if (!c || !currentStock) return;
  const s = currentStock;
  const symbol = s.symbol;
  const price  = s.price || 100;
  let cost20 = price * 0.958;

  // Use module-level klineData (no need for window global)
  const kdForVwap = klineData.length > 0 ? klineData : (_sessionCache.klineData || []);
  if (kdForVwap.length > 0) {
    let sumVal = 0;
    let sumVol = 0;
    const slice20 = kdForVwap.slice(-20);
    slice20.forEach(k => {
      const typ = ((k.h || k.c) + (k.l || k.c) + k.c) / 3;
      const vol = k.v || 0;
      sumVal += typ * vol;
      sumVol += vol;
    });
    if (sumVol > 0) cost20 = sumVal / sumVol;
  }
  
  const gap    = ((price - cost20) / cost20 * 100).toFixed(2);
  const fmt    = (v, d = 0) => isNaN(v) ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(d).toLocaleString();

  c.innerHTML = '<div class="cinfo">連線 Vercel Serverless API 載入最新法人籌碼中...</div>';

  if (!klineData || klineData.length === 0) {
    c.innerHTML = '<div class="cinfo">目前無 K 線交易資料可供對應分析</div>';
    return;
  }

  try {
    if (tab === 'chip') {
      c.innerHTML = `
        <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
          <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">每日三大法人共同買賣超柱狀圖 (與上方 K 線時間軸 100% 垂直聯動對齊)</div>
        </div>
        <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-total-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
        <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-foreign-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
        <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-trust-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
        <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:4px;"><canvas id="drw-chip-dealer-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      `;
      initChipSubCanvasEvents();
      drawChipSubCanvases(klineMouseX, klineMouseY);
      return;
    } else if (tab === 'margin') {
      if (klineData && klineData.length > 0) {
        const m = klineData[klineData.length - 1];
        const mBalance = m.marginBalance || 0;
        const sBalance = m.shortBalance || 0;
        const ratio    = m.marginRatio || 0;

        c.innerHTML = `
          <div class="ccard" style="margin-bottom:10px; padding:8px 14px; display:flex; justify-content:space-between; align-items:center;">
            <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">融資券單日增減與當沖比例 (聯動 K 線)</div>
            <div style="font-size:0.85em;color:#94a3b8" id="drw-margin-text">餘額: 融資 <span style="color:#fff" id="drw-margin-bal">${Number(mBalance).toLocaleString()}</span> 張 | 券資比 <span style="color:#38bdf8" id="drw-margin-ratio">${Number(ratio).toFixed(2)}%</span></div>
          </div>
          <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-margin-purchase-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
          <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-margin-short-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
          <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:4px;"><canvas id="drw-margin-daytrade-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
        `;
        initMarginSubCanvasEvents();
        drawMarginSubCanvases(klineMouseX, klineMouseY);
        return;
      }
    } else if (tab === 'holders') {
      if (klineData && klineData.length > 0) {
        // 從 drawer_data API 判斷目前是畫千張大戶歷史還是外資持股比
        const isTdcc = _sessionCache.holdersRes?.usingTdccHistory;
        const titleText = isTdcc 
          ? "千張以上大戶持股比例歷史趨勢 (與上方 K 線時間軸聯動對齊)"
          : "外資持股比例歷史趨勢 (與上方 K 線時間軸聯動對齊)";
          
        c.innerHTML = `
          <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
            <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">${titleText}</div>
          </div>
          <div class="kbox sub-chart-box" style="height:250px;position:relative;margin-bottom:10px;"><canvas id="drw-holders-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
        `;
        initHoldersSubCanvasEvents();
        drawHoldersSubCanvases(klineMouseX, klineMouseY);
        return;
      }

    } else if (tab === 'branches') {
      if (klineData && klineData.length > 0) {
        c.innerHTML = `
          <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
            <div id="drw-branches-title" class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">券商分點進出 (Tornado Chart) 載入中...</div>
          </div>
          <div class="kbox sub-chart-box" style="height:200px;position:relative;margin-bottom:10px;"><canvas id="drw-branches-canvas" style="display:block;width:100%;height:100%;cursor:pointer;"></canvas></div>
        `;
        initBranchesSubCanvasEvents();
        drawBranchesSubCanvases(klineMouseX, klineMouseY);
        return;
      }
    }
  } catch (e) {
    console.warn('[Drawer] API Fetch fallback:', e.message);
  }

  // Fallback / default content if API is slow or offline
  const fallbacks = {
    chip: `
      <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
        <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">每日三大法人共同買賣超柱狀圖 (與上方 K 線時間軸 100% 垂直聯動對齊)</div>
      </div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-total-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-foreign-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-chip-trust-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:4px;"><canvas id="drw-chip-dealer-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>`,
    margin: `
      <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
        <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">融資券單日增減與當沖比例 (估算聯動)</div>
      </div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-margin-purchase-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:10px;"><canvas id="drw-margin-short-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      <div class="kbox sub-chart-box" style="height:125px;position:relative;margin-bottom:4px;"><canvas id="drw-margin-daytrade-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
    `,
    holders: `
      <div class="ccard">
        <div class="cctitle">千張以上大戶持股變化</div>
        <div class="crow"><span>1000張大戶持股</span><strong style="color:var(--positive-color)">72.4%</strong></div>
        <div class="crow"><span>400張中戶持股</span><strong>85.1%</strong></div>
      </div>`,
    branches: `
      <div class="ccard">
        <div class="cctitle">分點進出 (Tornado Chart) 載入中...</div>
      </div>`,
  };
  c.innerHTML = fallbacks[tab] || fallbacks.chip;
  if (tab === 'chip') {
    initChipSubCanvasEvents();
    drawChipSubCanvases(klineMouseX, klineMouseY);
  } else if (tab === 'margin') {
    initMarginSubCanvasEvents();
    drawMarginSubCanvases(klineMouseX, klineMouseY);
  }
}

async function fetchAndDrawKline(symbol, currentPrice) {
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

  // Check session cache for klineData
  if (_sessionCache.symbol === symbol && _sessionCache.klineData && _sessionCache.klineData.length > 0) {
    klineData = _sessionCache.klineData;
    klineEndIdx = klineData.length;
    klineStartIdx = Math.max(0, klineEndIdx - 40);
    klineHoverIdx = -1;
    drawKlineCanvas();
    renderTab(currentTab);
    return;
  }

  let kd = [];
  let chipMap = {};
  let marginMap = {};
  let holdersMap = {};
  let daytradeMap = {};

  try {
    const unifiedRes = await fetch(`/api/drawer_data?symbol=${symbol}&days=120`)
      .then(r => r.json()).catch(() => null);

    if (unifiedRes && unifiedRes.success) {
      // Build sessionCache-compatible response objects for renderTab
      const cDates = Object.keys(unifiedRes.chipMap || {}).sort();
      _sessionCache.chipRes = {
        data: cDates.map(d => ({
          date: d,
          foreign_net: (unifiedRes.chipMap[d].foreignNet || 0),
          trust_net:   (unifiedRes.chipMap[d].trustNet   || 0),
          dealer_net:  (unifiedRes.chipMap[d].dealerNet  || 0)
        }))
      };

      const mDates = Object.keys(unifiedRes.marginMap || {}).sort();
      _sessionCache.marginRes = {
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
      _sessionCache.holdersRes = {
        usingTdccHistory: unifiedRes.usingTdccHistory,
        data: hDates.map(d => ({
          date: d,
          dailyEstMajorHoldersRatioPercent: unifiedRes.holdersMap[d].ratio,
          signalText: unifiedRes.holdersMap[d].signalText
        }))
      };

      _sessionCache.daytradeRes = {
        data: [{ marketDayTradeRatioPct: unifiedRes.daytrade?.marketRatio || 0 }]
      };

      // 顯示外資持股比 + TDCC 千張大戶持股比（均為真實 API 資料）
      const shBanner  = document.getElementById('drw-shareholders');
      const shForeign = document.getElementById('sh-foreign');
      const shWhale   = document.getElementById('sh-whale');
      const shTdccDate = document.getElementById('sh-tdcc-date');
      
      if (shBanner && shForeign) {
        // 外資持股比（真實值，無偏移）
        const foreignPct = unifiedRes.baseForeignRatio || 0;
        shForeign.textContent = foreignPct > 0 ? foreignPct.toFixed(2) : '--';
        
        // TDCC 千張以上大戶持股比（真實值）
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
        marketRatio: unifiedRes.daytrade?.marketRatio || 0 
      };

      const klineArr = unifiedRes.kline || [];
      if (klineArr.length > 0) {
        const hasRealChip = Object.keys(chipMap).length > 0;

        // Initialize holdersRatio from the FIRST available holdersMap value
        // (not 0, which causes the flat-line-at-zero bug)
        const hDates = Object.keys(holdersMap).sort();
        let lastHRatio = hDates.length > 0 ? holdersMap[hDates[0]].ratio : (unifiedRes.baseForeignRatio || 0);
        let lastMarginBalance = 0;
        let lastShortBalance = 0;
        let lastMarginRatio = 0;

        kd = klineArr.map((k, idx) => {
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
          if (!hData) { 
            // Carry forward last known ratio (forward-fill, never zero-fill)
            hData = { ratio: lastHRatio, signalText: '' }; 
          } else {
            lastHRatio = hData.ratio;
          }

          return {
            date: kDate, o: k.open || k.o, c: k.close || k.c, h: k.high || k.h, l: k.low || k.l, v: k.volume || k.v,
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
    klineData = [];
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

  klineData = kd;
  _sessionCache.klineData = kd; // Save to session cache (used for VWAP + tab switch dedup)
  klineEndIdx = klineData.length;
  klineStartIdx = Math.max(0, klineEndIdx - 40);
  klineHoverIdx = -1;
  drawKlineCanvas();
  
  // Re-render current tab once all data is fully loaded
  renderTab(currentTab);
}
function getNiceTicks(min, max, targetCount) {
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

function drawKlineCanvas(mX = -1, mY = -1) {
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

  if (!klineData || !klineData.length || klineStartIdx >= klineEndIdx) {
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

  const count = klineEndIdx - klineStartIdx;
  const startIdx = Math.floor(klineStartIdx);
  const endIdx = Math.min(klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = klineData.slice(startIdx, endIdx);
  const ps = slice.flatMap(k => [k.h, k.l, k.ma5, k.ma20].filter(v => v !== null && !isNaN(v)));
  const rawMin = Math.min(...ps), rawMax = Math.max(...ps);
  const pCenter = (rawMax + rawMin) / 2 || 1;
  const halfR = Math.max(0.1, ((rawMax - rawMin) / 2 || pCenter * 0.05) * (1 / (klinePriceZoom || 1.0))) * 1.02;
  const pMin = pCenter - halfR, pMax = pCenter + halfR;
  const pR = (pMax - pMin) || 1;
  const vMax = Math.max(...slice.map(k => k.v)) || 1;
  const bW = (chartW - 16) / count;
  const pixelOffset = (klineStartIdx - startIdx) * bW;
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
  if (klineHoverIdx >= klineStartIdx && klineHoverIdx < klineEndIdx && mX >= 0 && mY >= 0) {
    const relIdx = klineHoverIdx - klineStartIdx;
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

    const hk = klineData[klineHoverIdx];
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

let branchesDebounceTimer = null;
function syncAllCrosshairs(mX = -1, mY = -1) {
  if (syncRAF) cancelAnimationFrame(syncRAF);
  syncRAF = requestAnimationFrame(() => {
    drawKlineCanvas(mX, mY);
    drawChipSubCanvases(mX, mY);
    drawMarginSubCanvases(mX, mY);
    drawHoldersSubCanvases(mX, mY);
    
    if (currentTab === 'branches') {
      if (branchesDebounceTimer) clearTimeout(branchesDebounceTimer);
      branchesDebounceTimer = setTimeout(() => {
        drawBranchesSubCanvases(mX, mY);
      }, 50);
    }
  });
}

function initChipSubCanvasEvents() {
  const ids = ['drw-chip-total-canvas', 'drw-chip-foreign-canvas', 'drw-chip-trust-canvas', 'drw-chip-dealer-canvas'];
  ids.forEach(id => {
    const cv = document.getElementById(id);
    if (!cv) return;

    cv.addEventListener('pointerdown', e => {
      klineIsDragging = true;
      klineDragStartX = e.clientX;
      klineDragStartIdx = klineStartIdx;
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      klineMouseX = e.clientX - rect.left;
      klineMouseY = e.clientY - rect.top;
      if (!klineData || !klineData.length) return;
      const count = klineEndIdx - klineStartIdx;
      const chartW = Math.max(100, rect.width - 56);
      const bW = (chartW - 16) / count;
      const idxFloat = klineStartIdx + (klineMouseX - 8) / bW;
    klineHoverIdx = Math.max(0, Math.min(klineData.length - 1, Math.round(idxFloat)));

      if (klineIsDragging) {
        const dx = e.clientX - klineDragStartX;
        const shiftBars = -dx / bW;
        const newStart = Math.max(0, Math.min(klineData.length - count, klineDragStartIdx + shiftBars));
        klineStartIdx = newStart;
        klineEndIdx = newStart + count;
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    });

    cv.addEventListener('pointerup', e => {
      klineIsDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      klineHoverIdx = -1;
      klineIsDragging = false;
      klineMouseX = -1;
      klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!klineData || !klineData.length) return;
      const count = klineEndIdx - klineStartIdx;
      if (e.deltaY < 0 && count > 10) {
        klineStartIdx += 2;
      } else if (e.deltaY > 0 && count < klineData.length) {
        klineStartIdx = Math.max(0, klineStartIdx - 2);
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }, { passive: false });
  });
}

function drawOneChipCanvas(canvasId, field, maField, title, mX, mY) {
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

  if (!klineData || !klineData.length || klineStartIdx >= klineEndIdx) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('正在同步法人籌碼資料...', W / 2, H / 2);
    return;
  }

  const count = klineEndIdx - klineStartIdx;
  const startIdx = Math.floor(klineStartIdx);
  const endIdx = Math.min(klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = klineData.slice(startIdx, endIdx);
  const bW = (chartW - 16) / count;
  const pixelOffset = (klineStartIdx - startIdx) * bW;
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

  if (klineHoverIdx >= klineStartIdx && klineHoverIdx < klineEndIdx && mX >= 0) {
    const relIdx = klineHoverIdx - klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = klineData[klineHoverIdx];
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

function drawChipSubCanvases(mX = -1, mY = -1) {
  drawOneChipCanvas('drw-chip-total-canvas',   'total',   'ma5_total',   '三大法人合計', mX, mY);
  drawOneChipCanvas('drw-chip-foreign-canvas', 'foreign', 'ma5_foreign', '外資買賣超', mX, mY);
  drawOneChipCanvas('drw-chip-trust-canvas',   'trust',   'ma5_trust',   '投信買賣超', mX, mY);
  drawOneChipCanvas('drw-chip-dealer-canvas',  'dealer',  'ma5_dealer',  '自營商買賣超', mX, mY);
}

function drawOneMarginCanvas(canvasId, field, title, mX, mY, isPercentage = false) {
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

  if (!klineData || !klineData.length || klineStartIdx >= klineEndIdx) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('正在同步融資券與當沖資料...', W / 2, H / 2);
    return;
  }

  const count = klineEndIdx - klineStartIdx;
  const startIdx = Math.floor(klineStartIdx);
  const endIdx = Math.min(klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = klineData.slice(startIdx, endIdx);
  const bW = (chartW - 16) / count;
  const pixelOffset = (klineStartIdx - startIdx) * bW;
  const bp = Math.max(1, Math.floor(bW * 0.15));

  let vMax = 0, vMin = 0;
  if (isPercentage) {
    klineData.forEach(k => {
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
  const absMax = isPercentage ? baseAbsMax * (1 / marginRatioYZoom) : baseAbsMax;
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

  if (klineHoverIdx >= klineStartIdx && klineHoverIdx < klineEndIdx && mX >= 0) {
    const relIdx = klineHoverIdx - klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = klineData[klineHoverIdx];
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
  if (klineHoverIdx >= klineStartIdx && klineHoverIdx < klineEndIdx) {
    const hk = klineData[klineHoverIdx];
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

function drawMarginSubCanvases(mX = -1, mY = -1) {
  drawOneMarginCanvas('drw-margin-purchase-canvas', 'marginChange', '融資單日增減', mX, mY, false);
  drawOneMarginCanvas('drw-margin-short-canvas', 'shortChange', '融券單日增減', mX, mY, false);
  drawOneMarginCanvas('drw-margin-daytrade-canvas', 'dayTradeRatio', '當沖比例', mX, mY, true);
}

function initMarginSubCanvasEvents() {
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
        marginDragStartZoom = marginRatioYZoom;
      } else {
        klineIsDragging = true;
        klineDragStartX = e.clientX;
        klineDragStartIdx = klineStartIdx;
      }
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      klineMouseX = e.clientX - rect.left;
      klineMouseY = e.clientY - rect.top;
      if (!klineData || !klineData.length) return;
      const chartW = Math.max(100, rect.width - 56);
      const count = klineEndIdx - klineStartIdx;
      const bW = (chartW - 16) / count;
      if (klineMouseX >= 8 && klineMouseX <= chartW - 8) {
        klineHoverIdx = klineStartIdx + Math.floor((klineMouseX - 8) / bW);
      } else {
        klineHoverIdx = -1;
      }

      if (marginIsYDragging) {
        const dy = e.clientY - marginDragStartY;
        const zoomFactor = Math.pow(1.01, dy);
        marginRatioYZoom = Math.max(0.25, Math.min(4.0, marginDragStartZoom * zoomFactor));
      } else if (klineIsDragging) {
        const dx = e.clientX - klineDragStartX;
        const shiftBars = -dx / bW;
        const newStart = Math.max(0, Math.min(klineData.length - count, klineDragStartIdx + shiftBars));
        klineStartIdx = newStart;
        klineEndIdx = newStart + count;
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    });

    cv.addEventListener('pointerup', e => {
      klineIsDragging = false;
      marginIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointercancel', e => {
      klineIsDragging = false;
      marginIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      klineHoverIdx = -1;
      klineIsDragging = false;
      marginIsYDragging = false;
      klineMouseX = -1;
      klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!klineData || !klineData.length) return;
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (klineMouseX > chartW && id === 'drw-margin-daytrade-canvas') {
        const zoomIn = e.deltaY < 0;
        marginRatioYZoom = Math.max(0.25, Math.min(4.0, marginRatioYZoom * (zoomIn ? 1.15 : 0.85)));
      } else {
        const count = klineEndIdx - klineStartIdx;
        if (e.deltaY < 0 && count > 10) {
          klineStartIdx += 2;
        } else if (e.deltaY > 0 && count < klineData.length) {
          klineStartIdx = Math.max(0, klineStartIdx - 2);
        }
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }, { passive: false });

    cv.addEventListener('dblclick', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (e.clientX - rect.left > chartW && id === 'drw-margin-daytrade-canvas') {
        marginRatioYZoom = 1.0;
        syncAllCrosshairs(klineMouseX, klineMouseY);
      }
    });
  });
}

function drawOneHoldersCanvas(canvasId, field, title, mX, mY) {
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

  if (!klineData || !klineData.length || klineStartIdx >= klineEndIdx) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('正在同步大戶持股資料...', W / 2, H / 2);
    return;
  }

  const count = klineEndIdx - klineStartIdx;
  const startIdx = Math.floor(klineStartIdx);
  const endIdx = Math.min(klineData.length, startIdx + Math.ceil(count) + 1);
  const slice = klineData.slice(startIdx, endIdx);
  const bW = (chartW - 16) / count;
  const pixelOffset = (klineStartIdx - startIdx) * bW;

  // Use ABSOLUTE values (entire dataset) for Y-axis instead of dynamic slice
  let vMax = -Infinity, vMin = Infinity;
  klineData.forEach(k => {
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
  const halfRange = ((vMax - vMin) / 2) * (1 / holdersYZoom);
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

  if (klineHoverIdx >= klineStartIdx && klineHoverIdx < klineEndIdx && mX >= 0) {
    const relIdx = klineHoverIdx - klineStartIdx;
    const x = 8 + relIdx * bW + bW / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);

    const hk = klineData[klineHoverIdx];
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

function drawHoldersSubCanvases(mX = -1, mY = -1) {
  drawOneHoldersCanvas('drw-holders-canvas', 'holdersRatio', '大戶比例', mX, mY);
}

function initHoldersSubCanvasEvents() {
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
        holdersDragStartZoom = holdersYZoom;
      } else {
        klineIsDragging = true;
        klineDragStartX = e.clientX;
        klineDragStartIdx = klineStartIdx;
      }
      cv.setPointerCapture(e.pointerId);
    });

    cv.addEventListener('pointermove', e => {
      const rect = cv.getBoundingClientRect();
      const mX = e.clientX - rect.left;
      const mY = e.clientY - rect.top;
      klineMouseX = mX;
      klineMouseY = mY;
      if (!klineData || !klineData.length) return;
      const chartW = Math.max(100, rect.width - 56);
      const count = klineEndIdx - klineStartIdx;
      const bW = (chartW - 16) / count;
      if (mX >= 8 && mX <= chartW - 8) {
        klineHoverIdx = klineStartIdx + Math.floor((mX - 8) / bW);
      } else {
        klineHoverIdx = -1;
      }

      if (holdersIsYDragging) {
        const dy = e.clientY - holdersDragStartY;
        const zoomFactor = Math.pow(1.01, dy);
        holdersYZoom = Math.max(0.25, Math.min(4.0, holdersDragStartZoom * zoomFactor));
      } else if (klineIsDragging) {
        const dx = e.clientX - klineDragStartX;
        const shiftBars = -dx / bW;
        const newStart = Math.max(0, Math.min(klineData.length - count, klineDragStartIdx + shiftBars));
        klineStartIdx = newStart;
        klineEndIdx = newStart + count;
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    });

    cv.addEventListener('pointerup', e => {
      klineIsDragging = false;
      holdersIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointercancel', e => {
      klineIsDragging = false;
      holdersIsYDragging = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    cv.addEventListener('pointerleave', () => {
      klineHoverIdx = -1;
      klineIsDragging = false;
      holdersIsYDragging = false;
      klineMouseX = -1;
      klineMouseY = -1;
      syncAllCrosshairs();
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (!klineData || !klineData.length) return;
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (klineMouseX > chartW) {
        const zoomIn = e.deltaY < 0;
        holdersYZoom = Math.max(0.25, Math.min(4.0, holdersYZoom * (zoomIn ? 1.15 : 0.85)));
      } else {
        const count = klineEndIdx - klineStartIdx;
        if (e.deltaY < 0 && count > 10) {
          klineStartIdx += 2;
        } else if (e.deltaY > 0 && count < klineData.length) {
          klineStartIdx = Math.max(0, klineStartIdx - 2);
        }
      }
      syncAllCrosshairs(klineMouseX, klineMouseY);
    }, { passive: false });

    cv.addEventListener('dblclick', e => {
      const rect = cv.getBoundingClientRect();
      const chartW = Math.max(100, rect.width - 56);
      if (e.clientX - rect.left > chartW) {
        holdersYZoom = 1.0;
        syncAllCrosshairs(klineMouseX, klineMouseY);
      }
    });
  });
}


let tornadoRenderer = null;

function initBranchesSubCanvasEvents() {
  const c = document.getElementById('drw-branches-canvas');
  if (!c) return;
  
  if (!tornadoRenderer) {
    tornadoRenderer = new TornadoRenderer('drw-branches-canvas');
  }

  // Remove old listeners to avoid duplicates
  const newC = c.cloneNode(true);
  c.parentNode.replaceChild(newC, c);
  
  newC.addEventListener('click', e => {
    const rect = newC.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    tornadoRenderer.handleClick(mx, my, newC.clientHeight, newC.clientWidth, (trackedName) => {
       // Update global state for sync
       trackedBrokerName = trackedName;
       drawBranchesSubCanvases(klineMouseX, klineMouseY);
       
       import('./api.js').then(api => {
          if (trackedName) {
            api.showToast('已鎖定追蹤券商：' + trackedName, 'success');
          } else {
            api.showToast('已取消追蹤券商', 'info');
          }
       });
    });
  });
}

async function drawBranchesSubCanvases(mx, my) {
  const canvas = document.getElementById('drw-branches-canvas');
  if (!canvas || !currentStock) return;
  
  // Set physical resolution
  const box = canvas.parentElement;
  canvas.width = box.clientWidth;
  canvas.height = box.clientHeight;
  
  const sym = currentStock.symbol;
  
  // 更新標題
  const titleEl = document.getElementById('drw-branches-title');
  if (titleEl) titleEl.textContent = `三大法人今日進出 (${sym}) 載入中...`;
  
  if (!tornadoRenderer) {
    tornadoRenderer = new TornadoRenderer('drw-branches-canvas');
  }
  tornadoRenderer.setTrackedBroker(trackedBrokerName);
  
  try {
    // 使用真實 /api/branches 取得 T86 三大法人資料
    const res = await fetch(`/api/branches?symbol=${encodeURIComponent(sym)}`);
    if (!res.ok) throw new Error(`branches API ${res.status}`);
    const data = await res.json();
    
    if (titleEl && data.date) {
      titleEl.textContent = `三大法人今日進出 (${sym} / ${data.date}) — 資料來源：TWSE T86`;
    }
    
    if (!data.success || !data.hasData) {
      // 無資料時乾淨留白
      tornadoRenderer.draw(null, data.date || '--');
      return;
    }
    
    // data.top_buy / data.top_sell 格式已符合 TornadoRenderer 期望
    tornadoRenderer.draw(data, data.date);
  } catch (err) {
    console.warn('[branches] API error:', err.message);
    if (titleEl) titleEl.textContent = `三大法人今日進出 (${sym}) — 資料暫時無法取得`;
    tornadoRenderer.draw(null, '--');
  }
}

