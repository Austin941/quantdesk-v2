import { fetchFinmind, startDateFromDays } from '../_lib/finmindFetcher.js';

export default async function handler(req, res) {
  // Allow CORS & Edge Cache for 5 minutes (300 seconds)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const { symbol = '2330', range = '3mo', interval = '1d' } = req.query;

  try {
    let cleanSymbol = symbol.toUpperCase().trim();
    if (!cleanSymbol.endsWith('.TW') && !cleanSymbol.endsWith('.TWO')) {
      // Default to .TW for Taiwan stocks unless specified
      cleanSymbol = `${cleanSymbol}.TW`;
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

    let json = null;
    let usedFallback = false;

    try {
      const response = await fetch(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(4000)
      });

      if (!response.ok) {
        if (cleanSymbol.endsWith('.TW')) {
          const otcSymbol = cleanSymbol.replace('.TW', '.TWO');
          const otcUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(otcSymbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
          const otcRes = await fetch(otcUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4000)
          });
          if (otcRes.ok) {
            json = await otcRes.json();
          }
        }
        if (!json) throw new Error(`Yahoo Finance returned status ${response.status}`);
      } else {
        json = await response.json();
      }
    } catch (err) {
      console.warn(`[kline] Yahoo fetch failed for ${symbol}:`, err.message, 'Falling back to FinMind...');
      usedFallback = true;
    }

    if (usedFallback) {
      // Fallback to FinMind TaiwanStockPrice
      let days = 90;
      if (range === '1mo') days = 30;
      else if (range === '6mo') days = 180;
      else if (range === '1y') days = 365;
      
      const cleanSym = cleanSymbol.replace('.TW', '').replace('.TWO', '');
      const fmData = await fetchFinmind('TaiwanStockPrice', cleanSym, startDateFromDays(days));
      
      if (!fmData || fmData.length === 0) {
        return res.status(404).json({ success: false, error: 'No chart data found in fallback' });
      }

      const klineData = fmData.map(item => ({
        time: item.date,
        timestamp: new Date(item.date).getTime() / 1000,
        open: item.open,
        high: item.max,
        low: item.min,
        close: item.close,
        volume: item.Trading_Volume
      }));

      return res.status(200).json({
        success: true,
        symbol,
        currency: 'TWD',
        count: klineData.length,
        data: klineData
      });
    }

    return parseYahooChartData(json, cleanSymbol, res);

  } catch (error) {
    console.error('K-Line API Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candlestick K-line data',
      details: error.message
    });
  }
}

function parseYahooChartData(json, symbol, res) {
  const result = json?.chart?.result?.[0];
  if (!result) {
    return res.status(404).json({ success: false, error: 'No chart data found' });
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const { open = [], high = [], low = [], close = [], volume = [] } = quote;

  const klineData = [];

  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const o = open[i];
    const h = high[i];
    const l = low[i];
    const c = close[i];
    const v = volume[i];

    // Filter out null / invalid entries
    if (o != null && h != null && l != null && c != null) {
      // Convert timestamp to YYYY-MM-DD format for Lightweight Charts
      const dateObj = new Date(time * 1000);
      const timeString = dateObj.toISOString().split('T')[0];

      klineData.push({
        time: timeString,
        timestamp: time,
        open: parseFloat(o.toFixed(2)),
        high: parseFloat(h.toFixed(2)),
        low: parseFloat(l.toFixed(2)),
        close: parseFloat(c.toFixed(2)),
        volume: v || 0
      });
    }
  }

  const meta = result.meta || {};

  return res.status(200).json({
    success: true,
    symbol,
    currency: meta.currency || 'TWD',
    regularMarketPrice: meta.regularMarketPrice,
    previousClose: meta.chartPreviousClose,
    count: klineData.length,
    data: klineData
  });
}
