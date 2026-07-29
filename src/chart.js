// ============================================================
// CHART — Bubble chart render and showChart entry point
// ============================================================
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { state } from './state.js';
import { showBubbleChart, showTechChart } from './views.js';
import { renderDetailTable } from './tables.js';
import { setActiveRow } from './dom.js';

Chart.register(ChartDataLabels, annotationPlugin, zoomPlugin);
Chart.defaults.color       = '#cbd5e1';
Chart.defaults.font.family = 'Inter, sans-serif';

// ---- HELPER: RANK & ANTI-COLLISION ----
function calculateRanksAndAntiCollision(dataList, getX, getY, getR) {
  const pts = dataList.map(d => ({
    rawX: getX(d),
    rawY: getY(d),
    r: getR(d),
    raw: d
  }));

  const N = pts.length;
  if (N === 0) return [];
  if (N === 1) {
    pts[0].x = 50; pts[0].y = 50;
    return pts;
  }

  // X Rank
  pts.sort((a, b) => a.rawX - b.rawX);
  pts.forEach((pt, idx) => {
    pt.x = (idx / (N - 1)) * 100 + (Math.random() - 0.5) * 0.1;
  });

  // Y Rank
  pts.sort((a, b) => a.rawY - b.rawY);
  pts.forEach((pt, idx) => {
    pt.y = (idx / (N - 1)) * 100 + (Math.random() - 0.5) * 0.1;
  });

  // Anti-collision on 0-100 scale
  for (let iter = 0; iter < 15; iter++) {
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Map pixel radius to percentile space (tuning factor)
        const minDist = (pts[i].r + pts[j].r) * 0.12; 
        if (dist < minDist && dist > 0) {
          const force = (minDist - dist) / dist * 0.35;
          pts[i].y -= dy * force;
          pts[j].y += dy * force;
          pts[i].x -= dx * force;
          pts[j].x += dx * force;
        }
      }
    }
  }

  if (state.isExtremesOnly) {
    // Keep only the 4 extreme corners (Top/Bottom 25% for both X and Y)
    return pts.filter(pt => (pt.x <= 25 || pt.x >= 75) && (pt.y <= 25 || pt.y >= 75));
  }

  return pts;
}

// ---- ENTRY POINT ----
export function showChart(identifier, mode = 'sector') {
  state.currentSector    = identifier;
  state.currentChartMode = mode;
  showBubbleChart(identifier, mode);
  const modeText = mode === 'sector' ? '族群' : (mode === 'group' ? '集團股' : '題材概念');
  document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析`;
  renderChart(identifier, mode);
}

import { showMacroView } from './views.js';

// ---- MACRO ENTRY POINT ----
export async function renderMacroChart(macroMode = 'sector', isSilentRefresh = false) {
  state.currentFetchId++;
  const fetchId = state.currentFetchId;
  showMacroView(macroMode);

  let dataSource = [];
  let labelKey = '';
  
  if (macroMode === 'sector') {
    dataSource = state.sectorRankingData;
    labelKey = 'sector';
  } else if (macroMode === 'theme') {
    dataSource = state.themeRankingData;
    labelKey = 'theme';
  } else if (macroMode === 'group') {
    dataSource = state.groupRankingData;
    labelKey = 'group';
  }

  // Filter out empty or zero amount
  let plotData = dataSource.filter(d => d.totalAmount > 0 && d[labelKey]);
  
  // Apply the same X-axis mode logic
  const xAxisMode = state.currentXAxisMode || 'amount_diff';
  const xAxisTitle = xAxisMode === 'volume'
    ? '族群成交總量 (萬張)'
    : xAxisMode === 'amount'
      ? '族群成交金額 (億)'
      : '族群資金變化量 (億)';

  const getX = d => {
    if (xAxisMode === 'volume') return Math.max((d.totalVolume || 0) / 10000, 0.1);
    if (xAxisMode === 'amount') return Math.max((d.totalAmount / 1e8) || 0.1, 0.1);
    return (d.totalAmountDiff || 0) / 1e8;
  };

  const getR = d => {
    if (state.currentSizeMode === 'volume') {
      return Math.max(4, Math.min(Math.sqrt((d.volume || 0) / 1000) * 1.8 + 4, 25));
    }
    if (state.currentSizeMode === 'amount') {
      return Math.max(4, Math.min((d.amount || 0) / 1e8 * 0.2 + 4, 25));
    }
    if (state.currentSizeMode === 'return') {
      return Math.max(4, Math.min(Math.abs(d.dailyReturn || 0) * 1.5 + 4, 25));
    }
    // Default: amount_diff (資金變化)
    return Math.max(4, Math.min(Math.sqrt(Math.abs(d.amountDiff || 0) / 1e8) * 2.0 + 4, 25));
  };

  const getY = d => d.avgReturn || 0;

  const pts = calculateRanksAndAntiCollision(plotData, getX, getY, getR);
  const mktName = macroMode === 'sector' ? '產業聚落' : (macroMode === 'theme' ? '題材聚落' : '集團聚落');
  
  const dataset = {
    label: mktName,
    data: pts,
    backgroundColor: pts.map(d => (d.rawY || 0) >= 0 ? 'rgba(239,68,68,0.78)' : 'rgba(34,197,94,0.78)'),
    borderColor: '#38bdf8', borderWidth: 2,
    hoverBorderWidth: 4, hoverBorderColor: '#ffffff',
  };

  // Calculate Market Average Return across ALL stocks
  const allReturns = state.allMarketData.filter(d => d.dailyReturn !== undefined && !isNaN(d.dailyReturn)).map(d => d.dailyReturn);
  const marketAvgReturn = allReturns.length ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;
  
  // Find percentile of marketAvgReturn
  let smallerCount = 0;
  plotData.forEach(d => { if ((d.avgReturn || 0) < marketAvgReturn) smallerCount++; });
  const marketYPercentile = plotData.length > 1 ? (smallerCount / (plotData.length - 1)) * 100 : 50;

  let xTitleDesc = '← 資金流出最多 ｜ 族群資金變化量排序 ｜ 資金流入最多 →';
  if (state.currentXAxisMode === 'volume') xTitleDesc = '← 成交量最低 ｜ 族群成交總量排序 ｜ 成交量最高 →';
  if (state.currentXAxisMode === 'amount') xTitleDesc = '← 交易冷清 ｜ 族群成交金額排序 ｜ 交易熱絡 →';

  try {
    const ctx = document.getElementById('bubbleChart').getContext('2d');
    if (state.chartInstance) {
      try { state.chartInstance.stop(); } catch (_) {}
      state.chartInstance.data.datasets = [dataset];
      state.chartInstance.options.scales.x.title.text = xTitleDesc;
      state.chartInstance.options.scales.x.min = -5;
      state.chartInstance.options.scales.x.max = 105;
      state.chartInstance.options.scales.y.min = -10;
      state.chartInstance.options.scales.y.max = 110;
      state.chartInstance.options.scales.x.ticks = { display: false };
      state.chartInstance.options.scales.y.ticks = { display: false };
      state.chartInstance.options.scales.y.title.text = '← 跌幅最大 ｜ 報酬率排序 ｜ 漲幅最大 →';
      state.chartInstance.options.plugins.annotation.annotations.marketLine.yMin = marketYPercentile;
      state.chartInstance.options.plugins.annotation.annotations.marketLine.yMax = marketYPercentile;
      state.chartInstance.options.plugins.annotation.annotations.marketLine.label.content = `加權平均 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`;
      
      // Override tooltips and clicks for MACRO mode
      state.chartInstance.options.plugins.tooltip.external = (context) => macroTooltip(context, labelKey);
      state.chartInstance.options.plugins.datalabels.formatter = v => v.raw[labelKey];
      state.chartInstance.options.onClick = (_event, elements) => {
        if (!elements.length) return;
        const { datasetIndex, index } = elements[0];
        const pt = state.chartInstance.data.datasets[datasetIndex].data[index];
        const itemName = pt?.raw?.[labelKey];
        if (itemName) {
          // Drill-down!
          showChart(itemName, macroMode);
        }
      };

      if (isSilentRefresh) {
        state.chartInstance.update('none');
      } else {
        state.chartInstance.options.animation.duration = 250;
        state.chartInstance.update();
      }
    } else {
      state.chartInstance = new Chart(ctx, {
        type: 'bubble',
        data: { datasets: [dataset] },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 400, easing: 'easeOutQuad' },
          onClick: (_event, elements) => {
            if (!elements.length) return;
            const { datasetIndex, index } = elements[0];
            const pt = state.chartInstance.data.datasets[datasetIndex].data[index];
            const itemName = pt?.raw?.[labelKey];
            if (itemName) {
              showChart(itemName, macroMode);
            }
          },
          onHover: (_e, elements, chart) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#cbd5e1', font: { size: 12, family: 'Inter, sans-serif' }, padding: 18, boxWidth: 28 } },
            tooltip: {
              enabled: false,
              external(context) {
                if (state.isMacroView) {
                  let lk = state.currentMacroMode === 'sector' ? 'sector' : (state.currentMacroMode === 'theme' ? 'theme' : 'group');
                  return macroTooltip(context, lk);
                }
                return microTooltip(context);
              },
            },
            datalabels: {
              color: 'rgba(255,255,255,0.9)', font: { weight: 'bold', size: 12 },
              formatter: v => state.isMacroView ? v.raw[state.currentMacroMode === 'sector' ? 'sector' : (state.currentMacroMode === 'theme' ? 'theme' : 'group')] : v.raw.stock['股票名稱'],
              align: 'end', anchor: 'end', offset: 2, clip: false,
              display: ctx => ctx.dataset.data[ctx.dataIndex].r >= 8,
            },
            annotation: {
              annotations: {
                marketLine: {
                  type: 'line',
                  yMin: marketYPercentile,
                  yMax: marketYPercentile,
                  borderColor: 'rgba(239, 68, 68, 0.8)',
                  borderWidth: 1.5,
                  borderDash: [5, 5],
                  label: {
                    content: `大盤 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`,
                    display: true,
                    position: 'end',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    font: { size: 10, family: 'Inter, sans-serif' }
                  }
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: -5, max: 105,
              title: { display: true, text: xTitleDesc, color: '#94a3b8' },
              grid: {
                color: 'rgba(255,255,255,0.05)',
                lineWidth: 1,
              },
              ticks: { display: false },
            },
            y: {
              type: 'linear',
              min: -10, max: 110,
              title: { display: true, text: '← 跌幅最大 ｜ 報酬率排序 ｜ 漲幅最大 →', color: '#94a3b8' },
              grid: {
                color: 'rgba(255,255,255,0.05)',
                lineWidth: 1,
              },
              ticks: { display: false },
            },
          },
        },
      });
    }
  } catch (err) {
    console.error('Macro Chart render failed:', err);
  }
}

function macroTooltip(context, labelKey) {
  const el = document.getElementById('chart-tooltip');
  const model = context.tooltip;
  if (model.opacity === 0) { el.style.opacity = 0; return; }
  if (!model.body) return;
  const d = model.dataPoints[0].raw.raw;
  const sign = d.avgReturn > 0 ? '+' : '';
  const col = d.avgReturn > 0 ? 'var(--positive-color)' : d.avgReturn < 0 ? 'var(--negative-color)' : 'white';
  const amt = (d.totalAmount / 1e8).toFixed(2);
  const diffVal = (d.totalAmountDiff || 0) / 1e8;
  const diffSign = diffVal > 0 ? '+' : '';
  const diffCol = diffVal > 0 ? 'var(--positive-color)' : diffVal < 0 ? 'var(--negative-color)' : '#94a3b8';
  
  el.innerHTML = `
    <div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px">
      <strong style="font-size:1.1rem;color:#facc15">${d[labelKey]}</strong>
      <span style="color:#cbd5e1;font-size:0.8rem;margin-left:8px;">包含 ${d.count || '多'} 檔成分股</span>
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:0.95rem">
      <span style="color:#94a3b8">平均報酬率:</span><span style="color:${col};font-weight:bold;text-align:right">${sign}${d.avgReturn.toFixed(2)}%</span>
      <span style="color:#94a3b8">族群資金變化:</span><span style="color:${diffCol};font-weight:bold;text-align:right">${diffSign}${diffVal.toFixed(2)} 億</span>
      <span style="color:#94a3b8">族群總額:</span><span style="color:#fff;text-align:right">${amt} 億</span>
    </div>
    <div style="margin-top:6px;font-size:0.8rem;color:#38bdf8;text-align:center;">
      (點擊氣泡下鑽查看詳細成分股)
    </div>
  `;
  const pos = context.chart.canvas.getBoundingClientRect();
  let left = pos.left + window.scrollX + model.caretX + 15;
  const top = pos.top + window.scrollY + model.caretY - 15;
  if (left + 220 > window.innerWidth - 10) left = pos.left + window.scrollX + model.caretX - 220;
  el.style.opacity = 1;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

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
      price: d.price, prevClose: d.prevClose
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
            price: d.price, prevClose: d.prevClose
          }
        : {
            symbol: sym, name: d.stock['股票名稱'], stock: d.stock,
            dailyReturn: 0, volume: 0, amount: 0, amountDiff: 0, volumeDiff: 0, isMissing: true,
            price: d.price, prevClose: d.prevClose
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

  const xAxisMode = state.currentXAxisMode || 'amount_diff';
  const getX = d => {
    if (xAxisMode === 'volume') return Math.max(d.volume || 1, 1);
    if (xAxisMode === 'amount') return Math.max((d.amount / 1e8) || 0.1, 0.1);
    return (d.amountDiff || 0) / 1e8;
  };

  const getR = d => {
    if (state.currentSizeMode === 'volume') {
      return Math.max(4, Math.min(Math.sqrt((d.volume || 0) / 1000) * 1.8 + 4, 25));
    }
    if (state.currentSizeMode === 'amount') {
      return Math.max(4, Math.min((d.amount || 0) / 1e8 * 0.2 + 4, 25));
    }
    if (state.currentSizeMode === 'return') {
      return Math.max(4, Math.min(Math.abs(d.dailyReturn || 0) * 1.5 + 4, 25));
    }
    // Default: amount_diff (資金變化)
    return Math.max(4, Math.min(Math.sqrt(Math.abs(d.amountDiff || 0) / 1e8) * 2.0 + 4, 25));
  };

  const getY = d => d.dailyReturn || 0;
  
  const allPts = calculateRanksAndAntiCollision(chartPlotData, getX, getY, getR);

  const twsePts = allPts.filter(pt => (pt.raw.stock['市場別'] || '').includes('上市'));
  const tpexPts = allPts.filter(pt => !(pt.raw.stock['市場別'] || '').includes('上市'));

  const mkDataset = (label, data, borderColor, borderDash) => {
    return {
      label,
      data,
      backgroundColor: data.map(pt => (pt.rawY || 0) >= 0 ? 'rgba(240,64,64,0.78)' : 'rgba(34,197,94,0.78)'),
      borderColor, borderWidth: borderDash ? 2 : 3.5,
      ...(borderDash ? { borderDash } : {}),
      hoverBorderWidth: borderDash ? 4 : 5, hoverBorderColor: '#ffffff',
    };
  };

  const allReturns = state.allMarketData.filter(d => d.dailyReturn !== undefined && !isNaN(d.dailyReturn)).map(d => d.dailyReturn);
  const marketAvgReturn = allReturns.length ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;

  let smallerCount = 0;
  chartPlotData.forEach(d => { if ((d.dailyReturn || 0) < marketAvgReturn) smallerCount++; });
  const marketYPercentile = chartPlotData.length > 1 ? (smallerCount / (chartPlotData.length - 1)) * 100 : 50;

  const datasets = [
    ...(twsePts.length ? [mkDataset('上市 (TWSE) 👑金環', twsePts, '#facc15')] : []),
    ...(tpexPts.length ? [mkDataset('上櫃 (TPEX) 💎藍環', tpexPts, '#38bdf8', [3, 3])] : []),
  ];

  let xTitleDesc = '← 資金流出最多 ｜ 個股資金變化量排序 ｜ 資金流入最多 →';
  if (xAxisMode === 'volume') xTitleDesc = '← 量縮 ｜ 個股成交量排序 ｜ 出量 →';
  if (xAxisMode === 'amount') xTitleDesc = '← 交易冷清 ｜ 個股成交額排序 ｜ 交易熱絡 →';

  try {
    const ctx = document.getElementById('bubbleChart').getContext('2d');
    if (state.chartInstance) {
      try { state.chartInstance.stop(); } catch (_) {}
      state.chartInstance.data.datasets = datasets;
      state.chartInstance.options.scales.x.title.text = xTitleDesc;
      state.chartInstance.options.scales.x.min = -5;
      state.chartInstance.options.scales.x.max = 105;
      state.chartInstance.options.scales.y.min = -10;
      state.chartInstance.options.scales.y.max = 110;
      state.chartInstance.options.scales.x.ticks = { display: false };
      state.chartInstance.options.scales.y.ticks = { display: false };
      state.chartInstance.options.scales.y.title.text = '← 跌幅最大 ｜ 報酬率排序 ｜ 漲幅最大 →';
      state.chartInstance.options.plugins.annotation.annotations.marketLine.yMin = marketYPercentile;
      state.chartInstance.options.plugins.annotation.annotations.marketLine.yMax = marketYPercentile;
      state.chartInstance.options.plugins.annotation.annotations.marketLine.label.content = `大盤 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`;
      // Restore MICRO tooltips and clicks
      state.chartInstance.options.plugins.tooltip.external = (context) => microTooltip(context);
      state.chartInstance.options.plugins.datalabels.formatter = v => v.raw.stock['股票名稱'];
      state.chartInstance.options.onClick = (_event, elements) => {
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
      };

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
                if (state.isMacroView) {
                  let labelKey = state.currentMacroMode === 'sector' ? 'sector' : (state.currentMacroMode === 'theme' ? 'theme' : 'group');
                  return macroTooltip(context, labelKey);
                }
                return microTooltip(context);
              },
            },
            datalabels: {
              color: 'rgba(255,255,255,0.9)', font: { weight: 'bold', size: 12 },
              formatter: v => state.isMacroView ? v.raw[state.currentMacroMode === 'sector' ? 'sector' : (state.currentMacroMode === 'theme' ? 'theme' : 'group')] : v.raw.stock['股票名稱'],
              align: 'end', anchor: 'end', offset: 2, clip: false,
              display: ctx => ctx.dataset.data[ctx.dataIndex].r >= 8,
            },

            annotation: {
              annotations: {
                marketLine: {
                  type: 'line',
                  yMin: marketYPercentile,
                  yMax: marketYPercentile,
                  borderColor: 'rgba(239, 68, 68, 0.8)',
                  borderWidth: 1.5,
                  borderDash: [5, 5],
                  label: {
                    content: `大盤 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`,
                    display: true,
                    position: 'end',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    font: { size: 10, family: 'Inter, sans-serif' }
                  }
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: -5, max: 105,
              title: { display: true, text: xTitleDesc, color: '#94a3b8' },
              grid: {
                color: 'rgba(255,255,255,0.05)',
                lineWidth: 1,
              },
              ticks: { display: false },
            },
            y: {
              type: 'linear',
              min: -10, max: 110,
              title: { display: true, text: '← 跌幅最大 ｜ 報酬率排序 ｜ 漲幅最大 →', color: '#94a3b8' },
              grid: {
                color: 'rgba(255,255,255,0.05)',
                lineWidth: 1,
              },
              ticks: { display: false },
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

export function microTooltip(context) {
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
      <span style="color:#94a3b8">成交價:</span><span style="color:#f8fafc;font-weight:bold;text-align:right">${d.price ? Number(d.price.toFixed(2)).toString() : '-'} 元</span>
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
}
