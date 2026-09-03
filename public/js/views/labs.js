// The Labs — проекты сотрудников и связанные с ними идеи.

Views._labTypeFilter = Views._labTypeFilter || 'all';
Views._labAuthorFilter = Views._labAuthorFilter || 'all';
Views._labsTab = Views._labsTab || 'ideas';
Views._labOnlyUnassignedIdeas = Views._labOnlyUnassignedIdeas !== false;

function labProgress(status) {
  return LAB_PROGRESS[status] ?? 15;
}

Views.labs = async function () {
  
  const requestedTab = Router.queryParam('tab');
  if (requestedTab === 'ideas' || requestedTab === 'projects') Views._labsTab = requestedTab;
  const isIdeas = Views._labsTab === 'ideas';
  setTopbar(`<h1>The Labs</h1>${Auth.canCreate('labs') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="${isIdeas ? 'openLabIdeaModal' : 'openLabModal'}">${isIdeas ? '+ Добавить идею' : '+ Создать проект'}</button></div>` : ''}`);
  const view = document.getElementById('view');
  view.classList.add('labs-page-view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const allItems = (await Resources.labs.list()).sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  Views._theLabsProjects = allItems.filter((lab) => lab.entityType !== 'idea');
  let items = allItems.filter((lab) => isIdeas ? lab.entityType === 'idea' : lab.entityType !== 'idea');
  if (!isIdeas && Views._labTypeFilter !== 'all') items = items.filter((lab) => (lab.projectType || 'pet') === Views._labTypeFilter);
  if (Views._labAuthorFilter !== 'all') items = items.filter((lab) => lab.authorId === Views._labAuthorFilter);
  if (isIdeas && Views._labOnlyUnassignedIdeas) items = items.filter((idea) => !idea.labProjectId);
  view.innerHTML = `<div class="labs-page view-narrow">
    <div class="list-tabs labs-section-tabs" role="tablist" aria-label="Раздел The Labs">
      <button type="button" class="list-tab ${isIdeas ? 'active' : ''}" role="tab" aria-selected="${isIdeas}" data-route="/labs?tab=ideas">Идеи</button>
      <button type="button" class="list-tab ${!isIdeas ? 'active' : ''}" role="tab" aria-selected="${!isIdeas}" data-route="/labs?tab=projects">Проекты The Labs</button>
    </div>
    <div class="labs-sticky-toolbar">
      <div class="labs-filter-controls">
        ${!isIdeas ? `<select id="labs-type-filter" class="task-filter-select" aria-label="Фильтр по типу">
          <option value="all" ${Views._labTypeFilter === 'all' ? 'selected' : ''}>Все типы</option>
          ${Object.entries(LAB_TYPE_LABEL).map(([value,label]) => `<option value="${value}" ${Views._labTypeFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>` : ''}
        <select id="labs-author-filter" class="task-filter-select task-filter-person" aria-label="Фильтр по автору">
          <option value="all" ${Views._labAuthorFilter === 'all' ? 'selected' : ''}>Все сотрудники</option>
          ${store.team().map((person) => `<option value="${person.id}" ${Views._labAuthorFilter === person.id ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join('')}
        </select>
        ${isIdeas ? `<label class="task-dense-toggle labs-unassigned-toggle"><input id="labs-unassigned-filter" type="checkbox" ${Views._labOnlyUnassignedIdeas ? 'checked' : ''}/> Только задачи без проектов</label>` : ''}
      </div>
    </div>
    <p class="labs-intro">${isIdeas ? 'Идеи команды. Идея может существовать отдельно или быть прикреплена к проекту The Labs.' : 'Экспериментальные проекты команды — от идеи до готового результата.'}</p>
    ${items.length ? `<div class="labs-list ${isIdeas ? 'labs-ideas-list task-list-unified' : ''}">${items.map(isIdeas ? labIdeaRowHtml : labRowHtml).join('')}</div>` : `<div class="zen-empty">${isIdeas ? 'Идей пока нет' : 'Проектов не найдено'}</div>`}
  </div>`;
  const unassignedFilter = document.getElementById('labs-unassigned-filter');
  if (unassignedFilter) unassignedFilter.onchange = (e) => { Views._labOnlyUnassignedIdeas = e.target.checked; Views.labs(); };
  const typeFilter = document.getElementById('labs-type-filter');
  if (typeFilter) typeFilter.onchange = (e) => { Views._labTypeFilter = e.target.value; Views.labs(); };
  document.getElementById('labs-author-filter').onchange = (e) => { Views._labAuthorFilter = e.target.value; Views.labs(); };
};

function labIdeaRowHtml(idea) {
  const author = store.person(idea.authorId);
  const project = (Views._theLabsProjects || []).find((item) => item.id === idea.labProjectId);
  const editIdx = registerAction(() => openLabIdeaModal(idea));
  const title = idea.title || idea.description || 'Без названия';
  return `<div class="ui-row list-row task-list-row labs-idea-row" data-action-id="${editIdx}">
    <span class="task-status-icon task-status-todo" aria-hidden="true">${TASK_STATUS_SYMBOL.todo || '○'}</span>
    <span class="tl-title">${escapeHtml(title)}</span>
    <div class="tl-right">
      ${project ? `<span class="ui-tag badge lab-type-badge">${escapeHtml(project.title || 'Без названия')}</span>` : ''}
      ${author ? `<div class="task-assignee-cell">${personAvatarLinkHtml(author)}</div>` : ''}
    </div>
  </div>`;
}

async function openLabIdeaModal(existing, opts) {
  opts = opts || {};
  const idea = existing || { labProjectId: opts.labProjectId || null };
  if (!Array.isArray(Views._theLabsProjects)) {
    try {
      const all = await Resources.labs.list();
      Views._theLabsProjects = all.filter((item) => item.entityType !== 'idea');
    } catch (_) {
      Views._theLabsProjects = [];
    }
  }
  const editable = canEditLab(idea);
  const defaultAuthorId = idea.authorId || Auth.user?.personId || '';
  const value = { ...idea, authorId: defaultAuthorId };
  const schema = [
    { key: 'title', label: 'Название', type: 'text', trim: true },
    { key: 'description', label: 'Описание', type: 'textarea', rows: 6, trim: true },
    { key: 'authorId', label: 'Автор', type: 'select', emptyLabel: '—', options: () => store.team().map((person) => ({ value: person.id, label: person.name })), parse: (v) => v || null },
    { key: 'labProjectId', label: 'Проект The Labs', type: 'select', emptyLabel: 'Без проекта', options: () => (Views._theLabsProjects || []).filter((item) => item.entityType !== 'idea').map((project) => ({ value: project.id, label: project.title || 'Без названия' })), parse: (v) => v || null, hint: 'Идея может существовать отдельно или быть связана с существующим проектом.' },
  ];
  EntityForm.open({
    title: existing ? (editable ? 'Редактировать идею' : 'Идея') : 'Новая идея',
    mode: existing ? 'edit' : 'create',
    value,
    schema,
    editable,
    validate: (payload) => {
      if (!payload.title && !payload.description) return 'Добавьте название или описание идеи';
      if (!payload.authorId) return 'Укажите автора';
      return '';
    },
    onSave: async (payload) => {
      payload.entityType = 'idea';
      if (!payload.title) payload.title = payload.description.slice(0, 80);
      if (existing) await Resources.labs.update(idea.id, payload); else await Resources.labs.create(payload);
      Modal.close();
      toast('Идея сохранена');
      if (location.pathname.startsWith('/labs/')) Router.render(); else Views.labs();
    },
    onDelete: existing && editable ? async () => {
      const ok = await confirmAction('Удалить идею?');
      if (!ok) return;
      await Resources.labs.remove(idea.id);
      Modal.close();
      toast('Идея удалена');
      if (location.pathname.startsWith('/labs/')) Router.render(); else Views.labs();
    } : null,
  });
}

function labStatusIconHtml(status, lab) {
  const taskStatus = LAB_TASK_STATUS[status] || 'todo';
  const symbol = TASK_STATUS_SYMBOL[taskStatus] ?? '○';
  const label = LAB_STATUS_LABEL[status] || status || 'Идея';
  if (!lab || !canEditLab(lab)) {
    return `<span class="task-status-icon task-status-${taskStatus}" aria-label="${escapeHtml(label)}">${symbol}</span>`;
  }
  const idx = registerAction((event) => openLabStatusMenu(event, lab));
  return `<span class="task-status-icon task-status-${taskStatus} task-status-interactive" role="button" tabindex="0" aria-label="Изменить статус: ${escapeHtml(label)}" data-action-id="${idx}" data-action-stop="1">${symbol}</span>`;
}

function labStatusHtml(status, lab) {
  const label = LAB_STATUS_LABEL[status] || status || 'Идея';
  return `${labStatusIconHtml(status, lab)}<span>${escapeHtml(label)}</span>`;
}

let _labStatusMenu = null;
let _labStatusOutside = null;
let _labStatusKey = null;

function closeLabStatusMenu() {
  if (_labStatusMenu) _labStatusMenu.remove();
  _labStatusMenu = null;
  if (_labStatusOutside) document.removeEventListener('mousedown', _labStatusOutside, true);
  if (_labStatusKey) document.removeEventListener('keydown', _labStatusKey, true);
  _labStatusOutside = null;
  _labStatusKey = null;
}

function openLabStatusMenu(event, lab) {
  closeLabStatusMenu();
  if (!lab || !canEditLab(lab)) return;
  const eventTarget = event?.target;
  const anchor = eventTarget?.closest?.('.task-status-interactive') || null;
  if (!anchor) return;
  const menu = document.createElement('div');
  menu.className = 'task-status-menu lab-status-menu';
  menu.setAttribute('role','menu');
  menu.innerHTML = Object.keys(LAB_STATUS_LABEL).map((status) => {
    const taskStatus = LAB_TASK_STATUS[status] || 'todo';
    const symbol = TASK_STATUS_SYMBOL[taskStatus] ?? '○';
    const active = status === (lab.status || 'idea');
    return `<button type="button" class="task-status-menu-item ${active ? 'active' : ''}" role="menuitemradio" aria-checked="${active}" data-status="${status}">
      <span class="task-status-icon task-status-${taskStatus}" aria-hidden="true">${symbol}</span>
      <span class="task-status-menu-label">${escapeHtml(LAB_STATUS_LABEL[status])}</span>
      ${active ? '<span class="task-status-menu-check">✓</span>' : ''}
    </button>`;
  }).join('');
  document.body.appendChild(menu);
  _labStatusMenu = menu;
  const rect = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let left = rect.left, top = rect.bottom + 7;
  if (left + mr.width > window.innerWidth - 10) left = window.innerWidth - mr.width - 10;
  if (top + mr.height > window.innerHeight - 10) top = Math.max(10, rect.top - mr.height - 7);
  menu.style.left = `${Math.max(10,left)}px`;
  menu.style.top = `${Math.max(10,top)}px`;
  menu.querySelectorAll('.task-status-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const status = item.dataset.status;
      if (!status || status === (lab.status || 'idea')) { closeLabStatusMenu(); return; }
      menu.classList.add('is-saving');
      try {
        if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
        await Resources.labs.update(lab.id, { status });
        closeLabStatusMenu();
        toast(`Статус: ${LAB_STATUS_LABEL[status]}`);
        await store.loadAll();
        await Router.render();
      } catch (err) {
        console.error(err);
        menu.classList.remove('is-saving');
        toast('Не удалось изменить статус');
      }
    });
  });
  _labStatusOutside = (e) => { if (!_labStatusMenu?.contains(e.target) && e.target !== anchor) closeLabStatusMenu(); };
  _labStatusKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeLabStatusMenu(); anchor.focus?.(); } };
  setTimeout(() => document.addEventListener('mousedown', _labStatusOutside, true), 0);
  document.addEventListener('keydown', _labStatusKey, true);
}

function normalizeLabLinks(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const seen = new Set();
  return raw.map((v) => String(v || '').trim()).filter((url) => {
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function labLinkLabel(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch (_) {
    return url;
  }
}

function labRowHtml(lab) {
  const author = store.person(lab.authorId);
  const idx = registerAction(() => Router.go(`/labs/${encodeURIComponent(lab.labKey || lab.id)}`));
  const links = normalizeLabLinks(lab.links);
  const progress = labProgress(lab.status || 'idea');
  const typeLabel = LAB_TYPE_LABEL[lab.projectType || 'pet'] || 'Другое';
  return `<div class="ui-surface card lab-card clickable" data-action-id="${idx}">
    <div class="lab-card-main">
      <div class="lab-card-copy">
        <div class="lab-card-head"><div class="lab-card-title">${escapeHtml(lab.title || 'Без названия')}</div>${lab.labKey ? `<span class="tiny lab-card-key">${escapeHtml(lab.labKey)}</span>` : ''}</div>
        ${lab.description ? `<div class="tiny lab-card-description formatted-text">${escapeHtml(lab.description)}</div>` : ''}
        <div class="lab-card-meta">
          <div class="lab-card-status">${labStatusHtml(lab.status || 'idea', lab)}</div>
          ${lab.private ? `<span class="lab-private-meta" title="Приватный проект">${icon('eyeOff', 12)} Приватный</span>` : ''}
          ${author ? `<span class="lab-row-author">${personAvatarLinkHtml(author)}<span>${escapeHtml(author.name)}</span><span class="ui-tag badge lab-type-badge">${escapeHtml(typeLabel)}</span></span>` : `<span class="ui-tag badge lab-type-badge">${escapeHtml(typeLabel)}</span>`}
          ${links.length ? `<span class="lab-row-links">${links.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-stop-propagation="1">${escapeHtml(labLinkLabel(url))}</a>`).join('')}</span>` : ''}
        </div>
      </div>
      <div class="lab-card-tree" aria-hidden="true">${goalTreeHtml(progress, 'compact', lab.id)}</div>
    </div>
  </div>`;
}

function canEditLab(lab) {
  return !lab ? Auth.canCreate('labs') : Auth.canEditItem('labs', lab);
}

function openLabModal(existing) {
  const isEdit = Boolean(existing);
  const lab = existing || {};
  const editable = canEditLab(lab);
  const authors = store.team();
  const value = {
    ...lab,
    title: lab.title || '',
    description: lab.description || '',
    links: normalizeLabLinks(lab.links).join('\n'),
    authorId: lab.authorId || Auth.user?.personId || '',
    projectType: lab.projectType || 'pet',
    private: Boolean(lab.private),
    status: lab.status || 'idea',
  };
  const schema = [
    { key: 'title', label: 'Название', type: 'text', trim: true },
    { key: 'description', label: 'Описание', type: 'textarea', rows: 5, trim: true },
    { key: 'links', label: 'Ссылки', type: 'textarea', rows: 3, placeholder: 'https://…\nПо одной ссылке на строку', hint: 'По одной ссылке на строку', parse: normalizeLabLinks },
    { key: 'projectType', label: 'Тип проекта', type: 'select', options: Object.entries(LAB_TYPE_LABEL).map(([value,label]) => ({ value, label })) },
    { key: 'private', label: 'Доступ', type: 'checkbox', checkboxLabel: 'Приватный проект', hint: 'Виден только автору, тимлидам и администраторам.' },
    { key: 'authorId', label: 'Автор', type: 'select', emptyLabel: '—', options: authors.map((person) => ({ value: person.id, label: person.name })) },
    { key: 'status', label: 'Статус', type: 'select', options: Object.entries(LAB_STATUS_LABEL).map(([value,label]) => ({ value, label })) },
  ];

  EntityForm.open({
    title: isEdit ? (editable ? 'Редактировать проект The Labs' : 'Проект The Labs') : 'Новый проект The Labs',
    mode: isEdit ? 'edit' : 'create',
    value,
    schema,
    editable,
    validate(payload) {
      if (!payload.title) return 'Укажите название проекта The Labs';
      if (!payload.authorId) return 'Укажите автора';
      return '';
    },
    async onSave(payload) {
      if (isEdit) await Resources.labs.update(lab.id, payload);
      else await Resources.labs.create(payload);
      Modal.close();
      toast('Сохранено');
      Views.labs();
    },
    onDelete: isEdit && editable ? async () => {
      const ok = await confirmAction('Удалить проект The Labs?');
      if (!ok) return;
      await Resources.labs.remove(lab.id);
      Modal.close();
      toast('Проект The Labs удалён');
      Views.labs();
    } : null,
  });
}


Views.labDetail = async function (ref) {
  
  const { lab, ideas, comments } = await LabService.detail(ref);
  if (lab.entityType === 'idea') { Router.go('/labs?tab=ideas'); return; }
  if (lab.labKey && String(ref || '').toUpperCase() !== String(lab.labKey).toUpperCase()) {
    Router.replace(`/labs/${encodeURIComponent(lab.labKey)}`);
  }

  const editable = canEditLab(lab);
  const authors = store.team();
  const progress = labProgress(lab.status || 'idea');
  const hasActions = true;

  // /labs/:key само по себе не отличает «Идею» от проекта The Labs (только
  // ?tab= в ссылках меню это делает) — но выше по коду страница уже увела
  // идеи на /labs?tab=ideas, так что здесь lab всегда проект The Labs. Крошки
  // передаём явно, а не через автоматический резолвер по пути.
  setTopbar(`<h1 class="topbar-h1-key">${escapeHtml(lab.labKey || '')}</h1>
    <div class="actions task-detail-topbar-actions">
      ${hasActions ? `<div class="task-actions-menu-wrap">
        <button type="button" class="ui-button btn task-detail-topbar-btn" id="lab-actions-toggle" aria-haspopup="menu" aria-expanded="false">Действия</button>
        <div class="task-actions-menu" id="lab-actions-menu" role="menu" hidden>
          <button type="button" class="task-actions-menu-item" id="lab-version-history" role="menuitem">${icon('clock',14)} История версий</button>
          ${editable ? `<button type="button" class="task-actions-menu-item task-actions-menu-item-danger" id="lab-detail-delete" role="menuitem">${icon('trash',14)} Удалить</button>` : ''}
        </div>
      </div>` : ''}
      <button type="button" class="ui-button btn task-detail-topbar-btn" data-router-back>Назад</button>
    </div>
  `, { crumbs: [
    { label: 'Garden', path: '/overview' },
    { label: 'The Labs', path: '/labs?tab=projects' },
  ] });

  const ideasHtml = ideas.length ? ideas.map((idea) => {
    const author = store.person(idea.authorId);
    return `<div class="task-relation-item" data-lab-idea-id="${escapeHtml(idea.id)}">
      <span class="task-relation-kind">Идея</span>
      <button type="button" class="task-relation-link" data-lab-idea-open="${escapeHtml(idea.id)}">${escapeHtml(idea.title || idea.description || 'Без названия')}</button>
      ${author ? `<span class="tiny">${escapeHtml(author.name)}</span>` : ''}
    </div>`;
  }).join('') : `<div class="task-relation-empty">К проекту пока не прикреплено идей</div>`;

  const view = document.getElementById('view');
  view.classList.add('task-detail-page-view');
  const authorControl = detailInlineSelectHtml({ id: 'lab-detail-author', value: lab.authorId || '', editable, emptyLabel: '—', options: authors.map((person) => ({ value: person.id, label: person.name })) });
  const typeControl = detailInlineSelectHtml({ id: 'lab-detail-type', value: lab.projectType || 'pet', editable, options: Object.entries(LAB_TYPE_LABEL).map(([value,label]) => ({ value, label })) });
  const accessControl = detailInlineSelectHtml({ id: 'lab-detail-private', value: lab.private ? 'private' : 'public', editable, options: [{ value:'public', label:'Для команды' }, { value:'private', label:'Приватный' }] });
  const linkControl = detailInlineInputHtml({ id: 'lab-detail-links', value: normalizeLabLinks(lab.links).join(' · '), editable, placeholder: 'https://…', linked: true });
  const statusControl = `<div class="task-detail-status-control">${labStatusIconHtml(lab.status || 'idea', editable ? lab : null)}<span>${escapeHtml(LAB_STATUS_LABEL[lab.status || 'idea'] || '')}</span></div>`;
  const details = `<section class="task-detail-section task-detail-details-section"><div class="task-detail-details-grid"><div class="task-detail-details-column">
    ${detailPropertyHtml({ label:'Автор', control:authorControl })}
    ${detailPropertyHtml({ label:'Тип', control:typeControl })}
    ${detailPropertyHtml({ label:'Доступ', control:accessControl })}
    ${detailPropertyHtml({ label:'Статус', control:statusControl, className:'task-detail-status-property' })}
    ${detailPropertyHtml({ label:'Ссылка', control:linkControl })}
  </div><div class="task-detail-details-column lab-tree-column"><div class="lab-detail-progress-tree" aria-label="Прогресс проекта">${goalTreeHtml(progress, 'compact', lab.labKey || lab.id)}</div></div></div></section>`;
  const description = `<section class="task-detail-section task-detail-description-section"><div class="task-detail-section-label task-detail-section-title">Описание</div><div class="task-inline-edit task-inline-edit-description ${editable ? 'is-editable' : ''}">${editable ? `<textarea id="lab-detail-description" class="task-detail-description" rows="4" placeholder="Добавьте описание проекта">${escapeHtml(lab.description || '')}</textarea><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit',11)}</span>` : `<textarea id="lab-detail-description" class="task-detail-description" hidden disabled>${escapeHtml(lab.description || '')}</textarea><div class="task-detail-description task-detail-description-readonly">${renderLinkedText(lab.description || '') || '<span class="muted">Описание не добавлено</span>'}</div>`}</div></section>`;
  const ideasSection = detailSectionHtml('Идеи', `<div class="task-relation-list task-relation-list-unified" id="lab-detail-ideas">${ideasHtml}</div>`, `<button type="button" class="task-section-add-btn" id="lab-detail-add-idea" aria-label="Добавить идею" title="Добавить идею">+</button>`).replace('task-detail-section"','task-detail-section task-relations-section"');
  const commentsSection = `<section class="task-comments-section"><div class="task-comments-head"><span>Комментарии</span><span class="task-comments-count" id="lab-comments-count">${comments.length || ''}</span></div><div class="task-comments-list" id="lab-comments-list">${commentThreadHtml(comments)}</div><div class="task-comment-compose"><textarea id="lab-comment-input" rows="2" placeholder="Оставить комментарий…"></textarea><button type="button" class="ui-button btn task-comment-send-inline" id="lab-comment-send" hidden>Отправить</button></div></section>`;
  view.innerHTML = entityDetailHtml({ className:'lab-task-detail-page', header:detailPageHeaderHtml({ title: lab.title, eyebrow: '', inputId:'lab-detail-title', displayId:'lab-title-display', shellId:'lab-title-shell', editable, ariaLabel:'Название проекта The Labs' }), main:details + description + ideasSection + commentsSection });

  Views._labDetailIdeas = ideas;

  const linkedShell = document.querySelector('[data-linked-inline-shell="lab-detail-links"]');
  const linksField = document.getElementById('lab-detail-links');
  const linksDisplay = document.querySelector('[data-linked-inline-display="lab-detail-links"]');
  if (linkedShell && linksField && linksDisplay) {
    const beginLinkEdit = (event) => {
      if (event?.target?.closest?.('a')) return;
      linksDisplay.hidden = true;
      linksField.hidden = false;
      linksField.focus();
      linksField.select?.();
    };
    linksDisplay.addEventListener('click', beginLinkEdit);
    linksDisplay.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginLinkEdit(event); } });
    linksField.addEventListener('blur', () => {
      linksDisplay.innerHTML = linksField.value.trim() ? renderLinkedText(linksField.value) : '<span class="muted">https://…</span>';
      linksField.hidden = true;
      linksDisplay.hidden = false;
    });
  }

  const descriptionField = document.getElementById('lab-detail-description');
  const resizeDescription = () => {
    if (!descriptionField) return;
    descriptionField.style.height = 'auto';
    descriptionField.style.height = `${Math.max(descriptionField.scrollHeight, 52)}px`;
  };
  resizeDescription();
  descriptionField?.addEventListener('input', resizeDescription);

  const titleShell = document.getElementById('lab-title-shell');
  const titleDisplay = document.getElementById('lab-title-display');
  const titleInput = document.getElementById('lab-detail-title');
  const beginTitleEdit = () => {
    if (!editable || !titleInput || !titleDisplay) return;
    titleShell.classList.add('is-editing');
    titleDisplay.hidden = true;
    titleInput.hidden = false;
    titleInput.focus();
    titleInput.select();
  };
  const finishTitleEdit = () => {
    if (!titleInput || !titleDisplay) return;
    titleDisplay.textContent = titleInput.value.trim() || 'Без названия';
    titleInput.hidden = true;
    titleDisplay.hidden = false;
    titleShell.classList.remove('is-editing');
  };
  if (editable) {
    titleDisplay.onclick = beginTitleEdit;
    titleDisplay.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginTitleEdit(); } };
    titleInput.onblur = finishTitleEdit;
    titleInput.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); titleInput.blur(); } };
  }

  const actionsToggle = document.getElementById('lab-actions-toggle');
  const actionsMenu = document.getElementById('lab-actions-menu');
  if (actionsToggle && actionsMenu) {
    const setActionsOpen = (open) => { actionsMenu.hidden = !open; actionsToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    const wrap = actionsToggle.closest('.task-actions-menu-wrap');
    actionsToggle.onclick = (event) => { event.stopPropagation(); setActionsOpen(actionsMenu.hidden); };
    actionsMenu.onclick = (event) => event.stopPropagation();
    document.addEventListener('click', (event) => { if (!wrap?.contains(event.target)) setActionsOpen(false); });
  }

  const versionHistoryButton = document.getElementById('lab-version-history');
  if (versionHistoryButton) versionHistoryButton.onclick = async () => {
    actionsMenu && (actionsMenu.hidden = true);
    if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
    openVersionHistory('labs', lab, { canRestore: editable });
  };

  document.querySelectorAll('[data-lab-idea-open]').forEach((button) => {
    button.onclick = () => openLabIdeaModal(ideas.find((item) => item.id === button.dataset.labIdeaOpen));
  });
  document.getElementById('lab-detail-add-idea').onclick = () => openLabIdeaModal(null, { labProjectId: lab.id });

  createCommentController({
    entityType: 'lab', entityId: lab.id, comments,
    listId: 'lab-comments-list', countId: 'lab-comments-count',
    inputId: 'lab-comment-input', sendId: 'lab-comment-send',
  }).bind();

  if (editable) {
    const currentPayload = () => ({
      title: titleInput.value.trim(),
      description: descriptionField.value.trim(),
      authorId: document.getElementById('lab-detail-author').value || null,
      projectType: document.getElementById('lab-detail-type').value || 'pet',
      private: document.getElementById('lab-detail-private').value === 'private',
      status: lab.status || 'idea',
      links: normalizeLabLinks(document.getElementById('lab-detail-links').value.replace(/\s+·\s+/g, '\n')),
    });
    let lastSavedPayload = JSON.stringify(currentPayload());
    const saveLabChanges = async () => {
      const payload = currentPayload();
      if (!payload.title) { toast('Укажите название проекта The Labs'); return false; }
      if (!payload.authorId) { toast('Укажите автора'); return false; }
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedPayload) return true;
      try {
        const saved = await Resources.labs.update(lab.id, payload);
        lastSavedPayload = serialized;
        Object.assign(lab, saved || payload);
        const index = (store.labs || []).findIndex((item) => item.id === lab.id);
        if (index >= 0) store.labs[index] = { ...store.labs[index], ...saved };
        toast('Версия сохранена');
        return true;
      } catch (error) {
        console.error(error);
        toast('Не удалось сохранить изменения');
        throw error;
      }
    };
    const autosave = DetailAutosave.set(createAutosave(saveLabChanges, { delay: 550 }));
    Router.setLeaveGuard(async () => { await autosave.flush(); return true; }, () => autosave.pending);

    ['lab-detail-title','lab-detail-description','lab-detail-links'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => autosave.schedule(false));
    });
    ['lab-detail-author','lab-detail-type','lab-detail-private'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => autosave.schedule(true));
    });
    titleInput.addEventListener('blur', () => autosave.schedule(true));
    descriptionField?.addEventListener('blur', () => autosave.schedule(true));
    const linksField = document.getElementById('lab-detail-links');
    linksField?.addEventListener('blur', () => autosave.schedule(true));
    bindDetailCommitOnEnter(descriptionField, () => autosave.schedule(true));
    bindDetailCommitOnEnter(linksField, () => autosave.schedule(true));

    document.getElementById('lab-detail-delete').onclick = async () => {
      if (!await confirmAction('Удалить проект The Labs?')) return;
      autosave.cancel();
      await Resources.labs.remove(lab.id);
      toast('Проект The Labs удалён');
      Router.go('/labs?tab=projects');
    };
  }
};


// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openLabIdeaModal });
