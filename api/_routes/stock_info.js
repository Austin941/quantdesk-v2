// api/stock_info.js — 個股基本資訊 (資本額、市場別、產業別)
// 後端統一快取，避免前端直接打 TWSE 全量資料
import { withCache, TTL } from '../_lib/cache.js';

const _capitalCache = new Map(); // 永久記憶體快取 (重啟前有效)

async function _fetchTWSEList() {
  return withCache('twse:company_list', async () => {
    const r = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`TWSE list HTTP ${r.status}`);
    return r.json();
  }, 24 * 3600 * 1000); // 24小時快取 (公司基本資料幾乎不變)
}

async function _fetchTPExList() {
  return withCache('tpex:company_list', async () => {
    const r = await fetch('https://openapi.tpex.org.tw/web/regular_emerging/corporateInfo/OTC/otc_companies_information.php?l=zh-tw', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`TPEx list HTTP ${r.status}`);
    return r.json();
  }, 24 * 3600 * 1000);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 公司基本資料每天只更新一次
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800');

  const { symbol = '2330' } = req.query;
  const cleanSym = symbol.replace(/[^0-9A-Za-z]/g, '');

  try {
    // 先嘗試上市清單
    let capital = null;
    let marketType = 'TWSE';

    const twseList = await _fetchTWSEList().catch(() => null);
    if (Array.isArray(twseList)) {
      const row = twseList.find(x => x['公司代號'] === cleanSym);
      if (row) {
        capital = parseInt(row['實收資本額'] || '0', 10);
        marketType = 'TWSE';
      }
    }

    // 如果上市找不到，試上櫃
    if (!capital) {
      const tpexList = await _fetchTPExList().catch(() => null);
      if (Array.isArray(tpexList)) {
        const row = tpexList.find(x =>
          x['SecuritiesCompanyCode'] === cleanSym ||
          x['公司代號'] === cleanSym
        );
        if (row) {
          capital = parseInt(row['實收資本額'] || row['PaidInCapital'] || '0', 10);
          marketType = 'TPEx';
        }
      }
    }

    let sizeLabel = '小型股';
    let sizeCode = 'small';
    if (capital >= 5_000_000_000) { sizeLabel = '大型股'; sizeCode = 'large'; }
    else if (capital >= 1_000_000_000) { sizeLabel = '中型股'; sizeCode = 'mid'; }

    return res.status(200).json({
      success: true,
      symbol: cleanSym,
      marketType,
      capital: capital || 0,
      sizeLabel,
      sizeCode,
      capitalDisplay: capital >= 1e8
        ? `${(capital / 1e8).toFixed(capital >= 1e10 ? 1 : 2)} 億`
        : capital > 0 ? `${(capital / 1e6).toFixed(1)} 百萬` : '—',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
