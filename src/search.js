// ============================================================
// SEARCH — Global Ctrl+K quick search & reset button
// ============================================================
import { state } from './state.js';
import { showChart } from './chart.js';
import { showTechChart } from './views.js';

export function initGlobalSearch() {
  const input    = document.getElementById('global-search-input');
  const dropdown = document.getElementById('global-search-dropdown');
  const resetBtn = document.getElementById('reset-view-btn');

  // Reset button
  resetBtn?.addEventListener('click', () => {
    if (input)    input.value = '';
    if (dropdown) dropdown.classList.add('hidden');
    const def = state.sectorRankingData[0]?.sector || '半導體業';
    showChart(def, 'sector');
  });

  if (!input || !dropdown) return;

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
      input.blur();
    }
  });

  // Debounced search
  let timer;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(e.target.value.trim().toLowerCase(), dropdown), 120);
  });

  // Click outside to close
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function runSearch(q, dropdown) {
  if (!q) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }

  const stocks  = state.allMarketData.filter(d => {
    const name = (d.stock['股票名稱'] || '').toLowerCase();
    const sym  = (d.stock['股票代號'] || '').toLowerCase();
    return name.includes(q) || sym.includes(q);
  }).slice(0, 6);

  const sectors = state.sectorRankingData.filter(s => (s.sector || '').toLowerCase().includes(q)).slice(0, 4);
  const themes  = state.themeRankingData.filter(t  => (t.theme  || '').toLowerCase().includes(q)).slice(0, 4);

  if (!stocks.length && !sectors.length && !themes.length) {
    dropdown.innerHTML = `<div style="padding:14px;color:#94a3b8;text-align:center">🔍 找不到與「${q}」相關的標的或主題</div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  let html = '';
  if (stocks.length) {
    html += `<div class="search-category-header">📈 個股 (${stocks.length})</div>`;
    stocks.forEach(d => {
      const ret  = d.dailyReturn || 0;
      const sign = ret > 0 ? '+' : '';
      const col  = ret > 0 ? 'var(--positive-color)' : ret < 0 ? 'var(--negative-color)' : '#fff';
      const mkt  = (d.stock['市場別'] || '').includes('上市') ? '👑上市' : '💎上櫃';
      html += `<div class="search-item" data-type="stock" data-symbol="${d.stock['股票代號']}">
        <div><strong style="color:#facc15">${d.stock['股票名稱']}</strong>
          <span style="color:#94a3b8;font-size:0.85em;margin-left:4px">(${d.stock['股票代號']})</span>
          <small style="margin-left:4px;color:#38bdf8;font-size:0.75em">${mkt}</small></div>
        <span style="color:${col};font-weight:bold">${sign}${ret.toFixed(2)}%</span>
      </div>`;
    });
  }
  if (sectors.length) {
    html += `<div class="search-category-header">🏢 產業族群 (${sectors.length})</div>`;
    sectors.forEach(s => {
      html += `<div class="search-item" data-type="sector" data-name="${s.sector}">
        <div><span class="badge-sector">${s.sector}</span></div>
        <span style="color:#94a3b8;font-size:0.85em">查看族群泡泡圖 →</span>
      </div>`;
    });
  }
  if (themes.length) {
    html += `<div class="search-category-header">💡 概念題材 (${themes.length})</div>`;
    themes.forEach(t => {
      html += `<div class="search-item" data-type="theme" data-name="${t.theme}">
        <div><span class="badge-sector" style="background:rgba(56,189,248,0.2);color:#38bdf8;border-color:rgba(56,189,248,0.4)">${t.theme}</span></div>
        <span style="color:#94a3b8;font-size:0.85em">查看題材泡泡圖 →</span>
      </div>`;
    });
  }

  dropdown.innerHTML = html;
  dropdown.classList.remove('hidden');

  // Attach click handlers
  dropdown.querySelectorAll('.search-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-type');
      if (type === 'stock') {
        const sym = item.getAttribute('data-symbol');
        const td  = state.allMarketData.find(d => d.stock['股票代號'] === sym);
        if (td) { showChart(td.stock['產業別'] || '半導體業', 'sector'); showTechChart(td); }
      } else if (type === 'sector') {
        showChart(item.getAttribute('data-name'), 'sector');
      } else if (type === 'theme') {
        showChart(item.getAttribute('data-name'), 'theme');
      }
      dropdown.classList.add('hidden');
      const input = document.getElementById('global-search-input');
      if (input) input.value = '';
    });
  });
}
