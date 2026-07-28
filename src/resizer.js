// ============================================================
// RESIZER — Desktop sidebar drag-to-resize
// ============================================================
import { state } from './state.js';

export function initSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.querySelector('.tv-sidebar');
  if (!resizer || !sidebar) return;

  // Restore saved width
  const saved = parseInt(localStorage.getItem('tv_sidebar_width'), 10);
  if (saved && window.innerWidth > 1024 && saved >= 260 && saved <= Math.min(850, window.innerWidth * 0.65)) {
    sidebar.style.width = `${saved}px`;
  }

  let dragging = false;

  resizer.addEventListener('pointerdown', e => {
    if (window.innerWidth <= 1024) return;
    dragging = true;
    resizer.classList.add('is-resizing');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.setPointerCapture(e.pointerId);
  });

  resizer.addEventListener('pointermove', e => {
    if (!dragging || window.innerWidth <= 1024) return;
    const newW   = window.innerWidth - e.clientX - 10;
    const minW   = 260;
    const maxW   = Math.min(850, Math.floor(window.innerWidth * 0.65));
    if (newW >= minW && newW <= maxW) {
      sidebar.style.width = `${newW}px`;
      localStorage.setItem('tv_sidebar_width', newW);
    }
  });

  const stopDrag = e => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('is-resizing');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state.chartInstance) state.chartInstance.resize();
  };

  resizer.addEventListener('pointerup',     stopDrag);
  resizer.addEventListener('pointercancel', stopDrag);
}

// ---- Desktop/Tablet vertical drag-to-resize between Canvas and Detail Table ----
export function initVerticalResizer() {
  const resizer = document.getElementById('main-vertical-resizer');
  const canvasContainer = document.querySelector('.canvas-container');
  const detailWrapper = document.getElementById('detail-table-wrapper');
  const viewWrapper = document.getElementById('bubble-chart-view');

  if (!resizer || !canvasContainer || !detailWrapper || !viewWrapper) return;

  // Restore saved height
  const savedH = parseInt(localStorage.getItem('tv_canvas_height'), 10);
  if (savedH && window.innerWidth > 768 && savedH >= 220 && savedH <= 900) {
    canvasContainer.style.flex = 'none';
    canvasContainer.style.height = `${savedH}px`;
  }

  let dragging = false;
  let startY = 0;
  let startH = 0;

  const startDrag = (e) => {
    if (window.innerWidth <= 768) return; // Disable on small phone screens
    dragging = true;
    resizer.classList.add('is-resizing');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    startY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
    startH = canvasContainer.getBoundingClientRect().height;
    if (e.pointerId && resizer.setPointerCapture) {
      try { resizer.setPointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const onDrag = (e) => {
    if (!dragging || window.innerWidth <= 768) return;
    const currentY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
    const deltaY = currentY - startY;
    const newH = startH + deltaY;
    const parentH = viewWrapper.getBoundingClientRect().height;

    const minH = 220;
    const maxH = Math.max(220, parentH - 160);

    if (newH >= minH && newH <= maxH) {
      canvasContainer.style.flex = 'none';
      canvasContainer.style.height = `${newH}px`;
      localStorage.setItem('tv_canvas_height', Math.round(newH));
      if (state.chartInstance) {
        state.chartInstance.resize();
      }
    }
  };

  const stopDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('is-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (e.pointerId && resizer.releasePointerCapture) {
      try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    if (state.chartInstance) {
      state.chartInstance.resize();
    }
  };

  resizer.addEventListener('pointerdown', startDrag);
  resizer.addEventListener('pointermove', onDrag);
  resizer.addEventListener('pointerup', stopDrag);
  resizer.addEventListener('pointercancel', stopDrag);
}
