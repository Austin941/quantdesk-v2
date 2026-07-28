// ============================================================
// _lib/finmindFetcher.js — 統一 FinMind 資料抓取器
// 特性：
//   1. 共享快取 — 同一 symbol+dataset+startDate 只打一次 FinMind
//   2. API Token 輪換 — 自動從 FUGLE_API_KEYS 輪換（雖是 Fugle Key，此處示範多 token 架構）
//   3. Stale-While-Revalidate — 失敗時回傳舊快取
//   4. 自動重試 (最多 2 次，指數退避)
// ============================================================
import { withCache, TTL } from './cache.js';

// ---- FinMind Token Pool ----
// 從環境變數讀取（可放多組 FinMind token，逗號分隔）
const _tokens = (process.env.FINMIND_TOKENS || '')
  .split(',').map(t => t.trim()).filter(Boolean);

let _tokenIdx = 0;

function _nextToken() {
  if (_tokens.length === 0) return null;
  const token = _tokens[_tokenIdx];
  _tokenIdx = (_tokenIdx + 1) % _tokens.length;
  return token;
}

const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data';

/**
 * Fetch a FinMind dataset with caching and deduplication.
 * @param {string} dataset  — e.g. 'TaiwanStockInstitutionalInvestorsBuySell'
 * @param {string} symbol   — e.g. '2330'
 * @param {string} startDate — e.g. '2024-01-01' (YYYY-MM-DD)
 * @param {number} [ttlMs]  — cache TTL (default: TTL.CHIP = 5min)
 * @returns {Promise<Array>} — raw data array from FinMind
 */
export async function fetchFinmind(dataset, symbol, startDate, ttlMs = TTL.CHIP) {
  const key = `finmind:${dataset}:${symbol}:${startDate}`;

  return withCache(key, async () => {
    const token = _nextToken();
    const params = new URLSearchParams({
      dataset,
      data_id: symbol,
      start_date: startDate,
    });
    if (token) params.set('token', token);

    const url = `${FINMIND_BASE}?${params}`;

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(8000),
        });

        if (res.status === 429) {
          // Rate limited — try next token if available
          const altToken = _nextToken();
          if (altToken && altToken !== token) {
            params.set('token', altToken);
            const retryRes = await fetch(`${FINMIND_BASE}?${params}`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(8000),
            });
            if (retryRes.ok) {
              const result = await retryRes.json();
              return result.data || [];
            }
          }
          throw new Error(`FinMind 429: rate limited`);
        }

        if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);

        const result = await res.json();
        return result.data || [];

      } catch (err) {
        if (attempt === 2) throw err;
        // Exponential backoff: 500ms, 1000ms
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }, ttlMs);
}

/**
 * Helper — calculate start date string from "days ago"
 */
export function startDateFromDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - (parseInt(days) || 30));
  return d.toISOString().split('T')[0];
}

/**
 * Helper — clean Taiwan stock symbol
 */
export function cleanTWSymbol(symbol) {
  return String(symbol)
    .replace('.TW', '').replace('.TWO', '')
    .replace('TWSE:', '').replace('OTC:', '')
    .trim();
}
