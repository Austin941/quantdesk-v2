// ============================================================
// STOCK TAGS API — Unified Stock, Sector, Theme & Group API
// 統一股票標籤、產業、題材與集團股對照 API (支援自動連動與動態更新)
// ============================================================
import { CONGLOMERATES, getConglomeratesByStockCode, getAllConglomerates } from '../scripts/conglomerates_database.js';

/**
 * 依據股票代號獲取完整標籤 (包含集團、產業與題材)
 * @param {string} symbol - 股票代號 (例: "2330")
 * @param {Object} stockObj - 個股資料物件
 * @returns {Object} 擴充後的股票標籤資訊
 */
export function getStockTags(symbol, stockObj = {}) {
  const code = String(symbol).trim();
  const group = getConglomeratesByStockCode(code);
  const sector = stockObj['產業別'] || stockObj.sector || '';
  const rawThemes = stockObj['題材清單'] || stockObj.themes || [];
  const themes = Array.isArray(rawThemes)
    ? rawThemes
    : String(rawThemes).split('、').map(t => t.trim()).filter(Boolean);

  return {
    code,
    name: stockObj['股票名稱'] || stockObj.name || '',
    sector,
    market: stockObj['市場別'] || stockObj.market || '',
    group,
    hasGroup: group !== '獨立/未歸類',
    themes,
    themeCount: themes.length
  };
}

export {
  CONGLOMERATES,
  getConglomeratesByStockCode,
  getAllConglomerates
};
