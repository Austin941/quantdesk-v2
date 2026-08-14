// api/_lib/db.js — Serverless 友善之 Vercel KV / Upstash Redis HTTP 資料庫模組
import { Redis as UpstashRedis } from '@upstash/redis';

let upstashClient = null;

function getUpstashClient() {
  if (upstashClient) return upstashClient;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      upstashClient = new UpstashRedis({ url, token });
      return upstashClient;
    } catch (e) {
      console.warn('[Upstash Redis Init Failed]', e.message);
    }
  }
  return null;
}

export async function getKv(key) {
  // 1. 優先使用 @upstash/redis (HTTP-based Serverless 專用)
  const client = getUpstashClient();
  if (client) {
    try {
      const data = await client.get(key);
      if (data) {
        if (typeof data === 'string') {
          try { return JSON.parse(data); } catch { return data; }
        }
        return data;
      }
      return null;
    } catch (err) {
      console.error('[KV GET Error via Upstash SDK]', err.message);
    }
  }

  // 2. 退回使用原生 fetch REST API (防依賴異常)
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== undefined && data.result !== null) {
      try {
        return JSON.parse(data.result);
      } catch {
        return data.result;
      }
    }
    return null;
  } catch (err) {
    console.error('[KV GET Error via REST fallback]', err.message);
    return null;
  }
}

export async function setKv(key, value, ttlSeconds = 0) {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

  // 1. 優先使用 @upstash/redis
  const client = getUpstashClient();
  if (client) {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await client.setex(key, ttlSeconds, valueStr);
      } else {
        await client.set(key, valueStr);
      }
      return true;
    } catch (err) {
      console.error('[KV SET Error via Upstash SDK]', err.message);
    }
  }

  // 2. 退回使用原生 fetch REST API
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const endpoint = (ttlSeconds && ttlSeconds > 0)
      ? `${url}/setex/${encodeURIComponent(key)}/${ttlSeconds}`
      : `${url}/set/${encodeURIComponent(key)}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: valueStr,
      signal: AbortSignal.timeout(4000)
    });
    return res.ok;
  } catch (err) {
    console.error('[KV SET Error via REST fallback]', err.message);
    return false;
  }
}
