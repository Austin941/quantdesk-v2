// api/daytrade.js — 個股當沖比率 (TWSE TWTB4U)
// 當日沖銷交易標的及成交量值，計算個股當沖成交量 / 整體市場成交量比重

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 盤後更新，快取 1 小時
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const { symbol = '2330' } = req.query;
  const cleanSym = symbol.replace(/[^0-9A-Za-z]/g, '');

  // 取最近幾個交易日 (往前找，避免假日空白)
  const results = [];
  const today = new Date();

  for (let daysBack = 0; daysBack <= 7 && results.length < 5; daysBack++) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBack);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // 跳過週末

    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');

    try {
      const url = `https://www.twse.com.tw/exchangeReport/TWTB4U?response=json&date=${dateStr}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuantDesk/1.0)' }
      });
      if (!r.ok) continue;

      const json = await r.json();
      if (json.stat !== 'OK' || !json.tables || json.tables.length < 2) continue;

      // tables[0]: 整體市場統計，tables[1]: 個股明細
      const marketTable = json.tables[0];
      const stockTable  = json.tables[1];

      if (!marketTable?.data?.[0] || !stockTable?.data) continue;

      // 整體市場當沖佔比 (col[1] = 占市場比重%)
      const marketSharePct = parseFloat(marketTable.data[0][1] || '0');

      // 找到指定個股
      const row = stockTable.data.find(r => r[0] === cleanSym);
      if (!row) {
        // 當日這檔沒有當沖交易
        results.push({
          date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
          symbol: cleanSym,
          dayTradeShares: 0,
          dayTradeBuyAmount: 0,
          dayTradeSellAmount: 0,
          dayTradeRatioPct: 0,
          marketDayTradeRatioPct: marketSharePct
        });
        continue;
      }

      const dtShares     = parseInt(String(row[3] || '0').replace(/,/g, ''), 10);
      const dtBuyAmt     = parseInt(String(row[4] || '0').replace(/,/g, ''), 10);
      const dtSellAmt    = parseInt(String(row[5] || '0').replace(/,/g, ''), 10);
      const avgAmt       = (dtBuyAmt + dtSellAmt) / 2;

      // 估算當沖比率 = 當沖買進金額 / (買進 + 賣出) / 2，再 *2 還原成當沖比率近似值
      // 精確做法：個股當沖股數 / 當日個股總成交股數（需另外API）
      // 這裡用 TWSE 給的「占市場比重%」欄位正確計算個股比率並不直接，
      // 改為：dayTradeRatioPct = dtShares / (dtShares + nonDtEstimate) * 100
      // 由於無法直接取個股總成交量，以「當沖金額 / 2 占整體市場比重」作為合理估算
      results.push({
        date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
        symbol: cleanSym,
        dayTradeShares: dtShares,
        dayTradeBuyAmount: dtBuyAmt,
        dayTradeSellAmount: dtSellAmt,
        dayTradeRatioPct: null, // 需搭配 snapshot API 個股成交量計算
        marketDayTradeRatioPct: marketSharePct,
        avgDayTradeAmount: avgAmt
      });

    } catch (e) {
      console.warn(`[daytrade] ${dateStr} error:`, e.message);
    }
  }

  const latest = results[0] || null;

  res.status(200).json({
    success: true,
    symbol: cleanSym,
    count: results.length,
    latest,
    data: results
  });
}
