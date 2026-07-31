// ============================================================
// ui/toolbar-events.js — Toolbar and Widget Events
// ============================================================
import { state } from '../state.js';
import { renderThemeRanking } from '../tables.js';
import { renderTvWidget } from '../views.js';

export function initToolbarEvents() {
  // Theme count filter (cluster vs all)
  document.querySelectorAll('#theme-count-filter .size-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const filter = e.currentTarget.getAttribute('data-filter');
      const hide = filter === 'cluster';
      if (state.hideSingleStockThemes === hide) return;
      state.hideSingleStockThemes = hide;
      document.querySelectorAll('#theme-count-filter .size-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === filter);
      });
      if (state.currentPeriodDays === 1) {
        renderThemeRanking();
      } else if (state.historicalRanking?.[String(state.currentPeriodDays)]) {
        const pd = state.historicalRanking[String(state.currentPeriodDays)];
        const orig = [...state.themeRankingData];
        state.themeRankingData = pd.themes.filter(t => isFinite(t.avgReturn));
        renderThemeRanking(`近 ${state.currentPeriodDays} 日排行`);
        state.themeRankingData = orig;
      }
    });
  });

  // X-Axis Control 3-Box Selector Buttons
  document.querySelectorAll('#chart-xaxis-selector .xaxis-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const xaxisMode = e.currentTarget.getAttribute('data-xaxis');
      state.currentXAxisMode = xaxisMode;
      document.querySelectorAll('#chart-xaxis-selector .xaxis-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-xaxis') === xaxisMode);
      });
      if (state.isMacroView) {
        import('../chart/macro.js').then(({ renderMacroChart }) => renderMacroChart(state.currentMacroMode));
      } else if (state.currentSector) {
        import('../chart/micro.js').then(({ renderChart }) => renderChart(state.currentSector, state.currentChartMode));
      }
    });
  });

  // View Controls (Expand, Zoom and Extremes)
  document.getElementById('reset-zoom-btn')?.addEventListener('click', () => {
    if (state.chartInstance) {
      state.chartInstance.resetZoom();
    }
  });

  document.getElementById('toggle-expand-btn')?.addEventListener('click', e => {
    const ws = document.querySelector('.tv-workspace');
    if (ws) {
      ws.classList.toggle('expanded-mode');
      const isExpanded = ws.classList.contains('expanded-mode');
      e.currentTarget.textContent = isExpanded ? '🗗 復原' : '⛶ 滿版';
      e.currentTarget.classList.toggle('active', isExpanded);
    }
  });

  const extremesSlider = document.getElementById('extremes-slider');
  const extremesLabel = document.getElementById('extremes-val-label');
  if (extremesSlider) {
    if (state.isMacroView && state.currentMacroMode === 'theme') {
      extremesSlider.value = 10;
      state.extremesThreshold = 10;
      extremesLabel.textContent = '前後10%';
    } else {
      extremesSlider.value = 50; 
      state.extremesThreshold = 100;
    }

    const updateExtremes = (e) => {
      const val = parseInt(e.target.value);
      state.extremesThreshold = (val === 50) ? 100 : val;
      extremesLabel.textContent = (val === 50) ? '全顯示' : `前後${val}%`;
      
      if (!document.getElementById('bubble-chart-view').classList.contains('hidden')) {
        if (state.isMacroView) {
          import('../chart/macro.js').then(({ renderMacroChart }) => renderMacroChart(state.currentMacroMode, true));
        } else if (state.currentSector) {
          import('../chart/micro.js').then(({ renderChart }) => renderChart(state.currentSector, state.currentChartMode, true));
        }
      }
    };
    
    extremesSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      extremesLabel.textContent = (val === 50) ? '全顯示' : `前後${val}%`;
    });
    extremesSlider.addEventListener('change', updateExtremes);
  }

  // Bubble size slider
  const bubbleScaleSlider = document.getElementById('bubble-size-slider');
  if (bubbleScaleSlider) {
    bubbleScaleSlider.addEventListener('input', (e) => {
      state.bubbleScaleRatio = parseFloat(e.target.value);
      if (!document.getElementById('bubble-chart-view').classList.contains('hidden')) {
        if (state.isMacroView) {
          import('../chart/macro.js').then(({ renderMacroChart }) => renderMacroChart(state.currentMacroMode, true));
        } else if (state.currentSector) {
          import('../chart/micro.js').then(({ renderChart }) => renderChart(state.currentSector, state.currentChartMode, true));
        }
      }
    });
  }

  // TradingView interval buttons
  document.querySelectorAll('#tech-interval-selector .interval-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('#tech-interval-selector .interval-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const symbol = document.getElementById('tech-chart-view').getAttribute('data-tv-symbol');
      if (symbol) renderTvWidget(symbol, e.target.getAttribute('data-interval'));
    });
  });

  // Detail table inline search
  const detailSearch = document.getElementById('detail-stock-search');
  if (detailSearch) {
    detailSearch.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      document.getElementById('detailTableBody')?.querySelectorAll('tr').forEach(tr => {
        tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
    });
  }
}
