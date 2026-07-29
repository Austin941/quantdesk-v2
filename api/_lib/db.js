// api/_lib/db.js — Vercel KV 資料庫連線模組
// 負責與 Vercel KV (Redis) 進行互動，用來儲存 TDCC 的歷史資料
export async function getKv(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
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
    console.error('[KV GET Error]', err.message);
    return null;
  }
}

export async function setKv(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(value)
    });
    return res.ok;
  } catch (err) {
    console.error('[KV SET Error]', err.message);
    return false;
  }
}
