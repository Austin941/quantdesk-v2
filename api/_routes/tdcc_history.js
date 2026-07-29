// api/tdcc_history.js — 從 Vercel KV 讀取「千張大戶持股比」的歷史累積資料
import { getKv } from '../_lib/db.js';
import { cleanTWSymbol } from '../_lib/finmindFetcher.js';
import { buildTimeBasedCacheHeader } from '../_lib/cacheControl.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 歷史資料更新頻率低，可快取較長時間
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(9, 0, 3600));

  const { symbol = '2330' } = req.query;
  const sym = cleanTWSymbol(symbol);

  try {
    if (!process.env.KV_REST_API_URL && !process.env.REDIS_URL && !process.env.KV_URL) {
      // 尚未設定 KV 的 fallback
      return res.status(200).json({
        success: false,
        symbol: sym,
        message: 'Vercel KV not configured yet.',
        history: []
      });
    }

    const datesList = await getKv('tdcc_dates_list') || [];
    
    // 如果資料庫是空的，回傳空陣列
    if (datesList.length === 0) {
      return res.status(200).json({
        success: true,
        symbol: sym,
        history: []
      });
    }

    const history = [];
    
    // 批次或並發抓取該股票在各日期的數值
    // 為了避免 Serverless 執行過久，建議設定合理的擷取上限（例如最近 50 週）
    const targetDates = datesList.slice(-50); 
    
    // 依序抓取（如果 KV 在同一個 region，延遲很低）
    for (const d of targetDates) {
      const snap = await getKv(`tdcc_snap:${d}`);
      if (snap && snap[sym] !== undefined) {
        history.push({
          date: d,
          ratio: snap[sym]
        });
      }
    }

    return res.status(200).json({
      success: true,
      symbol: sym,
      history
    });

  } catch (err) {
    console.error('[tdcc_history] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
