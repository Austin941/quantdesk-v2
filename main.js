// ============================================================
// MAIN — App bootstrap: data loading and live refresh only
// ============================================================
import Papa from 'papaparse';
import { fetchSnapshot, fetchHistoricalRanking } from './src/api.js';
import { state } from './src/state.js';
import { showChart, renderChart } from './src/chart.js';
import { initGlobalSearch } from './src/search.js';
import { initSidebarResizer, initVerticalResizer } from './src/resizer.js';
import { initEvents, updateSortUI, updateThemeSortUI, updateGroupSortUI, updateRadarSortUI } from './src/events.js';
import { renderRanking, renderThemeRanking, renderGroupRanking, renderRadar } from './src/tables.js';
import { getConglomeratesByStockCode } from './src/stock_api.js';

// ---- Global error handlers ----
window.onerror = (msg, _src, _line, _col, err) => console.error('Global Error:', msg, err);
window.addEventListener('unhandledrejection', e => console.error('Unhandled rejection:', e.reason));

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    // 1. Kick off historical JSON fetch in background (non-blocking)
    const historicalPromise = fetchHistoricalRanking().then(data => {
      state.historicalRanking = data;
      if (data) {
        const at = data.updated_at
          ? new Date(data.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
          : '未知';
        console.log(`[HistoricalRanking] Loaded. Updated at: ${at}`);
      } else {
        console.warn('[HistoricalRanking] Not available.');
      }
    });

    // 2. Load stock list CSV in parallel
    const todayStr = new Date().toISOString().split('T')[0];
    await new Promise((resolve, reject) => {
      Papa.parse(`./stocks.csv?v=${todayStr}`, {
        download: true, header: true,
        complete: results => {
          state.allStocks = results.data.filter(d => d['股票代號'] && d['股票名稱']);
          resolve();
        },
        error: reject,
      });
    });

    // 3. First live data load (shows data immediately)
    await processData();

    // 4. Wire up all UI events (tabs, sort, period, size, search, resizer)
    initEvents(historicalPromise);
    initGlobalSearch();
    initSidebarResizer();
    initVerticalResizer();

    // 5. Init sort UI indicators
    updateSortUI();
    updateThemeSortUI();
    updateGroupSortUI();
    updateRadarSortUI();

    // 6. Auto-select the top sector so chart is never blank at startup
    const defaultSector = state.sectorRankingData[0]?.sector || '半導體業';
    showChart(defaultSector, 'sector');

    // 7. Live refresh every 15 seconds (single-day mode only)
    setInterval(() => {
      if (state.currentPeriodDays === 1) processData(true);
    }, 15000);

  } catch (err) {
    console.error('Init failed:', err);
    document.getElementById('last-updated').textContent = '初始化失敗，請重新整理頁面。';
  }
}

// ============================================================
// DATA PROCESSING — Fetch live snapshot, build allMarketData
// ============================================================
async function processData(isSilentRefresh = false) {
  try {
    const result = await fetchSnapshot(state.allStocks);
    if (!result) return;

    const marketCache    = result.data || result;
    state.isMarketOpenNow  = result.isMarketOpen !== undefined ? result.isMarketOpen : true;
    state.liveSnapshotCache = marketCache;

    // Update timestamp
    const status = state.isMarketOpenNow ? ' 🟢 盤中即時 (15s自動刷新)' : ' 🔴 已收盤';
    document.getElementById('last-updated').textContent =
      `最後更新：${new Date().toLocaleTimeString('zh-TW', { hour12: false })}${status}`;

    // Build lookup for 1-day reference historical data
    const hist1Map = {};
    if (state.historicalRanking?.[1]?.allStocks) {
      state.historicalRanking[1].allStocks.forEach(s => {
        hist1Map[s.stock['股票代號']] = s;
      });
    }

    // Build allMarketData from CSV stock list + live snapshot
    state.allMarketData = state.allStocks.map(stock => {
      const sym  = stock['股票代號'];
      const snap = marketCache[sym];
      let dailyReturn = 0, volume = 0, amount = 0, price = 0;
      let volumeDiff = 0, amountDiff = 0;
      if (snap) {
        price  = snap.price  || 0;
        volume = snap.volume || 0;
        if (snap.prevClose > 0 && price > 0)
          dailyReturn = ((price - snap.prevClose) / snap.prevClose) * 100;
        amount = price * volume * 1000;

        const h1 = hist1Map[sym];
        if (h1 && h1.amount > 0) {
          amountDiff = amount - h1.amount;
          volumeDiff = volume - h1.volume;
        } else {
          amountDiff = amount * (dailyReturn / 100);
          volumeDiff = volume * (dailyReturn / 100);
        }
      }
      const groupName = getConglomeratesByStockCode(sym);
      stock.group = groupName;
      return { stock, dailyReturn, volume, amount, price, symbol: sym, volumeDiff, amountDiff, group: groupName };
    });

    // Aggregate sector, theme & group rankings
    const sectorMap = {}, themeMap = {}, groupMap = {};
    const THEME_BLACKLIST = new Set(['半導體', '電子零組件', '電子代工', '通信網路', '其他電子', '光電', '電腦及週邊設備']);

    state.allMarketData.forEach(d => {
      const sector = d.stock['產業別'];
      if (sector && sector !== '無' && sector !== '') {
        const s = sectorMap[sector] ||= { sector, totalVolume: 0, totalAmount: 0, totalVolumeDiff: 0, totalAmountDiff: 0, weightedReturnSum: 0 };
        s.totalVolume       += d.volume;
        s.totalAmount       += d.amount;
        s.totalVolumeDiff   += d.volumeDiff || 0;
        s.totalAmountDiff   += d.amountDiff || 0;
        s.weightedReturnSum += d.dailyReturn * d.amount;
      }
      const groupName = getConglomeratesByStockCode(d.stock['股票代號']);
      if (groupName && groupName !== '獨立/未歸類') {
        const g = groupMap[groupName] ||= { group: groupName, totalVolume: 0, totalAmount: 0, totalVolumeDiff: 0, totalAmountDiff: 0, weightedReturnSum: 0, count: 0 };
        g.totalVolume       += d.volume;
        g.totalAmount       += d.amount;
        g.totalVolumeDiff   += d.volumeDiff || 0;
        g.totalAmountDiff   += d.amountDiff || 0;
        g.weightedReturnSum += d.dailyReturn * d.amount;
        g.count             += 1;
      }
      const themes = d.stock['題材清單'];
      if (themes) {
        themes.split('、').map(t => t.trim())
          .filter(t => t && t !== sector && !THEME_BLACKLIST.has(t))
          .forEach(theme => {
            const t = themeMap[theme] ||= { theme, totalVolume: 0, totalAmount: 0, totalVolumeDiff: 0, totalAmountDiff: 0, weightedReturnSum: 0, count: 0 };
            t.totalVolume       += d.volume;
            t.totalAmount       += d.amount;
            t.totalVolumeDiff   += d.volumeDiff || 0;
            t.totalAmountDiff   += d.amountDiff || 0;
            t.weightedReturnSum += d.dailyReturn * d.amount;
            t.count             += 1;
          });
      }
    });

    state.sectorRankingData = Object.values(sectorMap).map(s => ({
      sector: s.sector, totalVolume: s.totalVolume, totalAmount: s.totalAmount,
      totalVolumeDiff: s.totalVolumeDiff, totalAmountDiff: s.totalAmountDiff,
      avgReturn: s.totalAmount > 0 ? s.weightedReturnSum / s.totalAmount : 0,
    }));

    state.themeRankingData = Object.values(themeMap).map(t => ({
      theme: t.theme, totalVolume: t.totalVolume, totalAmount: t.totalAmount,
      totalVolumeDiff: t.totalVolumeDiff, totalAmountDiff: t.totalAmountDiff,
      avgReturn: t.totalAmount > 0 ? t.weightedReturnSum / t.totalAmount : 0,
      count: t.count,
    }));

    state.groupRankingData = Object.values(groupMap).map(g => ({
      group: g.group, totalVolume: g.totalVolume, totalAmount: g.totalAmount,
      totalVolumeDiff: g.totalVolumeDiff, totalAmountDiff: g.totalAmountDiff,
      avgReturn: g.totalAmount > 0 ? g.weightedReturnSum / g.totalAmount : 0,
      count: g.count,
    }));

    // Render tables for the active period
    if (state.currentPeriodDays === 1) {
      renderRanking();
      renderThemeRanking();
      renderGroupRanking();
      renderRadar();
    }

    // Refresh chart silently if already open
    if (state.currentSector && !document.getElementById('bubble-chart-view').classList.contains('hidden') && state.currentPeriodDays === 1) {
      renderChart(state.currentSector, state.currentChartMode, isSilentRefresh);
    }
  } catch (err) {
    console.error('processData error:', err);
    document.getElementById('last-updated').textContent = '最後更新：載入失敗，請稍後再試。';
  }
}

// ---- Start ----
init();
