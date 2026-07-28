// ============================================================
// VIEWS — showBubbleChart, showTechChart, renderTvWidget
// ============================================================
import { state } from './state.js';
import { getConglomeratesByStockCode } from './stock_api.js';

// Lazy showChart to avoid circular dependency (views ↔ chart)
async function _showChart(id, mode) {
  const { showChart } = await import('./chart.js');
  showChart(id, mode);
}

// Switch main panel back to bubble chart
export function showBubbleChart(groupName, mode = 'sector') {
  const bubbleView = document.getElementById('bubble-chart-view');

  // Fade-in without blocking layout: use rAF
  requestAnimationFrame(() => {
    bubbleView.classList.remove('fade-in');
    requestAnimationFrame(() => bubbleView.classList.add('fade-in'));
  });

  let title = '全市場族群';
  if (groupName && groupName !== 'ALL') title += ' ❯ ' + groupName;
  document.getElementById('tv-main-title').textContent = title;
  document.getElementById('tv-main-subtitle').textContent = '';

  document.getElementById('tech-chart-view').classList.add('hidden');
  document.getElementById('tech-interval-selector').classList.add('hidden');
  document.getElementById('back-to-bubble-btn').classList.add('hidden');
  document.getElementById('bubble-chart-view').classList.remove('hidden');
  document.getElementById('bubble-period-selector').classList.remove('hidden');
  document.getElementById('detail-table-wrapper').classList.remove('hidden');
  document.getElementById('main-vertical-resizer')?.classList.remove('hidden');
}

// Show stock meta panel and set TradingView widget
export function showTechChart(stockData) {
  if (!stockData || !stockData.stock) return;
  const stock = stockData.stock;

  const metaPanel  = document.getElementById('stock-meta-panel');
  const selectHint = document.getElementById('detail-select-hint');

  if (metaPanel) {
    metaPanel.classList.remove('hidden');
    if (selectHint) selectHint.classList.add('hidden'); // hide placeholder
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
      const priceText = dPrice ? `<span style="color:#f8fafc;font-size:0.95rem;margin-right:8px">${dPrice.toFixed(2)}元</span>` : '';
      returnEl.innerHTML = `${priceText}<span class="${dReturn > 0 ? 'color-positive' : dReturn < 0 ? 'color-negative' : ''}">${sign}${dReturn.toFixed(2)}%</span>`;
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

// Render TradingView widget
export function renderTvWidget(symbol, interval) {
  const container = document.getElementById('tradingview-widget-container');
  container.innerHTML = '';
  if (window.TradingView) {
    state.activeTvWidget = new TradingView.widget({
      autosize: true, symbol, interval,
      timezone: 'Asia/Taipei', theme: 'dark', style: '1', locale: 'zh_TW',
      enable_publishing: false,
      backgroundColor: 'rgba(15, 23, 42, 1)',
      hide_top_toolbar: true, hide_legend: false, save_image: false,
      container_id: 'tradingview-widget-container',
    });
  }
}

// Switch between sidebar views
export function switchView(targetViewId) {
  if (targetViewId !== 'view-chart') {
    document.querySelectorAll('.sidebar-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-target') === targetViewId);
    });
  }
  document.querySelectorAll('.sidebar-view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('active');
  });
  const target = document.getElementById(targetViewId);
  if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
}
