// Shared detail-page primitives.
// `eyebrow` — необязательный короткий идентификатор записи (ключ задачи/встречи/
// проекта The Labs вроде «PREM-0002»): читаемое название — то, что человек
// узнаёт задачу по, — остаётся главным заголовком, а ключ — маленькая опорная
// метка над ним, а не наоборот.
function detailPageHeaderHtml({ title, eyebrow, inputId, displayId, shellId, editable, ariaLabel }) {
  return `<header class="task-detail-header"><div class="task-detail-header-copy">${eyebrow ? `<div class="task-detail-kicker">${escapeHtml(eyebrow)}</div>` : ''}<div id="${escapeHtml(shellId || '')}" class="task-inline-edit task-inline-edit-title ${editable ? 'is-editable' : ''}"><div id="${displayId}" class="task-detail-title-display" ${editable ? 'role="button" tabindex="0"' : ''}>${escapeHtml(title || '')}</div><input id="${inputId}" class="task-detail-title" value="${escapeHtml(title || '')}" ${editable ? '' : 'disabled'} aria-label="${escapeHtml(ariaLabel || 'Название')}" hidden />${editable ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit',12)}</span>` : ''}</div></div></header>`;
}

function detailSectionHtml(title, body, extraHead) {
  return `<section class="task-detail-section"><div class="task-detail-section-head"><div class="task-detail-section-label task-detail-section-title">${escapeHtml(title)}</div>${extraHead || ''}</div>${body || ''}</section>`;
}

function detailPropertyHtml({ label, control, className = '' }) {
  return `<div class="task-detail-property ${escapeHtml(className)}"><span>${escapeHtml(label)}</span>${control || ''}</div>`;
}

function detailInlineInputHtml({ id, value = '', editable = true, placeholder = '', type = 'text', linked = false }) {
  if (!editable) return `<span class="task-inline-readonly" id="${escapeHtml(id)}-readonly">${value ? renderLinkedText(value) : `<span class="muted">${escapeHtml(placeholder || '—')}</span>`}</span>`;
  if (linked) return `<span class="task-inline-edit task-inline-edit-linked is-editable" data-linked-inline-shell="${escapeHtml(id)}"><span class="task-inline-linked-display" data-linked-inline-display="${escapeHtml(id)}" role="button" tabindex="0">${value ? renderLinkedText(value) : `<span class="muted">${escapeHtml(placeholder || '—')}</span>`}</span><input id="${escapeHtml(id)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" hidden /><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit',11)}</span></span>`;
  return `<span class="task-inline-edit is-editable"><input id="${escapeHtml(id)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" /><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit',11)}</span></span>`;
}

function detailInlineSelectHtml({ id, value = '', options = [], editable = true, emptyLabel }) {
  const empty = emptyLabel !== undefined ? `<option value="">${escapeHtml(emptyLabel)}</option>` : '';
  return `<span class="task-inline-edit task-inline-select ${editable ? 'is-editable' : ''}"><select id="${escapeHtml(id)}" ${editable ? '' : 'disabled'}>${empty}${options.map((option) => {
    const item = typeof option === 'string' ? { value: option, label: option } : option;
    return `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`;
  }).join('')}</select></span>`;
}

function detailRelationListHtml(items, { empty = 'Связей пока нет', renderItem }) {
  return items?.length ? items.map(renderItem).join('') : `<div class="task-relation-empty">${escapeHtml(empty)}</div>`;
}

function entityDetailHtml({ className = '', header = '', main = '' }) {
  return `<section class="modal-panel modal-task-detail task-detail-page ${escapeHtml(className)}"><div class="task-detail-shell">${header}<div class="task-detail-layout"><main class="task-detail-main">${main}</main></div></div></section>`;
}

function createAutosave(saveFn, options) {
  const opts = options || {};
  const delay = Number(opts.delay ?? 550);
  let timer = null;
  let running = Promise.resolve();
  let queued = false;

  const notify = (state) => { try { opts.onState?.(state); } catch (_) {} };
  const run = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queued) return running;
    queued = false;
    notify('saving');
    const operation = running.catch(() => {}).then(async () => {
      await saveFn();
      notify('saved');
    });
    running = operation.catch(() => {});
    return operation.catch((error) => {
      queued = true;
      notify('error');
      throw error;
    });
  };

  return {
    schedule(immediate = false) {
      queued = true;
      notify('pending');
      if (timer) clearTimeout(timer);
      if (immediate) return run();
      timer = setTimeout(() => { run().catch(() => {}); }, delay);
      return running;
    },
    async flush() {
      if (queued) await run();
      else await running;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      queued = false;
    },
    get pending() { return queued || Boolean(timer); },
  };
}

const DetailAutosave = {
  controller: null,
  set(controller) { this.controller = controller || null; return controller; },
  async flush() { if (this.controller?.flush) await this.controller.flush(); },
  clear() { this.controller?.cancel?.(); this.controller = null; },
};

function bindDetailCommitOnEnter(field, commit, options) {
  if (!field || typeof commit !== 'function') return () => {};
  const opts = options || {};
  const handler = async (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await commit();
      if (opts.blur !== false) field.blur();
    } catch (_) {}
  };
  field.addEventListener('keydown', handler);
  return () => field.removeEventListener('keydown', handler);
}
