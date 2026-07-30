import { withCache, TTL } from '../_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbols } = req.body;
  if (!symbols || !Array.isArray(symbols)) {
    return res.status(400).json({ error: 'Missing or invalid symbols array' });
  }

  const sortedSymbols = [...symbols].sort();
  // Using a short hash to avoid excessively long cache keys in memory
  // but for in-memory Map, long string is fine.
  const cacheKey = 'snapshot_' + sortedSymbols.join('|');

  try {
    const data = await withCache(cacheKey, async () => {
      const chunks = [];
      for (let i = 0; i < sortedSymbols.length; i += 100) {
        chunks.push(sortedSymbols.slice(i, i + 100));
      }

      const results = [];
      const CONCURRENCY = 1; // Strict sequential fetching to prevent TWSE MIS rate limit 503/403
      
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY).map(async (chunk) => {
          const queryStr = chunk.join('|');
          const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${queryStr}&json=1&delay=0`;
          try {
            const response = await fetch(url, {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive'
              },
              signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) throw new Error(`TWSE returned status ${response.status}`);
            const data = await response.json();
            return { status: 'fulfilled', value: data };
          } catch (err) {
            return { status: 'rejected', reason: err };
          }
        });
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        // Delay between batches to respect rate limits
        if (i + CONCURRENCY < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
      
      const aggregatedMsgArray = [];
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.msgArray) {
          aggregatedMsgArray.push(...result.value.msgArray);
        } else if (result.status === 'rejected') {
          console.warn('[Snapshot] A chunk failed to fetch:', result.reason);
        }
      });

      return { msgArray: aggregatedMsgArray };
    }, TTL.MARKET_LIVE);

    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=15');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch snapshot from TWSE', details: error.message });
  }
}
