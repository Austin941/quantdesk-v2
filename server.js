// server.js — 本地開發伺服器 (重構版)
// 修復：補齊所有 6 個缺失的 API handler
import express from 'express';
import cors    from 'cors';

// ---- 所有 API Handlers ----
import proxyHandler         from './api/_routes/proxy.js';
import closingHandler       from './api/_routes/closing.js';
import chipHandler          from './api/_routes/chip.js';
import marginHandler        from './api/_routes/margin.js';

import klineHandler         from './api/_routes/kline.js';
import banksHandler         from './api/_routes/banks.js';
import branchesHandler      from './api/_routes/branches.js';
import conglomeratesHandler from './api/_routes/conglomerates.js';
import dictionaryHandler    from './api/_routes/dictionary.js';
import drawerDataHandler    from './api/_routes/drawer_data.js';
import stockInfoHandler     from './api/_routes/stock_info.js';
import tdccHandler          from './api/_routes/tdcc.js';
import tdccHistoryHandler   from './api/_routes/tdcc_history.js';
import tdccSyncHandler      from './api/_routes/tdcc-sync.js';
import supplyChainHandler   from './api/_routes/supply_chain.js';
import snapshotHandler      from './api/_routes/snapshot.js';
import marketIndexHandler   from './api/_routes/market_index.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ---- Vercel Request/Response Shim ----
const shim = (handler) => async (req, res) => {
  // Ensure res.status() is chainable (Vercel-compatible)
  const origStatus = res.status.bind(res);
  res.status = (code) => { origStatus(code); return res; };
  try {
    await handler(req, res);
  } catch (err) {
    console.error('[Shim Error]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- Register all routes ----
app.get('/api/proxy',         shim(proxyHandler));
app.get('/api/closing',       shim(closingHandler));
app.get('/api/chip',          shim(chipHandler));
app.get('/api/margin',        shim(marginHandler));

app.get('/api/kline',         shim(klineHandler));
app.get('/api/banks',         shim(banksHandler));
app.get('/api/branches',      shim(branchesHandler));
app.get('/api/conglomerates', shim(conglomeratesHandler));
app.get('/api/dictionary',    shim(dictionaryHandler));
app.get('/api/drawer_data',   shim(drawerDataHandler));
app.get('/api/stock_info',    shim(stockInfoHandler));
app.get('/api/tdcc',          shim(tdccHandler));
app.get('/api/tdcc_history',  shim(tdccHistoryHandler));
app.get('/api/cron/tdcc-sync',shim(tdccSyncHandler));
app.get('/api/supply_chain',  shim(supplyChainHandler));
app.post('/api/snapshot',     shim(snapshotHandler));
app.get('/api/market_index',  shim(marketIndexHandler));

// SPA fallback - disable cache for development
app.use(express.static('.', {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.listen(PORT, () => {
  console.log(`\n🚀 Local Dev Server running at http://localhost:${PORT}`);
  console.log('📡 Available API Endpoints:');
  [
    '/api/proxy?symbols=tse_2330.tw',
    '/api/closing',
    '/api/chip?symbol=2330&days=30',
    '/api/margin?symbol=2330&days=30',
    '/api/kline?symbol=2330&range=3mo&interval=1d',
    '/api/banks',
    '/api/branches?symbol=2330',
    '/api/conglomerates',
    '/api/dictionary',
    '/api/drawer_data?symbol=2330&days=120',
    '/api/stock_info?symbol=2330',
    '/api/tdcc?symbol=2330',
    '/api/tdcc_history?symbol=2330',
    '/api/supply_chain?symbol=2330',
  ].forEach(ep => console.log(`   http://localhost:${PORT}${ep}`));
  console.log('');
});
