// api/margin.js — 融資融券 (智慧 21:30 時間快取控制版)
import { fetchFinmind, startDateFromDays, cleanTWSymbol } from './_lib/finmindFetcher.js';
import { buildTimeBasedCacheHeader } from './_lib/cacheControl.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(21, 30, 1800));

  const { symbol = '2330', days = '30' } = req.query;

  try {
    const sym       = cleanTWSymbol(symbol);
    const startDate = startDateFromDays(days);

    const rawData = await fetchFinmind(
      'TaiwanStockMarginPurchaseShortSale', sym, startDate
    );

    const data = rawData.map(item => {
      const marginBalance = item.MarginPurchaseTodayBalance     || 0;
      const marginPrev    = item.MarginPurchaseYesterdayBalance  || 0;
      const marginChange  = marginBalance - marginPrev;
      const shortBalance  = item.ShortSaleTodayBalance          || 0;
      const shortPrev     = item.ShortSaleYesterdayBalance       || 0;
      const shortChange   = shortBalance - shortPrev;
      const ratio         = marginBalance > 0
        ? parseFloat(((shortBalance / marginBalance) * 100).toFixed(2))
        : 0;

      return {
        date: item.date, symbol: sym,
        marginBalance, marginChange,
        marginBuy:  item.MarginPurchaseBuy  || 0,
        marginSell: item.MarginPurchaseSell || 0,
        shortBalance, shortChange,
        shortBuy:   item.ShortSaleBuy   || 0,
        shortSell:  item.ShortSaleSell  || 0,
        offsetLoanAndShort:      item.OffsetLoanAndShort || 0,
        shortMarginRatioPercent: ratio,
        isShortSqueezeAlert:     ratio >= 20.0,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const latest = data[data.length - 1] || {};

    res.status(200).json({
      success: true, symbol: sym, count: data.length,
      latestSummary: {
        date:                    latest.date                    || null,
        marginBalance:           latest.marginBalance           || 0,
        marginChange:            latest.marginChange            || 0,
        shortBalance:            latest.shortBalance            || 0,
        shortChange:             latest.shortChange             || 0,
        shortMarginRatioPercent: latest.shortMarginRatioPercent || 0,
        isShortSqueezeAlert:     latest.isShortSqueezeAlert     || false,
      },
      data,
    });
  } catch (err) {
    console.error('[margin] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
