// ============================================================
// data/price.js — 統一價格解析工具函數
// 修復 P0-4：TWSE API 欄位可能含底線分隔多值 (委賣/委買) 或逗號分隔千位符
// ============================================================

/**
 * Parse a TWSE price string safely.
 * Handles:
 *   - Multi-value fields: "2395.0000_2400.0000_..." → takes first value
 *   - Comma-separated thousands: "12,345.00" → 12345
 *   - Dash placeholder: "-" → NaN
 * @param {string|number} raw
 * @returns {number} parsed price, or NaN if invalid
 */
export function parsePrice(raw) {
  if (raw === null || raw === undefined || raw === '-' || raw === '') return NaN;
  const first = String(raw).split('_')[0]; // Take first of multi-value fields
  return parseFloat(first.replace(/,/g, ''));
}

/**
 * Parse volume string (handles commas and integer rounding)
 * @param {string|number} raw
 * @returns {number}
 */
export function parseVolume(raw) {
  if (!raw || raw === '-') return 0;
  return parseInt(String(raw).replace(/,/g, ''), 10) || 0;
}

/**
 * Calculate daily return % from price and prevClose
 * @param {number} price
 * @param {number} prevClose
 * @returns {number}
 */
export function calcDailyReturn(price, prevClose) {
  if (!prevClose || prevClose <= 0 || !price || price <= 0) return 0;
  return ((price - prevClose) / prevClose) * 100;
}

/**
 * Compute the next closing data expiry timestamp
 * 對齊 TWSE OpenAPI 實際公佈收盤數據的時間：台北時間 14:30
 * @returns {number} Unix ms timestamp
 */
export function getNextClosingExpiry() {
  const now = Date.now();
  const taipeiNow = new Date(now + 8 * 3_600_000);

  // 台北時間 14:30 = UTC 06:30 — TWSE 真實收盤數據公布時間
  const todayRealClosing = Date.UTC(
    taipeiNow.getUTCFullYear(),
    taipeiNow.getUTCMonth(),
    taipeiNow.getUTCDate(),
    6, 30, 0, 0  // 14:30 Taipei = 06:30 UTC
  );

  if (now < todayRealClosing) {
    // 盤前/盤中（14:30 前）：closing API 傳的是昨天的收盤數據
    // 快取只保留 20 分鐘，避免錯誤 prevClose 鎖死整個上午造成漲幅錯誤
    return now + 20 * 60 * 1000;
  }

  // 14:30 後：今日真實收盤已出，快取到明天 14:30
  return todayRealClosing + 86_400_000;
}
