// ============================================================
// api.js — HTTP 資料層（精簡版）
// 職責：僅做 HTTP 請求和本地快取，不含 Toast 或 UI 邏輯
// 修復 P0-3：使用 getNextClosingExpiry() 修正 UTC 時間計算
// 修復 P0-4：使用統一 parsePrice() 工具函數
// ============================================================
import { parsePrice, parseVolume, getNextClosingExpiry } from './data/price.js';

// ---- LocalStorage Cache Helpers ----
function getLocalCache(key) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function setLocalCache(key, data, expiresAt) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt }));
  } catch { /* Ignore quota errors */ }
}

// ---- Module-level cache ----
let closingCache = null;
let _failCount = 0;

// ---- Toast (lazy import to avoid circular dep) ----
async function _toast(msg, type = 'error') {
  const { showToast } = await import('./ui/toast.js');
  showToast(msg, type);
}

// ---- fetchSnapshot ----
export async function fetchSnapshot(allStocks = []) {
  try {
    // 1. Fetch closing data once
    if (!closingCache) {
      const CACHE_KEY = 'quantdesk_closing_cache_v4';
      closingCache = getLocalCache(CACHE_KEY);

      if (!closingCache) {
        console.log('[Snapshot] Fetching EOD closing data...');
        const closingRes = await fetch('/api/closing');
        if (closingRes.ok) {
          const data = await closingRes.json();
          closingCache = data.data || {};
          setLocalCache(CACHE_KEY, closingCache, getNextClosingExpiry()); // ← 修復 P0-3
        } else {
          closingCache = {};
        }
      } else {
        console.log('[Snapshot] Loaded closing data from LocalStorage');
      }
    }

    if (!allStocks || allStocks.length === 0) {
      return { data: closingCache, isMarketOpen: true };
    }

    // 2. Build TWSE MIS symbols list
    const misSymbols = allStocks.map(stock => {
      const code = stock['股票代號'];
      return (stock['市場別'] || '').includes('上市') ? `tse_${code}.tw` : `otc_${code}.tw`;
    });

    // 3. Fetch all via /api/snapshot
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: misSymbols })
    });

    if (!res.ok) throw new Error(`Snapshot error: ${res.status}`);
    const data = await res.json();

    const finalCache = {};

    if (data && data.msgArray) {
      data.msgArray.forEach(item => {
        const code = item.c;
        if (!code || code === 't00') return;

        // Use closingCache for prevClose first (more reliable)
        let prevClose = closingCache[code]?.prevClose || parsePrice(item.y) || 0;
        if (prevClose <= 0) prevClose = parsePrice(item.y) || 0;

        // Price fallback chain (修復 P0-4：統一 parsePrice 處理多值欄位)
        let price = parsePrice(item.z);
        if (isNaN(price) || price <= 0) price = parsePrice(item.pz);
        if (isNaN(price) || price <= 0) price = parsePrice(item.a); // best ask (first of multi-value)
        if (isNaN(price) || price <= 0) price = parsePrice(item.b); // best bid
        if (isNaN(price) || price <= 0) price = parsePrice(item.o); // open
        if (isNaN(price) || price <= 0) price = prevClose;          // yesterday's close

        const volume = parseVolume(item.v);
        if (prevClose > 0 && price > 0) {
          finalCache[code] = { price, prevClose, volume };
        }
      });
    }

    // 4. Fetch TAIEX index
    try {
      const idxRes = await fetch('/api/proxy?symbols=tse_t00.tw');
      if (idxRes.ok) {
        const idxData = await idxRes.json();
        const item = idxData?.msgArray?.[0];
        if (item) {
          let price = parsePrice(item.z);
          if (isNaN(price) || price <= 0) price = parsePrice(item.y);
          const prevClose = parsePrice(item.y);
          if (price > 0 && prevClose > 0) {
            finalCache['t00'] = { price, prevClose, volume: 0 };
          }
        }
      }
    } catch (e) {
      console.warn('[Snapshot] Failed to fetch TAIEX:', e);
    }

    // 5. Fill missing stocks from closing data
    allStocks.forEach(stock => {
      const code = stock['股票代號'];
      if (!finalCache[code] && closingCache[code]) {
        finalCache[code] = {
          price:     closingCache[code].price,
          prevClose: closingCache[code].prevClose,
          volume:    closingCache[code].volume || 0,
        };
      }
    });

    // Fallback TAIEX from closing
    if (!finalCache['t00'] && closingCache['t00']) {
      finalCache['t00'] = {
        price:     closingCache['t00'].price,
        prevClose: closingCache['t00'].prevClose,
        volume:    0,
      };
    }

    _failCount = 0;
    return { data: finalCache, isMarketOpen: true };

  } catch (error) {
    _failCount++;
    console.error('[Snapshot] Failed:', error);
    if (_failCount === 1) {
      _toast('無法取得最新資料，將顯示歷史模式。');
    }
    return { data: closingCache || {}, isMarketOpen: false };
  }
}

// Alias for backward compatibility
export const fetchMarketData = fetchSnapshot;

// ---- fetchHistoricalRanking ----
export async function fetchHistoricalRanking() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const CACHE_KEY = `quantdesk_hist_ranking_${today}`;
    let data = getLocalCache(CACHE_KEY);

    if (data) {
      console.log(`[Historical] Loaded ${today} from LocalStorage`);
      return data;
    }

    const response = await fetch(`./historical_ranking.json?d=${today}`);
    if (!response.ok) throw new Error('Historical data not found');
    data = await response.json();

    // Cache until tomorrow 08:00 Taipei (00:00 UTC)
    const now = new Date();
    const target = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
      0, 0, 0 // 08:00 Taipei = 00:00 UTC
    ));
    setLocalCache(CACHE_KEY, data, target.getTime());

    return data;
  } catch (error) {
    console.warn('No historical data available:', error);
    return null;
  }
}
