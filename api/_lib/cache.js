// ============================================================
// _lib/cache.js — Persistent & In-Memory LRU Cache with Stale Fallback
// 共享快取與持續備份機制：當抓不到新資料/休市時，自動回傳上一筆有效數值！
// ============================================================

class LRUCache {
  constructor(maxSize = 200) {
    this._map   = new Map();
    this._max   = maxSize;
  }

  get(key) {
    if (!this._map.has(key)) return null;
    const entry = this._map.get(key);
    if (Date.now() > entry.expiresAt) {
      // 保持過期資料以防抓不到新資料時降級使用
      return null;
    }
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this._map.has(key)) this._map.delete(key);
    else if (this._map.size >= this._max) {
      this._map.delete(this._map.keys().next().value);
    }
    this._map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key) { return this.get(key) !== null; }
  size()   { return this._map.size; }
}

export const cache = new LRUCache(200);

export const TTL = {
  MARKET_LIVE:   10_000,    // 10s
  CLOSING:       3_600_000, // 1hr
  CHIP:          300_000,   // 5min
  MARGIN:        300_000,   // 5min
  T86:           600_000,   // 10min
  KLINE:         300_000,   // 5min
};

const _inflight = new Map();
const _lastValidDataMap = new Map(); // 全局保存最新一次成功抓取到的有效資料

export async function withCache(key, fetcher, ttlMs, staleOk = true) {
  const cached = cache.get(key);
  if (cached !== null) return cached;

  if (_inflight.has(key)) {
    return _inflight.get(key);
  }

  const promise = fetcher()
    .then(data => {
      // 驗證抓到的資料是否有效（非空物件或無效陣列）
      const isValid = data && (
        (Array.isArray(data) && data.length > 0) ||
        (typeof data === 'object' && Object.keys(data).length > 0)
      );

      if (isValid) {
        cache.set(key, data, ttlMs);
        _lastValidDataMap.set(key, data); // 備份最新的有效資料
        _inflight.delete(key);
        return data;
      }

      // 如果抓不到新資料（如休市或回傳空資料），嘗試降級顯示備份資料
      if (staleOk && _lastValidDataMap.has(key)) {
        console.warn(`[Cache] Empty data returned for ${key}, falling back to last valid cached data.`);
        _inflight.delete(key);
        return _lastValidDataMap.get(key);
      }

      cache.set(key, data, ttlMs);
      _inflight.delete(key);
      return data;
    })
    .catch(err => {
      _inflight.delete(key);
      // 當網路或 API 異常抓不到新資料時，強制回傳最新一次成功抓取的歷史數值
      if (staleOk && _lastValidDataMap.has(key)) {
        console.warn(`[Cache] Fetch error for ${key}: ${err.message}. Falling back to last valid cached data.`);
        return _lastValidDataMap.get(key);
      }
      throw err;
    });

  _inflight.set(key, promise);
  return promise;
}
