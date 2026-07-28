// ============================================================
// DOM HELPERS — Cached element lookups & tbody utilities
// ============================================================

const tbodyCache = new Map();

/**
 * Get a specific period's tbody element by view and day count.
 * Results are cached to avoid repeated querySelector calls.
 */
export function getTbody(viewId, days) {
  const key = `${viewId}_${days}`;
  if (tbodyCache.has(key)) return tbodyCache.get(key);

  const baseIdMap = {
    'view-ranking': 'rankingTableBody',
    'view-theme':   'themeRankingTableBody',
    'view-group':   'groupRankingTableBody',
    'view-radar':   'radarTableBody',
    'view-flow':    'flowTableBody',
  };
  const baseId = baseIdMap[viewId] || viewId;
  const el = document.getElementById(`${baseId}_${days}`);
  if (el) tbodyCache.set(key, el);
  return el;
}

/**
 * Show only the active period tbody, hide all others.
 */
export function switchPeriodTbody(viewId, days) {
  [1, 3, 5, 10, 20].forEach(d => {
    const tbody = getTbody(viewId, d);
    if (tbody) tbody.classList.toggle('hidden', d !== days);
  });
}

/**
 * Highlight (add active-row) and remove from siblings.
 */
export function setActiveRow(tr) {
  if (!tr || !tr.parentElement) return;
  tr.parentElement.querySelectorAll('tr.active-row').forEach(r => r.classList.remove('active-row'));
  tr.classList.add('active-row');
}
