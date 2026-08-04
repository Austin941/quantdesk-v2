import express from 'express';
import cors    from 'cors';

// ---- Import moved API Handlers ----
import proxyHandler         from './_routes/proxy.js';
import closingHandler       from './_routes/closing.js';
import chipHandler          from './_routes/chip.js';
import marginHandler        from './_routes/margin.js';
import klineHandler         from './_routes/kline.js';
import banksHandler         from './_routes/banks.js';
import branchesHandler      from './_routes/branches.js';
import conglomeratesHandler from './_routes/conglomerates.js';
import dictionaryHandler    from './_routes/dictionary.js';
import drawerDataHandler    from './_routes/drawer_data.js';
import stockInfoHandler     from './_routes/stock_info.js';
import tdccHandler          from './_routes/tdcc.js';
import tdccHistoryHandler   from './_routes/tdcc_history.js';
import tdccSyncHandler      from './_routes/tdcc-sync.js';
import supplyChainHandler   from './_routes/supply_chain.js';
import pingHandler          from './_routes/ping.js';
import snapshotHandler      from './_routes/snapshot.js';
import marketIndexHandler   from './_routes/market_index.js';

const app = express();

app.use(cors());
app.use(express.json());

// ---- Vercel Request/Response Shim ----
const shim = (handler) => async (req, res) => {
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
app.get('/api/ping',          shim(pingHandler));
app.get('/api/snapshot',      shim(snapshotHandler)); // GET 方式支援 CDN Cache
app.get('/api/market_index',  shim(marketIndexHandler));

export default app;
