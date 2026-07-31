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
 * Compute the next closing data expiry timestamp (台北時間 13:35)
 * @returns {number} Unix ms timestamp
 */
export function getNextClosingExpiry() {
  const now = Date.now();
  // Shift to UTC+8 by adding 8 hours
  const taipeiNow = new Date(now + 8 * 3_600_000);

  // Build today's 13:35 Taipei time as a UTC timestamp
  const todayClosing = Date.UTC(
    taipeiNow.getUTCFullYear(),
    taipeiNow.getUTCMonth(),
    taipeiNow.getUTCDate(),
    5, 35, 0, 0  // 13:35 Taipei = 05:35 UTC
  );

  // If already past today's closing, next expiry is tomorrow's closing
  return now < todayClosing ? todayClosing : todayClosing + 86_400_000;
}
