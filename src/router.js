// ============================================================
// ROUTER — Multi-URL SPA Hash Router with Back/Forward Support
// 支援 #/stock/2330, #/group/鴻海集團, #/theme/AI伺服器, #/sector/半導體業
// ============================================================

export class Router {
  constructor(routes = {}) {
    this.routes = routes; // { '/stock/:code': handler, '/group/:name': handler, ... }
    this.init();
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());
  }

  // Navigate to path without refreshing page
  navigate(path) {
    if (window.location.hash === `#${path}`) {
      this.handleRoute(); // Force trigger if same hash
    } else {
      window.location.hash = path;
    }
  }

  // Match current hash against registered routes
  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const match = this.matchRoute(pattern, hash);
      if (match) {
        handler(match.params);
        return;
      }
    }

    // Default route fallback
    if (this.routes['*']) {
      this.routes['*']({});
    }
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
