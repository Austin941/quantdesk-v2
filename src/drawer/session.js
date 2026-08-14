// ============================================================
// drawer/session.js — Drawer 抽屜資料快取與 API 管理模組
// 職責：負責 Session 快取生命週期、靜態資料取得與資本額查詢
// ============================================================
import { dState } from './state.js';

export function clearSessionCache() {
  Object.keys(dState._sessionCache).forEach(k => {
    dState._sessionCache[k] = null;
  });
}

export async function fetchStaticJson(type, dateStr) {
  if (!dateStr) return null;
  const yyyymmdd = dateStr.replace(/-/g, '');
  if (dState.staticDataCache[type]?.[yyyymmdd] !== undefined) {
    return dState.staticDataCache[type][yyyymmdd];
  }
  try {
    const res = await fetch(`./data/${type}/${yyyymmdd}.json`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    if (!dState.staticDataCache[type]) dState.staticDataCache[type] = {};
    dState.staticDataCache[type][yyyymmdd] = data;
    return data;
  } catch (e) {
    if (!dState.staticDataCache[type]) dState.staticDataCache[type] = {};
    dState.staticDataCache[type][yyyymmdd] = null;
    return null;
  }
}

export async function fetchStockCompleteJson(symbol) {
  if (!symbol) return null;
  const cleanSym = symbol.replace('.TW', '').replace('.TWO', '');
  if (dState._sessionCache.symbol === symbol && dState._sessionCache.stockJson) {
    return dState._sessionCache.stockJson;
  }
  try {
    const staticUrl = `https://raw.githubusercontent.com/Austin941/bubble-chart-2/master/data/stocks/${cleanSym}.json`;
    const res = await fetch(staticUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (dState._sessionCache.symbol === symbol) {
      dState._sessionCache.stockJson = data;
    }
    return data;
  } catch (e) {
    return null;
  }
}

export async function fetchDrawerData(symbol, days = 120) {
  if (dState._sessionCache.symbol === symbol && dState._sessionCache.drawerRes) {
    return dState._sessionCache.drawerRes;
  }
  try {
    const res = await fetch(`/api/drawer_data?symbol=${encodeURIComponent(symbol)}&days=${days}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success) {
      dState._sessionCache.drawerRes = data;
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[DrawerData] Failed to fetch drawer data:', err);
    return null;
  }
}

export async function fetchAndSetCapital(symbol) {
  const el = document.getElementById('drw-capital-badge');
  if (!el) return;

  // Return immediately if already fetched this session
  if (dState._sessionCache.stockInfo) {
    applyCapitalBadge(el, dState._sessionCache.stockInfo);
    return;
  }

  try {
    const info = await fetch(`/api/stock_info?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .catch(() => null);
    if (info && info.success) {
      dState._sessionCache.stockInfo = info;
      applyCapitalBadge(el, info);
    } else {
      el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
    }
  } catch (e) {
    el.innerHTML = `資本額 暫無資料 <span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">無法取得</span>`;
  }
}

export function applyCapitalBadge(el, info) {
  const sc = {
    large: { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.3)',  label: '🔴 大型股' },
    mid:   { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', border: 'rgba(234,179,8,0.3)',   label: '🟡 中型股' },
    small: { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', border: 'rgba(34,197,94,0.3)',   label: '🟢 小型股' },
  }[info.sizeCode] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)', label: '' };
  el.innerHTML = `資本額 ${info.capitalDisplay} <span style="background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};padding:1px 5px;border-radius:4px;margin-left:2px;font-size:0.7rem;font-weight:600;white-space:nowrap">${sc.label}</span>`;
  el.style.color = '#94a3b8';
  el.style.fontSize = '0.75rem';
}
