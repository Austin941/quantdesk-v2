// ============================================================
// api.js — HTTP 資料層（精簡版）
// 職責：僅做 HTTP 請求和本地快取，不含 Toast 或 UI 邏輯
// 修復 P0-3：使用 getNextClosingExpiry() 修正 UTC 時間計算
// 修復 P0-4：使用統一 parsePrice() 工具函數
// ============================================================
import { parsePrice, parseVolume, getNextClosingExpiry } from './data/price.js';

// ---- LocalStorage Cache Helpers ----
const CACHE_KEY_VERSION = 'v6'; // ← 更改版本號可強制使所有客戶端快取失效

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

// Helper to split array into chunks
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export async function fetchSnapshot(allStocks = []) {
  try {
    // 1. Fetch closing data once
    if (!closingCache) {
      const CACHE_KEY = `quantdesk_closing_cache_${CACHE_KEY_VERSION}`;
      // 清除所有舊版快取 (v1 ~ v5)
      for (let v = 1; v <= 5; v++) {
        try { localStorage.removeItem(`quantdesk_closing_cache_v${v}`); } catch (_) {}
      }
      closingCache = getLocalCache(CACHE_KEY);

      if (!closingCache) {
        console.log('[Snapshot] Fetching EOD closing data...');
        // \u52a0\u4e0a 20 \u5206\u9418\u7cbe\u5ea6\u7684\u6642\u9593\u6233\uff0c\u7e5e\u904e Vercel Edge CDN \u53ef\u80fd\u6b8b\u7559\u7684\u820a\u5feb\u53d6
        const cacheBust = Math.floor(Date.now() / (20 * 60 * 1000));
        const closingRes = await fetch(`/api/closing?_t=${cacheBust}`);
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

    // 3. Split into chunks of 100
    const chunks = chunkArray(misSymbols, 100);
    const finalCache = {};
    const aggregatedMsgArray = [];

    // 4. Fetch all chunks with concurrency limit to Vercel proxy
    const maxConcurrency = 10;
    let index = 0;
    const fetchPromises = [];
    const activePromises = new Set();

    const fetchChunk = async (chunk) => {
      const queryStr = encodeURIComponent(chunk.join('|'));
      const res = await fetch(`/api/proxy?symbols=${queryStr}`);
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      const data = await res.json();
      if (data && data.msgArray) {
        aggregatedMsgArray.push(...data.msgArray);
      }
    };

    while (index < chunks.length) {
      if (activePromises.size >= maxConcurrency) {
        await Promise.race(activePromises);
      }
      const p = fetchChunk(chunks[index++]).catch(err => console.warn('[Snapshot] Chunk failed:', err));
      fetchPromises.push(p);
      activePromises.add(p);
      p.finally(() => activePromises.delete(p));
    }

    await Promise.all(fetchPromises);

    const parsedData = await parseSnapshotData({ msgArray: aggregatedMsgArray }, closingCache, allStocks);
    _failCount = 0;
    return { data: parsedData, isMarketOpen: true };

  } catch (error) {
    _failCount++;
    console.error('[Snapshot] Failed:', error);
    if (_failCount === 1) {
      _toast('無法取得最新資料，將顯示歷史模式。');
    }
    return { data: closingCache || {}, isMarketOpen: false };
  }
}

export function getSymsParam(allStocks) {
  const misSymbols = allStocks.map(stock => {
    const code = stock['股票代號'];
    return (stock['市場別'] || '').includes('上市') ? `tse_${code}.tw` : `otc_${code}.tw`;
  });
  return encodeURIComponent(misSymbols.join('|'));
}

export async function parseSnapshotData(data, localClosingCache, allStocks) {
  const finalCache = {};

  if (data && data.msgArray) {
    data.msgArray.forEach(item => {
      const code = item.c;
      if (!code || code === 't00') return;

      // 優先使用 MIS API 提供的昨日收盤價 (item.y)
      let prevClose = parsePrice(item.y);
      if (isNaN(prevClose) || prevClose <= 0) {
        // 若 MIS 無資料，則使用盤後資料的最新收盤價作為今日的參考價
        prevClose = localClosingCache[code]?.price || 0;
      }
      // Price fallback chain (修復 P0-4：統一 parsePrice 處理多值欄位)
      let price = parsePrice(item.z);
      if (isNaN(price) || price <= 0) price = parsePrice(item.pz);
      if (isNaN(price) || price <= 0) price = parsePrice(item.a); // best ask (first of multi-value)
      if (isNaN(price) || price <= 0) price = parsePrice(item.b); // best bid
      if (isNaN(price) || price <= 0) price = parsePrice(item.o); // open
      if (isNaN(price) || price <= 0) price = prevClose;          // yesterday's close

      const volume = parseVolume(item.v);
      const priceIsFallback = (price === prevClose); // price fell all the way back to prevClose = z was '-'
      // 如果 price 跟 prevClose 相同，代表 MIS 沒有任何即時成交資訊 (z='-')。
      // 此時不納入 finalCache，就能讓下面 Step 5 的 closing fallback 正確接手。
      if (prevClose > 0 && price > 0 && !priceIsFallback) {
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
    if (!finalCache[code] && localClosingCache[code]) {
      finalCache[code] = {
        price:     localClosingCache[code].price,
        prevClose: localClosingCache[code].prevClose,
        volume:    localClosingCache[code].volume || 0,
      };
    }
  });

  // Fallback TAIEX from closing
  if (!finalCache['t00'] && localClosingCache['t00']) {
    finalCache['t00'] = {
      price:     localClosingCache['t00'].price,
      prevClose: localClosingCache['t00'].prevClose,
      volume:    0,
    };
  }
  
  return finalCache;
}

// Alias for backward compatibility
export const fetchMarketData = fetchSnapshot;
export function getClosingCache() { return closingCache; }

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
