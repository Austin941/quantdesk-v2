// ============================================================
// SMART ROUTER — Low-Overhead Multi-URL SPA Router with SWR Cache
// 具備 Smart Push/Replace, SWR 記憶體快取, Fallback Guard 與 Scroll Restorer
// ============================================================

export class SmartRouter {
  constructor(options = {}) {
    this.routes = options.routes || {};
    this.swrCache = new Map(); // SWR Memory Cache (TTL: 30s)
    this.scrollPositions = new Map(); // Scroll Restorer
    this.currentHash = '';
    this.init();
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());
    
    // Save scroll position before route change
    window.addEventListener('beforeunload', () => this.saveScrollPosition());
  }

  saveScrollPosition() {
    if (this.currentHash) {
      this.scrollPositions.set(this.currentHash, {
        x: window.scrollX,
        y: window.scrollY
      });
    }
  }

  restoreScrollPosition(hash) {
    const pos = this.scrollPositions.get(hash);
    if (pos) {
      window.scrollTo(pos.x, pos.y);
    }
  }

  // Navigate with Smart Push vs Replace (Avoids History Bloat)
  navigate(path, options = {}) {
    const targetHash = `#${path}`;
    const isReplace = options.replace || false;

    if (window.location.hash === targetHash) {
      this.handleRoute();
    } else {
      if (isReplace) {
        window.history.replaceState(null, '', targetHash);
        this.handleRoute();
      } else {
        window.location.hash = path;
      }
    }
  }

  // SWR Cache Fetcher (Low Online Server Overhead)
  async fetchWithSWR(key, fetcher, ttlMs = 30000) {
    const cached = this.swrCache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp < ttlMs)) {
      return cached.data; // Return instantly from memory!
    }

    try {
      const freshData = await fetcher();
      this.swrCache.set(key, { data: freshData, timestamp: now });
      return freshData;
    } catch (err) {
      return cached ? cached.data : null; // Fallback to stale if network fails
    }
  }

  handleRoute() {
    this.saveScrollPosition();
    const hash = window.location.hash.slice(1) || '/';
    this.currentHash = hash;

    let matched = false;
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const match = this.matchRoute(pattern, hash);
      if (match) {
        handler(match.params);
        matched = true;
        break;
      }
    }

    // Fallback Exception Guard (Prevents Blank Screen)
    if (!matched && this.routes['*']) {
      this.routes['*']({});
    }

    // Restore scroll after DOM updates
    requestAnimationFrame(() => this.restoreScrollPosition(hash));
  }

  matchRoute(pattern, path) {
    const patternSegments = pattern.split('/').filter(Boolean);
    const pathSegments = path.split('/').filter(Boolean);

    if (patternSegments.length !== pathSegments.length) return null;

    const params = {};
    for (let i = 0; i < patternSegments.length; i++) {
      if (patternSegments[i].startsWith(':')) {
        const paramName = patternSegments[i].slice(1);
        params[paramName] = decodeURIComponent(pathSegments[i]);
      } else if (patternSegments[i] !== pathSegments[i]) {
        return null;
      }
    }
    return { params };
  }
}
