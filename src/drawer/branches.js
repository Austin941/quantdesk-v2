import { state } from '../state.js';
import { dState } from './state.js';
import { TornadoRenderer } from '../renderers/TornadoRenderer.js';
import { fetchStaticJson } from './index.js';
import { syncAllCrosshairs } from './kline.js';

let tornadoRenderer = null;

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
  const currentPeriodKey = dState.branchesPeriod || 'days20';
  const periodLabel = currentPeriodKey === 'days60' ? '近 60 日' : '近 20 日';
  
  if (!tornadoRenderer) {
    tornadoRenderer = new TornadoRenderer('drw-branches-canvas');
  }
  tornadoRenderer.setTrackedBroker(dState.trackedBrokerName);
  
  // 1. 如果已從 /data/stocks/${sym}.json 載入 topBrokers，直接渲染龍捲風圖 (0ms)
  const cachedBrokers = dState._sessionCache.topBrokers;
  if (cachedBrokers && (cachedBrokers.days20 || cachedBrokers.days60)) {
    const periodData = cachedBrokers[currentPeriodKey] || cachedBrokers.days20 || cachedBrokers.days60;
    const topBuy = (periodData.topBuyers || []).map(b => ({
      name: b.name,
      buy: b.buy,
      sell: b.sell,
      net: b.net,
      price: b.avgPrice || 0
    }));
    const topSell = (periodData.topSellers || []).map(b => ({
      name: b.name,
      buy: b.buy,
      sell: b.sell,
      net: b.net,
      price: b.avgPrice || 0
    }));

    tornadoRenderer.draw({
      success: true,
      hasData: true,
      top_buy: topBuy,
      top_sell: topSell
    }, periodLabel);
    return;
  }

  // 2. Fallback: 使用後端 /api/branches 端點
  try {
    const res = await fetch(`/api/branches?symbol=${encodeURIComponent(sym)}`);
    if (!res.ok) throw new Error(`branches API ${res.status}`);
    const data = await res.json();
    
    if (!data.success || !data.hasData) {
      tornadoRenderer.draw(null, data.date || '--');
      return;
    }
    
    tornadoRenderer.draw(data, data.date || '今日');
  } catch (err) {
    console.warn('[branches] API error:', err.message);
    tornadoRenderer.draw(null, '--');
  }
}

export function bindBranchesPeriodToggle() {
  const btns = document.querySelectorAll('.drw-period-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btns.forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.style.background = 'rgba(56, 189, 248, 0.2)';
      btn.style.color = '#38bdf8';
      dState.branchesPeriod = btn.getAttribute('data-period') || 'days20';
      drawBranchesSubCanvases(dState.klineMouseX, dState.klineMouseY);
    });
  });
}

