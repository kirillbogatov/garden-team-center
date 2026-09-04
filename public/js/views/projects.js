// Проекты — список и карточка проекта с задачами, проблемами и упоминаниями.

Views._projectsOverviewTab = 'projects';

Views.projects = async function (forcedTab = null) {
  const requestedTab = forcedTab || Router.queryParam('tab');
  // URL — единственный источник истины для вкладки, чтобы переключение не залипало.
  Views._projectsOverviewTab = requestedTab === 'load' ? 'load' : 'projects';
  setTopbar(`<h1>Проекты</h1>${Auth.canCreate('projects') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openProjectModal">+ Создать проект</button></div>` : ''}`);
  const view = document.getElementById('view');
  const projects = await Resources.projects.list();



  const loadRows = store.team()
    .map((person) => {
      const summary = personProjectLoadSummary(person.id);
      return { p: person, count: summary.projects.length, maxHours: summary.maxHours, level: summary.level };
    })
    .sort((a, b) => b.maxHours - a.maxHours || b.count - a.count || a.p.name.localeCompare(b.p.name, 'ru'));

  // Тот же приём вкладок со счётчиками, что и в Задачах/Проблемах/Договорённостях/
  // Встречах — здесь переключает не фильтр статуса, а представление целиком
  // (список проектов / загрузка команды), но визуально это тот же паттерн.
  const overviewTabs = `<div class="list-tabs projects-overview-tabs" role="tablist" aria-label="Представление проектов">
    <button type="button" class="list-tab ${Views._projectsOverviewTab === 'projects' ? 'active' : ''}" role="tab" aria-selected="${Views._projectsOverviewTab === 'projects'}" data-route="/projects?tab=projects">Проекты</button>
    <button type="button" class="list-tab ${Views._projectsOverviewTab === 'load' ? 'active' : ''}" role="tab" aria-selected="${Views._projectsOverviewTab === 'load'}" data-route="/projects?tab=load">Загрузка команды</button>
  </div>`;

  const projectsList = projects.length ? projects.map((p) => {
    const members = store.people.filter((m) => (p.memberIds || []).includes(m.id));
    return `<div class="ui-row list-row" data-route="${projectPath(p)}">
      <span class="dot" style="background:${p.color || 'var(--accent)'}"></span>
      <span class="title">${escapeHtml(p.name)}</span>
      <span class="ui-tag badge">${PROJECT_STATUS_LABEL[p.status] || p.status}</span>
      <div class="flex gap-6" style="margin-left:auto">${members.slice(0, 6).map((m) => personAvatarLinkHtml(m)).join('')}</div>
    </div>`;
  }).join('') : emptyState('Проектов пока нет', '', 'projects');

  const loadList = loadRows.map(({ p, count, maxHours, level }) => `<div class="ui-row list-row team-load-row" data-command="openPersonLoadModal" data-command-arg="${p.id}">
      ${personAvatarLinkHtml(p)}<span class="title">${escapeHtml(p.name)}</span>
      <span class="meta team-load-projects">${count} ${pluralRu(count, 'активный проект', 'активных проекта', 'активных проектов')}</span>
      <span class="team-load-level ${level.tone}" title="Оценка рассчитывается по верхней границе выбранных диапазонов">${level.label}</span>
    </div>`).join('');

  view.innerHTML = `<div class="view-narrow projects-overview projects-page">
    ${overviewTabs}
    <div class="projects-overview-body">${Views._projectsOverviewTab === 'load' ? loadList : projectsList}</div>
  </div>`;
};

Views._projectTab = 'tasks';

Views.projectDetail = async function (id) {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const data = await api.get(`/api/projects/${id}/detail`);
  const p = data.project;
  if (id !== (data.project.slug || data.project.id)) Router.replace(projectPath(p));
  Views._lastProject = p;

  const [projectNotes, settings] = await Promise.all([
    api.get(`/api/comments/project/${encodeURIComponent(p.id)}`).catch(() => []),
    GardenSettings.load(),
  ]);

  setTopbar(`<h1>${escapeHtml(p.name)}</h1><div class="actions">
    <button type="button" class="sidebar-collapse-btn overview-comments-sidebar-toggle" id="project-comments-toggle" aria-label="Показать панель стикеров" title="Показать панель стикеров" aria-expanded="false">${icon('sticky', 16)}</button>
    ${Auth.canEditItem('projects', p) ? `<button class="ui-button btn" data-command="editCurrentProject">${icon('edit',14)} Редактировать</button>` : ''}
  </div>`);

  const tabs = [
    { key: 'tasks', label: 'Задачи' },
    { key: 'issues', label: 'Проблемы' },
    { key: 'meetings', label: 'Встречи' },
    { key: 'agreements', label: 'Договорённости' },
    { key: 'journal', label: 'Журнал' },
    { key: 'documents', label: 'Документы' },
  ];

  function body(key) {
    if (key === 'tasks') return data.tasks.length ? data.tasks.map((t) => {
      const idx = registerAction(() => FeatureLoader.run('openTaskModal', t.id));
      const assignees = (t.assigneeIds || []).map((id) => store.person(id)).filter(Boolean);
      const overdue = t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < todayStr();
      return `<div class="ui-row ui-row--task list-row task-list-row project-task-row" data-action-id="${idx}">
        ${taskStatusBadge(t.status, t.id)}
        <span class="tl-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
        <div class="tl-right">
          <div class="task-tags-cell"><span class="task-labels-group">${priorityBadge(t.priority)}</span></div>
          <div class="task-due-cell">${t.dueDate ? `<span class="tiny" style="${overdue ? 'color:var(--red)' : ''}">${t.status === 'done' ? deadlineDateLabel(t.dueDate) : dueLabel(t.dueDate)}</span>` : ''}</div>
          <div class="task-assignee-cell">${assignees.length ? `<div class="flex gap-4">${assignees.map((a) => personAvatarLinkHtml(a)).join('')}</div>` : avatarHtml(null)}</div>
        </div>
      </div>`;
    }).join('') : emptyState('Задач нет', '', 'tasks');
    if (key === 'issues') return data.issues.length ? data.issues.map((i) => {
      const idx = registerAction(() => FeatureLoader.run('openIssueModal', i.id));
      return `<div class="ui-row list-row" data-action-id="${idx}">${issueStatusBadge(i.status, i.id)}<span class="title">${escapeHtml(i.title)}</span>${severityBadge(i.severity)}</div>`;
    }).join('') : emptyState('Проблем нет', '', 'issues');
    if (key === 'meetings') return data.meetings.length ? data.meetings.map((m) => {
      const idx = registerAction(() => FeatureLoader.run('openMeetingModal', m));
      return `<div class="ui-row list-row" data-action-id="${idx}"><span class="ui-tag badge">${MEETING_TYPE_LABEL[m.type]}</span><span class="title">${escapeHtml(meetingDisplayTitle(m))}</span><span class="meta">${fmtDate(m.date)}</span></div>`;
    }).join('') : emptyState('Встреч не было', '', 'meetings');
    if (key === 'agreements') return (data.agreements || []).length ? data.agreements.map((a) => {
      const idx = registerAction(() => FeatureLoader.run('openAgreementModal', a.id));
      return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${renderMentionText(a.text)}</span><span class="meta">${fmtDate(a.date)}</span></div>`;
    }).join('') : emptyState('Договорённостей нет', '', 'agreements');
    if (key === 'journal') return data.journal.length ? data.journal.map(journalEntryHtml).join('') : emptyState('Упоминаний нет', '', 'journal');
    if (key === 'documents') return data.documents.length ? data.documents.map(documentRowHtml).join('') : emptyState('Документов нет', '', 'documents');
    return '';
  }

  view.innerHTML = `<div class="project-detail-page-shell">
    <div class="flex items-center gap-10" style="margin-bottom:6px">
      <span class="dot" style="background:${p.color};width:10px;height:10px"></span>
      <span class="ui-tag badge">${PROJECT_STATUS_LABEL[p.status] || p.status}</span>
    </div>
    <p class="muted formatted-text">${escapeHtml(p.description || '')}</p>
    <div class="flex gap-8" style="margin:12px 0 20px">${data.members.map(personChip).join('')}</div>
    ${data.goals.length ? `<div class="tiny" style="margin-bottom:16px">Работает на цели: ${data.goals.map((g) => `<span class="link" data-route="${goalPath(g)}">${escapeHtml(g.title)}</span>`).join(', ')}</div>` : ''}
    <div class="ui-tab tabs">${tabs.map((t) => `<div class="ui-tab tab ${Views._projectTab === t.key ? 'active' : ''}" data-view-state="_projectTab" data-view-value="${t.key}" data-view-render="projectDetail" data-view-render-arg="${p.id}">${t.label}</div>`).join('')}</div>
    <div>${body(Views._projectTab)}</div>
    <aside class="overview-comments-drawer project-comments-drawer" id="project-comments-drawer" aria-hidden="true">
      <div class="overview-comments-head">
        <div><strong>Стикеры</strong></div>
        <div class="overview-notes-head-actions"><button type="button" class="task-detail-icon-btn overview-note-add" id="project-note-add" title="Добавить стикер" aria-label="Добавить стикер">+</button></div>
      </div>
      <div class="task-comments-list overview-comments-list" id="project-comments-list">${commentThreadHtml(projectNotes, { variant: 'notes' })}</div>
    </aside>
  </div>`;

  const drawer = document.getElementById('project-comments-drawer');
  const toggle = document.getElementById('project-comments-toggle');
  const mainShell = document.querySelector('.main');
  let notesController = null;
  const projectStateKey = String(p.id);
  const persistProjectNotesState = async (isOpen) => {
    if (!notesController || notesController.filledCount() < 1) return;
    const next = { ...((await GardenSettings.load()).projectNotesOpen || {}), [projectStateKey]: !!isOpen };
    try { await GardenSettings.update({ projectNotesOpen: next }); } catch (_) {}
  };
  const setProjectNotesOpen = (open, options = {}) => {
    const isOpen = Boolean(open);
    view.classList.toggle('overview-comments-open', isOpen);
    mainShell?.classList.toggle('overview-comments-open', isOpen);
    drawer?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (toggle) {
      const label = isOpen ? 'Скрыть панель стикеров' : 'Показать панель стикеров';
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
      toggle.classList.toggle('is-active', isOpen);
    }
    if (options.persist !== false) persistProjectNotesState(isOpen);
  };
  notesController = createCommentController({
    entityType: 'project', entityId: p.id, comments: projectNotes,
    listId: 'project-comments-list', countId: 'project-comments-count',
    addId: 'project-note-add', variant: 'notes', suppressEmptyAfterDelete: true,
    journalPrefix: `@[${String(p.name || '').replace(/]/g, '')}](project:${p.id})`,
    onChange: ({ type }) => {
      if ((type === 'create' || type === 'update') && notesController?.filledCount() > 0) persistProjectNotesState(view.classList.contains('overview-comments-open'));
    },
  }).bind();
  const hasFilledNotes = projectNotes.some((note) => String(note?.text || '').trim());
  setProjectNotesOpen(hasFilledNotes ? !!settings.projectNotesOpen?.[projectStateKey] : false, { persist: false, ensureDraft: false });
  if (toggle) toggle.onclick = () => setProjectNotesOpen(!view.classList.contains('overview-comments-open'));
};

function editCurrentProject() { return openProjectModal(Views._lastProject); }

function openProjectModal(existing) {
  const isEdit = !!existing;
  const p = existing || {};
  const colors = ['#5E6AD2', '#26B5CE', '#4CB782', '#F2994A', '#EB5757', '#9B74E9', '#EB70AA', '#E2B203'];
  Modal.open(`
    <h2>${isEdit ? 'Редактировать проект' : 'Новый проект'}</h2>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="prf-name">Название</label><input id="prf-name" value="${escapeHtml(p.name || '')}" /></div>
      <div class="ui-field field project-task-code-field"><label class="ui-field-label field-label" for="prf-task-code">Код задач</label><input id="prf-task-code" maxlength="4" autocomplete="off" value="${escapeHtml(p.taskCode || '')}" placeholder="ABCD" style="text-transform:uppercase" /><div class="ui-field-hint field-hint">4 латинские буквы · например GRDN</div></div>
    </div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="prf-desc">Описание</label><textarea id="prf-desc" rows="2">${escapeHtml(p.description || '')}</textarea></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="prf-status">Статус</label>
      <select id="prf-status">
        <option value="active" ${p.status === 'active' ? 'selected' : ''}>Активен</option>
        <option value="paused" ${p.status === 'paused' ? 'selected' : ''}>На паузе</option>
        <option value="done" ${p.status === 'done' ? 'selected' : ''}>Завершён</option>
      </select>
    </div>
    <div class="ui-field field"><span class="ui-field-label field-label">Цвет</span>
      <div class="flex gap-8">${colors.map((c) => `<button type="button" aria-label="Цвет ${c}" aria-pressed="${(p.color||colors[0])===c}" data-project-color="${c}" class="color-swatch${(p.color||colors[0])===c?' selected':''}" style="background:${c}"></button>`).join('')}</div>
      <input type="hidden" id="prf-color" value="${p.color || colors[0]}" />
    </div>
    <div class="ui-field field"><span class="ui-field-label field-label">Участники</span>
      <div id="prf-members-wrap">${peoplePickerHtml('Добавить участника…')}</div>
      <div id="prf-member-loads" class="project-member-loads"></div>
    </div>
    <div class="ui-modal-actions modal-actions">
      ${isEdit ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" data-command="deleteProject" data-command-arg="${p.id}">${icon('trash',14)} Удалить</button>` : ''}
      <button class="ui-button btn" id="prf-cancel">Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="prf-save">Сохранить</button>
    </div>
  `);
  document.querySelectorAll('[data-project-color]').forEach((swatch) => swatch.addEventListener('click', () => {
    const color = swatch.dataset.projectColor;
    document.getElementById('prf-color').value = color;
    document.querySelectorAll('[data-project-color]').forEach((item) => { item.classList.toggle('selected', item === swatch); item.setAttribute('aria-pressed', item === swatch ? 'true' : 'false'); });
  }));
  const normalizeMemberLoad = normalizeProjectMemberLoad;
  const memberLoads = Object.fromEntries(Object.entries(p.memberLoads || {}).map(([id, value]) => [id, normalizeMemberLoad(value)]));
  const memberLoadsEl = document.getElementById('prf-member-loads');
  function renderMemberLoads(selectedIds) {
    const selectedPeople = selectedIds.map((id) => store.person(id)).filter(Boolean);
    memberLoadsEl.innerHTML = selectedPeople.length ? `<div class="project-member-loads-title">Ориентировочная загрузка в проекте</div>${selectedPeople.map((person) => {
      const load = memberLoads[person.id] || normalizeMemberLoad('full');
      memberLoads[person.id] = load;
      return `<div class="project-member-load-row" data-person-id="${person.id}">
        <div class="project-member-load-person">${avatarHtml(person)}<span>${escapeHtml(person.name)}</span></div>
        <select class="project-member-load-select" data-person-id="${person.id}">
          <option value="full" ${load.mode === 'full' ? 'selected' : ''}>Фултайм (6–8 часов)</option>
          <option value="half" ${load.mode === 'half' ? 'selected' : ''}>Парт-тайм (3–5 часов)</option>
          <option value="support" ${load.mode === 'support' ? 'selected' : ''}>Саппорт (1–2 часа)</option>
        </select>
      </div>`;
    }).join('')}` : '';
    memberLoadsEl.querySelectorAll('.project-member-load-select').forEach((select) => {
      select.onchange = () => {
        const id = select.dataset.personId;
        memberLoads[id] = { mode: select.value };
      };
    });

  }
  const membersPicker = initPeoplePicker(document.getElementById('prf-members-wrap'), store.team(), p.memberIds, {
    multi: true,
    placeholder: 'Добавить участника…',
    onChange: (ids) => renderMemberLoads(ids),
  });
  renderMemberLoads(membersPicker.getSelected());
  document.getElementById('prf-cancel').onclick = () => Modal.close();
  document.getElementById('prf-save').onclick = async () => {
    const payload = {
      name: document.getElementById('prf-name').value.trim(),
      taskCode: document.getElementById('prf-task-code').value.trim().toUpperCase(),
      description: document.getElementById('prf-desc').value.trim(),
      status: document.getElementById('prf-status').value,
      color: document.getElementById('prf-color').value,
      memberIds: membersPicker.getSelected(),
      memberLoads: Object.fromEntries(membersPicker.getSelected().map((id) => [id, (memberLoads[id] || normalizeMemberLoad('full')).mode])),
    };
    if (!payload.name) { toast('Укажите название проекта'); return; }
    if (payload.taskCode && !/^[A-Z]{4}$/.test(payload.taskCode)) { toast('Код задач должен состоять из 4 латинских букв'); return; }
    try {
      if (isEdit) await Resources.projects.update(p.id, payload);
      else await Resources.projects.create(payload);
    } catch (err) {
      if (err?.data?.error === 'project_task_code_exists') { toast('Такой код задач уже используется другим проектом'); return; }
      if (err?.data?.error === 'invalid_project_task_code') { toast('Код задач должен состоять из 4 латинских букв'); return; }
      throw err;
    }
    await store.loadAll();
    Modal.close();
    toast('Сохранено');
    if (isEdit) Views.projectDetail(p.id); else Router.go('/projects');
  };
}


async function openPersonLoadModal(personId) {
  const person = store.person(personId);
  if (!person) return;
  const projects = store.projects.filter((pr) => pr.status === 'active');
  const canEdit = Auth.canEditItem('projects', p, ['memberIds']);
  const draft = new Map(projects.map((pr) => {
    const included = (pr.memberIds || []).includes(personId);
    const load = normalizeProjectMemberLoad((pr.memberLoads || {})[personId]);
    return [pr.id, { included, mode: load.mode }];
  }));

  const renderRows = () => projects.map((pr) => {
    const item = draft.get(pr.id);
    const value = item.included ? item.mode : 'none';
    return `<div class="person-load-project-row ${item.included ? 'active' : ''}" data-project-id="${pr.id}">
      <div class="person-load-project-toggle">
        <span class="dot" style="background:${pr.color || 'var(--accent)'}"></span>
        <span class="person-load-project-name">${escapeHtml(pr.name)}</span>
      </div>
      <select data-load-project-mode="${pr.id}" aria-label="Режим загрузки по проекту ${escapeHtml(pr.name || '')}" ${canEdit ? '' : 'disabled'}>
        <option value="none" ${value === 'none' ? 'selected' : ''}>Не участвует</option>
        <option value="full" ${value === 'full' ? 'selected' : ''}>Фултайм (6–8 часов)</option>
        <option value="half" ${value === 'half' ? 'selected' : ''}>Парт-тайм (3–5 часов)</option>
        <option value="support" ${value === 'support' ? 'selected' : ''}>Саппорт (1–2 часа)</option>
      </select>
    </div>`;
  }).join('');

  Modal.open(`
    <h2>Загрузка · ${escapeHtml(person.name)}</h2>
    <p class="muted" style="margin-top:-4px">Добавьте или уберите активные проекты и задайте уровень загрузки. Общая оценка считается по верхней границе выбранных режимов.</p>
    <div id="person-load-projects" class="person-load-project-list">${renderRows() || '<div class="empty-inline">Нет активных проектов</div>'}</div>
    <div class="ui-modal-actions modal-actions">
      <button class="ui-button btn" id="person-load-cancel">${canEdit ? 'Отмена' : 'Закрыть'}</button>
      ${canEdit ? '<button class="ui-button ui-button--primary btn btn-primary" id="person-load-save">Сохранить</button>' : ''}
    </div>
  `);
  const root = document.getElementById('person-load-projects');
  if (!root) return;

  root.querySelectorAll('[data-load-project-mode]').forEach((select) => {
    select.onchange = () => {
      const id = select.dataset.loadProjectMode;
      const item = draft.get(id);
      item.included = select.value !== 'none';
      if (item.included) item.mode = select.value;
      const row = root.querySelector(`[data-project-id="${id}"]`);
      if (row) row.classList.toggle('active', item.included);
    };
  });
  document.getElementById('person-load-cancel').onclick = () => Modal.close();
  const save = document.getElementById('person-load-save');
  if (save) save.onclick = async () => {
    save.disabled = true;
    try {
      for (const pr of projects) {
        const item = draft.get(pr.id);
        const memberIds = [...(pr.memberIds || [])].filter((id) => id !== personId);
        if (item.included) memberIds.push(personId);
        const memberLoads = { ...(pr.memberLoads || {}) };
        if (item.included) memberLoads[personId] = item.mode;
        else delete memberLoads[personId];
        await Resources.projects.update(pr.id, { memberIds: [...new Set(memberIds)], memberLoads });
      }
      await store.loadAll();
      Modal.close();
      toast('Загрузка обновлена');
      // Обновляем текущий view через Router без перезагрузки страницы.
      const currentPath = Router.current();
      if (currentPath === '/projects') await Views.projects();
      else if (currentPath.startsWith('/people/')) await Views.personDetail(currentPath.split('/')[2] || personId);
    } catch (e) {
      save.disabled = false;
      toast('Не удалось сохранить загрузку');
    }
  };
}

async function deleteProject(id) {
  const ok = await confirmAction('Удалить проект? Задачи и проблемы останутся, но без привязки к проекту.');
  if (!ok) return;
  await Resources.projects.remove(id);
  await store.loadAll();
  Modal.close();
  toast('Проект удалён');
  Router.go('/projects');
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ editCurrentProject, openProjectModal, openPersonLoadModal, deleteProject });
