// ============================================================
// tables/ranking.js — 產業排行表格
// ============================================================
import { state } from '../state.js';
import { _showChart, renderAmountCell, makeSortComparator, getTbody, updateTableDelta, triggerFlashIfChanged } from './shared.js';

export function renderRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各產業別標籤即可查看該族群的泡泡圖分析';

  const data = [...state.sectorRankingData].sort(
    makeSortComparator(state.sortCol, state.sortDesc)
  );

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
