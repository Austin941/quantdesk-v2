// ============================================================
// TABLES — All sidebar and detail table rendering logic
// ============================================================
import { state } from './state.js';
import { getTbody, setActiveRow } from './dom.js';
import { updateTableDelta, triggerFlashIfChanged } from './ui.js';

// Lazy imports to avoid circular deps (tables ↔ chart ↔ views ↔ tables)
async function _showChart(id, mode) {
  const { showChart } = await import('./chart.js');
  showChart(id, mode);
}
async function _showTechChart(d) {
  const { showTechChart } = await import('./views.js');
  showTechChart(d);
}

// ---- HELPER: RENDER AMOUNT CELL (DIFF VS ABS) ----
// ---- HELPER: RENDER AMOUNT CELL (DEFAULT AMOUNT DIFF) ----
function renderAmountCell(amount, amountDiff, maxVal) {
  const diffVal = amountDiff !== undefined ? amountDiff : (amount || 0);
  const diffIn100M = diffVal / 1e8;
  const sign = diffIn100M > 0 ? '+' : '';
  const cls = diffIn100M > 0 ? 'color-positive' : diffIn100M < 0 ? 'color-negative' : '';
  const pct = Math.min((Math.abs(diffVal) / (maxVal || 1)) * 100, 100);
  const barBg = diffIn100M >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
  return `
    <td class="text-right data-bar-cell ${cls}" title="成交金額: ${(amount/1e8).toFixed(2)}億">
      <div class="data-bar" style="width:${pct}%;background:${barBg}"></div>
      <strong class="data-bar-text">${sign}${diffIn100M.toFixed(2)}</strong>
    </td>
  `;
}

// ---- RENDER SECTOR RANKING ----
export function renderRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各產業別標籤即可查看該族群的泡泡圖分析';

  const data = [...state.sectorRankingData].sort((a, b) => {
    const key = state.sortCol;
    let vA = 0, vB = 0;
    if (key === 'amount') {
      vA = a.totalAmountDiff ?? a.totalAmount;
      vB = b.totalAmountDiff ?? b.totalAmount;
    } else if (key === 'amount_abs') {
      vA = a.totalAmount;
      vB = b.totalAmount;
    } else if (key === 'volume') {
      vA = a.totalVolume; vB = b.totalVolume;
    } else {
      vA = a.avgReturn; vB = b.avgReturn;
    }
    if (!isFinite(vA)) return 1;
    if (!isFinite(vB)) return -1;
    return state.sortDesc ? vB - vA : vA - vB;
  });

  const tbody = getTbody('view-ranking', targetDays);
  if (!tbody) return;
  const maxVal = Math.max(...data.map(d => Math.abs(d.totalAmountDiff ?? d.totalAmount))) || 1;

  updateTableDelta(tbody, data, d => d.sector, (tr, d, index) => {
    const cls     = d.avgReturn > 0 ? 'color-positive' : d.avgReturn < 0 ? 'color-negative' : '';
    const sign    = d.avgReturn > 0 ? '+' : '';
    const retPct  = Math.min(Math.abs(d.avgReturn) / 10 * 100, 100);
    const retBar  = d.avgReturn >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
    const oldAmt  = tr.getAttribute('data-amount');
    const amtCell = renderAmountCell(d.totalAmount, d.totalAmountDiff, maxVal);

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><span class="badge-sector">${d.sector}</span></td>
      <td class="text-right ${cls} data-bar-cell">
        <div class="data-bar" style="width:${retPct}%;background:${retBar}"></div>
        <strong class="data-bar-text">${sign}${d.avgReturn.toFixed(2)}%</strong>
      </td>
      <td class="text-right">${Math.round(d.totalVolume).toLocaleString()}</td>
      ${amtCell}
      <td class="text-right" style="color:#94a3b8">${(d.totalAmount / 1e8).toFixed(2)}</td>
    `;
    tr.onclick = () => _showChart(d.sector, 'sector');
    tr.setAttribute('data-amount', d.totalAmount);
    triggerFlashIfChanged(tr, oldAmt, d.totalAmount);
  });
}

// ---- RENDER THEME RANKING ----
export function renderThemeRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('theme-ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各題材類別標籤即可查看該概念股的專屬泡泡圖';

  let data = [...state.themeRankingData];
  if (state.hideSingleStockThemes) {
    data = data.filter(d => d.count === undefined || d.count >= 2);
  }

  data.sort((a, b) => {
    const key = state.themeSortCol;
    let vA = 0, vB = 0;
    if (key === 'amount') {
      vA = a.totalAmountDiff ?? a.totalAmount;
      vB = b.totalAmountDiff ?? b.totalAmount;
    } else if (key === 'amount_abs') {
      vA = a.totalAmount;
      vB = b.totalAmount;
    } else if (key === 'volume') {
      vA = a.totalVolume; vB = b.totalVolume;
    } else {
      vA = a.avgReturn; vB = b.avgReturn;
    }
    return state.themeSortDesc ? vB - vA : vA - vB;
  });

  const tbody = getTbody('view-theme', targetDays);
  if (!tbody) return;
  const maxVal = Math.max(...data.map(d => Math.abs(d.totalAmountDiff ?? d.totalAmount))) || 1;

  updateTableDelta(tbody, data, d => d.theme, (tr, d, index) => {
    const cls    = d.avgReturn > 0 ? 'color-positive' : d.avgReturn < 0 ? 'color-negative' : '';
    const sign   = d.avgReturn > 0 ? '+' : '';
    const retPct = Math.min(Math.abs(d.avgReturn) / 10 * 100, 100);
    const retBar = d.avgReturn >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
    const oldAmt = tr.getAttribute('data-amount');
    const amtCell = renderAmountCell(d.totalAmount, d.totalAmountDiff, maxVal);
    const countBadge = d.count ? `<small style="font-size:0.75em;color:#94a3b8;margin-left:3px">(${d.count})</small>` : '';

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><span class="badge-sector">${d.theme}${countBadge}</span></td>
      <td class="text-right ${cls} data-bar-cell">
        <div class="data-bar" style="width:${retPct}%;background:${retBar}"></div>
        <strong class="data-bar-text">${sign}${d.avgReturn.toFixed(2)}%</strong>
      </td>
      <td class="text-right">${Math.round(d.totalVolume).toLocaleString()}</td>
      ${amtCell}
      <td class="text-right" style="color:#94a3b8">${(d.totalAmount / 1e8).toFixed(2)}</td>
    `;
    tr.onclick = () => _showChart(d.theme, 'theme');
    tr.setAttribute('data-amount', d.totalAmount);
    triggerFlashIfChanged(tr, oldAmt, d.totalAmount);
  });
}

// ---- RENDER RADAR (live) ----
export function renderRadar() {
  const desc = document.getElementById('radar-description');
  if (desc) desc.textContent = '顯示全市場即時成交金額與資金變化前 100 檔個股';
  state.currentRadarData = [...state.allMarketData].filter(d => d.amount > 0);
  resortRadar(1);
}

// ---- RESORT RADAR ----
export function resortRadar(targetDays = state.currentPeriodDays) {
  const sorted = [...state.currentRadarData].sort((a, b) => {
    const key = state.radarSortCol;
    let vA = 0, vB = 0;
    if (key === 'price')        { vA = a.price || 0;             vB = b.price || 0; }
    else if (key === 'change')  {
      vA = (a.price && a.prevClose) ? (a.price - a.prevClose) : 0;
      vB = (b.price && b.prevClose) ? (b.price - b.prevClose) : 0;
    }
    else if (key === 'amount')  { vA = a.amountDiff ?? a.amount; vB = b.amountDiff ?? b.amount; }
    else if (key === 'amount_abs') { vA = a.amount; vB = b.amount; }
    else if (key === 'volume') { vA = a.volume; vB = b.volume; }
    else { vA = a.dailyReturn; vB = b.dailyReturn; }
    if (!isFinite(vA)) return 1;
    if (!isFinite(vB)) return -1;
    return state.radarSortDesc ? vB - vA : vA - vB;
  });
  renderRadarFromData(sorted.slice(0, 200), targetDays);
}

// ---- RENDER RADAR FROM DATA ----
export function renderRadarFromData(data, targetDays = state.currentPeriodDays) {
  const tbody = getTbody('view-radar', targetDays);
  if (!tbody) return;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">暫無交易資料</td></tr>';
    return;
  }
  const maxVal = state.flowMetricMode === 'diff'
    ? (Math.max(...data.map(d => Math.abs(d.amountDiff ?? d.amount))) || 1)
    : (data[0]?.amount || 1);

  updateTableDelta(tbody, data,
    d => d.stock ? d.stock['股票代號'] : d.symbol,
    (tr, d, index) => {
      const stock      = d.stock;
      if (!stock) return;
      const sector     = stock['產業別'] || '無';
      const ret        = d.dailyReturn;
      const price      = d.price ? d.price.toFixed(2) : '-';
      const changeVal  = (d.price && d.prevClose) ? (d.price - d.prevClose) : 0;
      const changeStr  = changeVal > 0 ? `+${changeVal.toFixed(2)}` : changeVal < 0 ? `${changeVal.toFixed(2)}` : '0.00';
      const cls        = ret > 0 ? 'color-positive' : ret < 0 ? 'color-negative' : '';
      const sign       = ret > 0 ? '+' : '';
      const retPct     = Math.min(Math.abs(ret) / 10 * 100, 100);
      const retBar     = ret > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)';
      const amtCell    = renderAmountCell(d.amount, d.amountDiff, maxVal);

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><div class="stock-name-cell">
          <strong>${stock['股票名稱']}</strong>
          <span class="stock-symbol">${stock['股票代號']}</span>
        </div></td>
        <td><span class="badge-sector">${sector}</span></td>
        <td class="text-right font-bold ${cls}">${price}</td>
        <td class="text-right font-bold ${cls}">${changeStr}</td>
        <td class="text-right ${cls} data-bar-cell">
          <div class="data-bar" style="width:${retPct}%;background:${retBar}"></div>
          <strong class="data-bar-text">${sign}${ret.toFixed(2)}%</strong>
        </td>
        <td class="text-right">${Math.round(d.volume).toLocaleString()}</td>
        ${amtCell}
        <td class="text-right" style="color:#94a3b8">${(d.amount / 1e8).toFixed(2)}</td>
      `;


      const oldAmt = tr.getAttribute('data-amount');
      if (!tr.hasAttribute('data-amount')) {
        tr.addEventListener('click', () => {
          if (stock['產業別']) _showChart(stock['產業別'], 'sector');
          _showTechChart(d);
        });
      }
      tr.setAttribute('data-amount', d.amount);
      triggerFlashIfChanged(tr, oldAmt, d.amount);
    }
  );
}

// ---- RENDER FLOW (資金建倉) ----
export function renderFlowRanking(targetDays = state.currentPeriodDays) {
  const tbody = getTbody('view-flow', targetDays);
  if (!tbody) return;
  if (!state.allMarketData.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">載入中...</td></tr>';
    return;
  }

  const sorted = [...state.allMarketData]
    .filter(d => d?.stock && d.amount > 0)
    .sort((a, b) => {
      const vA = state.flowMetricMode === 'diff' ? (a.amountDiff ?? a.amount) : a.amount;
      const vB = state.flowMetricMode === 'diff' ? (b.amountDiff ?? b.amount) : b.amount;
      return vB - vA;
    })
    .slice(0, 100);

  updateTableDelta(tbody, sorted,
    d => d.stock ? d.stock['股票代號'] : d.symbol,
    (tr, d, index) => {
      const stock  = d.stock;
      if (!stock) return;
      const sector = stock['產業別'] || '無';
      const ret    = d.dailyReturn;
      const cls    = ret > 0 ? 'color-positive' : ret < 0 ? 'color-negative' : '';
      const sign   = ret > 0 ? '+' : '';
      const maxVal = Math.max(...sorted.map(d => Math.abs(d.amountDiff ?? d.amount))) || 1;
      const amtCell = renderAmountCell(d.amount, d.amountDiff, maxVal);
      const absAmount = (d.amount / 1e8).toFixed(2);
      const mktTag = (stock['市場別'] || '').includes('上市') ? '👑上市' : '💎上櫃';

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><div class="stock-name-cell">
          <a href="#" class="stock-link"><strong>${stock['股票名稱']}</strong></a>
          <span class="stock-symbol">${stock['股票代號']} <small style="font-size:0.75em;color:#cbd5e1">${mktTag}</small></span>
        </div></td>
        <td class="text-right ${cls}">${sign}${ret.toFixed(2)}%</td>
        <td class="text-right">${Math.round(d.volume).toLocaleString()}</td>
        ${amtCell}
        <td class="text-right font-bold" style="color:#facc15">${absAmount}</td>
      `;
      if (!tr.hasAttribute('data-amount')) {
        tr.addEventListener('click', () => {
          const full = state.globalSectorDataForTable.find(i => i.symbol === stock['股票代號'])
            || { stock, dailyReturn: d.dailyReturn, volume: d.volume, amount: d.amount };
          if (stock['產業別']) _showChart(stock['產業別'], 'sector');
          _showTechChart(full);
        });
      }
      tr.setAttribute('data-amount', d.amount);
    }
  );
}

// ---- RENDER DETAIL TABLE (bubble chart bottom panel) ----
export function renderDetailTable(data) {
  const tbody = document.getElementById('detailTableBody');
  if (!tbody) return;

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center" data-ignore="true">無資料</td></tr>';
    return;
  }

  const sorted = [...data].sort((a, b) => {
    const col = state.currentDetailSort.column;
    let vA, vB;
    if (col === 'price')        { vA = a.price || 0;          vB = b.price || 0; }
    else if (col === 'change')  {
      vA = (a.price && a.prevClose) ? (a.price - a.prevClose) : 0;
      vB = (b.price && b.prevClose) ? (b.price - b.prevClose) : 0;
    }
    else if (col === 'return')  { vA = a.dailyReturn || 0;   vB = b.dailyReturn || 0; }
    else if (col === 'volume')  { vA = a.volume || 0;         vB = b.volume || 0; }
    else if (col === 'amount')  {
      vA = a.amountDiff ?? a.amount ?? 0;
      vB = b.amountDiff ?? b.amount ?? 0;
    }
    else if (col === 'amount_abs') {
      vA = a.amount || 0;
      vB = b.amount || 0;
    }
    else if (col === 'sector') {
      vA = a.stock ? (a.stock['產業別'] || '') : '';
      vB = b.stock ? (b.stock['產業別'] || '') : '';
      return state.currentDetailSort.order === 'desc'
        ? vB.localeCompare(vA, 'zh-Hant')
        : vA.localeCompare(vB, 'zh-Hant');
    }
    else { vA = a.symbol || ''; vB = b.symbol || ''; }

    if (vA < vB) return state.currentDetailSort.order === 'desc' ? 1 : -1;
    if (vA > vB) return state.currentDetailSort.order === 'desc' ? -1 : 1;
    return 0;
  });

  const maxVal = Math.max(...sorted.map(d => Math.abs(d.amountDiff ?? d.amount))) || 1;

  updateTableDelta(tbody, sorted, item => item.symbol, (tr, item, idx) => {
    const oldAmt = tr.getAttribute('data-amount');
    if (item.isMissing) {
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${item.stock['股票名稱']} (${item.symbol})</td>
        <td>-</td>
        <td class="text-right text-slate-500">-</td>
        <td class="text-right text-slate-500">-</td>
        <td class="text-right text-slate-500">無資料</td>
        <td class="text-right text-slate-500">-</td>
        <td class="text-right text-slate-500">-</td>
        <td class="text-right text-slate-500">-</td>
      `;
    } else {
      const ret        = item.dailyReturn;
      const price      = item.price ? item.price.toFixed(2) : '-';
      const changeVal  = (item.price && item.prevClose) ? (item.price - item.prevClose) : 0;
      const changeStr  = changeVal > 0 ? `+${changeVal.toFixed(2)}` : changeVal < 0 ? `${changeVal.toFixed(2)}` : '0.00';
      let cls          = ret > 0 ? 'text-danger color-positive' : ret < 0 ? 'text-success color-negative' : '';
      if (ret >= 9.8)  cls += ' badge-limit-up';
      if (ret <= -9.8) cls += ' badge-limit-down';
      const sign = ret > 0 ? '+' : '';

      const amtCell   = renderAmountCell(item.amount, item.amountDiff, maxVal);
      const absAmount = (item.amount / 1e8).toFixed(2);

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><a href="#" class="stock-link">
          <strong style="color:#facc15">${item.stock['股票名稱']}</strong> <span style="color:#94a3b8;font-size:0.85em">${item.symbol}</span>
        </a></td>
        <td><span class="badge-sector" style="font-size:0.75em">${item.stock['產業別'] || '無'}</span></td>
        <td class="text-right font-bold ${cls}">${price}</td>
        <td class="text-right font-bold ${cls}">${changeStr}</td>
        <td class="text-right font-bold"><span class="${cls}">${sign}${ret.toFixed(2)}%</span></td>
        <td class="text-right">${Math.round(item.volume).toLocaleString()}</td>
        ${amtCell}
        <td class="text-right" style="color:#94a3b8">${absAmount}</td>
      `;


      tr.setAttribute('data-symbol', item.symbol);
      if (!tr.hasAttribute('data-amount')) {
        tr.addEventListener('click', e => {
          e.preventDefault();
          setActiveRow(tr);
          _showTechChart({ stock: item.stock, dailyReturn: item.dailyReturn, volume: item.volume, amount: item.amount });
        });
      }
    }
    tr.setAttribute('data-amount', item.amount || 0);
    triggerFlashIfChanged(tr, oldAmt, item.amount || 0);
  });
}

// ---- RENDER GROUP RANKING ----
export function renderGroupRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('group-ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各集團標籤即可查看該集團旗下的股票泡泡圖（如台塑、中美晶、鴻海、聯電集團）';

  const data = [...state.groupRankingData].sort((a, b) => {
    const key = state.groupSortCol;
    let vA = 0, vB = 0;
    if (key === 'amount') {
      vA = a.totalAmountDiff ?? a.totalAmount;
      vB = b.totalAmountDiff ?? b.totalAmount;
    } else if (key === 'amount_abs') {
      vA = a.totalAmount;
      vB = b.totalAmount;
    } else if (key === 'volume') {
      vA = a.totalVolume; vB = b.totalVolume;
    } else {
      vA = a.avgReturn; vB = b.avgReturn;
    }
    if (!isFinite(vA)) return 1;
    if (!isFinite(vB)) return -1;
    return state.groupSortDesc ? vB - vA : vA - vB;
  });

  const tbody = getTbody('view-group', targetDays);
  if (!tbody) return;
  const maxVal = Math.max(...data.map(d => Math.abs(d.totalAmountDiff ?? d.totalAmount))) || 1;

  updateTableDelta(tbody, data, d => d.group, (tr, d, index) => {
    const cls     = d.avgReturn > 0 ? 'color-positive' : d.avgReturn < 0 ? 'color-negative' : '';
    const sign    = d.avgReturn > 0 ? '+' : '';
    const retPct  = Math.min(Math.abs(d.avgReturn) / 10 * 100, 100);
    const retBar  = d.avgReturn >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
    const oldAmt  = tr.getAttribute('data-amount');
    const amtCell = renderAmountCell(d.totalAmount, d.totalAmountDiff, maxVal);
    const countBadge = d.count ? `<small style="font-size:0.75em;color:#cbd5e1;margin-left:3px">(${d.count})</small>` : '';

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><span class="badge-sector" style="background:rgba(168,85,247,0.2);color:#c084fc;border:1px solid rgba(168,85,247,0.4);">${d.group}${countBadge}</span></td>
      <td class="text-right ${cls} data-bar-cell">
        <div class="data-bar" style="width:${retPct}%;background:${retBar}"></div>
        <strong class="data-bar-text">${sign}${d.avgReturn.toFixed(2)}%</strong>
      </td>
      <td class="text-right">${Math.round(d.totalVolume).toLocaleString()}</td>
      ${amtCell}
      <td class="text-right" style="color:#94a3b8">${(d.totalAmount / 1e8).toFixed(2)}</td>
    `;
    tr.onclick = () => _showChart(d.group, 'group');
    tr.setAttribute('data-amount', d.totalAmount);
    triggerFlashIfChanged(tr, oldAmt, d.totalAmount);
  });
}

// ---- RENDER HISTORICAL RANKING (5/10/20 day) ----
export function renderHistoricalRanking(days) {
  const hr = state.historicalRanking;
  if (!hr || !hr[String(days)]) {
    getTbody('view-ranking', days).innerHTML = `<tr><td colspan="5" class="text-center" style="color:#94a3b8">歷史資料尚未產生，請稍後再試</td></tr>`;
    getTbody('view-theme',   days).innerHTML = `<tr><td colspan="5" class="text-center" style="color:#94a3b8">歷史資料尚未產生</td></tr>`;
    getTbody('view-group',   days).innerHTML = `<tr><td colspan="5" class="text-center" style="color:#94a3b8">歷史資料尚未產生</td></tr>`;
    getTbody('view-radar',   days).innerHTML = `<tr><td colspan="6" class="text-center" style="color:#94a3b8">歷史資料尚未產生</td></tr>`;
    return;
  }

  const periodData = hr[String(days)];
  const updatedAt  = hr.updated_at
    ? new Date(hr.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    : '';

  const origSector = [...state.sectorRankingData];
  const origTheme  = [...state.themeRankingData];
  const origGroup  = [...state.groupRankingData];

  state.sectorRankingData = periodData.sectors.filter(s => isFinite(s.avgReturn));
  state.themeRankingData  = periodData.themes.filter(t => isFinite(t.avgReturn));
  state.groupRankingData  = (periodData.groups || []).filter(g => isFinite(g.avgReturn));

  renderRanking(`近 ${days} 日排行 (更新: ${updatedAt})`, days);
  renderThemeRanking(`近 ${days} 日排行`, days);
  renderGroupRanking(`近 ${days} 日排行`, days);

  const desc = document.getElementById('radar-description');
  if (desc) desc.textContent = `顯示全市場近 ${days} 日累積成交金額最高的前 200 檔個股`;
  state.currentRadarData = periodData.radar || [];
  resortRadar(days);

  state.sectorRankingData = origSector;
  state.themeRankingData  = origTheme;
  state.groupRankingData  = origGroup;
}
