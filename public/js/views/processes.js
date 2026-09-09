// Процессы — список операционных проблем и detail-страницы процессов.

Views._processFilter = Views._processFilter || 'problems';

// ---------------------------------------------------------------------------
// Data shaping and shared row rendering
// ---------------------------------------------------------------------------

function normalizeProcessRecord(process) {
  const p = { ...(process || {}) };
  p.expectedBehavior = p.expectedBehavior ?? '';
  p.currentBehavior = p.currentBehavior ?? '';
  if (!Array.isArray(p.fixOptions)) p.fixOptions = [];
  p.fixOptions = p.fixOptions.map((option, index) => ({
    id: option.id || `fix_${p.id || 'new'}_${index}_${Date.now().toString(36)}`,
    text: option.text || '',
    status: PROCESS_FIX_STATUS_LABEL[option.status] ? option.status : 'unchecked',
  }));
  return p;
}

function processPath(processOrId) {
  const ref = typeof processOrId === 'string' ? processOrId : processOrId?.id;
  return `/processes/${encodeURIComponent(ref || '')}`;
}

function processStatusBadgeHtml(status) {
  const current = PROCESS_STATUS_LABEL[status] ? status : 'ok';
  const className = current === 'broken' ? 'process-status-broken' : current === 'attention' ? 'process-status-attention' : 'process-status-ok';
  return `<span class="process-status-dot ${className}" aria-hidden="true"></span><span class="process-status-label">${escapeHtml(PROCESS_STATUS_LABEL[current])}</span>`;
}

function processListRowHtml(process) {
  const p = normalizeProcessRecord(process);
  const openIdx = registerAction(() => Router.go(processPath(p)));
  return `<div class="ui-row list-row task-list-row process-list-row" data-action-id="${openIdx}">
    <span class="tl-title">${escapeHtml(p.title || 'Без названия')}</span>
    <div class="tl-right process-list-right">
      <span class="process-list-status">${processStatusBadgeHtml(p.status || 'ok')}</span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

function processListEmptyLabel(filterKey) {
  if (filterKey === 'problems') return 'Проблем нет';
  if (filterKey === 'archived') return 'Архив пуст';
  return 'Процессы ещё не описаны';
}

function processFilterTabsHtml(filters, selected) {
  const tabs = filters.map((filter) => `<button type="button" class="list-tab ${selected.key === filter.key ? 'active' : ''}" role="tab" aria-selected="${selected.key === filter.key}" data-view-state="_processFilter" data-view-value="${filter.key}" data-view-render="processes">${filter.label}</button>`).join('');
  return `<div class="list-tabs" role="tablist" aria-label="Фильтр процессов">${tabs}</div>`;
}

Views.processes = async function () {
  setTopbar(`<h1>Процессы</h1>${Auth.canCreate('processes') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openProcessModal">+ Добавить процесс</button></div>` : ''}`);
  const view = document.getElementById('view');
  const processes = (await Resources.processes.list()).map(normalizeProcessRecord);
  const active = processes.filter((p) => !p.archivedAt);
  const archived = processes.filter((p) => p.archivedAt);

  const filters = [
    { key: 'problems', label: 'Проблемы', items: active.filter((p) => p.status === 'attention' || p.status === 'broken') },
    { key: 'all', label: 'Все', items: active },
    { key: 'archived', label: 'Архив', items: archived },
  ];
  const selected = filters.find((item) => item.key === Views._processFilter) || filters[0];
  const body = selected.items.length ? selected.items.map(processListRowHtml).join('') : emptyState(processListEmptyLabel(selected.key), '', 'processes');

  view.innerHTML = `<div class="view-narrow work-list-page processes-view">
    <div class="work-list-toolbar">${processFilterTabsHtml(filters, selected)}</div>
    <div class="work-list-body">${body}</div>
  </div>`;
};

Views.processDetailPage = async function (ref) {
  const process = normalizeProcessRecord(await Resources.processes.get(ref));
  return renderProcessDetail(process);
};

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function processFixEditorRowHtml(option, index) {
  const statusOptions = Object.entries(PROCESS_FIX_STATUS_LABEL)
    .map(([value, label]) => `<option value="${value}" ${option.status === value ? 'selected' : ''}>${label}</option>`)
    .join('');
  return `<div class="process-fix-editor-row">
    <textarea rows="2" data-new-process-fix-text="${index}" placeholder="Вариант решения">${escapeHtml(option.text || '')}</textarea>
    <select data-new-process-fix-status="${index}">${statusOptions}</select>
    <button type="button" class="ui-button ui-button--ghost btn btn-ghost process-fix-remove" data-new-process-fix-remove="${index}" aria-label="Удалить вариант">×</button>
  </div>`;
}

async function openProcessModal(id) {
  if (id) {
    Router.go(processPath(id));
    return;
  }

  const editable = Auth.canCreate('processes');
  let fixOptions = [];
  const statusSelectOptions = Object.entries(PROCESS_STATUS_LABEL).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  Modal.open(`
    <h2>Новый процесс</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-title">Название процесса</label><input id="pf-title" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-status">Текущий статус</label><select id="pf-status">${statusSelectOptions}</select></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-expected">Как должно работать</label><textarea id="pf-expected" rows="3"></textarea></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-current">Как работает сейчас / какие есть проблемы</label><textarea id="pf-current" rows="3"></textarea></div>
    <div class="ui-field field"><span class="ui-field-label field-label">Как можно починить</span><div id="pf-fixes"></div><button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost" id="pf-add-fix">+ Добавить вариант</button></div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button btn" id="pf-cancel">Отмена</button>${editable ? `<button class="ui-button ui-button--primary btn btn-primary" id="pf-save">Создать</button>` : ''}</div>
  `);

  const renderFixes = () => {
    const wrap = document.getElementById('pf-fixes');
    wrap.innerHTML = fixOptions.map((option, index) => processFixEditorRowHtml(option, index)).join('');
    wrap.querySelectorAll('[data-new-process-fix-text]').forEach((field) => {
      field.oninput = () => { fixOptions[Number(field.dataset.newProcessFixText)].text = field.value; };
    });
    wrap.querySelectorAll('[data-new-process-fix-status]').forEach((field) => {
      field.onchange = () => { fixOptions[Number(field.dataset.newProcessFixStatus)].status = field.value; };
    });
    wrap.querySelectorAll('[data-new-process-fix-remove]').forEach((button) => {
      button.onclick = () => { fixOptions.splice(Number(button.dataset.newProcessFixRemove), 1); renderFixes(); };
    });
  };
  renderFixes();

  document.getElementById('pf-add-fix').onclick = () => {
    fixOptions.push({ id: `fix_${Date.now().toString(36)}`, text: '', status: 'unchecked' });
    renderFixes();
  };
  document.getElementById('pf-cancel').onclick = () => Modal.close();

  if (editable) {
    document.getElementById('pf-save').onclick = async () => {
      const title = document.getElementById('pf-title').value.trim();
      if (!title) {
        toast('Укажите название процесса');
        return;
      }
      const saved = await Resources.processes.create({
        title,
        status: document.getElementById('pf-status').value || 'ok',
        expectedBehavior: document.getElementById('pf-expected').value.trim(),
        currentBehavior: document.getElementById('pf-current').value.trim(),
        fixOptions: fixOptions.filter((option) => option.text.trim()).map((option) => ({ ...option, text: option.text.trim() })),
        archivedAt: null,
      });
      Modal.close();
      toast('Процесс создан');
      Router.go(processPath(saved));
    };
  }
}

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

function processDetailTopbarHtml(p, { canEdit, canDelete, isArchived }) {
  const archiveAction = isArchived
    ? `<button type="button" class="task-actions-menu-item" id="process-restore" role="menuitem">${icon('refresh', 14)} Вернуть из архива</button>`
    : `<button type="button" class="task-actions-menu-item" id="process-archive" role="menuitem">${icon('archive', 14)} В архив</button>`;
  const deleteAction = canDelete
    ? `<button type="button" class="task-actions-menu-item task-actions-menu-item-danger" id="process-delete" role="menuitem">${icon('trash', 14)} Удалить</button>`
    : '';

  return `<h1 class="topbar-h1-key">${escapeHtml(p.processKey || 'PROCESS')}</h1><div class="actions task-detail-topbar-actions"><div class="task-actions-menu-wrap"><button type="button" class="ui-button btn task-detail-topbar-btn" id="process-actions-toggle" aria-haspopup="menu" aria-expanded="false">Действия</button><div class="task-actions-menu" id="process-actions-menu" role="menu" hidden>${canEdit ? archiveAction : ''}${deleteAction}</div></div><button type="button" class="ui-button btn task-detail-topbar-btn" data-command="processDetailGoBack">Назад</button></div>`;
}

async function renderProcessDetail(process) {
  const p = process;
  const canEdit = Auth.canEditItem('processes', p);
  const canDelete = Auth.canDeleteItem('processes', p);
  const isArchived = Boolean(p.archivedAt);
  setTopbar(processDetailTopbarHtml(p, { canEdit, canDelete, isArchived }), { crumbs: [{ label: 'Garden', path: '/overview' }, { label: 'Процессы', path: '/processes' }] });

  const view = document.getElementById('view');
  view.classList.add('task-detail-page-view', 'process-detail-page-view');
  const fixRows = () => p.fixOptions.map((option, index) => processFixRowHtml(option, index, canEdit)).join('');
  view.innerHTML = `<section class="modal-panel modal-task-detail task-detail-page process-detail-page"><div class="task-detail-shell">
    ${detailPageHeaderHtml({ title: p.title, eyebrow: '', inputId: 'process-title', displayId: 'process-title-display', shellId: 'process-title-shell', editable: canEdit, ariaLabel: 'Название процесса' })}
    <div class="task-detail-layout"><main class="task-detail-main process-detail-main">
      <section class="task-detail-section"><div class="task-detail-details-grid"><div class="task-detail-details-column">
        <div class="task-detail-property"><span>Статус</span>${detailInlineSelectHtml({ id: 'process-status', value: p.status || 'ok', editable: canEdit && !isArchived, options: Object.entries(PROCESS_STATUS_LABEL).map(([value, label]) => ({ value, label })) })}</div>
      </div></div></section>
      ${processTextSectionHtml('Как должно работать', 'process-expected', p.expectedBehavior, canEdit && !isArchived)}
      ${processTextSectionHtml('Как работает сейчас / какие есть проблемы', 'process-current', p.currentBehavior, canEdit && !isArchived)}
      <section class="task-detail-section process-fixes-section"><div class="task-detail-section-head"><div class="task-detail-section-label task-detail-section-title">Как можно починить</div>${canEdit && !isArchived ? `<button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost process-add-fix-btn" id="process-add-fix">+ Добавить вариант</button>` : ''}</div><div id="process-fix-list" class="process-fix-list">${fixRows() || `<div class="task-relation-empty">Вариантов пока нет</div>`}</div></section>
    </main></div></div></section>`;

  bindProcessDetailInteractions(p, { canEdit, canDelete, isArchived, renderFixRows: fixRows });
}

function processTextSectionHtml(label, id, value, editable) {
  const body = editable
    ? `<textarea id="${id}" class="task-detail-description process-detail-textarea" rows="4" placeholder="Добавьте описание">${escapeHtml(value || '')}</textarea>`
    : `<div class="task-detail-description formatted-text">${value ? renderLinkedText(value) : '<span class="muted">Не заполнено</span>'}</div>`;
  return `<section class="task-detail-section process-text-section"><div class="task-detail-section-label task-detail-section-title">${escapeHtml(label)}</div>${body}</section>`;
}

function processFixRowHtml(option, index, editable) {
  const status = PROCESS_FIX_STATUS_LABEL[option.status] ? option.status : 'unchecked';
  const body = editable
    ? (() => {
        const statusOptions = Object.entries(PROCESS_FIX_STATUS_LABEL)
          .map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`)
          .join('');
        return `<textarea rows="2" data-process-fix-text="${index}" placeholder="Вариант решения">${escapeHtml(option.text || '')}</textarea><select data-process-fix-status="${index}">${statusOptions}</select><button type="button" class="task-relation-remove process-fix-remove" data-process-fix-remove="${index}" aria-label="Удалить вариант">×</button>`;
      })()
    : `<div class="process-fix-copy">${option.text ? renderLinkedText(option.text) : '<span class="muted">Пустой вариант</span>'}</div><span class="ui-tag badge process-fix-status process-fix-status-${status}">${escapeHtml(PROCESS_FIX_STATUS_LABEL[status])}</span>`;
  return `<div class="process-fix-row" data-process-fix-row="${index}">${body}</div>`;
}

// ---------------------------------------------------------------------------
// Detail page interactions
// ---------------------------------------------------------------------------

function bindProcessActionsMenu() {
  const actionsToggle = document.getElementById('process-actions-toggle');
  const actionsMenu = document.getElementById('process-actions-menu');
  if (!actionsToggle || !actionsMenu) return;

  const wrap = actionsToggle.closest('.task-actions-menu-wrap');
  const setActionsOpen = (open) => {
    actionsMenu.hidden = !open;
    actionsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  actionsToggle.onclick = (event) => {
    event.stopPropagation();
    const open = actionsMenu.hidden;
    setActionsOpen(open);
    if (open) bindOutsideClickClose(wrap, () => setActionsOpen(false));
  };
  actionsMenu.onclick = (event) => event.stopPropagation();
}

// Заголовок и текстовые поля процесса живут на одном автосейве: любое поле
// планирует отложенное сохранение, а blur/Enter форсируют немедленный flush.
function bindProcessTitleAndFieldsAutosave(p, { renderFixRows }) {
  const titleShell = document.getElementById('process-title-shell');
  const titleDisplay = document.getElementById('process-title-display');
  const titleInput = document.getElementById('process-title');

  const startTitleEdit = () => {
    titleDisplay.hidden = true;
    titleInput.hidden = false;
    titleShell.classList.add('is-editing');
    titleInput.focus();
    titleInput.select();
  };
  titleDisplay?.addEventListener('click', startTitleEdit);
  titleDisplay?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startTitleEdit();
    }
  });

  const currentPayload = () => ({
    title: document.getElementById('process-title').value.trim(),
    status: document.getElementById('process-status').value || 'ok',
    expectedBehavior: document.getElementById('process-expected').value.trim(),
    currentBehavior: document.getElementById('process-current').value.trim(),
    fixOptions: p.fixOptions.map((option) => ({ id: option.id, text: String(option.text || '').trim(), status: option.status || 'unchecked' })).filter((option) => option.text),
  });

  let lastSaved = JSON.stringify(currentPayload());
  const save = async () => {
    const payload = currentPayload();
    if (!payload.title) {
      toast('Укажите название процесса');
      return false;
    }
    const serialized = JSON.stringify(payload);
    if (serialized === lastSaved) return true;
    const saved = await Resources.processes.update(p.id, payload);
    Object.assign(p, saved || payload);
    lastSaved = serialized;
    titleDisplay.textContent = payload.title;
    return true;
  };
  const autosave = DetailAutosave.set(createAutosave(save, { delay: 550 }));
  const queueSave = (immediate = false) => autosave.schedule(immediate);
  Router.setLeaveGuard(async () => { await autosave.flush(); return true; }, () => autosave.pending);

  titleInput?.addEventListener('input', () => queueSave(false));
  titleInput?.addEventListener('blur', () => {
    const value = titleInput.value.trim() || p.title;
    titleInput.value = value;
    titleDisplay.textContent = value;
    titleInput.hidden = true;
    titleDisplay.hidden = false;
    titleShell.classList.remove('is-editing');
    queueSave(true);
  });
  titleInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      titleInput.blur();
    }
  });

  ['process-expected', 'process-current'].forEach((id) => {
    const field = document.getElementById(id);
    field?.addEventListener('input', () => queueSave(false));
    field?.addEventListener('blur', () => queueSave(true));
  });
  document.getElementById('process-status')?.addEventListener('change', () => queueSave(true));

  bindProcessFixEditor(p, renderFixRows, queueSave);
}

function bindProcessFixEditor(p, renderFixRows, queueSave) {
  const renderAndBindFixes = () => {
    const wrap = document.getElementById('process-fix-list');
    wrap.innerHTML = renderFixRows() || `<div class="task-relation-empty">Вариантов пока нет</div>`;
    wrap.querySelectorAll('[data-process-fix-text]').forEach((field) => {
      field.oninput = () => { p.fixOptions[Number(field.dataset.processFixText)].text = field.value; queueSave(false); };
      field.onblur = () => queueSave(true);
    });
    wrap.querySelectorAll('[data-process-fix-status]').forEach((field) => {
      field.onchange = () => { p.fixOptions[Number(field.dataset.processFixStatus)].status = field.value; queueSave(true); };
    });
    wrap.querySelectorAll('[data-process-fix-remove]').forEach((button) => {
      button.onclick = () => { p.fixOptions.splice(Number(button.dataset.processFixRemove), 1); renderAndBindFixes(); queueSave(true); };
    });
  };
  renderAndBindFixes();

  document.getElementById('process-add-fix').onclick = () => {
    p.fixOptions.push({ id: `fix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, text: '', status: 'unchecked' });
    renderAndBindFixes();
    document.querySelector('[data-process-fix-text]:last-of-type')?.focus();
  };
}

function bindProcessLifecycleButtons(p, canDelete) {
  const archiveButton = document.getElementById('process-archive');
  if (archiveButton) archiveButton.onclick = () => archiveProcess(p.id);
  const restoreButton = document.getElementById('process-restore');
  if (restoreButton) restoreButton.onclick = () => restoreProcess(p.id);
  const deleteButton = document.getElementById('process-delete');
  if (deleteButton && canDelete) deleteButton.onclick = () => deleteProcess(p.id);
}

function bindProcessDetailInteractions(p, context) {
  const { canEdit, canDelete, isArchived, renderFixRows } = context;
  bindProcessActionsMenu();
  if (canEdit && !isArchived) bindProcessTitleAndFieldsAutosave(p, { renderFixRows });
  bindProcessLifecycleButtons(p, canDelete);
}

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

async function archiveProcess(id) {
  const ok = await confirmAction('Переместить процесс в архив?');
  if (!ok) return;
  await DetailAutosave.flush();
  await Resources.processes.update(id, { archivedAt: new Date().toISOString() });
  toast('Процесс перемещён в архив');
  Router.render();
}

async function restoreProcess(id) {
  await DetailAutosave.flush();
  await Resources.processes.update(id, { archivedAt: null });
  toast('Процесс возвращён из архива');
  Router.render();
}

async function deleteProcess(id) {
  const ok = await confirmAction('Удалить этот процесс без возможности восстановления?');
  if (!ok) return;
  DetailAutosave.clear();
  await Resources.processes.remove(id);
  toast('Процесс удалён');
  Router.go('/processes');
}

function processDetailGoBack() { Router.back(); }

FeatureLoader.register({ openProcessModal, processDetailGoBack });
