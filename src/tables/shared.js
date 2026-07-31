// ============================================================
// tables/shared.js — 共用 Table Helpers
// 職責：所有表格渲染共用的工具函數
// ============================================================
import { state } from '../state.js';
import { getTbody, setActiveRow } from '../dom.js';
import { updateTableDelta, triggerFlashIfChanged } from '../ui.js';

export { getTbody, setActiveRow, updateTableDelta, triggerFlashIfChanged };

// Lazy imports to break circular deps
export async function _showChart(id, mode) {
  const { showChart } = await import('../chart/macro.js');
  showChart(id, mode);
}
export async function _showTechChart(d) {
  const { showTechChart } = await import('../ui/meta-panel.js');
  showTechChart(d);
}

// ---- HELPER: price change ----
export function getPriceChange(d) {
  if (d.price && d.prevClose && d.prevClose > 0) {
    return d.price - d.prevClose;
  }
  if (d.price > 0 && d.dailyReturn !== undefined && d.dailyReturn !== 0) {
    const prev = d.price / (1 + d.dailyReturn / 100);
    return d.price - prev;
  }
  return 0;
}

// ---- HELPER: amount bar cell ----
export function renderAmountCell(amount, amountDiff, maxVal) {
  const diffVal    = amountDiff !== undefined ? amountDiff : (amount || 0);
  const diffIn100M = diffVal / 1e8;
  const sign       = diffIn100M > 0 ? '+' : '';
  const cls        = diffIn100M > 0 ? 'color-positive' : diffIn100M < 0 ? 'color-negative' : '';
  const pct        = Math.min((Math.abs(diffVal) / (maxVal || 1)) * 100, 100);
  const barBg      = diffIn100M >= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)';
  return `
    <td class="text-right data-bar-cell ${cls}" title="成交金額: ${(amount/1e8).toFixed(2)}億">
      <div class="data-bar" style="width:${pct}%;background:${barBg}"></div>
      <strong class="data-bar-text">${sign}${diffIn100M.toFixed(2)}</strong>
    </td>
  `;
}

// ---- HELPER: generic sort comparator for ranking tables ----
export function makeSortComparator(sortCol, sortDesc, keyMap = {}) {
  return (a, b) => {
    const key = keyMap[sortCol] || sortCol;
    let vA = 0, vB = 0;
    if (key === 'amount') {
      vA = a.totalAmountDiff ?? a.totalAmount;
      vB = b.totalAmountDiff ?? b.totalAmount;
    } else if (key === 'amount_abs') {
      vA = a.totalAmount; vB = b.totalAmount;
    } else if (key === 'volume') {
      vA = a.totalVolume; vB = b.totalVolume;
    } else {
      vA = a.avgReturn; vB = b.avgReturn;
    }
    if (!isFinite(vA)) return 1;
    if (!isFinite(vB)) return -1;
    return sortDesc ? vB - vA : vA - vB;
  };
}
