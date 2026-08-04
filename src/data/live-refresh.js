// ============================================================
// data/live-refresh.js — 即時刷新管理器
// ============================================================

let _intervalId = null;
let _onRefresh = null; // callback: (data: any) => void

/**
 * 啟動即時刷新 (Polling)
 * @param {function} onRefresh - 刷新時呼叫的回調函數
 */
export function startLiveRefresh(onRefresh) {
  if (_intervalId !== null) stopLiveRefresh(); // 防止重複啟動

  _onRefresh = onRefresh;

  _intervalId = setInterval(() => {
    if (_onRefresh) _onRefresh(true);
  }, 15000);

  console.log('[LiveRefresh] Started 15s polling.');
}

/**
 * 停止即時刷新
 */
export function stopLiveRefresh() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    console.log('[LiveRefresh] Stopped polling.');
    _intervalId = null;
    _onRefresh = null;
  }
}

/**
 * 是否正在刷新中
 * @returns {boolean}
 */
export function isLiveRefreshActive() {
  return _intervalId !== null;
}
