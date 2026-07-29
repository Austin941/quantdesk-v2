// api/_lib/db.js — Vercel KV / Upstash Redis / Redis 資料庫連線模組
import Redis from 'ioredis';

let redisClient = null;

function getRedisClient() {
  if (redisClient) return redisClient;
  
  const redisUrl = process.env.KV_URL || process.env.REDIS_URL;
  if (redisUrl) {
    redisClient = new Redis(redisUrl);
    redisClient.on('error', (err) => console.error('[Redis Client Error]', err.message));
    return redisClient;
  }
  return null;
}

export async function getKv(key) {
  // 1. 優先嘗試 ioredis (當有 REDIS_URL 或 KV_URL)
  const client = getRedisClient();
  if (client) {
    try {
      const data = await client.get(key);
      if (data) {
        try { return JSON.parse(data); } catch { return data; }
      }
      return null;
    } catch (err) {
      console.error('[KV GET Error via ioredis]', err.message);
      return null;
    }
  }

  // 2. 退回使用 Vercel KV REST API
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.result) {
      try {
        return JSON.parse(data.result);
      } catch {
        return data.result;
      }
    }
    return null;
  } catch (err) {
    console.error('[KV GET Error via REST]', err.message);
    return null;
  }
}

export async function setKv(key, value) {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

  // 1. 優先嘗試 ioredis
  const client = getRedisClient();
  if (client) {
    try {
      await client.set(key, valueStr);
      return true;
    } catch (err) {
      console.error('[KV SET Error via ioredis]', err.message);
      return false;
    }
  }

  // 2. 退回使用 Vercel KV REST API
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: valueStr
    });
    return res.ok;
  } catch (err) {
    console.error('[KV SET Error via REST]', err.message);
    return false;
  }
}
