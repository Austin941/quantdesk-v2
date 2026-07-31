// ============================================================
// tables/group.js — 集團排行表格
// ============================================================
import { state } from '../state.js';
import { _showChart, renderAmountCell, makeSortComparator, getTbody, updateTableDelta, triggerFlashIfChanged } from './shared.js';

export function renderGroupRanking(subTitle = '', targetDays = state.currentPeriodDays) {
  const desc = document.getElementById('group-ranking-description');
  if (desc) desc.textContent = subTitle || '點擊各集團標籤即可查看該集團旗下的股票泡泡圖（如台塑、中美晶、鴻海、聯電集團）';

  const data = [...state.groupRankingData].sort(
    makeSortComparator(state.groupSortCol, state.groupSortDesc)
  );

  const tbody = getTbody('view-group', targetDays);
  if (!tbody) return;
  const maxVal = Math.max(...data.map(d => Math.abs(d.totalAmountDiff ?? d.totalAmount))) || 1;

  updateTableDelta(tbody, data, d => d.group, (tr, d, index) => {
    const cls        = d.avgReturn > 0 ? 'color-positive' : d.avgReturn < 0 ? 'color-negative' : '';
    const sign       = d.avgReturn > 0 ? '+' : '';
    const retPct     = Math.min(Math.abs(d.avgReturn) / 10 * 100, 100);
    const retBar     = d.avgReturn >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
    const oldAmt     = tr.getAttribute('data-amount');
    const amtCell    = renderAmountCell(d.totalAmount, d.totalAmountDiff, maxVal);
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
