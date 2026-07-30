import { Chart, calculateRanksAndAntiCollision } from './shared.js';
import { state } from '../state.js';
import { showTechChart, showMacroView, showBubbleChart } from '../views.js';
import { renderDetailTable } from '../tables.js';
import { setActiveRow } from '../dom.js';

import { renderChart, microTooltip } from './micro.js';

export function showChart(identifier, mode = 'sector') {
  state.currentSector    = identifier;
  state.currentChartMode = mode;
  showBubbleChart(identifier, mode);
  const modeText = mode === 'sector' ? '族群' : (mode === 'group' ? '集團股' : '題材概念');
  document.getElementById('tv-main-title').textContent = `${identifier} ${modeText}分析`;
  renderChart(identifier, mode);
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
  
  let val = d[labelKey];
  let displayName = (val && typeof val === 'object') ? (val.name || val.group || val.id || String(val)) : val;
  el.innerHTML = `
    <div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px">
      <strong style="font-size:1.1rem;color:#facc15">${displayName}</strong>
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
    let baseR = 10;
    if (state.currentSizeMode === 'volume') {
      baseR = Math.max(10, Math.min(Math.sqrt((d.totalVolume || 0) / 1000) * 2.5 + 10, 45));
    } else if (state.currentSizeMode === 'amount') {
      baseR = Math.max(10, Math.min((d.totalAmount || 0) / 1e8 * 0.25 + 10, 45));
    } else if (state.currentSizeMode === 'return') {
      baseR = Math.max(10, Math.min(Math.abs(d.avgReturn || 0) * 2.0 + 10, 45));
    } else {
      // Default: amount_diff (資金變化)
      baseR = Math.max(10, Math.min(Math.sqrt(Math.abs(d.totalAmountDiff || 0) / 1e8) * 2.5 + 10, 45));
    }
    return baseR * (state.bubbleScaleRatio || 1.0);
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

      // Always update dataset in place to preserve zoom plugin state
      state.chartInstance.data.datasets[0].data = dataset.data;
      state.chartInstance.data.datasets[0].label = dataset.label;
      state.chartInstance.data.datasets[0].backgroundColor = dataset.backgroundColor;

      if (isSilentRefresh) {
        // Silent: ONLY update annotation line. Never touch scales/animation/zoom.
        // This is the key fix for flash and zoom-reset bugs.
        state.chartInstance.options.plugins.annotation.annotations.marketLine.yMin = marketYPercentile;
        state.chartInstance.options.plugins.annotation.annotations.marketLine.yMax = marketYPercentile;
        state.chartInstance.options.plugins.annotation.annotations.marketLine.label.content = `加權平均 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`;
        state.chartInstance.update('none');
      } else {
        // Full update: reset scales, tooltips, labels, animation
        state.chartInstance.options.scales.x.title.text = xTitleDesc;
        state.chartInstance.options.scales.x.min = -5;
        state.chartInstance.options.scales.x.max = 105;
        state.chartInstance.options.scales.x.ticks = { display: false };
        state.chartInstance.options.scales.y.min = -10;
        state.chartInstance.options.scales.y.max = 110;
        state.chartInstance.options.scales.y.ticks = { display: false };
        state.chartInstance.options.scales.y.title.text = '← 跌幅最大 ｜ 報酬率排序 ｜ 漲幅最大 →';
        state.chartInstance.options.plugins.annotation.annotations.marketLine.yMin = marketYPercentile;
        state.chartInstance.options.plugins.annotation.annotations.marketLine.yMax = marketYPercentile;
        state.chartInstance.options.plugins.annotation.annotations.marketLine.label.content = `加權平均 (${marketAvgReturn > 0 ? '+' : ''}${marketAvgReturn.toFixed(2)}%)`;
        state.chartInstance.options.plugins.tooltip.external = (context) => macroTooltip(context, labelKey);
        state.chartInstance.options.plugins.datalabels.formatter = v => {
          let val = v.raw[labelKey];
          return (val && typeof val === 'object') ? (val.name || val.group || val.id || String(val)) : val;
        };
        state.chartInstance.options.onClick = (_event, elements) => {
          if (!elements.length) return;
          const { datasetIndex, index } = elements[0];
          const pt = state.chartInstance.data.datasets[datasetIndex].data[index];
          const itemName = pt?.raw?.[labelKey];
          if (itemName) showChart(itemName, macroMode);
        };
        state.chartInstance.options.animation.duration = 250;
        state.chartInstance.update();
      }
    } else {
      state.chartInstance = new Chart(ctx, {
        type: 'bubble',
        data: { datasets: [dataset] },
        options: {
          responsive: true, maintainAspectRatio: false,
          resizeDelay: 0,
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
              display: true,
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
            },
            zoom: {
              pan: { enabled: true, mode: 'xy' },
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'xy'
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
      // Use ResizeObserver to reliably track container size changes
      // (rAF alone is insufficient when canvas is position:absolute)
      const container = document.querySelector('.canvas-container');
      if (container && window.ResizeObserver) {
        // Disconnect previous observer if exists
        if (state._canvasResizeObserver) state._canvasResizeObserver.disconnect();
        state._canvasResizeObserver = new ResizeObserver(() => {
          if (state.chartInstance) state.chartInstance.resize();
        });
        state._canvasResizeObserver.observe(container);
      }
      // Also do immediate resize after DOM settles
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (state.chartInstance) state.chartInstance.resize();
        });
      });
    }
  } catch (err) {
    console.error('Macro Chart render failed:', err);
    if(document.getElementById('global-error-display')) {
      document.getElementById('global-error-display').style.display='block';
      document.getElementById('global-error-display').innerHTML += '<strong>Macro Chart failed: ' + err.message + '</strong><br>' + err.stack + '<br>';
    }
  }
}