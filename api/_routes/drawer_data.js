import { fetchFinmind, startDateFromDays, cleanTWSymbol } from './_lib/finmindFetcher.js';
import { buildTimeBasedCacheHeader } from './_lib/cacheControl.js';
import { fetchT86, parseT86Int } from './_lib/twseFetcher.js';
import { withCache } from './_lib/cache.js';
import { getKv } from './_lib/db.js';
const DAY_TRADE_TTL = 3600 * 1000;
async function _fetchTWTB4U(dateStr) {
  return withCache(`twse:twtb4u:${dateStr}`, async () => {
    const r = await fetch(`https://www.twse.com.tw/exchangeReport/TWTB4U?response=json&date=${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    return r.json();
  }, DAY_TRADE_TTL);
}

// Re-use logic from kline.js internally
async function _fetchKline(symbol, range = '3mo', interval = '1d') {
  let cleanSymbol = symbol.toUpperCase().trim();
  if (!cleanSymbol.endsWith('.TW') && !cleanSymbol.endsWith('.TWO')) {
    cleanSymbol = `${cleanSymbol}.TW`;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  if (!r.ok && cleanSymbol.endsWith('.TW')) {
    const otcUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol.replace('.TW', '.TWO'))}?interval=${interval}&range=${range}`;
    const r2 = await fetch(otcUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    if (r2.ok) return r2.json();
  }
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 最保守策略：快取到台北時間 17:00（三大法人最早公布時間）
  // 盤中可能 5 分鐘更新一次 K 線，但籌碼/融資/大戶整合資料盤後才有意義
  // 使用 buildTimeBasedCacheHeader(17, 0) 可讓 Vercel Edge 快取整個工作日，大幅降低 Function 被喚醒次數
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(17, 0, 300));

  const { symbol = '2330', days = '120' } = req.query;

  try {
    const sym = cleanTWSymbol(symbol);
    const startDate = startDateFromDays(days);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // For today's daytrade

    // Fire all requests concurrently.
    const [
      klineRaw,
      chipData,
      marginData,
      shareholdingData,
      twtb4uRaw,
      dayTradeData,
      t86Raw,
      tdccRaw,
      tdccHistoryRaw
    ] = await Promise.all([
      _fetchKline(sym, '6mo', '1d').catch(() => null),
      fetchFinmind('TaiwanStockInstitutionalInvestorsBuySell', sym, startDate).catch(() => []),
      fetchFinmind('TaiwanStockMarginPurchaseShortSale',       sym, startDate).catch(() => []),
      fetchFinmind('TaiwanStockShareholding',                  sym, startDate).catch(() => []),
      _fetchTWTB4U(dateStr).catch(() => null),
      fetchFinmind('TaiwanStockDayTrading',                    sym, startDate).catch(() => []),
      // T86: 三大法人今日進出（全市場明細）
      (async () => {
        try { return await fetchT86(); } catch { return null; }
      })(),
      // TDCC: 千張以上大戶持股比（全市場每周五更新）
      (async () => {
        try {
          return withCache('tdcc:od:1-5', async () => {
            const r = await fetch('https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5', {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(15000),
            });
            if (!r.ok) return null;
            return r.text();
          }, 24 * 3600 * 1000);
        } catch { return null; }
      })(),
      // TDCC History: 從 Vercel KV 抓取累積的千張大戶歷史資料
      (async () => {
        try {
          if (!process.env.KV_REST_API_URL && !process.env.REDIS_URL && !process.env.KV_URL) return null;
          const datesList = await getKv('tdcc_dates_list');
          if (!datesList || !datesList.length) return null;
          const history = [];
          for (const d of datesList.slice(-30)) { // 取最近 30 週
            const snap = await getKv(`tdcc_snap:${d}`);
            if (snap && snap[sym] !== undefined) {
              history.push({ date: d, ratio: snap[sym] });
            }
          }
          return history;
        } catch { return null; }
      })()
    ]);

    // --- 1. Kline Processing ---
    const klineResult = [];
    if (klineRaw?.chart?.result?.[0]) {
      const result = klineRaw.chart.result[0];
      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.open[i] != null && quote.close[i] != null) {
          klineResult.push({
            date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
            o: parseFloat(quote.open[i].toFixed(2)),
            h: parseFloat(quote.high[i].toFixed(2)),
            l: parseFloat(quote.low[i].toFixed(2)),
            c: parseFloat(quote.close[i].toFixed(2)),
            v: quote.volume[i] || 0
          });
        }
      }
    }

    // --- 2. Chip Processing ---
    const chipMap = {};
    if (Array.isArray(chipData)) {
      chipData.forEach(({ date, name, buy, sell }) => {
        if (!chipMap[date]) chipMap[date] = { foreignNet: 0, trustNet: 0, dealerNet: 0, totalNet: 0 };
        const net = (buy || 0) - (sell || 0);
        if (name.includes('Foreign')) chipMap[date].foreignNet += net;
        else if (name.includes('Investment_Trust')) chipMap[date].trustNet += net;
        else if (name.includes('Dealer')) chipMap[date].dealerNet += net;
        chipMap[date].totalNet += net;
      });
    }

    // --- 3. Margin Processing ---
    const marginMap = {};
    if (Array.isArray(marginData)) {
      marginData.forEach(item => {
        const bal = item.MarginPurchaseTodayBalance || 0;
        const prev = item.MarginPurchaseYesterdayBalance || 0;
        const sBal = item.ShortSaleTodayBalance || 0;
        const sPrev = item.ShortSaleYesterdayBalance || 0;
        const ratio = bal > 0 ? parseFloat(((sBal / bal) * 100).toFixed(2)) : 0;
        marginMap[item.date] = {
          marginBalance: bal,
          marginChange: bal - prev,
          shortBalance: sBal,
          shortChange: sBal - sPrev,
          ratio
        };
      });
    }

    // --- 4. Holders Processing (ForeignInvestmentSharesRatio 外資持股比) / TDCC History ---
    const holdersMap = {};
    let usingTdccHistory = false;
    
    // 如果有成功累積 TDCC 歷史資料，優先使用千張大戶歷史
    if (tdccHistoryRaw && tdccHistoryRaw.length > 0) {
      usingTdccHistory = true;
      tdccHistoryRaw.forEach(item => {
        holdersMap[item.date] = { ratio: item.ratio, signalText: '' };
      });
    } else if (shareholdingData && shareholdingData.length > 0) {
      // 否則退回使用外資持股比 (免費 FinMind 資料)
      shareholdingData.forEach(item => {
        holdersMap[item.date] = { ratio: item.ForeignInvestmentSharesRatio, signalText: '' };
      });
    }

    // --- 5. TDCC 千張以上大戶持股比 (whale_pct) ---
    // TDCC 公開資料每周五更新，只有最新一期，回傳一個全期共用的數字
    let whalePct = null;
    let tdccDate = null;
    if (tdccRaw) {
      const lines = tdccRaw.split('\n');
      const rows = lines.filter(l => {
        const cols = l.split(',');
        return cols[1] && cols[1].trim() === sym;
      });
      const whaleRow = rows.find(l => parseInt(l.split(',')[2], 10) === 15);
      if (whaleRow) {
        const cols = whaleRow.trim().split(',');
        tdccDate = `${cols[0].slice(0,4)}-${cols[0].slice(4,6)}-${cols[0].slice(6,8)}`;
        whalePct = parseFloat(cols[5]) || null;
      }
    }

    // --- 6. T86 今日三大法人進出明細 ---
    // 使用真實 T86 三大法人資料，不用固定比例捧造券商分點
    const todayT86 = {};
    if (t86Raw && t86Raw.rows) {
      const row = t86Raw.rows.find(r => String(r[0]).trim() === sym);
      if (row) {
        todayT86.foreign   = parseT86Int(row[4]);   // 外資淨買超 (買-賣)
        todayT86.trust     = parseT86Int(row[10]);  // 投信淨買超
        todayT86.dealer    = parseT86Int(row[14]);  // 自營商自行買賣淨買超
        todayT86.total     = parseT86Int(row[18]);  // 三大法人合計淨買超
        todayT86.date      = t86Raw.date;
      }
    }

    // --- 7. Daytrade Processing ---
    let marketDayTradeRatioPct = 0;
    if (twtb4uRaw?.stat === 'OK' && twtb4uRaw.tables?.[0]?.data?.[0]) {
      marketDayTradeRatioPct = parseFloat(String(twtb4uRaw.tables[0].data[0][1] || '0').replace(/,/g, ''));
    }

    const daytradeMap = {};
    if (dayTradeData && dayTradeData.length > 0) {
      dayTradeData.forEach(item => {
        daytradeMap[item.date] = {
          volume: item.Volume
        };
      });
    }

    // --- 8. 外資持股比 (取最新一筆真實數字) ---
    const baseItem = shareholdingData?.[shareholdingData.length - 1] || {};
    const baseForeignRatio = parseFloat((baseItem.ForeignInvestmentSharesRatio || 0).toFixed(2));

    res.status(200).json({
      success: true,
      symbol: sym,
      kline: klineResult,
      chipMap,
      marginMap,
      holdersMap,           // 千張大戶歷史 (若有 KV 累積) 或 外資持股比歷史 (Fallback)
      usingTdccHistory,     // 告訴前端目前圖表畫的是外資還是大戶
      daytradeMap,
      todayT86,             // 三大法人今日進出真實數字
      whalePct,             // TDCC 千張以上大戶持股比 (最新一期)
      tdccDate,             // TDCC 資料日期
      baseForeignRatio,     // 外資持股比最新实際數字 (無偶移)
      daytrade: { marketRatio: marketDayTradeRatioPct }
    });

  } catch (err) {
    console.error('[drawer_data] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
