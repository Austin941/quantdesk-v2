// ============================================================
// _lib/twseFetcher.js — 統一 TWSE T86 抓取器
// 解決問題：banks.js 和 branches.js 都打同一個 T86 端點
// 現在由此模組統一抓取並快取，兩者共享同一份結果
// ============================================================
import { withCache, TTL } from './cache.js';

const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86?response=json';

/**
 * 取得 TWSE T86 三大法人買賣超資料（全市場）
 * 多個 handler 呼叫此函數 → 10分鐘內共用同一份快取
 * @returns {Promise<{date: string, rows: Array}>}
 */
export async function fetchT86() {
  return withCache('twse:t86', async () => {
    const res = await fetch(T86_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`TWSE T86 HTTP ${res.status}`);
    const data = await res.json();

    return {
      date: data.date || new Date().toISOString().split('T')[0],
      rows: data.data || [],
    };
  }, TTL.T86); // 10 分鐘共用快取
}

/**
 * 安全解析 T86 數字欄位（含逗號格式）
 */
export function parseT86Int(str) {
  return parseInt((str || '0').replace(/,/g, ''), 10) || 0;
}
