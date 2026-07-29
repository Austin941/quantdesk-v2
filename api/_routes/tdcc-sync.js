// api/cron/tdcc-sync.js — Vercel Cron 定時任務，每週五晚上下載並儲存 TDCC 資料
import { getKv, setKv } from '../_lib/db.js';

export default async function handler(req, res) {
  // 保護機制：確保有 KV 或 Redis 設定
  if (!process.env.KV_REST_API_URL && !process.env.KV_REST_API_TOKEN && !process.env.REDIS_URL && !process.env.KV_URL) {
    return res.status(500).json({ error: 'Missing Redis/KV credentials' });
  }

  // 驗證 Vercel Cron 的授權標頭 (本地端繞過)
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    console.log('[Cron] Fetching TDCC OpenData...');
    const tdccRes = await fetch('https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(9000)
    });
    
    if (!tdccRes.ok) throw new Error(`TDCC fetch failed: ${tdccRes.status}`);
    const csv = await tdccRes.text();
    
    const lines = csv.split('\n');
    let dateStr = null;
    const updates = {}; // { '2330': 84.7, '2317': 50.1, ... }
    
    console.log('[Cron] Parsing CSV...');
    for (const l of lines) {
      if (!l.trim()) continue;
      const cols = l.split(',');
      if (cols.length < 6) continue;
      
      const rDate = cols[0]; // YYYYMMDD
      const sym = cols[1].trim();
      const level = parseInt(cols[2], 10);
      const pct = parseFloat(cols[5]);
      
      if (!dateStr) {
        dateStr = `${rDate.slice(0,4)}-${rDate.slice(4,6)}-${rDate.slice(6,8)}`;
      }
      
      if (level === 15) {
        updates[sym] = pct;
      }
    }
    
    if (!dateStr) throw new Error('No valid date found in TDCC CSV');
    
    console.log(`[Cron] Saving TDCC data for date ${dateStr}, stocks count: ${Object.keys(updates).length}`);
    
    // 將當週所有股票的千張大戶比例存為一個 JSON blob，以日期為 key
    // Key: tdcc_snap:2026-07-24
    await setKv(`tdcc_snap:${dateStr}`, updates);
    
    // 更新目錄清單 (記錄有哪些歷史日期)
    let datesList = await getKv('tdcc_dates_list') || [];
    if (!datesList.includes(dateStr)) {
      datesList.push(dateStr);
      datesList = datesList.sort(); // 保持日期排序
      await setKv('tdcc_dates_list', datesList);
    }
    
    console.log('[Cron] Successfully updated TDCC history DB');
    return res.status(200).json({ success: true, date: dateStr, count: Object.keys(updates).length });
    
  } catch (err) {
    console.error('[Cron Error]', err);
    return res.status(500).json({ error: err.message });
  }
}
