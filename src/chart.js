// ============================================================
// CHART — Bubble chart render and showChart entry point
// ============================================================
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { state } from './state.js';
import { showBubbleChart, showTechChart } from './views.js';
import { renderDetailTable } from './tables.js';
import { setActiveRow } from './dom.js';

Chart.register(ChartDataLabels);
Chart.defaults.color       = '#cbd5e1';
Chart.defaults.font.family = 'Inter, sans-serif';

// ---- ENTRY POINT ----
export function showChart(identifier, mode = 'sector') {
  state.currentSector    = identifier;
  state.currentChartMode = mode;
  showBubbleChart(identifier, mode);
  const modeText = mode === 'sector' ? '族群' : (mode === 'group' ? '集團股' : '題材概念');
  document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析`;
  renderChart(identifier, mode);
}

// ---- RENDER BUBBLE CHART ----
export async function renderChart(identifier, mode, isSilentRefresh = false) {
  state.currentFetchId++;
  const fetchId = state.currentFetchId;

  const modeText = mode === 'sector' ? '族群' : (mode === 'group' ? '集團股' : '題材');
  document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析`;

  // Filter & sort base data
  let baseData = [];
  if (mode === 'sector') {
    baseData = state.allMarketData.filter(d => d.stock['產業別'] === identifier);
  } else if (mode === 'group') {
    baseData = state.allMarketData.filter(d => (d.group || d.stock?.group || d.stock?.['集團別']) === identifier);
  } else {
    baseData = state.allMarketData.filter(d => d.stock['題材清單']?.includes(identifier));
  }

  baseData = baseData
    .filter(d => d?.stock?.['股票代號'] && d.amount > 0 && d.volume > 0 && isFinite(d.dailyReturn))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50);

  if (baseData.length === 0) {
    document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析 (無資料)`;
    return;
  }

  // Race condition guard
  let sectorData = [];
  const overlay  = document.getElementById('chart-loading-overlay');

  if (state.currentPeriodDays === 1) {
    overlay.classList.add('hidden');
    sectorData = baseData.map(d => ({
      symbol: d.stock['股票代號'], name: d.stock['股票名稱'], stock: d.stock,
      dailyReturn: d.dailyReturn || 0, volume: d.volume, amount: d.amount,
      amountDiff: d.amountDiff || 0, volumeDiff: d.volumeDiff || 0,
    }));
  } else {
    overlay.classList.add('hidden');
    if (!state.historicalRanking?.[String(state.currentPeriodDays)]) {
      document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析 (歷史資料缺失)`;
      return;
    }
    const periodArr = state.historicalRanking[String(state.currentPeriodDays)].allStocks
      || state.historicalRanking[String(state.currentPeriodDays)].radar || [];
    const periodMap = Object.fromEntries(periodArr.map(d => [d.stock['股票代號'], d]));

    sectorData = baseData.map(d => {
      const sym = d.stock['股票代號'];
      const p   = periodMap[sym];
      return p
        ? {
            symbol: sym, name: d.stock['股票名稱'], stock: d.stock,
            dailyReturn: p.dailyReturn || 0, volume: p.volume, amount: p.amount,
            amountDiff: p.amountDiff || 0, volumeDiff: p.volumeDiff || 0,
          }
        : {
            symbol: sym, name: d.stock['股票名稱'], stock: d.stock,
            dailyReturn: 0, volume: 0, amount: 0, amountDiff: 0, volumeDiff: 0, isMissing: true,
          };
    });
    sectorData = sectorData.sort((a, b) => b.amount - a.amount).slice(0, 50);
    document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析 (近 ${state.currentPeriodDays} 日)`;
  }

  // Check race condition after any await
  if (fetchId !== state.currentFetchId) return;

  const chartPlotData = sectorData.filter(d => !d.isMissing && d.amount > 0);
  if (chartPlotData.length === 0) {
    document.getElementById('tv-main-title').textContent += ' - 無圖表資料';
    state.globalSectorDataForTable = sectorData;
    renderDetailTable(sectorData);
    return;
  }

  // Build datasets split by market
  const twseData = chartPlotData.filter(d => (d.stock['市場別'] || '').includes('上市'));
  const tpexData = chartPlotData.filter(d => !(d.stock['市場別'] || '').includes('上市'));
  const xAxisMode = state.currentXAxisMode || 'amount_diff';
  const xAxisTitle = xAxisMode === 'volume'
    ? '成交總量 (張)'
    : xAxisMode === 'amount'
      ? '成交金額 (億)'
      : '資金變化量 (億)';

  const getX = d => {
    if (xAxisMode === 'volume') return Math.max(d.volume || 1, 1);
    if (xAxisMode === 'amount') return Math.max((d.amount / 1e8) || 0.1, 0.1);
    return (d.amountDiff || 0) / 1e8;
  };

  const getR = d => {
    if (state.currentSizeMode === 'volume') {
      return Math.max(7, Math.min(Math.sqrt((d.volume || 0) / 1000) * 2.8 + 6, 38));
    }
    if (state.currentSizeMode === 'amount') {
      return Math.max(7, Math.min((d.amount || 0) / 1e8 * 0.3 + 6, 40));
    }
    if (state.currentSizeMode === 'return') {
      return Math.max(7, Math.min(Math.abs(d.dailyReturn || 0) * 2.5 + 6, 38));
    }
    // Default: amount_diff (資金變化)
    return Math.max(7, Math.min(Math.sqrt(Math.abs(d.amountDiff || 0) / 1e8) * 3.5 + 6, 40));
  };

  const mkDataset = (label, data, borderColor, borderDash) => ({
    label,
    data: data.map(d => ({ x: getX(d), y: d.dailyReturn || 0, r: getR(d), raw: d })),
    backgroundColor: data.map(d => (d.dailyReturn || 0) >= 0 ? 'rgba(239,68,68,0.75)' : 'rgba(34,197,94,0.75)'),
    borderColor, borderWidth: borderDash ? 2 : 3.5,
    ...(borderDash ? { borderDash } : {}),
    hoverBorderWidth: borderDash ? 4 : 5, hoverBorderColor: '#ffffff',
  });

  const datasets = [
    ...(twseData.length ? [mkDataset('上市 (TWSE) 👑金環', twseData, '#facc15')] : []),
    ...(tpexData.length ? [mkDataset('上櫃 (TPEX) 💎藍環', tpexData, '#38bdf8', [3, 3])] : []),
  ];

  try {
    const ctx = document.getElementById('bubbleChart').getContext('2d');
    if (state.chartInstance) {
      try { state.chartInstance.stop(); } catch (_) {}
      state.chartInstance.data.datasets = datasets;
      state.chartInstance.options.scales.x.title.text = xAxisTitle;
      if (isSilentRefresh) {
        state.chartInstance.update('none');
      } else {
        state.chartInstance.options.animation.duration = 220;
        state.chartInstance.update();
      }
    } else {
      state.chartInstance = new Chart(ctx, {
        type: 'bubble',
        data: { datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 400, easing: 'easeOutQuad' },
          onClick: (_event, elements) => {
            if (!elements.length) return;
            const { datasetIndex, index } = elements[0];
            const pt = state.chartInstance.data.datasets[datasetIndex].data[index];
            if (!pt?.raw?.symbol) return;
            const full = state.globalSectorDataForTable.find(d => d.symbol === pt.raw.symbol);
            if (full) {
              showTechChart(full);
              const tbody = document.getElementById('detailTableBody');
              const row   = tbody?.querySelector(`tr[data-symbol="${pt.raw.symbol}"]`);
              if (row) { setActiveRow(row); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
            } else {
              window.open(`https://tw.stock.yahoo.com/quote/${pt.raw.symbol}`, '_blank');
            }
          },
          onHover: (_e, elements, chart) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#cbd5e1', font: { size: 12, family: 'Inter, sans-serif' }, padding: 18, boxWidth: 28 } },
            tooltip: {
              enabled: false,
              external(context) {
                const el    = document.getElementById('chart-tooltip');
                const model = context.tooltip;
                if (model.opacity === 0) { el.style.opacity = 0; return; }
                if (!model.body) return;
                const d        = model.dataPoints[0].raw.raw;
                const sign     = d.dailyReturn > 0 ? '+' : '';
                const col      = d.dailyReturn > 0 ? 'var(--positive-color)' : d.dailyReturn < 0 ? 'var(--negative-color)' : 'white';
                const amt      = (d.amount / 1e8).toFixed(2);
                const diffVal  = (d.amountDiff || 0) / 1e8;
                const diffSign = diffVal > 0 ? '+' : '';
                const diffCol  = diffVal > 0 ? 'var(--positive-color)' : diffVal < 0 ? 'var(--negative-color)' : '#94a3b8';
                const mkt      = (d.stock['市場別'] || '').includes('上市') ? '👑上市' : '💎上櫃';
                el.innerHTML = `
                  <div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px">
                    <strong style="font-size:1.1rem;color:#facc15">${d.stock['股票名稱']}</strong>
                    <span style="color:#cbd5e1;font-size:0.9rem">(${d.stock['股票代號']})</span>
                    <span style="margin-left:6px;font-size:0.75rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);color:#38bdf8">${mkt}</span>
                  </div>
                  <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:0.95rem">
                    <span style="color:#94a3b8">成交價:</span><span style="color:#f8fafc;font-weight:bold;text-align:right">${d.price ? d.price.toFixed(2) : '-'} 元</span>
                    <span style="color:#94a3b8">報酬率:</span><span style="color:${col};font-weight:bold;text-align:right">${sign}${d.dailyReturn.toFixed(2)}%</span>
                    <span style="color:#94a3b8">資金變化:</span><span style="color:${diffCol};font-weight:bold;text-align:right">${diffSign}${diffVal.toFixed(2)} 億</span>
                    <span style="color:#94a3b8">成交量:</span><span style="color:#fff;text-align:right">${Math.round(d.volume).toLocaleString()} 張</span>
                    <span style="color:#94a3b8">成交額:</span><span style="color:#fff;text-align:right">${amt} 億</span>
                  </div>

                `;
                const pos  = context.chart.canvas.getBoundingClientRect();
                let left   = pos.left + window.scrollX + model.caretX + 15;
                const top  = pos.top  + window.scrollY + model.caretY - 15;
                if (left + 220 > window.innerWidth - 10) left = pos.left + window.scrollX + model.caretX - 220;
                el.style.opacity = 1;
                el.style.left    = left + 'px';
                el.style.top     = top  + 'px';
              },
            },
            datalabels: {
              color: 'rgba(255,255,255,0.9)', font: { weight: 'bold', size: 12 },
              formatter: v => v.raw.stock['股票名稱'],
              align: 'end', anchor: 'end', offset: 2, clip: false,
              display: ctx => ctx.dataset.data[ctx.dataIndex].r >= 8,
            },
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: xAxisTitle, color: '#94a3b8' },
              grid: {
                color:     ctx => ctx.tick?.value === 0 ? 'rgba(56,189,248,0.6)' : 'rgba(255,255,255,0.05)',
                lineWidth: ctx => ctx.tick?.value === 0 ? 2 : 1,
              },
              ticks: {
                color: '#94a3b8',
                callback(value) {
                  const mode = state.currentXAxisMode || 'amount_diff';
                  if (mode === 'volume')
                    return value >= 10000 ? (value / 10000).toFixed(1) + '萬張' : value.toLocaleString() + '張';
                  if (mode === 'amount_diff')
                    return (value > 0 ? '+' : '') + value.toFixed(1) + '億';
                  return value.toFixed(1) + '億';
                },
              },
            },
            y: {
              grace: '20%',
              title: { display: true, text: '報酬率 (%)', color: '#94a3b8' },
              grid: {
                color:     ctx => ctx.tick?.value === 0 ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.05)',
                lineWidth: ctx => ctx.tick?.value === 0 ? 2 : 1,
              },
              ticks: { color: '#94a3b8' },
            },
          },
        },
      });
    }

    state.globalSectorDataForTable = sectorData;
    renderDetailTable(sectorData);
  } catch (err) {
    console.error('Chart initialization failed:', err);
  }
}
