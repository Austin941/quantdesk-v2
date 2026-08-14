import { state } from '../state.js';
import { dState } from './state.js';
import { initKlineBoxResizer, initKlineCanvasEvents, fetchAndDrawKline, drawKlineCanvas, syncAllCrosshairs } from './kline.js';
import { initChipSubCanvasEvents, drawChipSubCanvases } from './chip.js';
import { initMarginSubCanvasEvents, drawMarginSubCanvases } from './margin.js';
import { initHoldersSubCanvasEvents, drawHoldersSubCanvases } from './holders.js';
import { initBranchesSubCanvasEvents, drawBranchesSubCanvases } from './branches.js';

export function _clearSessionCache() {
  Object.keys(dState._sessionCache).forEach(k => { dState._sessionCache[k] = null; });
}

export async function fetchStaticJson(type, dateStr) {
  if(!dateStr) return null;
  const yyyymmdd = dateStr.replace(/-/g, '');
  if (dState.staticDataCache[type][yyyymmdd] !== undefined) return dState.staticDataCache[type][yyyymmdd];
  try {
     const res = await fetch(`./data/${type}/${yyyymmdd}.json`);
     if (!res.ok) throw new Error('Not found');
     const data = await res.json();
     dState.staticDataCache[type][yyyymmdd] = data;
     return data;
  } catch (e) {
     dState.staticDataCache[type][yyyymmdd] = null;
     return null;
  }
}

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
      dState.currentTab = tab.getAttribute('data-tab') || 'chip';
      if (dState.currentStock) renderTab(dState.currentTab);
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

export function initDrawerResizer() {
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
    if (dState.klineData && dState.klineData.length > 0) {
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  });

  const stopResize = e => {
    if (!isResizing) return;
    isResizing = false;
    drawer.classList.remove('resizing');
    resizer.classList.remove('active');
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (dState.klineData && dState.klineData.length > 0) {
      syncAllCrosshairs(dState.klineMouseX, dState.klineMouseY);
    }
  };

  resizer.addEventListener('pointerup', stopResize);
  resizer.addEventListener('pointercancel', stopResize);
}

export function openDrawer(stockData) {
  if (!stockData || !stockData.symbol) return;
  dState.currentStock = stockData;

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
  if (dState._sessionCache.symbol !== symbol) {
    _clearSessionCache();
    dState._sessionCache.symbol = symbol;
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
  renderTab(dState.currentTab);
}

export async function _fetchAndSetCapital(symbol) {
  const el = document.getElementById('drw-capital-badge');
  if (!el) return;

  // Return immediately if already fetched this session
  if (dState._sessionCache.stockInfo) {
    _applyCapitalBadge(el, dState._sessionCache.stockInfo);
    return;
  }

  try {
    const info = await fetch(`/api/stock_info?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .catch(() => null);
    if (info && info.success) {
      dState._sessionCache.stockInfo = info;
      _applyCapitalBadge(el, info);
    } else {
      el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
    }
  } catch (e) {
    el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
  }
}

export function _applyCapitalBadge(el, info) {
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

export async function renderTab(tab) {
  const c = document.getElementById('drw-content');
  if (!c || !dState.currentStock) return;
  const s = dState.currentStock;
  const symbol = s.symbol;
  const price  = s.price || 100;
  let cost20 = price * 0.958;

  // Use module-level dState.klineData (no need for window global)
  const kdForVwap = dState.klineData.length > 0 ? dState.klineData : (dState._sessionCache.klineData || []);
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

  c.innerHTML = '<div class="cinfo">連線載入最新籌碼與分點中...</div>';

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
      drawChipSubCanvases(dState.klineMouseX, dState.klineMouseY);
      return;
    } else if (tab === 'margin') {
      const m = (dState.klineData && dState.klineData.length > 0) ? dState.klineData[dState.klineData.length - 1] : {};
      const mBalance = m.marginBalance || 0;
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
      drawMarginSubCanvases(dState.klineMouseX, dState.klineMouseY);
      return;
    } else if (tab === 'holders') {
      const isTdcc = dState._sessionCache.holdersRes?.usingTdccHistory;
      const tdccDataCount = dState._sessionCache.holdersRes?.data?.length || 0;
      const titleText = isTdcc
        ? (tdccDataCount > 1
            ? `千張以上大戶持股比例歷史趨勢 (TDCC，與上方 K 線時間軸聯動對齊)`
            : `千張以上大戶持股比例 (TDCC 最新一期，每週五更新)`)
        : `大戶持股比例歷史趨勢 (TDCC，與上方 K 線時間軸聯動對齊)`;
        
      c.innerHTML = `
        <div class="ccard" style="margin-bottom:10px; padding:8px 14px;">
          <div class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;display:flex;align-items:center;">${titleText}</div>
        </div>
        <div class="kbox sub-chart-box" style="height:250px;position:relative;margin-bottom:10px;"><canvas id="drw-holders-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas></div>
      `;
      initHoldersSubCanvasEvents();
      drawHoldersSubCanvases(dState.klineMouseX, dState.klineMouseY);
      return;
    } else if (tab === 'branches') {
      const curPeriod = dState.branchesPeriod || 'days20';
      c.innerHTML = `
        <div class="ccard" style="margin-bottom:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
          <div id="drw-branches-title" class="cctitle" style="color:#7dd3fc;letter-spacing:0.5px;margin:0;">主力券商分點買賣超排行榜</div>
          <div style="display:flex;background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:2px;gap:2px;">
            <button class="drw-period-btn" data-period="days20" style="background:${curPeriod === 'days20' ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};color:${curPeriod === 'days20' ? '#38bdf8' : '#94a3b8'};border:none;padding:2px 10px;font-size:0.75rem;border-radius:4px;cursor:pointer;font-weight:600;transition:all 0.15s ease;">近 20 日</button>
            <button class="drw-period-btn" data-period="days60" style="background:${curPeriod === 'days60' ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};color:${curPeriod === 'days60' ? '#38bdf8' : '#94a3b8'};border:none;padding:2px 10px;font-size:0.75rem;border-radius:4px;cursor:pointer;font-weight:600;transition:all 0.15s ease;">近 60 日</button>
          </div>
        </div>
        <div class="kbox sub-chart-box" style="height:360px;position:relative;margin-bottom:10px;"><canvas id="drw-branches-canvas" style="display:block;width:100%;height:100%;cursor:pointer;"></canvas></div>
      `;
      import('./branches.js').then(m => {
        if (m.bindBranchesPeriodToggle) m.bindBranchesPeriodToggle();
      });
      initBranchesSubCanvasEvents();
      drawBranchesSubCanvases(dState.klineMouseX, dState.klineMouseY);
      return;
    }
  } catch (e) {
    console.warn('[Drawer] Render tab error:', e.message);
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
    drawChipSubCanvases(dState.klineMouseX, dState.klineMouseY);
  } else if (tab === 'margin') {
    initMarginSubCanvasEvents();
    drawMarginSubCanvases(dState.klineMouseX, dState.klineMouseY);
  }
}

