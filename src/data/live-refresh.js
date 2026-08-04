// ============================================================
// data/live-refresh.js — 即時刷新管理器
// 修復 P0-2：
//   1. 原 events.js 中的 setInterval 呼叫不存在的 fetchMarketData
//   2. setInterval ID 未儲存，無法清除（記憶體/timer 洩漏）
//   3. 此模塊提供可控的 start/stop API
// ============================================================
import { state } from '../state.js';

let _eventSource = null;
let _onRefresh = null; // callback: (data: any) => void

/**
 * 啟動即時刷新 (SSE)
 * @param {function} onRefresh - 刷新時呼叫的回調函數
 * @param {string} symsParam - URI encoded symbols string
 */
export function startLiveRefresh(onRefresh, symsParam) {
  if (_eventSource !== null) stopLiveRefresh(); // 防止重複啟動

  _onRefresh = onRefresh;

  _eventSource = new EventSource(`/api/sse?syms=${symsParam || ''}`);

  _eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (_onRefresh) _onRefresh(data);
    } catch (err) {
      console.error('[SSE] Failed to parse message', err);
    }
  };

  _eventSource.onerror = (err) => {
    console.error('[SSE] Connection error. Will attempt to reconnect automatically.');
  };

  console.log('[LiveRefresh] Started SSE connection.');
}

/**
 * 停止即時刷新
 */
export function stopLiveRefresh() {
  if (_eventSource !== null) {
    _eventSource.close();
    console.log('[LiveRefresh] Stopped SSE connection.');
    _eventSource = null;
    _onRefresh = null;
  }
}


/**
 * 是否正在刷新中
 * @returns {boolean}
 */
export function isLiveRefreshActive() {
  return _eventSource !== null;
}
