// ============================================================
// ui/meta-panel.js — 個股資訊面板（從 views.js 拆出）
// 修復 P1-4：加入 stock_info 客戶端快取
// ============================================================
import { state } from '../state.js';
import { getConglomeratesByStockCode } from '../stock_api.js';
import { openDrawer } from '../drawer/index.js';

// ---- P1-4: Client-side cache for stock_info API calls ----
const _stockInfoCache = new Map();

async function fetchStockInfo(code) {
  if (_stockInfoCache.has(code)) return _stockInfoCache.get(code);
  try {
    const r = await fetch(`/api/stock_info?symbol=${encodeURIComponent(code)}`);
    const info = await r.json();
    if (info?.success) _stockInfoCache.set(code, info);
    return info;
  } catch { return null; }
}

// Lazy showChart to avoid circular dependency
async function _showChart(id, mode) {
  const { showChart } = await import('../chart/macro.js');
  showChart(id, mode);
}

export function showTechChart(stockData) {
  if (!stockData || !stockData.stock) return;
  openDrawer(stockData);
  const stock = stockData.stock;

  const metaPanel  = document.getElementById('stock-meta-panel');
  const selectHint = document.getElementById('detail-select-hint');

  if (metaPanel) {
    metaPanel.classList.remove('hidden');
    if (selectHint) selectHint.classList.add('hidden');
    requestAnimationFrame(() => {
      metaPanel.classList.remove('fade-in');
      requestAnimationFrame(() => metaPanel.classList.add('fade-in'));
    });

    const nameEl   = document.getElementById('selected-stock-name');
    const symbolEl = document.getElementById('selected-stock-symbol');
    const marketEl = document.getElementById('selected-stock-market');
    const returnEl = document.getElementById('selected-stock-return');

    if (nameEl)   nameEl.textContent   = stock['股票名稱'];
    if (symbolEl) symbolEl.textContent = `(${stock['股票代號']})`;
    if (marketEl) marketEl.textContent = (stock['市場別'] || '').includes('上市') ? '👑上市' : '💎上櫃';

    const dReturn = stockData.dailyReturn;
    const dPrice  = stockData.price;
    if (returnEl && dReturn !== undefined && isFinite(dReturn)) {
      const sign = dReturn > 0 ? '+' : '';
      const priceText = dPrice ? `<span style="color:#f8fafc;font-size:0.95rem;margin-right:8px">${Number(dPrice.toFixed(2)).toString()}元</span>` : '';
      returnEl.innerHTML = `${priceText}<span class="${dReturn > 0 ? 'color-positive' : dReturn < 0 ? 'color-negative' : ''}">${sign}${dReturn.toFixed(2)}%</span>`;
    }

    // Capital info (with cache)
    const capEl = document.getElementById('selected-stock-capital');
    if (capEl) {
      capEl.textContent = '載入中...';
      fetchStockInfo(stock['股票代號']).then(info => {
        if (!capEl) return;
        if (info?.success) {
          const sc = {
            large: { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.3)',  label: '🔴 大型股' },
            mid:   { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', border: 'rgba(234,179,8,0.3)',   label: '🟡 中型股' },
            small: { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', border: 'rgba(34,197,94,0.3)',   label: '🟢 小型股' },
          }[info.sizeCode] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)', label: '' };
          capEl.innerHTML = `資本額 ${info.capitalDisplay} <span style="background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};padding:1px 5px;border-radius:4px;margin-left:4px;font-size:0.7rem;font-weight:600;white-space:nowrap">${sc.label}</span>`;
        } else {
          capEl.textContent = '';
        }
      });
    }
  }

  // Sector tag
  const sectorTags = document.getElementById('tech-sector-tags');
  if (sectorTags) {
    sectorTags.innerHTML = '';
    if (stock['產業別']) {
      const t = Object.assign(document.createElement('span'), { className: 'drawer-tag', textContent: stock['產業別'] });
      t.addEventListener('click', () => _showChart(stock['產業別'], 'sector'));
      sectorTags.appendChild(t);
    }
  }

  // Group tag
  const groupTags = document.getElementById('tech-group-tags');
  if (groupTags) {
    groupTags.innerHTML = '';
    const gName = stock.group || stock['集團別'] || getConglomeratesByStockCode(stock['股票代號']);
    if (gName && gName !== '獨立/未歸類') {
      const t = Object.assign(document.createElement('span'), {
        className: 'drawer-tag badge-group',
        style: 'background:rgba(168,85,247,0.25);color:#c084fc;border:1px solid rgba(168,85,247,0.5);cursor:pointer;padding:3px 10px;border-radius:4px;font-weight:bold;',
        textContent: gName
      });
      t.addEventListener('click', () => _showChart(gName, 'group'));
      groupTags.appendChild(t);
    } else {
      const t = Object.assign(document.createElement('span'), {
        style: 'color:#64748b;font-size:0.85em;padding:2px 6px;',
        textContent: '獨立/未歸類'
      });
      groupTags.appendChild(t);
    }
  }

  // Theme tags
  const themeTags = document.getElementById('tech-theme-tags');
  if (themeTags) {
    themeTags.innerHTML = '';
    if (stock['題材清單']) {
      stock['題材清單'].split(/[,、]/).forEach(theme => {
        if (!theme.trim()) return;
        const t = Object.assign(document.createElement('span'), { className: 'drawer-tag', textContent: theme.trim() });
        t.addEventListener('click', () => _showChart(theme.trim(), 'theme'));
        themeTags.appendChild(t);
      });
    }
  }

  // Scroll to meta panel on mobile
  if (window.innerWidth <= 1024 && metaPanel) {
    metaPanel.scrollIntoView({ behavior: 'smooth' });
  }
}
