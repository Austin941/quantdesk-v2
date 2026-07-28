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
