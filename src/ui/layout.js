// ============================================================
// ui/layout.js — 頁面切換邏輯（從 views.js 拆出）
// 職責：純 DOM 操作，切換宏觀/微觀/技術分析視圖
// 不引用 chart/ 或 tables/（透過 bus 通訊）
// ============================================================
import { state } from '../state.js';

export function showMacroView(macroMode = 'sector') {
  state.isMacroView = true;
  state.currentMacroMode = macroMode;
  const bubbleView = document.getElementById('bubble-chart-view');

  requestAnimationFrame(() => {
    bubbleView.classList.remove('fade-in');
    requestAnimationFrame(() => bubbleView.classList.add('fade-in'));
  });

  const modeText = macroMode === 'sector' ? '產業' : (macroMode === 'theme' ? '題材' : '集團');
  document.getElementById('tv-main-title').textContent = `全市場資金流向分析 ❯ ${modeText}`;
  document.getElementById('tv-main-subtitle').textContent = '點擊泡泡進入微觀個股分析';

  document.getElementById('tech-chart-view').classList.add('hidden');
  document.getElementById('tech-interval-selector').classList.add('hidden');
  document.getElementById('back-to-bubble-btn').classList.add('hidden');
  document.getElementById('macro-view-selector').classList.remove('hidden');
  document.getElementById('back-to-macro-btn').classList.add('hidden');
  document.getElementById('bubble-chart-view').classList.remove('hidden');
  document.getElementById('bubble-period-selector').classList.remove('hidden');

  if (macroMode === 'theme') {
    document.getElementById('extremes-container')?.classList.remove('hidden');
  } else {
    document.getElementById('extremes-container')?.classList.add('hidden');
  }

  document.getElementById('detail-table-wrapper').classList.add('hidden');
  document.getElementById('main-vertical-resizer')?.classList.add('hidden');

  const canvasContainer = document.querySelector('.canvas-container');
  if (canvasContainer) {
    canvasContainer.style.flex = '';
    canvasContainer.style.height = '';
  }
}

export function showBubbleChart(groupName, mode = 'sector') {
  state.isMacroView = false;
  const bubbleView = document.getElementById('bubble-chart-view');

  requestAnimationFrame(() => {
    bubbleView.classList.remove('fade-in');
    requestAnimationFrame(() => bubbleView.classList.add('fade-in'));
  });

  let title = '全市場族群';
  if (groupName && groupName !== 'ALL') title += ' ❯ ' + groupName;
  document.getElementById('tv-main-title').textContent = title;
  document.getElementById('tv-main-subtitle').textContent = '';

  document.getElementById('tech-chart-view').classList.add('hidden');
  document.getElementById('tech-interval-selector').classList.add('hidden');
  document.getElementById('back-to-bubble-btn').classList.add('hidden');
  document.getElementById('macro-view-selector').classList.remove('hidden');
  document.getElementById('back-to-macro-btn').classList.remove('hidden');
  document.getElementById('bubble-chart-view').classList.remove('hidden');
  document.getElementById('bubble-period-selector').classList.remove('hidden');
  document.getElementById('extremes-container')?.classList.add('hidden');
  document.getElementById('detail-table-wrapper').classList.remove('hidden');
  document.getElementById('main-vertical-resizer')?.classList.remove('hidden');

  const canvasContainer = document.querySelector('.canvas-container');
  if (canvasContainer) {
    const savedH = parseInt(localStorage.getItem('tv_canvas_height'), 10);
    if (savedH && window.innerWidth > 768 && savedH >= 220 && savedH <= 900) {
      canvasContainer.style.flex = 'none';
      canvasContainer.style.height = `${savedH}px`;
    }
  }
}

export function switchView(targetViewId) {
  if (targetViewId !== 'view-chart') {
    document.querySelectorAll('.sidebar-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-target') === targetViewId);
    });
  }
  document.querySelectorAll('.sidebar-view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('active');
  });
  const target = document.getElementById(targetViewId);
  if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
}
