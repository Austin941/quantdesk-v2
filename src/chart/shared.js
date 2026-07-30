import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { state } from '../state.js';
import { showBubbleChart, showTechChart } from '../views.js';
import { renderDetailTable } from '../tables.js';
import { setActiveRow } from '../dom.js';

Chart.register(ChartDataLabels, annotationPlugin, zoomPlugin);
Chart.defaults.color       = '#cbd5e1';
Chart.defaults.font.family = 'Inter, sans-serif';

export { Chart, calculateRanksAndAntiCollision };

// ---- HELPER: RANK & ANTI-COLLISION ----
const _collisionCache = new Map();

function calculateRanksAndAntiCollision(dataList, getX, getY, getR) {
  // Generate cache key based on inputs
  // We use raw data values to identify uniqueness for this render cycle
  let cacheKey = '';
  if (dataList.length > 0) {
    const keys = dataList.map(d => {
      const id = d.symbol || d.stock?.['股票代號'] || Math.random();
      const x = getX(d);
      const y = getY(d);
      const r = getR(d);
      return `${id}:${x.toFixed(4)}:${y.toFixed(4)}:${r.toFixed(1)}`;
    });
    // Add thresholds to key to handle slider changes
    cacheKey = `${state.isMacroView}_${state.currentMacroMode}_${state.extremesThreshold}_${keys.join('|')}`;
    
    if (_collisionCache.has(cacheKey)) {
      return _collisionCache.get(cacheKey);
    }
  }

  let pts = dataList.map(d => ({
    rawX: getX(d),
    rawY: getY(d),
    r: getR(d),
    raw: d
  }));

  if (pts.length === 0) return [];
  if (pts.length === 1) {
    pts[0].x = 50; pts[0].y = 50;
    if (cacheKey) _collisionCache.set(cacheKey, pts);
    return pts;
  }

  // 1. Filter if threshold < 50 (e.g. 5~45)
  // ONLY apply for theme mode
  let effectiveThreshold = 100;
  if (state.isMacroView && state.currentMacroMode === 'theme') {
    effectiveThreshold = state.extremesThreshold;
  }

  if (effectiveThreshold < 50) {
    const t = effectiveThreshold;
    let sortedX = [...pts].sort((a, b) => a.rawX - b.rawX);
    sortedX.forEach((p, i) => p.pctX = (i / (pts.length - 1)) * 100);
    
    let sortedY = [...pts].sort((a, b) => a.rawY - b.rawY);
    sortedY.forEach((p, i) => p.pctY = (i / (pts.length - 1)) * 100);

    pts = pts.filter(pt => (pt.pctX <= t || pt.pctX >= 100 - t) && 
                           (pt.pctY <= t || pt.pctY >= 100 - t));
  }

  if (pts.length === 0) return [];
  if (pts.length === 1) { 
    pts[0].x = 50; pts[0].y = 50; 
    if (cacheKey) _collisionCache.set(cacheKey, pts);
    return pts; 
  }

  // 2. Re-Ranking on the filtered subset
  let finalX = [...pts].sort((a, b) => a.rawX - b.rawX);
  finalX.forEach((p, i) => p.x = (i / (pts.length - 1)) * 100);

  let finalY = [...pts].sort((a, b) => a.rawY - b.rawY);
  finalY.forEach((p, i) => p.y = (i / (pts.length - 1)) * 100);

  // 3. Anti-collision on 0-100 scale
  for (let iter = 0; iter < 15; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[i].x - pts[j].x;
        let dy = pts[i].y - pts[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let minDist = (pts[i].r + pts[j].r) / 4.0; // scale factor
        if (dist < minDist && dist > 0) {
          let force = (minDist - dist) / dist * 0.5;
          pts[i].x += dx * force; pts[i].y += dy * force;
          pts[j].x -= dx * force; pts[j].y -= dy * force;
        }
      }
    }
  }

  // Manage cache size to prevent memory leaks over time
  if (_collisionCache.size > 50) {
    const firstKey = _collisionCache.keys().next().value;
    _collisionCache.delete(firstKey);
  }
  
  if (cacheKey) _collisionCache.set(cacheKey, pts);
  return pts;
}
