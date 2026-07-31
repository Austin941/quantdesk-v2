// ============================================================
// tables/theme.js — 題材排行表格
// ============================================================
import { state } from '../state.js';
import { _showChart, renderAmountCell, getTbody, updateTableDelta, triggerFlashIfChanged } from './shared.js';

export function renderThemeRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('theme-ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各題材類別標籤即可查看該概念股的專屬泡泡圖';

  let data = [...state.themeRankingData];
  if (state.hideSingleStockThemes) {
    data = data.filter(d => d.count === undefined || d.count >= 3);
  }

  data.sort((a, b) => {
    const key = state.themeSortCol;
    let vA = 0, vB = 0;
    if (key === 'amount')      { vA = a.totalAmountDiff ?? a.totalAmount; vB = b.totalAmountDiff ?? b.totalAmount; }
    else if (key === 'amount_abs') { vA = a.totalAmount; vB = b.totalAmount; }
    else if (key === 'volume') { vA = a.totalVolume; vB = b.totalVolume; }
    else                       { vA = a.avgReturn; vB = b.avgReturn; }
    return state.themeSortDesc ? vB - vA : vA - vB;
  });

  const tbody = getTbody('view-theme', targetDays);
  if (!tbody) return;
  const maxVal = Math.max(...data.map(d => Math.abs(d.totalAmountDiff ?? d.totalAmount))) || 1;

  updateTableDelta(tbody, data, d => d.theme, (tr, d, index) => {
    const cls        = d.avgReturn > 0 ? 'color-positive' : d.avgReturn < 0 ? 'color-negative' : '';
    const sign       = d.avgReturn > 0 ? '+' : '';
    const retPct     = Math.min(Math.abs(d.avgReturn) / 10 * 100, 100);
    const retBar     = d.avgReturn >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
    const oldAmt     = tr.getAttribute('data-amount');
    const amtCell    = renderAmountCell(d.totalAmount, d.totalAmountDiff, maxVal);
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
