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

export async function fetchSnapshot(allStocks = []) {
  try {
    // 1. Fetch closing data once to get true prevClose
    if (!closingCache) {
      console.log('[Snapshot] Fetching EOD closing data...');
      const closingRes = await fetch('/api/closing');
      if (closingRes.ok) {
        const data = await closingRes.json();
        closingCache = data.data || {};
      } else {
        closingCache = {};
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

    // 3. Split into chunks of 100
    const chunks = chunkArray(misSymbols, 100);
    const finalCache = {};

    // 4. Fetch all chunks in parallel through Vercel Proxy
    // 4. Fetch all chunks with concurrency limit and exponential backoff retry
    const maxConcurrency = 10;
    let active = 0;
    let index = 0;
    const fetchPromises = [];

    const fetchChunkWithRetry = async (chunk, retries = 2) => {
      const queryStr = chunk.join('|');
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await fetch(`/api/proxy?symbols=${queryStr}`);
          if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
          
          const data = await res.json();
          if (data && data.msgArray) {
            data.msgArray.forEach(item => {
              const code = item.c;
              if (!code) return;

              let prevClose = parseFloat(item.y) || 0;
              if (prevClose <= 0 && closingCache[code] && closingCache[code].prevClose > 0) {
                prevClose = closingCache[code].prevClose;
              }

              let price = parseFloat(item.z);
              if (isNaN(price) || price <= 0) {
                if (item.pz && item.pz !== '-' && !isNaN(parseFloat(item.pz))) {
                  price = parseFloat(item.pz);
                } else {
                  let ask = null, bid = null;
                  if (item.a && item.a !== '-') {
                    const aVal = parseFloat(item.a.split('_')[0]);
                    if (!isNaN(aVal) && aVal > 0) ask = aVal;
                  }
                  if (item.b && item.b !== '-') {
                    const bVal = parseFloat(item.b.split('_')[0]);
                    if (!isNaN(bVal) && bVal > 0) bid = bVal;
                  }

                  if (ask !== null && bid !== null) {
                    price = (ask + bid) / 2;
                  } else if (ask !== null) {
                    price = ask; // 跌停鎖死
                  } else if (bid !== null) {
                    price = bid; // 漲停鎖死
                  } else if (item.w && item.w !== '-' && !isNaN(parseFloat(item.w))) {
                    price = parseFloat(item.w);
                  } else if (item.u && item.u !== '-' && !isNaN(parseFloat(item.u))) {
                    price = parseFloat(item.u);
                  } else if (item.o && item.o !== '-' && !isNaN(parseFloat(item.o))) {
                    price = parseFloat(item.o);
                  }
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
          return; // Success, exit retry loop
        } catch (err) {
          if (i === retries) {
            console.warn(`[Snapshot] Chunk failed after ${retries} retries:`, err);
          } else {
            // Exponential backoff: 500ms, 1000ms
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
          }
        }
      }
    };

    // Concurrency control loop
    const activePromises = new Set();
    while (index < chunks.length) {
      if (activePromises.size >= maxConcurrency) {
        // Wait for at least one active promise to finish
        await Promise.race(activePromises);
      }
      
      const chunk = chunks[index++];
      const p = fetchChunkWithRetry(chunk);
      fetchPromises.push(p);
      activePromises.add(p);
      p.finally(() => activePromises.delete(p));
    }

    await Promise.all(fetchPromises);

    failCount = 0;
    
    // If proxy completely failed (e.g. offline), fallback to closingCache
    if (Object.keys(finalCache).length === 0) {
      return { data: closingCache, isMarketOpen: true };
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
    const response = await fetch(`./historical_ranking.json?d=${today}`);
    if (!response.ok) throw new Error('Historical data not found');
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('No historical data available:', error);
    return null; 
  }
}
