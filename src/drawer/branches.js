import { state } from '../state.js';
import { dState } from './state.js';
import { fetchStaticJson } from './index.js';
import { syncAllCrosshairs } from './kline.js';

export function initBranchesSubCanvasEvents() {
  const c = document.getElementById('drw-branches-canvas');
  if (!c) return;
  
  if (!tornadoRenderer) {
    tornadoRenderer = new TornadoRenderer('drw-branches-canvas');
  }

  // Remove old listeners to avoid duplicates
  const newC = c.cloneNode(true);
  c.parentNode.replaceChild(newC, c);
  
  newC.addEventListener('click', e => {
    const rect = newC.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    tornadoRenderer.handleClick(mx, my, newC.clientHeight, newC.clientWidth, (trackedName) => {
       // Update global state for sync
       dState.trackedBrokerName = trackedName;
       drawBranchesSubCanvases(dState.klineMouseX, dState.klineMouseY);
       
       import('../api.js').then(api => {
          if (trackedName) {
            api.showToast('已鎖定追蹤券商：' + trackedName, 'success');
          } else {
            api.showToast('已取消追蹤券商', 'info');
          }
       });
    });
  });
}

export async function drawBranchesSubCanvases(mx, my) {
  const canvas = document.getElementById('drw-branches-canvas');
  if (!canvas || !dState.currentStock) return;
  
  // Set physical resolution
  const box = canvas.parentElement;
  canvas.width = box.clientWidth;
  canvas.height = box.clientHeight;
  
  const sym = dState.currentStock.symbol;
  
  // 更新標題
  const titleEl = document.getElementById('drw-branches-title');
  if (titleEl) titleEl.textContent = `券商分點買賣超 (${sym}) 載入中...`;
  
  if (!tornadoRenderer) {
    tornadoRenderer = new TornadoRenderer('drw-branches-canvas');
  }
  tornadoRenderer.setTrackedBroker(dState.trackedBrokerName);
  
  // 1. 如果已從 /data/stocks/${sym}.json 載入 topBrokers，直接渲染龍捲風圖 (0ms)
  const cachedBrokers = dState._sessionCache.topBrokers;
  if (cachedBrokers && (cachedBrokers.days20 || cachedBrokers.days60)) {
    const period = cachedBrokers.days20 || cachedBrokers.days60;
    const topBuy = (period.topBuyers || []).map(b => ({
      name: b.name,
      buy: b.buy,
      sell: b.sell,
      net: b.net,
      price: b.avgPrice || 0
    }));
    const topSell = (period.topSellers || []).map(b => ({
      name: b.name,
      buy: b.buy,
      sell: b.sell,
      net: b.net,
      price: b.avgPrice || 0
    }));

    if (titleEl) {
      titleEl.textContent = `券商分點近 20 日累計進出排行 (${sym})`;
    }

    tornadoRenderer.draw({
      success: true,
      hasData: true,
      top_buy: topBuy,
      top_sell: topSell
    }, '近20日');
    return;
  }

  // 2. Fallback: 使用後端 /api/branches 端點
  try {
    const res = await fetch(`/api/branches?symbol=${encodeURIComponent(sym)}`);
    if (!res.ok) throw new Error(`branches API ${res.status}`);
    const data = await res.json();
    
    if (titleEl && data.date) {
      titleEl.textContent = `三大法人今日進出 (${sym} / ${data.date}) — 資料來源：TWSE T86`;
    }
    
    if (!data.success || !data.hasData) {
      tornadoRenderer.draw(null, data.date || '--');
      return;
    }
    
    tornadoRenderer.draw(data, data.date);
  } catch (err) {
    console.warn('[branches] API error:', err.message);
    if (titleEl) titleEl.textContent = `券商分點進出 (${sym}) — 資料暫時無法取得`;
    tornadoRenderer.draw(null, '--');
  }
}

