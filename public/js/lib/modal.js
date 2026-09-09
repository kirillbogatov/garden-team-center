// Modal and confirmation primitives.
// ---------------- Overlay / Modal ----------------

// Список элементов внутри контейнера, которые реально могут получить фокус.
// Нужен и модалке, и мобильному drawer, поэтому живёт здесь.
function focusableWithin(root) {
  if (!root) return [];
  const selector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
  ].join(', ');
  return Array.from(root.querySelectorAll(selector)).filter((node) => {
    if (node.hasAttribute('hidden') || node.closest('[hidden]')) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
}

const Modal = {
  root: null,
  _returnFocus: null,
  _dirty: false,
  init() {
    Modal.root = document.getElementById('modal-root');
  },
  panel() {
    return Modal.root?.querySelector('.modal-panel') || null;
  },
  open(innerHtml, opts) {
    opts = opts || {};
    // Куда вернуть фокус после закрытия — обычно это кнопка, которая открыла диалог.
    Modal._returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    Modal._dirty = false;
    const panelClass = opts.panelClass ? ' ' + opts.panelClass : '';
    Modal.root.innerHTML = `<div class="ui-overlay overlay" id="modal-overlay"><div class="ui-modal modal-panel${panelClass}" role="dialog" aria-modal="true" tabindex="-1">${innerHtml}</div></div>`;
    const overlay = document.getElementById('modal-overlay');
    const panel = overlay.querySelector('.modal-panel');

    // Имя диалога берём из его же заголовка, чтобы скринридер объявлял, что открылось.
    const heading = panel.querySelector('h1, h2, h3');
    if (heading) {
      if (!heading.id) heading.id = 'modal-title-' + Math.random().toString(36).slice(2, 8);
      panel.setAttribute('aria-labelledby', heading.id);
    } else if (opts.label) {
      panel.setAttribute('aria-label', opts.label);
    }

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) Modal.requestClose();
    });
    // Любая правка в диалоге включает защиту от закрытия «мимо» кнопки «Сохранить».
    const markDirty = () => {
      Modal._dirty = true;
    };
    panel.addEventListener('input', markDirty);
    panel.addEventListener('change', markDirty);
    document.addEventListener('keydown', Modal._keyHandler);

    if (opts.onMount) opts.onMount(panel);

    // Фокус переносим внутрь диалога — иначе Tab уходит на страницу под оверлеем.
    const candidates = focusableWithin(panel);
    const firstSafe = candidates.find((node) => !node.classList.contains('btn-danger'));
    const initialFocus = opts.initialFocus === 'panel'
      ? panel
      : (panel.querySelector('[autofocus]') || firstSafe || candidates[0] || panel);
    initialFocus.focus({ preventScroll: true });
  },
  requestClose() {
    if (!Modal._dirty) {
      Modal.close();
      return;
    }
    Modal._showUnsavedGuard();
  },
  _showUnsavedGuard() {
    const panel = Modal.panel();
    if (!panel || panel.querySelector('.modal-unsaved')) return;
    const bar = el(`<div class="modal-unsaved" role="alert">
      <span class="modal-unsaved-text">Есть несохранённые изменения.</span>
      <button type="button" class="ui-button ui-button--sm btn btn-sm" data-unsaved="stay">Продолжить</button>
      <button type="button" class="ui-button ui-button--sm btn btn-sm btn-danger" data-unsaved="discard">Закрыть без сохранения</button>
    </div>`);
    panel.appendChild(bar);
    bar.querySelector('[data-unsaved="stay"]').onclick = () => bar.remove();
    bar.querySelector('[data-unsaved="discard"]').onclick = () => Modal.close();
    bar.querySelector('[data-unsaved="stay"]').focus();
  },
  close() {
    Modal.root.innerHTML = '';
    document.removeEventListener('keydown', Modal._keyHandler);
    Modal._dirty = false;
    const back = Modal._returnFocus;
    Modal._returnFocus = null;
    if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
  },
  _keyHandler(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      Modal.requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = Modal.panel();
    if (!panel) return;
    const items = focusableWithin(panel);
    if (!items.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!panel.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },
};

function confirmAction(message, confirmLabel) {
  return new Promise((resolve) => {
    Modal.open(
      `<h2>Подтверждение</h2><p class="muted" style="margin:0 0 4px">${escapeHtml(message)}</p>
       <div class="ui-modal-actions modal-actions">
         <button class="ui-button btn" id="cf-cancel">Отмена</button>
         <button class="ui-button ui-button--danger btn btn-danger-primary" id="cf-ok">${escapeHtml(confirmLabel || 'Удалить')}</button>
       </div>`
    );
    document.getElementById('cf-cancel').onclick = () => {
      Modal.close();
      resolve(false);
    };
    document.getElementById('cf-ok').onclick = () => {
      Modal.close();
      resolve(true);
    };
  });
}

