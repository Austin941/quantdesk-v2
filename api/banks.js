// api/banks.js — 公股行庫護盤偵測 (智慧 20:00 時間快取控制版)
import { fetchT86, parseT86Int } from './_lib/twseFetcher.js';
import { buildTimeBasedCacheHeader } from './_lib/cacheControl.js';

const DEFENSE_STOCKS = new Set(['2330', '2454', '2317', '2881', '2882', '2886', '2303']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(20, 0, 1800));

  try {
    const { date, rows } = await fetchT86();

    let foreignSum = 0;
    const topDefenseTargets = [];

    rows.forEach(row => {
      const code       = row[0]?.trim();
      const name       = row[1]?.trim();
      const foreignNet = parseT86Int(row[4]);
      const totalNet   = parseT86Int(row[18]);

      foreignSum += foreignNet;

      if (DEFENSE_STOCKS.has(code)) {
        const estimatedBankBuy = foreignNet < 0
          ? Math.abs(foreignNet) * 0.45
          : -foreignNet * 0.2;
        topDefenseTargets.push({
          code, name,
          foreignNetShares:         foreignNet,
          totalNetShares:           totalNet,
          estimatedStateBankNetShares: Math.round(estimatedBankBuy),
        });
      }
    });

    const stateBankNetEst = foreignSum < 0
      ? Math.abs(foreignSum) * 0.35
      : -foreignSum * 0.25;

    let defenseIndex = 50;
    if      (foreignSum < -200_000_000) defenseIndex += 35;
    else if (foreignSum < -100_000_000) defenseIndex += 20;
    else if (foreignSum >  100_000_000) defenseIndex -= 15;
    defenseIndex = Math.min(100, Math.max(0, defenseIndex));

    let status = 'NORMAL';
    if      (defenseIndex >= 80) status = 'NATIONAL_FUND_DEFENSE_HIGH';
    else if (defenseIndex >= 65) status = 'STATE_BANK_SUPPORTING';
    else if (defenseIndex <= 30) status = 'TAKING_PROFIT';

    const statusText = {
      NATIONAL_FUND_DEFENSE_HIGH: '🚨 國安基金高強度護盤觸發',
      STATE_BANK_SUPPORTING:      '🛡️ 八大公股行庫逆向護盤中',
      TAKING_PROFIT:              '☀️ 市場走強，公股高檔順勢調節',
    }[status] || '⚖️ 市場籌碼相對平穩';

    res.status(200).json({
      success: true,
      overview: {
        date, foreignTotalNetShares: foreignSum,
        estimatedStateBankNetShares: Math.round(stateBankNetEst),
        defenseIndex, status, statusText,
      },
      topDefenseTargets,
    });
  } catch (err) {
    console.error('[banks] Error:', err.message);
    res.status(200).json({
      success: false,
      overview: { date: new Date().toISOString().split('T')[0], defenseIndex: 50, status: 'NORMAL', statusText: '⚖️ 資料暫時無法取得' },
      topDefenseTargets: [],
    });
  }
}
