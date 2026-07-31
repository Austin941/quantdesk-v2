// ============================================================
// tables/detail.js — 成分股明細表格 + 歷史排行
// ============================================================
import { state } from '../state.js';
import { _showTechChart, getPriceChange, renderAmountCell, setActiveRow, updateTableDelta, triggerFlashIfChanged } from './shared.js';
import { renderRanking } from './ranking.js';
import { renderThemeRanking } from './theme.js';
import { renderGroupRanking } from './group.js';
import { resortRadar } from './radar.js';

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
    if      (col === 'price')      { vA = a.price || 0;          vB = b.price || 0; }
    else if (col === 'change')     { vA = getPriceChange(a);     vB = getPriceChange(b); }
    else if (col === 'return')     { vA = a.dailyReturn || 0;    vB = b.dailyReturn || 0; }
    else if (col === 'volume')     { vA = a.volume || 0;         vB = b.volume || 0; }
    else if (col === 'amount')     { vA = a.amountDiff ?? a.amount ?? 0; vB = b.amountDiff ?? b.amount ?? 0; }
    else if (col === 'amount_abs') { vA = a.amount || 0;         vB = b.amount || 0; }
    else if (col === 'sector') {
      vA = a.stock?.['產業別'] || ''; vB = b.stock?.['產業別'] || '';
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
      const ret       = item.dailyReturn;
      const price     = item.price ? Number(item.price.toFixed(2)).toString() : '<span title="即時連線失敗或查無報價" style="color:#ef4444;font-size:0.8em">⚠️無報價</span>';
      const changeVal = getPriceChange(item);
      const changeStr = item.price ? (changeVal > 0 ? `+${Number(changeVal.toFixed(2))}` : changeVal < 0 ? `${Number(changeVal.toFixed(2))}` : '0') : '-';
      const colorCls  = ret > 0 ? 'text-danger color-positive' : ret < 0 ? 'text-success color-negative' : '';
      let badgeCls    = colorCls;
      if (ret >= 9.8)  badgeCls += ' badge-limit-up';
      if (ret <= -9.8) badgeCls += ' badge-limit-down';
      const sign      = ret > 0 ? '+' : '';
      const amtCell   = renderAmountCell(item.amount, item.amountDiff, maxVal);
      const absAmount = (item.amount / 1e8).toFixed(2);

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><a href="#" class="stock-link">
          <strong style="color:#facc15">${item.stock['股票名稱']}</strong> <span style="color:#94a3b8;font-size:0.85em">${item.symbol}</span>
        </a></td>
        <td><span class="badge-sector" style="font-size:0.75em">${item.stock['產業別'] || '無'}</span></td>
        <td class="text-right font-bold ${colorCls}">${price}</td>
        <td class="text-right font-bold ${colorCls}">${changeStr}</td>
        <td class="text-right font-bold"><span class="${badgeCls}">${sign}${ret.toFixed(2)}%</span></td>
        <td class="text-right">${Math.round(item.volume).toLocaleString()}</td>
        ${amtCell}
        <td class="text-right" style="color:#94a3b8">${absAmount}</td>
      `;

      tr.setAttribute('data-symbol', item.symbol);
      if (!tr.hasAttribute('data-amount')) {
        const showChartFn = e => {
          e.preventDefault();
          setActiveRow(tr);
          _showTechChart(item);
        };
        tr.addEventListener('click', showChartFn);
        tr.addEventListener('dblclick', showChartFn);
      }
    }
    tr.setAttribute('data-amount', item.amount || 0);
    triggerFlashIfChanged(tr, oldAmt, item.amount || 0);
  });
}

export function renderHistoricalRanking(days) {
  const hr = state.historicalRanking;
  if (!hr || !hr[String(days)]) {
    const noData = `<tr><td colspan="5" class="text-center" style="color:#94a3b8">歷史資料尚未產生，請稍後再試</td></tr>`;
    const noData6 = `<tr><td colspan="6" class="text-center" style="color:#94a3b8">歷史資料尚未產生</td></tr>`;
    const getTbody = (id, d) => document.querySelector(`#${id} [data-days="${d}"] tbody`);
    ['view-ranking', 'view-theme', 'view-group'].forEach(id => {
      const tb = getTbody(id, days); if (tb) tb.innerHTML = noData;
    });
    const radarTb = getTbody('view-radar', days); if (radarTb) radarTb.innerHTML = noData6;
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
