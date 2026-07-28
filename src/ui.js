// src/ui.js

/**
 * Perform a Delta Update on a table body to prevent full DOM re-renders.
 * It matches rows by a unique ID (e.g., sector name or stock symbol) and updates
 * only the cells that have changed. It also handles reordering rows smoothly.
 * 
 * @param {HTMLElement} tbody - The table body element
 * @param {Array} data - The sorted array of data objects
 * @param {Function} getRowId - Function that takes a data object and returns a unique ID string
 * @param {Function} updateRow - Function that takes a tr element and a data object, and updates the tr's content
 */
const renderQueue = new Map();

export function updateTableDelta(tbody, data, getRowId, updateRow) {
  // Cancel any pending progressive render for this specific table body
  if (renderQueue.has(tbody)) {
    cancelAnimationFrame(renderQueue.get(tbody));
    renderQueue.delete(tbody);
  }

  const existingRows = Array.from(tbody.children);
  const rowMap = new Map();
  
  // Map existing rows by their data-id
  existingRows.forEach(tr => {
    if (tr.getAttribute('data-ignore') === 'true') {
      return; // Keep ignored rows
    }
    const id = tr.getAttribute('data-id');
    if (id) {
      rowMap.set(id, tr);
    } else {
      // Remove placeholder rows (like "Loading...")
      tbody.removeChild(tr);
    }
  });

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const id = getRowId(d);
    let tr = rowMap.get(id);

    if (!tr) {
      tr = document.createElement('tr');
      tr.setAttribute('data-id', id);
      tbody.appendChild(tr);
    } else {
      rowMap.delete(id);
    }

    if (tbody.children[i] !== tr) {
      tbody.insertBefore(tr, tbody.children[i]);
    }

    updateRow(tr, d, i);
  }

  // Finished all data, remove any remaining rows that are no longer in the data
  rowMap.forEach(tr => {
    tbody.removeChild(tr);
  });
}

/**
 * Triggers a flash animation on an element if the new value differs from the old value.
 * @param {HTMLElement} tr - The table row element
 * @param {string|number} oldValue - The previous value (e.g. price or amount)
 * @param {string|number} newValue - The new value
 */
export function triggerFlashIfChanged(tr, oldValue, newValue) {
  if (oldValue !== null && oldValue !== undefined && newValue !== undefined && String(oldValue) !== String(newValue)) {
    requestAnimationFrame(() => {
      tr.classList.remove('flash-up', 'flash-down');
      if (Number(newValue) > Number(oldValue)) {
        tr.classList.add('flash-up');
      } else {
        tr.classList.add('flash-down');
      }
      
      setTimeout(() => {
        tr.classList.remove('flash-up', 'flash-down');
      }, 1000);
    });
  }
}
