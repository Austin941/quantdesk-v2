// ============================================================
// tables/flow.js — 資金建倉排行表格
// ============================================================
import { state } from '../state.js';
import { _showChart, _showTechChart, renderAmountCell, getTbody, updateTableDelta } from './shared.js';

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
      const amtCell    = renderAmountCell(d.amount, d.amountDiff, maxVal);
      const absAmount  = (d.amount / 1e8).toFixed(2);
      const mktTag     = (stock['市場別'] || '').includes('上市') ? '👑上市' : '💎上櫃';

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
