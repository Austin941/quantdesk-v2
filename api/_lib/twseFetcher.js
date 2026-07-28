// ============================================================
// _lib/twseFetcher.js — 統一 TWSE T86 抓取器
// ============================================================
import { withCache, TTL } from './cache.js';

const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86?response=json';

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
  }, TTL.T86);
}

export function parseT86Int(str) {
  return parseInt((str || '0').replace(/,/g, ''), 10) || 0;
}
