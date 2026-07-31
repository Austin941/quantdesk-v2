let toastTimeout;

export function showToast(message, type = 'error') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>⚠️</span> <span>${message}</span>`;
  
  container.appendChild(toast);

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }, 5000);
}

let failCount = 0;
let closingCache = null;

// Helper to split array into chunks
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// LocalStorage Helper
function getLocalCache(key) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function setLocalCache(key, data, expiresAt) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt }));
  } catch (e) {
    // Ignore quota errors
  }
}

export async function fetchSnapshot(allStocks = []) {
  try {
    // 1. Fetch closing data once to get true prevClose
    if (!closingCache) {
      const CACHE_KEY = 'quantdesk_closing_cache_v3';
      closingCache = getLocalCache(CACHE_KEY);

      if (!closingCache) {
        console.log('[Snapshot] Fetching EOD closing data...');
        const closingRes = await fetch('/api/closing');
        if (closingRes.ok) {
          const data = await closingRes.json();
          closingCache = data.data || {};
          
          // Cache until 13:35 Taipei time today/tomorrow
          const now = new Date();
          const target = new Date(now);
          // Set to 13:35 UTC+8 (which is 05:35 UTC)
          target.setUTCHours(5, 35, 0, 0);
          if (now.getTime() > target.getTime()) {
             target.setUTCDate(target.getUTCDate() + 1);
          }
          setLocalCache(CACHE_KEY, closingCache, target.getTime());
        } else {
          closingCache = {};
        }
      } else {
        console.log('[Snapshot] Loaded closing data from LocalStorage');
      }
    }

    if (!allStocks || allStocks.length === 0) {
      return { data: closingCache, isMarketOpen: true };
    }

    // 2. Build TWSE MIS symbols list
    const misSymbols = allStocks.map(stock => {
      const code = stock['股票代號'];
      const market = stock['市場別'];
      if (market && market.includes('上市')) {
        return `tse_${code}.tw`;
      } else {
        return `otc_${code}.tw`;
      }
    });

    const finalCache = {};

    // 3. Fetch all via /api/snapshot (without tse_t00.tw to avoid pollution)
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: misSymbols })
    });

    if (!res.ok) throw new Error(`Snapshot error: ${res.status}`);
    const data = await res.json();
    
    if (data && data.msgArray) {
      data.msgArray.forEach(item => {
        const code = item.c;
        if (!code || code === 't00') return; // Skip t00 if it accidentally slips in

        let prevClose = parseFloat(item.y) || 0;
        if (prevClose <= 0 && closingCache[code] && closingCache[code].prevClose > 0) {
          prevClose = closingCache[code].prevClose;
        }

        let price = parseFloat(item.z);
        if (isNaN(price) || price <= 0) {
          if (item.pz && item.pz !== '-' && !isNaN(parseFloat(item.pz))) {
            price = parseFloat(item.pz);
          } else if (item.a && item.a !== '-' && !isNaN(parseFloat(item.a))) {
            price = parseFloat(item.a); // Fall back to best ask
          } else if (item.b && item.b !== '-' && !isNaN(parseFloat(item.b))) {
            price = parseFloat(item.b); // Fall back to best bid
          } else if (item.o && item.o !== '-' && !isNaN(parseFloat(item.o))) {
            price = parseFloat(item.o); // Fall back to open price
          } else if (item.y && item.y !== '-' && !isNaN(parseFloat(item.y))) {
            price = parseFloat(item.y); // Fall back to yesterday's close
          }

          if (isNaN(price) || price <= 0) {
            price = prevClose;
          }
        }

        const volume = parseInt(item.v) || 0;
        if (prevClose > 0) {
          finalCache[code] = { price, prevClose, volume };
        }
      });
    }

    // 4. Fetch the Market Index (TAIEX) via existing proxy to avoid needing a server restart
    try {
      const idxRes = await fetch('/api/proxy?symbols=tse_t00.tw');
      if (idxRes.ok) {
        const idxData = await idxRes.json();
        if (idxData && idxData.msgArray && idxData.msgArray.length > 0) {
          const item = idxData.msgArray[0];
          let price = parseFloat(item.z);
          if (isNaN(price) || price <= 0) price = parseFloat(item.y);
          const prevClose = parseFloat(item.y);
          if (price > 0 && prevClose > 0) {
            finalCache['t00'] = { price, prevClose, volume: 0 };
          }
        }
      }
    } catch (e) {
      console.warn('[Snapshot] Failed to fetch market index via proxy:', e);
    }

    const fetchPromises = [Promise.resolve()]; // Placeholder for any Promise.all dependencies later if any.

    failCount = 0;
    
    // 5. Fallback for stocks that failed MIS (e.g. market closed or no volume today)
    allStocks.forEach(stock => {
      const code = stock['股票代號'];
      if (!finalCache[code] && closingCache[code]) {
        // Use closing data for price and prevClose and volume
        finalCache[code] = {
          price: closingCache[code].price,
          prevClose: closingCache[code].prevClose,
          volume: closingCache[code].volume || 0
        };
      }
    });

    // explicitly fallback for TAIEX since it's not in allStocks
    if (!finalCache['t00'] && closingCache['t00']) {
      finalCache['t00'] = {
        price: closingCache['t00'].price,
        prevClose: closingCache['t00'].prevClose,
        volume: closingCache['t00'].volume || 0
      };
    }

    return { data: finalCache, isMarketOpen: true };

  } catch (error) {
    failCount++;
    console.error('[Snapshot] All retries failed:', error);
    if (failCount === 1) {
      showToast('無法取得最新資料，將顯示歷史模式。');
    }
    return { data: closingCache || {}, isMarketOpen: false };
  }
}

export async function fetchHistoricalRanking() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const CACHE_KEY = `quantdesk_hist_ranking_${today}`;
    let data = getLocalCache(CACHE_KEY);
    
    if (data) {
      console.log(`[Historical] Loaded data for ${today} from LocalStorage`);
      return data;
    }

    const response = await fetch(`./historical_ranking.json?d=${today}`);
    if (!response.ok) throw new Error('Historical data not found');
    data = await response.json();
    
    // Cache until tomorrow 08:00
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(0, 0, 0, 0); // 08:00 Taipei time = 00:00 UTC
    if (now.getTime() > target.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    setLocalCache(CACHE_KEY, data, target.getTime());
    
    return data;
  } catch (error) {
    console.warn('No historical data available:', error);
    return null; 
  }
}
