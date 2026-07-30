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
  const chartWidthPixels = typeof window !== 'undefined' ? (window.innerWidth > 768 ? window.innerWidth - 300 : window.innerWidth) : 1200;
  const pixelsPerUnit = Math.max(8, chartWidthPixels / 100);

  let cacheKey = '';
  if (state) {
    const keys = dataList.map(d => {
      const id = d.symbol || d.stock?.['股票代號'] || Math.random();
      const x = getX(d);
      const y = getY(d);
      const r = getR(d);
      return `${id}:${x.toFixed(4)}:${y.toFixed(4)}:${r.toFixed(1)}`;
    });
    // Add thresholds and v2_pixelsPerUnit to key to handle slider changes and force cache bust
    cacheKey = `v2_${state.isMacroView}_${state.currentMacroMode}_${state.extremesThreshold}_${pixelsPerUnit.toFixed(1)}_${keys.join('|')}`;
  }  
  if (_collisionCache.has(cacheKey)) {
    return _collisionCache.get(cacheKey);
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
  const xPos = pts.filter(p => p.rawX >= 0).sort((a,b) => a.rawX - b.rawX);
  const xNeg = pts.filter(p => p.rawX < 0).sort((a,b) => a.rawX - b.rawX);
  
  xPos.forEach((p, i) => p.x = xPos.length > 1 ? 50 + (i / (xPos.length - 1)) * 45 : (xPos.length === 1 ? 72.5 : 50));
  xNeg.forEach((p, i) => p.x = xNeg.length > 1 ? 5 + (i / (xNeg.length - 1)) * 45 : (xNeg.length === 1 ? 27.5 : 5));

  const yPos = pts.filter(p => p.rawY >= 0).sort((a,b) => a.rawY - b.rawY);
  const yNeg = pts.filter(p => p.rawY < 0).sort((a,b) => a.rawY - b.rawY);

  yPos.forEach((p, i) => p.y = yPos.length > 1 ? 50 + (i / (yPos.length - 1)) * 45 : (yPos.length === 1 ? 72.5 : 50));
  yNeg.forEach((p, i) => p.y = yNeg.length > 1 ? 5 + (i / (yNeg.length - 1)) * 45 : (yNeg.length === 1 ? 27.5 : 5));

  // 3. Anti-collision on 0-100 scale
  for (let iter = 0; iter < 25; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[i].x - pts[j].x;
        let dy = pts[i].y - pts[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let minDist = (pts[i].r + pts[j].r) / pixelsPerUnit; // Dynamic mapping of pixel radius to 0-100 units
        if (dist < minDist && dist > 0) {
          let force = (minDist - dist) / dist * 0.5;
          pts[i].x += dx * force; pts[i].y += dy * force;
          pts[j].x -= dx * force; pts[j].y -= dy * force;
        }
      }
    }
    // Constrain to quadrants INSIDE the loop so bubbles slide along the wall to separate
    pts.forEach(pt => {
      const minX = pt.rawX >= 0 ? 50 : 5;
      const maxX = pt.rawX >= 0 ? 95 : 50;
      const minY = pt.rawY >= 0 ? 50 : 5;
      const maxY = pt.rawY >= 0 ? 95 : 50;
      
      pt.x = Math.max(minX, Math.min(maxX, pt.x));
      pt.y = Math.max(minY, Math.min(maxY, pt.y));
    });
  }

  // Manage cache size to prevent memory leaks over time
  if (_collisionCache.size > 50) {
    const firstKey = _collisionCache.keys().next().value;
    _collisionCache.delete(firstKey);
  }
  
  if (cacheKey) _collisionCache.set(cacheKey, pts);
  return pts;
}
