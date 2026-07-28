// ============================================================
// EVENTS — All addEventListener registrations in one place
// ============================================================
import { state } from './state.js';
import { switchView, showBubbleChart, renderTvWidget } from './views.js';
import { showChart, renderChart } from './chart.js';
import { switchPeriodTbody } from './dom.js';
import {
  renderRanking, renderThemeRanking, renderGroupRanking, renderRadar, resortRadar,
  renderFlowRanking, renderDetailTable, renderHistoricalRanking,
} from './tables.js';

// Sort UI updaters (exported for init use)
const sortableHeaders      = document.querySelectorAll('.ranking-table th.sortable:not(.radar-sortable):not(.theme-sortable):not(.group-sortable)');
const themeSortableHeaders = document.querySelectorAll('.theme-sortable');
const groupSortableHeaders = document.querySelectorAll('.group-sortable');
const radarSortableHeaders = document.querySelectorAll('.radar-sortable');
const navBtns              = document.querySelectorAll('.sidebar-tab');
const backBtn              = document.getElementById('back-to-bubble-btn');

export function updateSortUI() {
  sortableHeaders.forEach(h => {
    const col  = h.getAttribute('data-sort');
    const icon = h.querySelector('.sort-icon');
    if (col === state.sortCol) { h.setAttribute('data-active', 'true'); icon.textContent = state.sortDesc ? '▼' : '▲'; }
    else { h.removeAttribute('data-active'); icon.textContent = ''; }
  });
}
export function updateThemeSortUI() {
  themeSortableHeaders.forEach(h => {
    const col  = h.getAttribute('data-sort');
    const icon = h.querySelector('.sort-icon');
    if (col === state.themeSortCol) { h.setAttribute('data-active', 'true'); icon.textContent = state.themeSortDesc ? '▼' : '▲'; }
    else { h.removeAttribute('data-active'); icon.textContent = ''; }
  });
}
export function updateGroupSortUI() {
  groupSortableHeaders.forEach(h => {
    const col  = h.getAttribute('data-sort');
    const icon = h.querySelector('.sort-icon');
    if (col === state.groupSortCol) { h.setAttribute('data-active', 'true'); icon.textContent = state.groupSortDesc ? '▼' : '▲'; }
    else { h.removeAttribute('data-active'); icon.textContent = ''; }
  });
}
export function updateRadarSortUI() {
  radarSortableHeaders.forEach(h => {
    const col  = h.getAttribute('data-sort');
    const icon = h.querySelector('.sort-icon');
    if (col === state.radarSortCol) { h.setAttribute('data-active', 'true'); icon.textContent = state.radarSortDesc ? '▼' : '▲'; }
    else { h.removeAttribute('data-active'); icon.textContent = ''; }
  });
}

// ---- Helper: get currently active sidebar tab target ----
function activeTabTarget() {
  return document.querySelector('.sidebar-tab.active')?.getAttribute('data-target') || 'view-ranking';
}

// ---- Register all events ----
export function initEvents(historicalPromise) {
  // Navigation tabs
  navBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      const targetViewId = e.currentTarget.getAttribute('data-target');
      navBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      switchView(targetViewId);

      // Lazy render: only active tab
      if (state.currentPeriodDays !== 1 && state.historicalRanking?.[String(state.currentPeriodDays)]) {
        const pd = state.historicalRanking[String(state.currentPeriodDays)];
        if (targetViewId === 'view-ranking') {
          const orig = [...state.sectorRankingData];
          state.sectorRankingData = pd.sectors.filter(s => isFinite(s.avgReturn));
          renderRanking(`近 ${state.currentPeriodDays} 日排行`);
          state.sectorRankingData = orig;
        } else if (targetViewId === 'view-theme') {
          const orig = [...state.themeRankingData];
          state.themeRankingData = pd.themes.filter(t => isFinite(t.avgReturn));
          renderThemeRanking(`近 ${state.currentPeriodDays} 日排行`);
          state.themeRankingData = orig;
        } else if (targetViewId === 'view-group') {
          const orig = [...state.groupRankingData];
          state.groupRankingData = (pd.groups || []).filter(g => isFinite(g.avgReturn));
          renderGroupRanking(`近 ${state.currentPeriodDays} 日排行`);
          state.groupRankingData = orig;
        } else if (targetViewId === 'view-radar') {
          state.currentRadarData = pd.radar || [];
          resortRadar();
        }
      } else if (state.currentPeriodDays === 1) {
        if (targetViewId === 'view-ranking') renderRanking();
        else if (targetViewId === 'view-theme') renderThemeRanking();
        else if (targetViewId === 'view-group') renderGroupRanking();
        else if (targetViewId === 'view-radar') renderRadar();
      }
    });
  });

  // Back button
  backBtn?.addEventListener('click', () => showBubbleChart(state.currentSector, state.currentChartMode));

  // Helper to sync X-axis mode and bubble size mode from table header click
  function syncBubbleSizeMode(sortCol) {
    let mode = 'amount_diff';
    if (sortCol === 'amount') mode = 'amount_diff';
    else if (sortCol === 'amount_abs') mode = 'amount';
    else if (sortCol === 'volume') mode = 'volume';
    else if (sortCol === 'return') mode = 'return';

    state.currentSizeMode = mode;
    if (mode === 'amount_diff' || mode === 'amount' || mode === 'volume') {
      state.currentXAxisMode = mode;
      document.querySelectorAll('#chart-xaxis-selector .xaxis-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-xaxis') === mode);
      });
    }
    if (state.currentSector) renderChart(state.currentSector, state.currentChartMode);
  }

  // Helper to re-render active table after sort column change
  function rerenderActiveTable() {
    const active = activeTabTarget();
    if (state.currentPeriodDays === 1) {
      if (active === 'view-ranking') renderRanking();
      else if (active === 'view-theme') renderThemeRanking();
      else if (active === 'view-group') renderGroupRanking();
      else if (active === 'view-radar') renderRadar();
    } else if (state.historicalRanking?.[String(state.currentPeriodDays)]) {
      renderHistoricalRanking(state.currentPeriodDays);
    }
  }

  // Sector sort headers
  sortableHeaders.forEach(h => {
    h.addEventListener('click', () => {
      const col = h.getAttribute('data-sort');
      if (state.sortCol === col) state.sortDesc = !state.sortDesc;
      else { state.sortCol = col; state.sortDesc = true; }
      updateSortUI();
      syncBubbleSizeMode(col);
      rerenderActiveTable();
    });
  });

  // Theme sort headers
  themeSortableHeaders.forEach(h => {
    h.addEventListener('click', () => {
      const col = h.getAttribute('data-sort');
      if (state.themeSortCol === col) state.themeSortDesc = !state.themeSortDesc;
      else { state.themeSortCol = col; state.themeSortDesc = true; }
      updateThemeSortUI();
      syncBubbleSizeMode(col);
      rerenderActiveTable();
    });
  });

  // Group sort headers
  groupSortableHeaders.forEach(h => {
    h.addEventListener('click', () => {
      const col = h.getAttribute('data-sort');
      if (state.groupSortCol === col) state.groupSortDesc = !state.groupSortDesc;
      else { state.groupSortCol = col; state.groupSortDesc = true; }
      updateGroupSortUI();
      syncBubbleSizeMode(col);
      rerenderActiveTable();
    });
  });

  // Radar sort headers
  radarSortableHeaders.forEach(h => {
    h.addEventListener('click', () => {
      const col = h.getAttribute('data-sort');
      if (state.radarSortCol === col) state.radarSortDesc = !state.radarSortDesc;
      else { state.radarSortCol = col; state.radarSortDesc = true; }
      updateRadarSortUI();
      syncBubbleSizeMode(col);
      rerenderActiveTable();
    });
  });

  // Period buttons
  document.querySelectorAll('#bubble-period-selector .period-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const days = parseInt(e.target.getAttribute('data-days'));
      if (state.currentPeriodDays === days) return;
      state.currentPeriodDays = days;

      // Update active class
      document.querySelectorAll('#bubble-period-selector .period-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-days')) === days);
      });

      // Switch period tbody for all views
      ['view-ranking', 'view-theme', 'view-group', 'view-radar'].forEach(v => switchPeriodTbody(v, days));

      // Re-render chart instantly
      if (state.currentSector) renderChart(state.currentSector, state.currentChartMode);

      // Lazy-render only the active tab
      const active = activeTabTarget();
      if (days === 1) {
        if (active === 'view-ranking') renderRanking();
        else if (active === 'view-theme') renderThemeRanking();
        else if (active === 'view-group') renderGroupRanking();
        else if (active === 'view-radar') renderRadar();
      } else if (historicalPromise) {
        document.getElementById('chart-loading-overlay').classList.remove('hidden');
        historicalPromise.then(() => {
          renderHistoricalRanking(state.currentPeriodDays);
          document.getElementById('chart-loading-overlay').classList.add('hidden');
        });
      }
    });
  });

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
      if (state.currentSector) renderChart(state.currentSector, state.currentChartMode);
    });
  });



  // Detail table sort headers
  document.querySelectorAll('.detail-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      if (state.currentDetailSort.column === column) {
        state.currentDetailSort.order = state.currentDetailSort.order === 'desc' ? 'asc' : 'desc';
      } else {
        state.currentDetailSort.column = column;
        state.currentDetailSort.order  = 'desc';
      }
      document.querySelectorAll('.detail-sortable .sort-icon').forEach(i => { i.textContent = ''; i.classList.remove('asc', 'desc'); });
      const icon = document.getElementById(`detail-sort-${column}`);
      if (icon) { icon.textContent = state.currentDetailSort.order === 'desc' ? '▼' : '▲'; icon.classList.add(state.currentDetailSort.order); }
      if (state.globalSectorDataForTable.length) renderDetailTable(state.globalSectorDataForTable);
    });
  });

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
