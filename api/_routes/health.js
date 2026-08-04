import { getKv } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Disable caching for health check
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const taipeiTime = new Date(utcMs + 8 * 3600000);
  const hour = taipeiTime.getHours();
  const minute = taipeiTime.getMinutes();
  const day = taipeiTime.getDay();

  let marketStatus = 'closed';
  const isWeekend = day === 0 || day === 6;
  const isBeforeOpen = hour < 9;
  const isAfterClose = hour > 13 || (hour === 13 && minute >= 35);
  const isPreMarket = hour === 8 && minute >= 30;

  if (isWeekend) {
    marketStatus = 'closed';
  } else if (isPreMarket) {
    marketStatus = 'pre-market';
  } else if (!isBeforeOpen && !isAfterClose) {
    marketStatus = 'open';
  } else {
    marketStatus = 'closed';
  }

  // Check FinMind
  let finmind = 'unreachable';
  try {
    const fmRes = await fetch('https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=2330&start_date=2023-01-01', {
      signal: AbortSignal.timeout(3000)
    });
    if (fmRes.ok) finmind = 'reachable';
  } catch (err) {}

  // Check KV
  let kv = 'missing';
  if (
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    process.env.REDIS_URL ||
    process.env.KV_URL
  ) {
    kv = 'connected';
    try {
      await getKv('__health_check__');
    } catch(err) {
      kv = 'error';
    }
  }

  res.status(200).json({
    status: 'ok',
    time: taipeiTime.toISOString(),
    market: marketStatus,
    finmind,
    kv
  });
}
