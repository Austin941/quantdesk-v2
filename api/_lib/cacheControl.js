// ============================================================
// api/_lib/cacheControl.js — 智慧時間型 CDN 快取控制 v2
//
// 核心策略：
//   - 用 Vercel CDN Edge 快取 (s-maxage) 而非 serverless memory
//   - 快取越長 → CDN 命中越多 → Fast Origin Transfer 越少
//   - 開盤前快取到開盤、收盤後快取到隔日、週末快取到週一
//   - stale-while-revalidate 讓過期快取平滑續期，不讓 origin 被砸
// ============================================================

const TAIPEI_OFFSET_MS = 8 * 3_600_000; // UTC+8

/** 取得台北時間的 Date 物件 */
function getTaipeiDate() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + TAIPEI_OFFSET_MS);
}

/** 是否為週末 */
export function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 是否為盤中時間 (9:00~13:30 台北時間, 週一至週五) */
export function isTradingHour() {
  const t   = getTaipeiDate();
  const day = t.getDay();
  if (day === 0 || day === 6) return false;
  const h = t.getHours(), m = t.getMinutes();
  return (h === 9 && m >= 0) || (h >= 10 && h <= 12) || (h === 13 && m <= 30);
}

/**
 * 計算距離下一個指定台北時間 (targetHour:targetMinute) 的秒數
 * 自動跳過週末，最小不低於 minCacheSeconds
 */
export function getSecondsUntilTaipeiTime(targetHour, targetMinute, minCacheSeconds = 300) {
  const taipeiNow = getTaipeiDate();

  const target = new Date(taipeiNow.getTime());
  target.setHours(targetHour, targetMinute, 0, 0);

  // 若今日已過目標時刻，移到明日
  if (taipeiNow >= target) {
    target.setDate(target.getDate() + 1);
  }

  // 跳過週末
  while (isWeekend(target)) {
    target.setDate(target.getDate() + 1);
  }

  const diff = Math.floor((target.getTime() - taipeiNow.getTime()) / 1_000);
  return Math.max(diff, minCacheSeconds);
}

/**
 * 核心函式：生成最佳 Cache-Control 標頭
 *
 * @param {number} targetHour      - 資料下次更新的台北時 (整點)
 * @param {number} targetMinute    - 資料下次更新的台北分
 * @param {number} minCacheSeconds - 最小快取秒數 (防止頻繁打 origin)
 * @returns {string}  Cache-Control header value
 *
 * 策略說明：
 *   s-maxage    → CDN 快取時長，CDN 有效期內所有請求 FOT = 0
 *   swr (stale-while-revalidate) → CDN 過期後仍繼續用舊快取服務，
 *                 背景非同步向 origin 更新，不讓用戶感覺到延遲
 */
export function buildTimeBasedCacheHeader(targetHour, targetMinute, minCacheSeconds = 300) {
  const sMaxAge = getSecondsUntilTaipeiTime(targetHour, targetMinute, minCacheSeconds);
  // swr = s-maxage 的 1.5 倍（讓 CDN 在背景平滑更新期間也不打穿 origin）
  // 最長設 7200s (2小時) 避免太舊的資料持續被服務
  const swr = Math.min(Math.floor(sMaxAge * 1.5), 7_200);
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
}

/**
 * 給【即時盤中】資料用的快取標頭（固定秒數版）
 *   trading: 盤中快取短、盤後快取長
 */
export function buildLiveHeader(tradingTtl = 15, closedTtl = 3_600) {
  const ttl = isTradingHour() ? tradingTtl : closedTtl;
  const swr = Math.min(ttl * 4, 7_200);
  return `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`;
}

/**
 * 給【歷史/日線/K線】資料用的快取標頭
 *   日線資料當天收盤後就不再變化，可快取到隔天 8:30
 */
export function buildDailyHeader() {
  return buildTimeBasedCacheHeader(8, 30, 1_800); // 至少快取 30 分鐘
}
