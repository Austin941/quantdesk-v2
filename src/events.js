// ============================================================
// events.js — Event Registration Facade
// 職責：統一管理事件註冊，邏輯已拆分至 ui/*-events.js
// ============================================================
import { initNavEvents } from './ui/nav-events.js';
import { initPeriodEvents } from './ui/period-events.js';
import { initSortEvents, updateSortUI, updateThemeSortUI, updateGroupSortUI, updateRadarSortUI } from './ui/sort-events.js';
import { initToolbarEvents } from './ui/toolbar-events.js';

export { updateSortUI, updateThemeSortUI, updateGroupSortUI, updateRadarSortUI };

export function initEvents(historicalPromise) {
  initNavEvents(historicalPromise);
  initPeriodEvents(historicalPromise);
  initSortEvents();
  initToolbarEvents();
}
