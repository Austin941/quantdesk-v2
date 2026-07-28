// api/major_holders.js — 千張大戶持股推算 (智慧 20:00 時間快取控制版)
import { fetchFinmind, startDateFromDays, cleanTWSymbol } from './_lib/finmindFetcher.js';
import { buildTimeBasedCacheHeader } from './_lib/cacheControl.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(20, 0, 1800));

  const { symbol = '2330', days = '30' } = req.query;

  try {
    const sym       = cleanTWSymbol(symbol);
    const startDate = startDateFromDays(days);

    const [chipData, marginData, shareholdingData] = await Promise.all([
      fetchFinmind('TaiwanStockInstitutionalInvestorsBuySell', sym, startDate),
      fetchFinmind('TaiwanStockMarginPurchaseShortSale',       sym, startDate),
      fetchFinmind('TaiwanStockShareholding',                  sym, startDate),
    ]);

    const baseItem         = shareholdingData[shareholdingData.length - 1] || {};
    const totalIssuedShares = baseItem.NumberOfSharesIssued  || 25_932_370_067;
    const baseForeignRatio  = baseItem.ForeignInvestmentSharesRatio || 70.37;

    const chipMap = {};
    chipData.forEach(({ date, name, buy, sell }) => {
      if (!chipMap[date]) chipMap[date] = { foreignNet: 0, trustNet: 0, dealerNet: 0, totalNet: 0 };
      const net = (buy || 0) - (sell || 0);
      if      (name.includes('Foreign'))          chipMap[date].foreignNet += net;
      else if (name.includes('Investment_Trust')) chipMap[date].trustNet   += net;
      else if (name.includes('Dealer'))           chipMap[date].dealerNet  += net;
      chipMap[date].totalNet += net;
    });

    const marginMap = {};
    marginData.forEach(item => {
      const bal  = item.MarginPurchaseTodayBalance     || 0;
      const prev = item.MarginPurchaseYesterdayBalance || 0;
      marginMap[item.date] = { marginBalance: bal, marginChange: bal - prev };
    });

    const allDates = Array.from(new Set([...Object.keys(chipMap), ...Object.keys(marginMap)])).sort();

    let currentEstMajorRatio = parseFloat((baseForeignRatio + 6.5).toFixed(2));

    const dailyEstimations = allDates.map(date => {
      const chip   = chipMap[date]   || { foreignNet: 0, trustNet: 0, dealerNet: 0, totalNet: 0 };
      const margin = marginMap[date] || { marginBalance: 0, marginChange: 0 };

      const retailShiftShares     = Math.round(margin.marginChange * 1000 * 0.85);
      const estDailyMajorNetShares = (chip.foreignNet + chip.trustNet + chip.dealerNet) - retailShiftShares;
      const deltaRatioPct          = (estDailyMajorNetShares / totalIssuedShares) * 100;
      currentEstMajorRatio         = parseFloat((currentEstMajorRatio + deltaRatioPct).toFixed(3));

      let signal = 'NEUTRAL', signalText = '⚖️ 大戶持股籌碼平衡';
      if      (estDailyMajorNetShares >  2_000_000 && margin.marginChange <= 0) { signal = 'MAJOR_ACCUMULATING';  signalText = '🔥 大戶強勢鎖碼 (法人大買+融資沉澱)'; }
      else if (estDailyMajorNetShares < -2_000_000 && margin.marginChange >  0) { signal = 'MAJOR_DISTRIBUTING'; signalText = '⚠️ 大戶高檔出貨 (法人大賣+散戶融資接刀)'; }
      else if (estDailyMajorNetShares >  1_000_000)                             { signal = 'MAJOR_BUYING';        signalText = '🟢 大戶持續加碼'; }
      else if (estDailyMajorNetShares < -1_000_000)                             { signal = 'MAJOR_SELLING';       signalText = '🔴 大戶減碼調節'; }

      return {
        date, symbol: sym,
        institutionalTotalNetShares: chip.totalNet,
        retailMarginChangeShares:    margin.marginChange,
        estDailyMajorNetShares,
        dailyEstMajorHoldersRatioPercent: currentEstMajorRatio,
        signal, signalText,
      };
    });

    const latest = dailyEstimations[dailyEstimations.length - 1] || {};

    res.status(200).json({
      success: true, symbol: sym,
      algorithmNote: '推算模型：基於每日三大法人買賣超淨額與散戶融資洗牌扣除額，每日滾動推算千張大戶持股比率',
      latestEstSummary: {
        date:                             latest.date                             || null,
        estDailyMajorNetShares:           latest.estDailyMajorNetShares           || 0,
        dailyEstMajorHoldersRatioPercent: latest.dailyEstMajorHoldersRatioPercent || 0,
        signal:                           latest.signal                           || 'NEUTRAL',
        signalText:                       latest.signalText                       || '⚖️ 大戶持股籌碼平衡',
      },
      count: dailyEstimations.length,
      data:  dailyEstimations,
    });
  } catch (err) {
    console.error('[major_holders] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
