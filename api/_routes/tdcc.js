// api/tdcc.js — TDCC 持股分級資料（千張以上大戶持股比）
// 真實資料來源：https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5
// 每周五更新一次，含全市場所有股票 17 個分級的持股比例
// 分級說明：
//   1～14：1-999, 1-4, 5-9, 10-14, 15-19, 20-29, 30-39, 40-49, 50-99, 100-199, 200-399, 400-599, 600-799, 800-999
//   15    ：≥1000張 (千張以上超級大戶)
//   16    ：其他（法人帳戶）
//   17    ：總計（驗證欄，stock_total=sum all levels）
import { withCache, TTL } from '../_lib/cache.js';
import { buildWeeklyCacheHeader } from '../_lib/cacheControl.js';

const TDCC_URL = 'https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5';
const TDCC_TTL = 24 * 3600 * 1000; // 每日快取（資料每周五更新，每日快取夠用）

async function fetchTdccRaw() {
  return withCache('tdcc:od:1-5', async () => {
    const res = await fetch(TDCC_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`TDCC HTTP ${res.status}`);
    const text = await res.text();
    return text;
  }, TDCC_TTL);
}

/**
 * 解析 TDCC CSV 找到特定股票的持股分級資料
 * @param {string} csv 原始 CSV 文字
 * @param {string} symbol 股票代號（如 '2330'）
 * @returns {{ date: string, whalePct: number, levels: object[] } | null}
 */
function parseTdccForSymbol(csv, symbol) {
  const lines = csv.split('\n');
  // 找到該股票的所有分級
  const rows = lines.filter(l => {
    const cols = l.split(',');
    return cols[1] && cols[1].trim() === symbol;
  });

  if (!rows.length) return null;

  const date = rows[0].split(',')[0]; // YYYYMMDD
  const isoDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;

  let whalePct = 0; // 千張以上比例
  let totalPct = 0;
  const levels = [];

  for (const row of rows) {
    const cols = row.trim().split(',');
    const level = parseInt(cols[2], 10);
    const people = parseInt(cols[3], 10) || 0;
    const shares = parseInt(cols[4], 10) || 0;
    const pct = parseFloat(cols[5]) || 0;

    levels.push({ level, people, shares, pct });

    if (level === 15) whalePct = pct;   // 千張以上大戶
    if (level === 17) totalPct = pct;   // 總計（應為 100）
  }

  return { date: isoDate, whalePct, totalPct, levels };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // TDCC 每週五更新，快取到下個週六 08:00（不會每天重打無用 API）
  res.setHeader('Cache-Control', buildWeeklyCacheHeader());

  const { symbol = '2330' } = req.query;
  const sym = symbol.trim().replace(/\s+/g, '');

  try {
    const csv = await fetchTdccRaw();
    const result = parseTdccForSymbol(csv, sym);

    if (!result) {
      return res.status(200).json({
        success: true,
        symbol: sym,
        whalePct: null,
        date: null,
        message: '該股票無 TDCC 持股分級資料',
        levels: []
      });
    }

    return res.status(200).json({
      success: true,
      symbol: sym,
      date: result.date,
      whalePct: result.whalePct,      // 千張以上持股比例 %
      totalPct: result.totalPct,
      levels: result.levels           // 全部 17 分級明細
    });
  } catch (err) {
    console.error('[tdcc] Error:', err.message);
    // 真實 API 掛掉時，不生成假資料，直接回報錯誤讓前端留白
    return res.status(200).json({
      success: false,
      symbol: sym,
      whalePct: null,
      date: null,
      error: err.message
    });
  }
}
