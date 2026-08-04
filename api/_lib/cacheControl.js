// ============================================================
// api/_lib/cacheControl.js — 智慧時間與休市開市快取控制
// 根據台北時間 (Asia/Taipei, UTC+8)、週末假日與休市狀態動態調整快取時間
// ============================================================

export function isWeekend(taipeiDate) {
  const day = taipeiDate.getDay();
  return day === 0 || day === 6;
}

export function getSecondsUntilTaipeiTime(targetHour, targetMinute, minCacheSeconds = 300) {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taipeiMs = utcMs + (8 * 3600000);
  const taipeiDate = new Date(taipeiMs);

  const targetDate = new Date(taipeiMs);
  targetDate.setHours(targetHour, targetMinute, 0, 0);

  if (taipeiDate >= targetDate) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  while (isWeekend(targetDate)) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const diffSeconds = Math.floor((targetDate.getTime() - taipeiDate.getTime()) / 1000);
  return Math.max(diffSeconds, minCacheSeconds);
}

export function buildTimeBasedCacheHeader(targetHour, targetMinute, minCacheSeconds = 300) {
  const sMaxAge = getSecondsUntilTaipeiTime(targetHour, targetMinute, minCacheSeconds);
  const swr = Math.min(sMaxAge, 3600);
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
}

/**
 * 計算快取秒數直到下個週六 08:00 台北時間
 * 適用於每週五更新一次的資料（如 TDCC 千張大戶）
 * @param {number} minCacheSeconds 最短快取秒數（預設 3600）
 */
export function buildWeeklyCacheHeader(minCacheSeconds = 3600) {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taipeiMs = utcMs + (8 * 3600000);
  const taipeiDate = new Date(taipeiMs);

  // 找下一個週六 08:00 台北時間
  const target = new Date(taipeiMs);
  target.setHours(8, 0, 0, 0);

  // 往前推到週六
  const daysUntilSat = (6 - target.getDay() + 7) % 7 || 7; // 0 代表今天就是週六，強制 +7
  target.setDate(target.getDate() + daysUntilSat);

  const diffSeconds = Math.floor((target.getTime() - taipeiDate.getTime()) / 1000);
  const sMaxAge = Math.max(diffSeconds, minCacheSeconds);
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=3600`;
}
