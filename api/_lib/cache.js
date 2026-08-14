// ============================================================
// _lib/cache.js — Persistent & In-Memory LRU Cache with Stale Fallback
// 共享快取與持續備份機制：雙層快取（L1 記憶體 + L2 Upstash KV），冷啟動防擊穿
// ============================================================
import { getKv, setKv } from './db.js';

class LRUCache {
  constructor(maxSize = 200) {
    this._map   = new Map();
    this._max   = maxSize;
  }

  get(key) {
    if (!this._map.has(key)) return null;
    const entry = this._map.get(key);
    if (Date.now() > entry.expiresAt) {
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

  // has() must NOT call get() — that would promote the entry in LRU order
  has(key) { 
    if (!this._map.has(key)) return false;
    const entry = this._map.get(key);
    return Date.now() <= entry.expiresAt;
  }
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
const _lastValidDataMap = new Map();

export async function withCache(key, fetcher, ttlMs, staleOk = true) {
  // 1. L1 記憶體快取（最快，0ms）
  const cached = cache.get(key);
  if (cached !== null) return cached;

  if (_inflight.has(key)) {
    return _inflight.get(key);
  }

  const runner = async () => {
    // 2. L2 KV 持久化快取（防 Serverless Cold Start 擊穿外部 API）
    if (ttlMs >= 60_000) {
      try {
        const kvData = await getKv(`c:${key}`);
        if (kvData && ((Array.isArray(kvData) && kvData.length > 0) || (typeof kvData === 'object' && Object.keys(kvData).length > 0))) {
          cache.set(key, kvData, ttlMs);
          _lastValidDataMap.set(key, kvData);
          return kvData;
        }
      } catch (_) { /* 靜默降級 */ }
    }

    try {
      const data = await fetcher();
      const isValid = data && (
        (Array.isArray(data) && data.length > 0) ||
        (typeof data === 'object' && Object.keys(data).length > 0)
      );

      if (isValid) {
        cache.set(key, data, ttlMs);
        _lastValidDataMap.set(key, data);
        if (ttlMs >= 60_000) {
          setKv(`c:${key}`, data, Math.floor(ttlMs / 1000)).catch(() => {});
        }
        return data;
      }

      if (staleOk && _lastValidDataMap.has(key)) {
        console.warn(`[Cache] Empty data returned for ${key}, falling back to last valid cached data.`);
        return _lastValidDataMap.get(key);
      }

      cache.set(key, data, ttlMs);
      return data;
    } catch (err) {
      if (staleOk && _lastValidDataMap.has(key)) {
        console.warn(`[Cache] Fetch error for ${key}: ${err.message}. Falling back to last valid cached data.`);
        return _lastValidDataMap.get(key);
      }
      throw err;
    } finally {
      _inflight.delete(key);
    }
  };

  const promise = runner();
  _inflight.set(key, promise);
  return promise;
}
