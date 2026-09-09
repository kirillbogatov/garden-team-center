// Цели — долгосрочные цели тимлида и то, что на них работает.

// Прогресс цели по задачам, у которых цель указана напрямую.
Views.goals = async function () {
  const addButton = Auth.canCreate('goals')
    ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openGoalModal">+ Добавить цель</button></div>`
    : '';
  setTopbar(`<h1>Цели</h1>${addButton}`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const [goals, tasks] = await Promise.all([Resources.goals.list(), Resources.tasks.list({ includeArchived: 1 })]);

  if (!goals.length) {
    view.innerHTML = emptyState('Целей пока нет', 'Сформулируйте первую долгосрочную цель', 'goals');
    return;
  }

  const cards = goals.map((g) => goalCardHtml(g, tasks)).join('');
  view.innerHTML = `<div class="view-narrow">${cards}</div>`;
};

function goalCardHtml(g, tasks) {
  const progress = goalProgress(g, tasks);
  return `<div class="ui-surface card clickable goal-card" style="margin-bottom:12px" data-route="${goalPath(g)}">
    <div class="flex justify-between items-center" style="margin-bottom:8px">
      <div class="entity-card-title">${escapeHtml(g.title)}</div>
      <span class="ui-tag badge">${escapeHtml(g.timeframe || '')}</span>
    </div>
    <div class="tiny" style="margin-bottom:10px">${escapeHtml(g.description || '')}</div>
    <div class="goal-growth-line">
      <div class="goal-growth-copy"><span class="tiny">Прогресс</span><strong>${progress}%</strong></div>
      ${goalTreeHtml(progress, 'compact', g.id)}
    </div>
  </div>`;
}

Views._goalTab = Views._goalTab || 'tasks';

Views.goalDetail = async function (id) {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const data = await api.get(`/api/goals/${id}/detail`);
  const g = data.goal;
  if (id !== (data.goal.slug || data.goal.id)) Router.replace(goalPath(g));
  Views._lastGoal = g;
  const progress = goalProgress(g, data.tasks);

  const editGoalIdx = registerAction(() => openGoalModal(g));
  const addTaskIdx = registerAction(() => FeatureLoader.run('openTaskModal', null, { prefill: { goalId: g.id }, onSaved: () => Views.goalDetail(g.id) }));
  const addIssueIdx = registerAction(() => FeatureLoader.run('openIssueModal', null, { onSaved: (issue) => linkIssueToGoal(issue.id) }));

  const editButton = Auth.canEditItem('goals', g)
    ? `<div class="actions"><button class="ui-button btn" data-action-id="${editGoalIdx}">${icon('edit',14)} Редактировать</button></div>`
    : '';
  setTopbar(`<h1>${escapeHtml(g.title)}</h1>${editButton}`);

  const goalTabs = [
    { key: 'tasks', label: `Задачи (${data.tasks.length})` },
    { key: 'issues', label: `Проблемы (${data.issues.length})` },
  ];
  if (!goalTabs.some((t) => t.key === Views._goalTab)) Views._goalTab = 'tasks';

  function goalTabBody(key) {
    if (key === 'tasks') {
      const rows = data.tasks.length
        ? data.tasks.map(goalTaskRowHtml).join('')
        : `<div class="tiny">Задачи не привязаны</div>`;
      return `<div class="flex items-center" style="margin-bottom:10px">
          <button class="ui-button ui-button--sm btn btn-sm" style="margin-left:auto" data-action-id="${addTaskIdx}">+ Добавить задачу</button>
        </div>
        ${rows}`;
    }
    const rows = data.issues.length
      ? data.issues.map(goalIssueRowHtml).join('')
      : `<div class="tiny">Проблемы не привязаны</div>`;
    return `<div class="flex items-center" style="margin-bottom:10px">
        <button class="ui-button ui-button--sm btn btn-sm" style="margin-left:auto" data-action-id="${addIssueIdx}">+ Добавить проблему</button>
      </div>
      ${rows}`;
  }

  // Строка задачи в списке цели: та же task-list-row разметка, что и в других
  // местах приложения (проекты, обзор) — единый визуальный язык для строк задач.
  function goalTaskRowHtml(t) {
    const idx = registerAction(() => FeatureLoader.run('openTaskModal', t.id));
    const assignees = (t.assigneeIds || []).map((personId) => store.person(personId)).filter(Boolean);
    const overdue = t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < todayStr();
    const dueHtml = t.dueDate
      ? `<span class="tiny" style="${overdue ? 'color:var(--red)' : ''}">${t.status === 'done' ? deadlineDateLabel(t.dueDate) : dueLabel(t.dueDate)}</span>`
      : '';
    const assigneeHtml = assignees.length
      ? `<div class="flex gap-4">${assignees.map((a) => personAvatarLinkHtml(a)).join('')}</div>`
      : avatarHtml(null);
    return `<div class="ui-row ui-row--task list-row task-list-row" data-action-id="${idx}">
      ${taskStatusBadge(t.status, t.id)}
      <span class="tl-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
      <div class="tl-right">
        <div class="task-tags-cell">${taskLabelsHtml(t)}</div>
        <div class="task-due-cell">${dueHtml}</div>
        <div class="task-assignee-cell">${assigneeHtml}</div>
      </div>
    </div>`;
  }

  function goalIssueRowHtml(i) {
    const idx = registerAction(() => FeatureLoader.run('openIssueModal', i.id));
    return `<div class="ui-row list-row" data-action-id="${idx}">${issueStatusBadge(i.status, i.id)}<span class="title">${escapeHtml(i.title)}</span></div>`;
  }

  const projectsHtml = data.projects.length
    ? `<div class="flex gap-8" style="flex-wrap:wrap">${data.projects.map(projectChip).join('')}</div>`
    : `<div class="tiny">Проекты не привязаны</div>`;
  const tabsHtml = goalTabs.map((t) => {
    const active = Views._goalTab === t.key;
    return `<div class="ui-tab tab ${active ? 'active' : ''}" data-view-state="_goalTab" data-view-value="${t.key}" data-view-render="goalDetail" data-view-render-arg="${id}">${t.label}</div>`;
  }).join('');

  view.innerHTML = `
    <div class="view-narrow">
      <div class="flex items-center gap-10" style="margin-bottom:6px">
        <span class="ui-tag badge">${escapeHtml(g.timeframe || '')}</span>
        <span class="ui-tag badge">${GOAL_STATUS_LABEL[g.status] || GOAL_STATUS_LABEL.active}</span>
      </div>
      <p class="muted">${escapeHtml(g.description || '')}</p>
      <div class="goal-growth-detail">
        ${goalTreeHtml(progress, 'regular', g.id)}
        <div class="goal-growth-detail-copy"><div class="goal-growth-percent">${progress}%</div><div class="tiny">прогресс цели</div></div>
      </div>

      <h2 class="section-title">${icon('projects',15)} Проекты (${data.projects.length})</h2>
      ${projectsHtml}

      <div class="ui-tab tabs goal-tabs" style="margin-top:28px">${tabsHtml}</div>
      <div class="goal-tab-body">${goalTabBody(Views._goalTab)}</div>
    </div>
  `;
};

async function linkIssueToGoal(issueId) {
  const g = Views._lastGoal;
  await Resources.issues.update(issueId, { goalId: g.id });
  toast('Проблема добавлена к цели');
  Views.goalDetail(g.id);
}

function openGoalModal(existing) {
  const g = existing || {};
  const isEdit = !!g.id;
  const editable = !isEdit || Auth.canEditItem('goals', g);
  return EntityForm.open({
    title: isEdit ? 'Редактировать цель' : 'Новая цель',
    value: g,
    mode: isEdit ? 'edit' : 'create',
    editable,
    schema: [
      { key: 'title', label: 'Название', trim: true },
      { key: 'description', label: 'Описание / как достигаем', type: 'textarea', rows: 3, trim: true },
      { key: 'timeframe', label: 'Горизонт', placeholder: 'Например, Q3 2026', trim: true },
      { key: 'status', label: 'Статус', type: 'select', default: 'active', options: Object.entries(GOAL_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
      { key: 'projectIds', label: 'Связанные проекты', type: 'multicheck', options: () => (store.projects || []).map((project) => ({ value: project.id, label: project.name })) },
    ],
    validate: (payload) => payload.title ? null : 'Укажите название цели',
    onSave: async (payload) => {
      if (isEdit) await Resources.goals.update(g.id, payload);
      else await Resources.goals.create(payload);
      Modal.close();
      toast('Сохранено');
      if (isEdit) Views.goalDetail(g.id); else Router.go('/goals');
    },
    onDelete: isEdit && Auth.canDeleteItem('goals', g) ? () => deleteGoal(g.id) : null,
  });
}

async function deleteGoal(id) {
  const ok = await confirmAction('Удалить эту цель?');
  if (!ok) return;
  await Resources.goals.remove(id);
  Modal.close();
  toast('Цель удалена');
  Router.go('/goals');
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openGoalModal });
