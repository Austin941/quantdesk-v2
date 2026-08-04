export async function retryFetch(url, opts = {}, retries = 3) {
  let attempt = 0;
  const timeoutMs = opts.timeout || 8000;
  
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      
      const fetchOpts = { ...opts, signal: controller.signal };
      // Before making the request, if there is a preFetch hook, run it (e.g. to swap tokens)
      if (opts.preFetch) await opts.preFetch(fetchOpts, attempt);
      
      const targetUrl = fetchOpts.url || url;
      const res = await fetch(targetUrl, fetchOpts);
      clearTimeout(id);

      if (res.ok) {
        return res;
      }

      if (res.status === 429) {
        // Rate limited
        const retryAfter = res.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, attempt);
        if (attempt === retries) throw new Error(`HTTP 429 Rate Limited (after ${retries} retries)`);
        
        if (opts.onRetry) await opts.onRetry(res, attempt, delay);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }

      if (res.status >= 500) {
        if (attempt === retries) throw new Error(`HTTP ${res.status} (after ${retries} retries)`);
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        
        if (opts.onRetry) await opts.onRetry(res, attempt, delay);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }

      // For 4xx (other than 429) or others, don't retry, just return response or throw
      throw new Error(`HTTP ${res.status} ${res.statusText}`);

    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        if (attempt === retries) throw new Error(`Fetch timeout after ${retries} retries`);
        const delay = 1000 * Math.pow(2, attempt);
        if (opts.onRetry) await opts.onRetry(err, attempt, delay);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }
      
      // Generic network errors
      if (attempt === retries) throw err;
      const delay = 1000 * Math.pow(2, attempt);
      if (opts.onRetry) await opts.onRetry(err, attempt, delay);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
}
