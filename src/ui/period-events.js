// ============================================================
// ui/period-events.js — Period Selection Events
// ============================================================
import { state } from '../state.js';
import { switchPeriodTbody } from '../dom.js';
import { renderRanking, renderThemeRanking, renderGroupRanking, renderRadar, renderHistoricalRanking } from '../tables.js';

export function initPeriodEvents(historicalPromise) {
  function activeTabTarget() {
    return document.querySelector('.sidebar-tab.active')?.getAttribute('data-target') || 'view-ranking';
  }

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
      if (state.isMacroView) {
        import('../chart/macro.js').then(({ renderMacroChart }) => renderMacroChart(state.currentMacroMode));
      } else if (state.currentSector) {
        import('../chart/micro.js').then(({ renderChart }) => renderChart(state.currentSector, state.currentChartMode));
      }

      // Lazy-render only the active tab
      const active = activeTabTarget();
      if (days === 1) {
        if (active === 'view-ranking') renderRanking();
        else if (active === 'view-theme') renderThemeRanking();
        else if (active === 'view-group') renderGroupRanking();
        else if (active === 'view-radar') renderRadar();
      } else if (historicalPromise) {
        document.getElementById('chart-loading-overlay')?.classList.remove('hidden');
        historicalPromise.then(() => {
          renderHistoricalRanking(state.currentPeriodDays);
          document.getElementById('chart-loading-overlay')?.classList.add('hidden');
        });
      }
    });
  });
}
