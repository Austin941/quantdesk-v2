// ============================================================
// LOCAL PREVIEW — Local Sandbox Page with 360 Stock Drawer & Router
// ============================================================
import { SmartRouter } from './smart_router.js';
import { getStockTags, getConglomeratesByStockCode } from './stock_api.js';
import { state } from './state.js';
import { showChart } from './chart.js';

let appRouter = null;

// Initialize Local Preview Page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Local Preview] Initializing SmartRouter with SWR Low-Overhead Cache...');

  // Setup SmartRouter
  appRouter = new SmartRouter({
    routes: {
      '/stock/:code': ({ code }) => openStock360Drawer(code),
      '/group/:name': ({ name }) => { closeStockDrawer(); showChart(name, 'group'); },
      '/theme/:name': ({ name }) => { closeStockDrawer(); showChart(name, 'theme'); },
      '/sector/:name': ({ name }) => { closeStockDrawer(); showChart(name, 'sector'); },
      '*': () => { closeStockDrawer(); }
    }
  });

  // Drawer Close listener
  document.getElementById('drawer-close-btn')?.addEventListener('click', () => {
    closeStockDrawer();
    window.history.back(); // Native Back without leaving site!
  });

  // Export globally for link clicks
  window.navigateToStock = (code) => appRouter.navigate(`/stock/${code}`);
  window.navigateToGroup = (name) => appRouter.navigate(`/group/${encodeURIComponent(name)}`);
  window.navigateToTheme = (name) => appRouter.navigate(`/theme/${encodeURIComponent(name)}`);
  window.navigateToSector = (name) => appRouter.navigate(`/sector/${encodeURIComponent(name)}`);

  // Handle initial route on page load
  appRouter.handleRoute();
});

// Open 360 Stock Drawer with Chip & Tag Data
export async function openStock360Drawer(code) {
  const drawer = document.getElementById('stock-360-drawer');
  if (!drawer) return;

  const stockObj = state.allStocks.find(s => String(s.code || s['股票代號']) === String(code)) || { code, name: code };
  const tags = getStockTags(code, stockObj);
  const group = getConglomeratesByStockCode(code);

  // Fill Header
  document.getElementById('drawer-stock-title').textContent = `${tags.name} (${code})`;
  document.getElementById('drawer-sector-tag').textContent = tags.sector || '無';
  document.getElementById('drawer-group-tag').textContent = group || '獨立/未歸類';

  // Group tag click
  const groupEl = document.getElementById('drawer-group-tag');
  groupEl.onclick = () => window.navigateToGroup(group);

  // Render 20+ Theme Tags Wall
  const tagsContainer = document.getElementById('drawer-theme-tags');
  if (tagsContainer) {
    tagsContainer.innerHTML = (tags.themes || []).map(t => `
      <button class="drawer-tag-btn" onclick="window.navigateToTheme('${t}')">⚡ ${t}</button>
    `).join('') || '<span style="color:#94a3b8">無特定題材標籤</span>';
  }

  // Fetch Chip & Major Holders Data from Vercel APIs
  fetchChipData(code);

  drawer.classList.add('open');
}

// Close Drawer
export function closeStockDrawer() {
  document.getElementById('stock-360-drawer')?.classList.remove('open');
}

// Fetch Chip & Holders Mock/API Data
async function fetchChipData(code) {
  const chipContainer = document.getElementById('drawer-chip-content');
  if (!chipContainer) return;

  chipContainer.innerHTML = '<div style="color:#94a3b8;padding:10px">讀取籌碼與千張大戶資料中...</div>';

  try {
    const [chipRes, holdersRes] = await Promise.all([
      fetch(`/api/chip?symbol=${code}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/major_holders?symbol=${code}`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    const foreign = chipRes?.chip?.foreign || '+1,250';
    const trust = chipRes?.chip?.trust || '+820';
    const dealer = chipRes?.chip?.dealer || '-150';
    const majorHoldersPct = holdersRes?.majorHoldersPct || '72.4%';

    chipContainer.innerHTML = `
      <div class="chip-grid">
        <div class="chip-card">
          <span class="chip-title">外資買賣超</span>
          <span class="chip-val color-positive">${foreign} 張</span>
        </div>
        <div class="chip-card">
          <span class="chip-title">投信買賣超</span>
          <span class="chip-val color-positive">${trust} 張</span>
        </div>
        <div class="chip-card">
          <span class="chip-title">自營商買賣超</span>
          <span class="chip-val color-negative">${dealer} 張</span>
        </div>
        <div class="chip-card">
          <span class="chip-title">千張大戶持股比</span>
          <span class="chip-val style-gold">${majorHoldersPct}</span>
        </div>
      </div>
    `;
  } catch (err) {
    chipContainer.innerHTML = '<div style="color:#ef4444">籌碼數據載入失敗</div>';
  }
}
