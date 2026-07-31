// ============================================================
// ui/nav-events.js — Navigation and View Switching Events
// ============================================================
import { state } from '../state.js';
import { switchView, showBubbleChart } from './layout.js';
import { renderRanking, renderThemeRanking, renderGroupRanking, renderRadar } from '../tables.js';

export function initNavEvents() {
  const navBtns = document.querySelectorAll('.sidebar-tab');
  const backBtn = document.getElementById('back-to-bubble-btn');

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
          import('../tables.js').then(({ resortRadar }) => resortRadar());
        }
      } else if (state.currentPeriodDays === 1) {
        if (targetViewId === 'view-ranking') renderRanking();
        else if (targetViewId === 'view-theme') renderThemeRanking();
        else if (targetViewId === 'view-group') renderGroupRanking();
        else if (targetViewId === 'view-radar') renderRadar();
      }
    });
  });

  // Back button (Micro -> Tech)
  backBtn?.addEventListener('click', () => showBubbleChart(state.currentSector, state.currentChartMode));

  // Macro View Toggle buttons
  document.querySelectorAll('#macro-view-selector .macro-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const macroMode = e.currentTarget.getAttribute('data-macro');
      document.querySelectorAll('#macro-view-selector .macro-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-macro') === macroMode);
      });
      // Need to dynamically import chart.js to avoid circular deps if not available
      import('../chart/macro.js').then(({ renderMacroChart }) => {
        renderMacroChart(macroMode);
      });
    });
  });

  // Back to Macro button (Drill-down -> Macro)
  document.getElementById('back-to-macro-btn')?.addEventListener('click', () => {
    import('../chart/macro.js').then(({ renderMacroChart }) => {
      renderMacroChart(state.currentMacroMode);
    });
  });
}
