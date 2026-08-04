// api/closing.js — 收盤價 (智慧時間型快取控制版)
// 台北時間 13:31 後收盤價公布，動態計算至下一個 13:31 的 s-maxage
import { withCache, TTL } from '../_lib/cache.js';
import { buildTimeBasedCacheHeader } from '../_lib/cacheControl.js';

const TSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const OTC_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const IDX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX';
const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function safeFetch(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 動態快取：TWSE 收盤數據實際公布時間約 14:30，快取持續到次日 14:30
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(14, 30, 1800));

  try {
    const data = await withCache('closing:all', async () => {
      const [tseData, otcData, idxData] = await Promise.all([safeFetch(TSE_URL), safeFetch(OTC_URL), safeFetch(IDX_URL)]);
      const cache = {};

      if (idxData && Array.isArray(idxData)) {
        const taiex = idxData.find(item => item['指數'] === '發行量加權股價指數');
        if (taiex) {
          const close = parseFloat(String(taiex['收盤指數'] || '').replace(/,/g, ''));
          const chg = parseFloat(String(taiex['漲跌點數'] || '').replace(/,/g, ''));
          const sign = taiex['漲跌'] === '-' ? -1 : 1;
          if (isFinite(close) && close > 0) {
            const prevClose = close - (chg * sign);
            cache['t00'] = { price: close, prevClose: prevClose > 0 ? prevClose : close, volume: 0 };
          }
        }
      }

      tseData.forEach(item => {
        const code  = item.Code?.trim();
        const close = parseFloat(String(item.ClosingPrice || '').replace(/,/g, ''));
        const chg   = parseFloat(String(item.Change      || '').replace(/,/g, ''));
        const vol   = Math.round((parseInt(String(item.TradeVolume || '0').replace(/,/g, '')) || 0) / 1000);
        if (!code || !isFinite(close) || close <= 0) return;
        const prevClose = close - chg;
        cache[code] = { price: close, prevClose: prevClose > 0 ? prevClose : close, volume: vol };
      });

      otcData.forEach(item => {
        const code  = item.SecuritiesCompanyCode?.trim();
        const close = parseFloat(String(item.Close  || '').replace(/,/g, ''));
        const chg   = parseFloat(String(item.Change || '').replace(/,/g, ''));
        const vol   = Math.round((parseInt(String(item.TradingShares || '0').replace(/,/g, '')) || 0) / 1000);
        if (!code || !isFinite(close) || close <= 0) return;
        const prevClose = close - chg;
        cache[code] = { price: close, prevClose: prevClose > 0 ? prevClose : close, volume: vol };
      });

      if (Object.keys(cache).length === 0) throw new Error('Both TSE and OTC returned empty data');
      return cache;
    }, TTL.CLOSING);

    res.status(200).json({ data });
  } catch (err) {
    console.error('[closing] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch closing data', details: err.message });
  }
}
