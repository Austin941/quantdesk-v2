import { fetchAllSnapshots } from '../_lib/finmind.js';
import { withCache, TTL } from '../_lib/cache.js';

export default async function handler(req, res) {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Vercel serverless functions have a max duration (e.g. 10s or 60s).
  // The client's EventSource will automatically reconnect when the connection closes.

  const sendSnapshot = async () => {
    try {
      // Use cache to prevent hammering the upstream API
      const marketCache = await withCache('snapshot:all', async () => {
        return await fetchAllSnapshots();
      }, TTL.MARKET_LIVE, true);

      // We only care if it's during market hours, but let's just send the data.
      res.write(`data: ${JSON.stringify(marketCache)}\n\n`);
      
      // We flush if supported
      if (res.flush) res.flush();
    } catch (err) {
      console.error('[SSE] Error fetching snapshot:', err.message);
    }
  };

  // Send immediately on connect
  await sendSnapshot();

  // Then send every 15 seconds
  const intervalId = setInterval(sendSnapshot, 15000);

  // Clean up when the connection closes
  req.on('close', () => {
    clearInterval(intervalId);
  });
}
