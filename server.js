// server.js — 本地開發伺服器 (重構版)
// 修復：補齊所有 6 個缺失的 API handler
import express from 'express';
import cors    from 'cors';

// ---- 所有 API Handlers ----
import proxyHandler         from './api/proxy.js';
import closingHandler       from './api/closing.js';
import chipHandler          from './api/chip.js';
import marginHandler        from './api/margin.js';
import majorHoldersHandler  from './api/major_holders.js';
import klineHandler         from './api/kline.js';
import banksHandler         from './api/banks.js';
import branchesHandler      from './api/branches.js';
import conglomeratesHandler from './api/conglomerates.js';
import dictionaryHandler    from './api/dictionary.js';

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
app.get('/api/major_holders', shim(majorHoldersHandler));
app.get('/api/kline',         shim(klineHandler));
app.get('/api/banks',         shim(banksHandler));
app.get('/api/branches',      shim(branchesHandler));
app.get('/api/conglomerates', shim(conglomeratesHandler));
app.get('/api/dictionary',    shim(dictionaryHandler));

// SPA fallback
app.use(express.static('.'));

app.listen(PORT, () => {
  console.log(`\n🚀 Local Dev Server running at http://localhost:${PORT}`);
  console.log('📡 Available API Endpoints:');
  [
    '/api/proxy?symbols=tse_2330.tw',
    '/api/closing',
    '/api/chip?symbol=2330&days=30',
    '/api/margin?symbol=2330&days=30',
    '/api/major_holders?symbol=2330&days=30',
    '/api/kline?symbol=2330&range=3mo&interval=1d',
    '/api/banks',
    '/api/branches?symbol=2330',
    '/api/conglomerates',
    '/api/dictionary',
  ].forEach(ep => console.log(`   http://localhost:${PORT}${ep}`));
  console.log('');
});
