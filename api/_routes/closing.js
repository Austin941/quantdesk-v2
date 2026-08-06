// api/closing.js — 收盤價 (智慧時間型快取控制版)
// 台北時間 13:31 後收盤價公布，動態計算至下一個 13:31 的 s-maxage
import { withCache, TTL } from '../_lib/cache.js';
import { buildTimeBasedCacheHeader } from '../_lib/cacheControl.js';
import { retryFetch } from '../_lib/retryFetch.js';

const TSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const OTC_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const IDX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX';
const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function safeFetch(url) {
  try {
    const res = await retryFetch(url, { headers: { 'User-Agent': UA }, timeout: 8000 }, 2);
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 盤中 (14:30 前)：快取 10 分鐘，避免 Vercel Edge CDN 把舊收盤資料鎖死整個上午
  // 盤後 (14:30 後)：快取到明天 14:30
  const now = Date.now();
  const taipeiNow = new Date(now + 8 * 3_600_000);
  const todayClosingUTC = Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate(), 6, 30, 0);
  const isAfterClosing = now >= todayClosingUTC;
  const cacheSeconds = isAfterClosing
    ? Math.floor((todayClosingUTC + 86_400_000 - now) / 1000)
    : 600; // 盤中最多快取 10 分鐘
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`);

  try {
    // \u5feb\u53d6 key \u542b\u65e5\u671f\uff0c\u78ba\u4fdd\u6bcf\u5929\u7b2c\u4e00\u6b21\u8acb\u6c42\u4e00\u5b9a\u91cd\u65b0\u62b4\u53d6\uff0c\u4e0d\u6703\u8de8\u65e5\u6c99\u7528\u820a\u7d50\u679c
    const dateStr = `${taipeiNow.getUTCFullYear()}-${String(taipeiNow.getUTCMonth()+1).padStart(2,'0')}-${String(taipeiNow.getUTCDate()).padStart(2,'0')}`;
    const data = await withCache(`closing:${dateStr}`, async () => {
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
        // 嚴格驗證 chg：TWSE 若漲跌為 '-' 或空，parseFloat 會得 NaN，此時 prevClose = close 是合理的 fallback
        const prevClose = isFinite(chg) ? (close - chg) : close;
        cache[code] = { price: close, prevClose: prevClose > 0 ? prevClose : close, volume: vol };
      });

      otcData.forEach(item => {
        const code  = item.SecuritiesCompanyCode?.trim();
        const close = parseFloat(String(item.Close  || '').replace(/,/g, ''));
        const chg   = parseFloat(String(item.Change || '').replace(/,/g, ''));
        const vol   = Math.round((parseInt(String(item.TradingShares || '0').replace(/,/g, '')) || 0) / 1000);
        if (!code || !isFinite(close) || close <= 0) return;
        // 同上：OTC Change 可能為空或非數字，嚴格驗證後才計算
        const prevClose = isFinite(chg) ? (close - chg) : close;
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
