// ============================================================
// data/live-refresh.js — 即時刷新管理器
// 修復 P0-2：
//   1. 原 events.js 中的 setInterval 呼叫不存在的 fetchMarketData
//   2. setInterval ID 未儲存，無法清除（記憶體/timer 洩漏）
//   3. 此模塊提供可控的 start/stop API
// ============================================================
import { state } from '../state.js';

let _timerId = null;
let _onRefresh = null; // callback: (isSilent: boolean) => void

/**
 * 啟動即時刷新（每 15 秒，僅交易時段）
 * @param {function} onRefresh - 刷新時呼叫的回調函數
 */
export function startLiveRefresh(onRefresh) {
  if (_timerId !== null) stopLiveRefresh(); // 防止重複啟動

  _onRefresh = onRefresh;

  _timerId = setInterval(() => {
    if (state.currentPeriodDays !== 1) return; // 非當日模式不刷新

    const now = new Date();
    // 轉換到台北時間 (UTC+8)
    const taipeiMs = now.getTime() + (now.getTimezoneOffset() * 60_000) + (8 * 3_600_000);
    const taipeiTime = new Date(taipeiMs);
    const day    = taipeiTime.getDay();
    const hour   = taipeiTime.getHours();
    const minute = taipeiTime.getMinutes();

    // TWSE 交易時段：週一至週五 09:00–13:35
    // 排除 08:30–09:00 盤前時段（TWSE MIS 會顯示昨日舊數據，不具参考價値）
    const isWeekend     = day === 0 || day === 6;
    const isBeforeOpen  = hour < 9;                                          // 00:00–08:59
    const isAfterClose  = hour > 13 || (hour === 13 && minute >= 35);        // 13:35+
    const isPreMarket   = hour === 8 && minute >= 30;                        // 08:30–08:59 盤前

    // 僅在真正交易時段內輪詢，盤前與盤後一律不打
    if (!isWeekend && !isBeforeOpen && !isAfterClose && !isPreMarket) {
      if (_onRefresh) _onRefresh(true); // isSilentRefresh = true
    }
  }, 15_000);

  console.log('[LiveRefresh] Started. Timer ID:', _timerId);
}

/**
 * 停止即時刷新
 */
export function stopLiveRefresh() {
  if (_timerId !== null) {
    clearInterval(_timerId);
    console.log('[LiveRefresh] Stopped. Timer ID:', _timerId);
    _timerId = null;
    _onRefresh = null;
  }
}

/**
 * 是否正在刷新中
 * @returns {boolean}
 */
export function isLiveRefreshActive() {
  return _timerId !== null;
}
