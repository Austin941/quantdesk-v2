// api/branches.js — 三大法人今日進出分析（使用 TWSE T86 真實資料）
// 注意：個別券商分點（如「美林-台北」）需要付費 API，TWSE 不公開。
// 本 API 回傳的是三大法人分類（外資/投信/自營商）的真實股數，不捏造。
import { fetchT86, parseT86Int } from '../_lib/twseFetcher.js';
import { cleanTWSymbol } from '../_lib/finmindFetcher.js';
import { buildTimeBasedCacheHeader } from '../_lib/cacheControl.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', buildTimeBasedCacheHeader(20, 0, 1800));

  const { symbol = '2330' } = req.query;

  try {
    const sym = cleanTWSymbol(symbol);
    const { date, rows } = await fetchT86();

    const targetRow = rows.find(row => String(row[0]).trim() === sym);

    if (!targetRow) {
      return res.status(200).json({
        success: true,
        symbol: sym,
        date,
        hasData: false,
        message: `${sym} 今日無三大法人進出資料（可能未上市交易）`,
        institutions: [],
        top_buy: [],
        top_sell: []
      });
    }

    // T86 欄位說明（依 TWSE 公告格式）
    // [0] 股票代號, [1] 名稱
    // [2] 外資買進股數, [3] 外資賣出股數, [4] 外資淨買超
    // [5] 外資自營商買進, [6] 外資自營商賣出, [7] 外資自營商淨買超
    // [8] 投信買進股數, [9] 投信賣出股數, [10] 投信淨買超
    // [11] 自營商買進(自行), [12] 自營商賣出(自行), [13] 自營商淨買超(自行)（備查）
    // [14] 自營商買進(避險), [15] 自營商賣出(避險), [16] 自營商淨買超（避險用）
    // [17] 三大法人買進合計, [18] 三大法人賣出合計, [19] 三大法人淨買超合計 ❌ wrong
    // 實際測試：[18] = 三大法人合計淨買超

    const foreignNet   = parseT86Int(targetRow[4]);
    const trustNet     = parseT86Int(targetRow[10]);
    const dealerNet    = parseT86Int(targetRow[14]); // 自營商自行買賣
    const totalNet     = parseT86Int(targetRow[18]); // 三大合計

    // 建立 top_buy / top_sell 格式（供 TornadoRenderer 使用）
    // 三大法人的真實資料，單位：股數（非張數）
    const institutionMap = [
      { name: '外資及外資自營商', net: foreignNet,  type: 'foreign' },
      { name: '投信',            net: trustNet,     type: 'trust'   },
      { name: '自營商（自行）',   net: dealerNet,    type: 'dealer'  },
    ];

    const top_buy  = institutionMap
      .filter(i => i.net > 0)
      .sort((a, b) => b.net - a.net)
      .map(i => ({ broker_name: i.name, net: i.net, type: i.type }));

    const top_sell = institutionMap
      .filter(i => i.net < 0)
      .sort((a, b) => a.net - b.net) // 最負的排前面
      .map(i => ({ broker_name: i.name, net: Math.abs(i.net), type: i.type }));

    return res.status(200).json({
      success: true,
      symbol: sym,
      date,
      hasData: true,
      totalNet,
      institutions: institutionMap,
      top_buy,
      top_sell,
      note: '資料來源：TWSE T86 三大法人買賣超（真實股數，非捏造分點）'
    });

  } catch (err) {
    console.error('[branches] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
