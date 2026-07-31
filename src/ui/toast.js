// ============================================================
// ui/toast.js — Toast 通知（從 api.js 拆出）
// 職責：僅負責顯示短暫通知訊息，不含任何資料邏輯
// ============================================================

let _toastTimeout = null;

/**
 * Show a toast notification
 * @param {string} message
 * @param {'error'|'success'|'info'} type
 */
export function showToast(message, type = 'error') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  }, 5000);
}
