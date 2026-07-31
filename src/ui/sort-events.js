// ============================================================
// ui/sort-events.js — Table Sorting Events
// ============================================================
import { state } from '../state.js';
import { renderRanking, renderThemeRanking, renderGroupRanking, renderRadar, renderDetailTable, renderHistoricalRanking } from '../tables.js';

export const sortableHeaders      = document.querySelectorAll('.ranking-table th.sortable:not(.radar-sortable):not(.theme-sortable):not(.group-sortable)');
export const themeSortableHeaders = document.querySelectorAll('.theme-sortable');
export const groupSortableHeaders = document.querySelectorAll('.group-sortable');
export const radarSortableHeaders = document.querySelectorAll('.radar-sortable');

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

function activeTabTarget() {
  return document.querySelector('.sidebar-tab.active')?.getAttribute('data-target') || 'view-ranking';
}

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
  if (state.isMacroView) {
    import('../chart/macro.js').then(({ renderMacroChart }) => renderMacroChart(state.currentMacroMode));
  } else if (state.currentSector) {
    import('../chart/micro.js').then(({ renderChart }) => renderChart(state.currentSector, state.currentChartMode));
  }
}

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

export function initSortEvents() {
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
}
