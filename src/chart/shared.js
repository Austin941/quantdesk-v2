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

  // 2. True Value Mapping (Anchor points)
  let maxX = 0, minX = 0, maxY = 0, minY = 0;
  pts.forEach(p => {
    if (p.rawX > maxX) maxX = p.rawX;
    if (p.rawX < minX) minX = p.rawX;
    if (p.rawY > maxY) maxY = p.rawY;
    if (p.rawY < minY) minY = p.rawY;
  });

  // Map to 5~45 and 55~95 to leave the center (50) and edges (0, 100) with margin
  pts.forEach(p => {
    // Anchor X
    if (p.rawX >= 0) {
      p.anchorX = maxX === 0 ? 75 : 55 + (p.rawX / maxX) * 40;
    } else {
      p.anchorX = minX === 0 ? 25 : 45 - (p.rawX / minX) * 40;
    }
    // Anchor Y
    if (p.rawY >= 0) {
      p.anchorY = maxY === 0 ? 75 : 55 + (p.rawY / maxY) * 40;
    } else {
      p.anchorY = minY === 0 ? 25 : 45 - (p.rawY / minY) * 40;
    }
    
    // Initial position
    p.x = p.anchorX;
    p.y = p.anchorY;
  });

  // 3. Apple Spring Collision & Force Layout
  const iterations = 80; // Smooth physics convergence
  const alpha = 0.7;     // Cooling factor
  for (let iter = 0; iter < iterations; iter++) {
    const currentAlpha = alpha * (1 - iter / iterations);
    
    // Repulsive Force (Anti-collision)
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[i].x - pts[j].x;
        let dy = pts[i].y - pts[j].y;
        
        // Break perfect symmetry to prevent grid/column forming
        if (dx === 0 && dy === 0) {
          dx = (Math.random() - 0.5) * 0.1;
          dy = (Math.random() - 0.5) * 0.1;
        }

        let dist = Math.sqrt(dx * dx + dy * dy);
        let minDist = ((pts[i].r + pts[j].r) / pixelsPerUnit) + 1.2; // Extra padding for breathing room
        
        if (dist < minDist && dist > 0) {
          let force = (minDist - dist) / dist * 0.5 * currentAlpha;
          pts[i].x += dx * force; pts[i].y += dy * force;
          pts[j].x -= dx * force; pts[j].y -= dy * force;
        }
      }
    }
    
    // Anchor Force (Gravity) & Soft Boundary
    pts.forEach(pt => {
      pt.x += (pt.anchorX - pt.x) * 0.1 * currentAlpha;
      pt.y += (pt.anchorY - pt.y) * 0.1 * currentAlpha;
      
      // Soft boundaries: keep within chart viewport, no rigid quadrant walls
      pt.x = Math.max(2, Math.min(98, pt.x));
      pt.y = Math.max(2, Math.min(98, pt.y));
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
