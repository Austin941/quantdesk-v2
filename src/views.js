// ============================================================
// views.js — 向後相容 Re-export wrapper
// 原始職責已拆分至：
//   src/ui/layout.js   — 頁面切換
//   src/ui/meta-panel.js — 個股資訊面板
// 所有現有的 import { showBubbleChart } from './views.js' 無需修改
// ============================================================
export { showMacroView, showBubbleChart, switchView } from './ui/layout.js';
export { showTechChart }                              from './ui/meta-panel.js';

// renderTvWidget stays here (TradingView widget setup)
import { state } from './state.js';

export function renderTvWidget(symbol, interval) {
  const container = document.getElementById('tradingview-widget-container');
  container.innerHTML = '';
  if (window.TradingView) {
    state.activeTvWidget = new TradingView.widget({
      autosize: true, symbol, interval,
      timezone: 'Asia/Taipei', theme: 'dark', style: '1', locale: 'zh_TW',
      enable_publishing: false,
      backgroundColor: 'rgba(15, 23, 42, 1)',
      hide_top_toolbar: true, hide_legend: false, save_image: false,
      container_id: 'tradingview-widget-container',
    });
  }
}
