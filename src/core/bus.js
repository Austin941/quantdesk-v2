// ============================================================
// core/bus.js — Ultra-lightweight Event Bus
// 解除模塊間循環依賴的關鍵：任何模塊只需引用 bus，不需互相引用
// ============================================================

const _listeners = new Map();

export const bus = {
  /**
   * Subscribe to an event
   * @param {string} event
   * @param {Function} fn
   */
  on(event, fn) {
    if (!_listeners.has(event)) _listeners.set(event, []);
    _listeners.get(event).push(fn);
    return () => bus.off(event, fn); // Return unsubscribe fn
  },

  /**
   * Unsubscribe from an event
   * @param {string} event
   * @param {Function} fn
   */
  off(event, fn) {
    const arr = _listeners.get(event) || [];
    _listeners.set(event, arr.filter(f => f !== fn));
  },

  /**
   * Emit an event with payload
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    const fns = _listeners.get(event) || [];
    fns.forEach(fn => {
      try { fn(payload); }
      catch (err) { console.error(`[Bus] Error in listener for "${event}":`, err); }
    });
  },

  /**
   * Subscribe once, auto-remove after first fire
   * @param {string} event
   * @param {Function} fn
   */
  once(event, fn) {
    const wrapper = (payload) => {
      fn(payload);
      bus.off(event, wrapper);
    };
    bus.on(event, wrapper);
  }
};

// ---- Defined Event Names (for IDE autocomplete & documentation) ----
export const BUS_EVENTS = {
  DRILL_DOWN:       'drill-down',       // { id, mode } — 進入微觀視圖
  BACK_TO_MACRO:    'back-to-macro',    // { macroMode } — 返回宏觀視圖
  SHOW_TECH_CHART:  'show-tech-chart',  // { stockData } — 顯示個股技術分析
  DATA_REFRESHED:   'data-refreshed',   // null — 資料已刷新
  PERIOD_CHANGED:   'period-changed',   // { days } — 期間切換
  XAXIS_CHANGED:    'xaxis-changed',    // { mode } — X 軸模式切換
};
