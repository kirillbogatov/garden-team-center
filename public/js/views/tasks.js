// Задачи — списком, в разрезе статуса, сотрудника или проекта.

Views._taskGroupBy = 'status';
Views._taskStatusFilter = 'all';
Views._taskPersonFilter = 'all';
Views._taskWorkMode = localStorage.getItem('garden:taskWorkMode') === 'development' ? 'development' : 'projects';
Views._taskProjectFilter = 'all';
Views._taskViewMode = 'list';
Views._taskFiltersCollapsed = localStorage.getItem('garden:taskFiltersCollapsed') === '1';
Views._taskQuery = Views._taskQuery || '';
Views._taskSearchOpen = Views._taskSearchOpen || false;

// Внутри группы/колонки задачи сортируются по приоритету (та же логика, что
// в «Обзоре»), а не лежат в порядке создания, как раньше — иначе старая
// задача без дедлайна перекрывала горящую свежую. Стратегия всегда берётся
// из Настроек — здесь раньше был переключатель для ручного выбора другой
// стратегии, но его убрали, чтобы освободить место на панели фильтров под
// поиск по задачам.
function sortTasksForDisplay(taskList) {
  const mode = GardenSettings.value?.taskPriorityMode || 'balanced';
  const today = todayStr();
  return [...taskList].sort((a, b) => compareTasksByPriority(a, b, mode, today));
}

// Общий текстовый поиск по названию задачи — используется и при первичном
// рендере страницы, и в живом фильтре инлайн-поиска (та же схема, что
// filterJournalEntries в Журнале).
function filterTasksByQuery(taskList, query) {
  const q = (query || '').trim().toLocaleLowerCase('ru');
  if (!q) return taskList;
  return taskList.filter((t) => (t.title || '').toLocaleLowerCase('ru').includes(q));
}

function taskListTopbarHtml(mineOnly, filtersCollapsed) {
  const taskWorkModeControlHtml = `<div class="task-header-work-mode" aria-label="Тип задач">
    <div class="ui-segmented seg-toggle task-work-mode-toggle">
      <button type="button" class="ui-segmented-item seg-btn ${Views._taskWorkMode === 'projects' ? 'active' : ''}" data-task-work-mode="projects" aria-pressed="${Views._taskWorkMode === 'projects'}">Проекты</button>
      <button type="button" class="ui-segmented-item seg-btn ${Views._taskWorkMode === 'development' ? 'active' : ''}" data-task-work-mode="development" aria-pressed="${Views._taskWorkMode === 'development'}">Развитие</button>
    </div>
  </div>`;
  return `<h1>${mineOnly ? 'Мои задачи' : 'Задачи'}</h1>
    <div class="actions task-header-actions">
      ${taskWorkModeControlHtml}
      <div class="ui-segmented seg-toggle task-view-toggle" aria-label="Представление задач">
        <button class="ui-segmented-item seg-btn ${Views._taskViewMode === 'list' ? 'active' : ''}" id="task-view-list" title="Список">${icon('list', 14)}</button>
        <button class="ui-segmented-item seg-btn ${Views._taskViewMode === 'kanban' ? 'active' : ''}" id="task-view-kanban" title="Канбан">${icon('columns', 14)}</button>
      </div>
      <button type="button" class="ui-button ui-button--sm btn btn-sm task-filter-toggle" id="task-filter-toggle" aria-expanded="${filtersCollapsed ? 'false' : 'true'}" title="${filtersCollapsed ? 'Показать фильтры' : 'Скрыть фильтры'}">
        <span class="task-filter-toggle-chevron ${filtersCollapsed ? '' : 'open'}">${icon('chevronRight', 12)}</span>
        <span>Фильтры</span>
      </button>
      ${Auth.canCreate('tasks') ? `<button class="ui-button ui-button--primary btn btn-primary" id="task-create-button">+ Добавить задачу</button>` : ''}
    </div>`;
}

function taskFilterToolbarHtml(isKanban, filtersCollapsed, taskPersonFilter) {
  const statusFilterHtml = !isKanban ? `<select id="task-status-filter" class="task-filter-select task-filter-status" aria-label="Фильтр по статусу">
      <option value="all" ${Views._taskStatusFilter === 'all' ? 'selected' : ''}>Все задачи</option>
      ${TASK_STATUS_ORDER.map((st) => `<option value="${st}" ${Views._taskStatusFilter === st ? 'selected' : ''}>${TASK_STATUS_LABEL[st]}</option>`).join('')}
      <option value="archived" ${Views._taskStatusFilter === 'archived' ? 'selected' : ''}>Архив</option>
    </select>` : '';
  // Поиск по названию задачи занимает место бывшего переключателя сортировки:
  // свёрнут — просто иконка, разворачивается в текстовое поле по клику.
  const searchHtml = Views._taskSearchOpen
    ? `<input id="task-search-input" type="search" class="task-search-input" placeholder="Поиск задач" value="${escapeHtml(Views._taskQuery || '')}" aria-label="Поиск задач" />
       <button type="button" class="ui-icon-button" id="task-search-close" title="Закрыть поиск" aria-label="Закрыть поиск">${icon('close', 14)}</button>`
    : `<button type="button" class="ui-icon-button" id="task-search-toggle" title="Поиск задач" aria-label="Поиск задач">${icon('search', 16)}</button>`;

  return `<div class="task-sticky-toolbar ${filtersCollapsed ? 'is-collapsed' : ''}" aria-hidden="${filtersCollapsed ? 'true' : 'false'}" ${filtersCollapsed ? 'inert' : ''}>
    <div class="task-toolbar-inner">
      <div class="task-filter-controls">
      ${statusFilterHtml}
      ${!isKanban ? `<select id="task-group-filter" class="task-filter-select task-filter-group" aria-label="Группировка задач">
        <option value="status" ${Views._taskGroupBy === 'status' ? 'selected' : ''}>По статусам</option>
        <option value="person" ${Views._taskGroupBy === 'person' ? 'selected' : ''}>По сотрудникам</option>
        <option value="project" ${Views._taskGroupBy === 'project' ? 'selected' : ''}>По проектам</option>
      </select>` : ''}
      ${Views._taskWorkMode === 'projects' ? `<select id="task-project-filter" class="task-filter-select task-filter-project" aria-label="Фильтр по проекту">
        <option value="all" ${Views._taskProjectFilter === 'all' ? 'selected' : ''}>Все проекты</option>
        ${store.projects.map((p) => `<option value="project:${p.id}" ${Views._taskProjectFilter === 'project:' + p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>` : ''}
      <select id="task-person-filter" class="task-filter-select task-filter-person" aria-label="Фильтр по сотруднику">
        <option value="all" ${taskPersonFilter === 'all' ? 'selected' : ''}>Все сотрудники</option>
        ${store.team().map((p) => `<option value="${p.id}" ${taskPersonFilter === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <div class="task-search-slot">${searchHtml}</div>
      </div>
    </div>
  </div>`;
}

// Группировка меняет только представление списка; остальные контролы остаются фильтрами.
function taskGroupsFor(rawListTasks) {
  // Сортируем один раз до разбивки на группы: filter() ниже сохраняет
  // относительный порядок, так что каждая группа получается уже отсортированной.
  const listTasks = sortTasksForDisplay(rawListTasks);
  let groups;
  if (Views._taskGroupBy === 'person') {
    groups = store.team().map((person) => ({
      key: `person:${person.id}`,
      label: person.name,
      tasks: listTasks.filter((t) => (t.assigneeIds || []).includes(person.id)),
    }));
    const unassigned = listTasks.filter((t) => !(t.assigneeIds || []).length);
    if (unassigned.length) groups.push({ key: 'person:unassigned', label: 'Без сотрудника', tasks: unassigned });
  } else if (Views._taskGroupBy === 'project') {
    groups = store.projects.map((project) => ({
      key: `project:${project.id}`,
      label: project.name,
      tasks: listTasks.filter((t) => t.projectId === project.id),
    }));
    const withoutProject = listTasks.filter((t) => !t.projectId);
    if (withoutProject.length) groups.push({ key: 'project:none', label: 'Без проекта', tasks: withoutProject });
  } else {
    groups = TASK_STATUS_ORDER.map((status) => ({
      key: status,
      label: TASK_STATUS_LABEL[status],
      color: TASK_STATUS_COLOR[status],
      tasks: listTasks.filter((t) => t.status === status),
    }));
  }
  return groups.filter((g) => g.tasks.length);
}

// Столбец под срок должен быть одной ширины у всех строк на странице сразу
// (не у каждой группы своя) — иначе лейбл проекта у задачи без срока стоит
// заметно ближе к аватарке, чем у соседней задачи со сроком, и колонки
// внутри списка не выровнены по вертикали. Меряем по уже отрисованным
// строкам: если срока нет ни у одной видимой задачи — столбец схлопывается
// совсем (CSS в style.css переключается по классу has-task-due-dates); если
// есть — ширина берётся по самому длинному из реально показанных текстов, а
// не с запасом «на вырост».
function syncTaskDueColumnWidth(container) {
  // Пока не добавлен has-task-due-dates, .task-due-cell скрыт (display:none) —
  // сначала включаем класс, чтобы ячейки реально отрисовались, и только потом
  // меряем. И меряем через getBoundingClientRect(), а не scrollWidth/
  // offsetWidth: у самого текста — inline <span> (класс .tiny), а у строчных
  // (inline) элементов offsetWidth/scrollWidth всегда возвращают 0 в браузере,
  // это их родовая особенность, а не что-то специфичное для скрытых ячеек.
  // getBoundingClientRect() у inline-элементов работает как положено.
  container.classList.add('has-task-due-dates');
  const dueSpans = container.querySelectorAll('.task-due-cell span');
  let maxWidth = 0;
  dueSpans.forEach((span) => { maxWidth = Math.max(maxWidth, span.getBoundingClientRect().width); });
  container.classList.toggle('has-task-due-dates', dueSpans.length > 0);
  if (dueSpans.length) container.style.setProperty('--task-due-col-width', `${Math.ceil(maxWidth)}px`);
}

function taskListContentHtml(tasks, archiveMode, allTasksCount, groups) {
  if (!tasks.length) {
    return archiveMode
      ? emptyState('Архив пуст', 'Архивные задачи появятся здесь', 'tasks')
      : allTasksCount
        ? emptyState('Ничего не найдено', 'Попробуйте изменить фильтры', 'tasks')
        : emptyState('Задач пока нет', 'Создайте первую задачу', 'tasks');
  }
  if (Views._taskViewMode === 'kanban') {
    const kanbanTasks = sortTasksForDisplay(tasks);
    return `<div class="task-kanban-wrap"><div class="kanban task-kanban">${TASK_STATUS_ORDER.map((status) => {
      const columnTasks = kanbanTasks.filter((t) => t.status === status);
      return `<section class="kanban-col task-kanban-col" data-status="${status}">
        <div class="kanban-col-title"><span>${TASK_STATUS_LABEL[status]}</span></div>
        <div class="task-kanban-stack" data-status="${status}">${columnTasks.length ? columnTasks.map(taskKanbanCardHtml).join('') : `<div class="kanban-empty">Нет задач</div>`}</div>
      </section>`;
    }).join('')}</div></div>`;
  }
  const separated = true;
  const groupSectionsHtml = groups.map((g) => {
    const hasSavedCollapseState = Object.prototype.hasOwnProperty.call(Views._taskCollapsed, g.key);
    const defaultCollapsed = Views._taskGroupBy === 'status' && g.key === 'done' && !archiveMode;
    const collapsed = hasSavedCollapseState ? !!Views._taskCollapsed[g.key] : defaultCollapsed;
    const rows = g.tasks.map(taskListRowHtml);
    return `<section class="task-group-section ${separated ? 'separated' : ''} ${collapsed ? 'is-collapsed' : ''}" data-task-group="${escapeHtml(g.key)}">
        <div class="ui-disclosure group-header clickable" data-command="toggleTaskGroup" data-command-arg="${g.key}" data-command-self="1" aria-expanded="${collapsed ? 'false' : 'true'}">
          <span class="group-chevron" style="${collapsed ? '' : 'transform:rotate(90deg)'}">${icon('chevronRight', 10)}</span><span class="task-group-title">${escapeHtml(g.label)}</span>
        </div>
        <div class="task-group-body-shell ${collapsed ? 'is-collapsed' : ''}"><div class="task-group-body">${rows.join('') || `<div class="tiny task-group-empty">Пусто</div>`}</div></div>
      </section>`;
  }).join('');
  return `<div class="view-narrow task-groups ${separated ? 'task-groups-separated' : ''}">${groupSectionsHtml}</div>`;
}

Views.tasks = async function () {
  const createRequested = Router.queryParam('create') === '1';
  const createTitle = Router.queryParam('title');
  const createAssigneeIds = String(Router.queryParam('assignees') || '').split(',').map((id) => id.trim()).filter((id) => store.person(id));
  const createProjectId = Router.queryParam('createProject');
  const mineOnly = Router.queryParam('mine') === '1';
  const currentPersonId = Auth.user?.personId || null;
  const requestedPersonId = Router.queryParam('person');
  const requestedPerson = requestedPersonId ? store.person(requestedPersonId) : null;
  const requestedProjectFilter = Router.queryParam('project');
  const requestedWorkMode = Router.queryParam('workMode');
  const requestedStatus = Router.queryParam('status');
  if (requestedWorkMode === 'development' || requestedWorkMode === 'projects') Views._taskWorkMode = requestedWorkMode;
  if (requestedStatus && ['all','todo','in_progress','in_review','blocked','paused','done','archived'].includes(requestedStatus)) Views._taskStatusFilter = requestedStatus;
  if (requestedProjectFilter === 'all') Views._taskProjectFilter = 'all';
  else if (requestedProjectFilter && store.projects.some((project) => project.id === requestedProjectFilter)) Views._taskProjectFilter = `project:${requestedProjectFilter}`;
  // Переходы из виджетов могут сразу открыть задачи конкретного сотрудника.
  // Query-параметр задаёт только фильтр сотрудника и не сбрасывает остальные
  // настройки представления/фильтры страницы.
  const taskPersonFilter = mineOnly && currentPersonId
    ? currentPersonId
    : (requestedPerson ? requestedPerson.id : Views._taskPersonFilter);
  const isKanban = Views._taskViewMode === 'kanban';
  const filtersCollapsed = !!Views._taskFiltersCollapsed;
  setTopbar(taskListTopbarHtml(mineOnly, filtersCollapsed));
  const taskCreateButton = document.getElementById('task-create-button');
  if (taskCreateButton) {
    taskCreateButton.onclick = () => {
      const prefill = {};
      if (taskPersonFilter !== 'all') prefill.assigneeIds = [taskPersonFilter];
      prefill.taskType = Views._taskWorkMode === 'development' ? 'development' : 'standard';
      if (Views._taskWorkMode === 'projects' && Views._taskProjectFilter?.startsWith('project:')) {
        prefill.projectId = Views._taskProjectFilter.slice('project:'.length);
      }
      FeatureLoader.run('openTaskModal', null, { prefill });
    };
  }
  const view = document.getElementById('view');
  view.classList.add('task-page');
  view.classList.toggle('task-board-wide', isKanban);
  const workspace = await api.get('/api/workspace-settings').catch(() => ({ taskAutoArchiveDays: 14 }));
  const archiveDays = Number(workspace?.taskAutoArchiveDays) || 14;
  const archiveMode = !isKanban && Views._taskStatusFilter === 'archived';

  // Один запрос со всеми задачами, включая архив: счётчики на вкладках статуса
  // и сама вкладка «Архив» считаются от одного и того же набора — до того, как
  // к нему применится сам статус (иначе вкладки показывали бы количество
  // задач ПОСЛЕ фильтра, а не общее число в каждой категории, как в референсе).
  const allRecords = await Resources.tasks.list({ includeArchived: 1 });
  let scoped = allRecords.filter((t) => Views._taskWorkMode === 'development'
    ? t.taskType === 'development'
    : t.taskType !== 'development');
  if (Views._taskWorkMode === 'projects' && Views._taskProjectFilter !== 'all' && Views._taskProjectFilter.startsWith('project:')) {
    const projectId = Views._taskProjectFilter.slice('project:'.length);
    scoped = scoped.filter((t) => t.projectId === projectId);
  }
  if (mineOnly) {
    scoped = currentPersonId ? scoped.filter((t) => (t.assigneeIds || []).includes(currentPersonId)) : [];
  }
  if (taskPersonFilter !== 'all') scoped = scoped.filter((t) => (t.assigneeIds || []).includes(taskPersonFilter));
  const scopedActive = scoped.filter((t) => !t.archivedAt);
  const scopedArchived = scoped.filter((t) => t.archivedAt);
  const allTasksCount = scopedActive.length;

  const taskToolbarHtml = taskFilterToolbarHtml(isKanban, filtersCollapsed, taskPersonFilter);
  view.innerHTML = `${taskToolbarHtml}<div id="task-content"><div class="tiny">Загрузка…</div></div>`;
  const content = document.getElementById('task-content');

  let tasks = isKanban ? scopedActive : (archiveMode ? scopedArchived : scopedActive);
  if (!isKanban && Views._taskStatusFilter !== 'all' && Views._taskStatusFilter !== 'archived') {
    tasks = tasks.filter((t) => t.status === Views._taskStatusFilter);
  }
  // Текстовый поиск — последний слой фильтра, уже поверх статуса/сотрудника/
  // проекта; allTasksCount выше считается до него, поэтому пустой результат
  // поиска по-прежнему показывает «Ничего не найдено», а не «Задач пока нет».
  const preSearchTasks = tasks;
  tasks = filterTasksByQuery(preSearchTasks, Views._taskQuery);

  const listTasks = tasks;
  const groups = taskGroupsFor(listTasks);

  Views._taskCollapsed = Views._taskCollapsed || {};
  content.innerHTML = taskListContentHtml(tasks, archiveMode, allTasksCount, groups);
  syncTaskDueColumnWidth(content);

  const filterToggle = document.getElementById('task-filter-toggle');
  if (filterToggle) filterToggle.onclick = () => {
    Views._taskFiltersCollapsed = !Views._taskFiltersCollapsed;
    localStorage.setItem('garden:taskFiltersCollapsed', Views._taskFiltersCollapsed ? '1' : '0');
    const toolbar = document.querySelector('.task-sticky-toolbar');
    toolbar?.classList.toggle('is-collapsed', Views._taskFiltersCollapsed);
    toolbar?.setAttribute('aria-hidden', Views._taskFiltersCollapsed ? 'true' : 'false');
    if (toolbar) toolbar.inert = Views._taskFiltersCollapsed;
    filterToggle.setAttribute('aria-expanded', Views._taskFiltersCollapsed ? 'false' : 'true');
    filterToggle.title = Views._taskFiltersCollapsed ? 'Показать фильтры' : 'Скрыть фильтры';
    filterToggle.querySelector('.task-filter-toggle-chevron')?.classList.toggle('open', !Views._taskFiltersCollapsed);
  };
  const statusFilter = document.getElementById('task-status-filter');
  if (statusFilter) statusFilter.onchange = (e) => {
    Views._taskStatusFilter = e.target.value;
    if (Views._taskStatusFilter === 'archived') Views._taskViewMode = 'list';
    Views.tasks();
  };
  const groupFilter = document.getElementById('task-group-filter');
  if (groupFilter) groupFilter.onchange = (e) => {
    Views._taskGroupBy = e.target.value;
    Views.tasks();
  };
  const searchToggle = document.getElementById('task-search-toggle');
  if (searchToggle) searchToggle.onclick = () => {
    Views._taskSearchOpen = true;
    Views.tasks();
  };
  const searchClose = document.getElementById('task-search-close');
  if (searchClose) searchClose.onclick = () => {
    Views._taskSearchOpen = false;
    Views._taskQuery = '';
    Views.tasks();
  };
  const searchInput = document.getElementById('task-search-input');
  if (searchInput) {
    searchInput.focus();
    const caretPos = searchInput.value.length;
    searchInput.setSelectionRange(caretPos, caretPos);
    // Фильтруем на лету поверх уже загруженного preSearchTasks — как
    // journalSearchInput в Журнале, без похода на сервер на каждую букву.
    searchInput.oninput = () => {
      Views._taskQuery = searchInput.value;
      const shown = filterTasksByQuery(preSearchTasks, Views._taskQuery);
      content.innerHTML = taskListContentHtml(shown, archiveMode, allTasksCount, taskGroupsFor(shown));
      syncTaskDueColumnWidth(content);
      if (isKanban) initTaskKanbanDnD();
    };
  }
  document.querySelectorAll('[data-task-work-mode]').forEach((button) => {
    button.onclick = () => {
      const nextMode = button.dataset.taskWorkMode === 'development' ? 'development' : 'projects';
      if (Views._taskWorkMode === nextMode) return;
      Views._taskWorkMode = nextMode;
      Views._taskProjectFilter = 'all';
      localStorage.setItem('garden:taskWorkMode', nextMode);
      Views.tasks();
    };
  });
  const projectFilter = document.getElementById('task-project-filter');
  if (projectFilter) projectFilter.onchange = (e) => { Views._taskProjectFilter = e.target.value; Views.tasks(); };
  const personFilter = document.getElementById('task-person-filter');
  if (personFilter) personFilter.onchange = (e) => {
    Views._taskPersonFilter = e.target.value;
    if (mineOnly || requestedPersonId) Router.replace('/tasks');
    Views.tasks();
  };
  document.getElementById('task-view-list').onclick = () => { Views._taskViewMode = 'list'; Views.tasks(); };
  document.getElementById('task-view-kanban').onclick = () => {
    if (Views._taskStatusFilter === 'archived') Views._taskStatusFilter = 'all';
    Views._taskViewMode = 'kanban'; Views.tasks();
  };
  if (isKanban) initTaskKanbanDnD();

  if (createRequested && Auth.canCreate('tasks')) {
    // Переход из Журнала открывает форму создания уже на странице Задач.
    // Query очищаем до открытия формы, чтобы повторный render не открывал её снова.
    Router.replace('/tasks');
    const prefill = {};
    if (createTitle) prefill.title = createTitle;
    if (createAssigneeIds.length) prefill.assigneeIds = [...new Set(createAssigneeIds)];
    prefill.taskType = Views._taskWorkMode === 'development' ? 'development' : 'standard';
    if (createProjectId && store.project(createProjectId)) {
      prefill.projectId = createProjectId;
      prefill.taskType = 'standard';
    }
    await openTaskModal(null, { prefill });
  }
};

function toggleTaskGroup(key, header) {
  const section = header?.closest('.task-group-section');
  const shell = section?.querySelector('.task-group-body-shell');
  if (!section || !shell) return;
  const collapsed = shell.classList.toggle('is-collapsed');
  section.classList.toggle('is-collapsed', collapsed);
  Views._taskCollapsed[key] = collapsed;
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const chevron = header.querySelector('.group-chevron');
  if (chevron) chevron.style.transform = collapsed ? '' : 'rotate(90deg)';
}

function taskKanbanCardHtml(t) {
  const assignees = (t.assigneeIds || []).map((id) => store.person(id)).filter(Boolean);
  const project = store.project(t.projectId);
  const overdue = t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < todayStr();
  const openIdx = registerAction(() => openTaskModal(t.id));
  return `<article class="kanban-card task-kanban-card" draggable="true" data-task-id="${t.id}" data-task-open-action="${openIdx}">
    <div class="kc-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
    <div class="task-kanban-tags">
      ${taskLabelsHtml(t)}
      ${t.dueDate ? `<span class="tiny" style="${overdue ? 'color:var(--red)' : ''}">${taskDueLabel(t)}</span>` : ''}
    </div>
    <div class="kc-meta">
      <span style="flex:1"></span>
      ${assignees.length ? `<div class="flex gap-4">${assignees.map((a) => personAvatarLinkHtml(a)).join('')}</div>` : avatarHtml(null)}
    </div>
  </article>`;
}

Views._taskJustDragged = false;

function initTaskKanbanDnD() {
  let dragged = null;
  document.querySelectorAll('.task-kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragged = card;
      Views._taskJustDragged = true;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.taskId || '');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.task-kanban-stack').forEach((stack) => stack.classList.remove('drag-over'));
      setTimeout(() => { Views._taskJustDragged = false; }, 80);
      dragged = null;
    });
  });

  document.querySelectorAll('.task-kanban-stack').forEach((stack) => {
    stack.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.task-kanban-stack').forEach((other) => other.classList.toggle('drag-over', other === stack));
    });
    stack.addEventListener('dragleave', (e) => {
      if (!stack.contains(e.relatedTarget)) stack.classList.remove('drag-over');
    });
    stack.addEventListener('drop', async (e) => {
      e.preventDefault();
      stack.classList.remove('drag-over');
      const taskId = (dragged && dragged.dataset.taskId) || e.dataTransfer.getData('text/plain');
      const newStatus = stack.dataset.status;
      if (!taskId || !newStatus) return;
      const sourceStatus = dragged?.closest('.task-kanban-stack')?.dataset.status;
      if (sourceStatus === newStatus) return;
      try {
        await Resources.tasks.update(taskId, { status: newStatus });
        toast(`Статус: ${TASK_STATUS_LABEL[newStatus]}`);
        await store.loadAll();
        Views.tasks();
      } catch (err) {
        console.error(err);
        toast('Не удалось изменить статус');
      }
    });
  });
}

Views._taskCache = {};


function taskDetailGoBack() {
  // Route through the guarded back action so unsaved task edits can be handled
  // before the browser history entry changes.
  Router.back();
}

Views.taskDetailPage = async function (ref) {
  const task = await Resources.tasks.get(ref);
  if (String(ref || '').toUpperCase() !== String(task.taskKey || '').toUpperCase()) Router.replace(taskPath(task));
  return openTaskModal(task.id, { asPage: true, taskRecord: task });
};

function taskDetailTopbarHtml(t, canEdit, canDelete, isArchived) {
  const hasTaskActions = true;
  return `<h1 class="topbar-h1-key">${escapeHtml(t.taskKey || '')}</h1>
    <div class="actions task-detail-topbar-actions">
      <button type="button" class="sidebar-collapse-btn task-notes-sidebar-toggle" id="task-notes-toggle" aria-label="Скрыть панель стикеров" title="Скрыть панель стикеров" aria-expanded="true">${icon('sticky', 16)}</button>
      ${hasTaskActions ? `<div class="task-actions-menu-wrap">
        <button type="button" class="ui-button btn task-detail-topbar-btn" id="task-actions-toggle" aria-haspopup="menu" aria-expanded="false">Действия</button>
        <div class="task-actions-menu" id="task-actions-menu" role="menu" hidden>
          <button type="button" class="task-actions-menu-item" id="task-version-history" role="menuitem">${icon('clock',14)} История версий</button>
          ${canEdit ? (isArchived
            ? `<button type="button" class="task-actions-menu-item" id="task-restore" role="menuitem">${icon('refresh',14)} Вернуть из архива</button>`
            : `<button type="button" class="task-actions-menu-item" id="task-archive" role="menuitem">${icon('archive',14)} В архив</button>`) : ''}
          ${canDelete ? `<button type="button" class="task-actions-menu-item task-actions-menu-item-danger" id="task-delete" role="menuitem">${icon('trash',14)} Удалить</button>` : ''}
        </div>
      </div>` : ''}
      <button type="button" class="ui-button btn task-detail-topbar-btn" data-command="taskDetailGoBack">Назад</button>
    </div>
  `;
}

// Отдельная лента обсуждения задачи — по образцу «Комментариев» на странице
// проекта The Labs. Живёт независимо от боковой панели «Стикеры» (те технически
// тоже комментарии задачи, но приватные цветные заметки, а не общая переписка).
function taskDetailCommentsSectionHtml(discussion) {
  return `<section class="task-comments-section"><div class="task-comments-head"><span>Комментарии</span><span class="task-comments-count" id="task-discussion-count">${discussion.length || ''}</span></div><div class="task-comments-list" id="task-discussion-list">${commentThreadHtml(discussion)}</div><div class="task-comment-compose"><textarea id="task-discussion-input" rows="2" placeholder="Оставить комментарий…"></textarea><button type="button" class="ui-button btn task-comment-send-inline" id="task-discussion-send" hidden>Отправить</button></div></section>`;
}

function taskDetailBodyHtml(t, canEdit, isArchived, assignees, goalOptions, issueOptions, taskNotes, discussion) {
  return `
    <div class="task-detail-shell">
${detailPageHeaderHtml({ title: t.title, eyebrow: '', inputId: 'tf-title', displayId: 'tf-title-display', shellId: 'tf-title-shell', editable: canEdit, ariaLabel: 'Название задачи' })}

      <div class="task-detail-layout">
        <main class="task-detail-main">
          <section class="task-detail-section task-detail-details-section">
            <div class="task-detail-details-grid">
              <div class="task-detail-details-column">
                <div class="task-detail-property task-detail-assignee-property"><span>Исполнитель</span>
                  ${canEdit ? `<div class="task-inline-edit task-inline-edit-assignees is-editable" id="tf-assignee-shell">
                    <div id="tf-assignee-display" class="task-detail-assignee-read task-detail-assignee-display" role="button" tabindex="0">${assignees.length ? assignees.map((person) => `<span>${avatarHtml(person)}${escapeHtml(person.name)}</span>`).join('') : '<span class="muted">Не назначено</span>'}</div>
                    <div id="tf-assignee-edit" class="task-detail-assignee-edit" hidden><div id="tf-assignee-wrap" class="task-detail-assignees">${peoplePickerHtml('Добавить исполнителя…')}</div><div class="task-assignee-copy-hint">Дополнительные исполнители получат собственные копии задачи</div></div>
                    <span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>
                  </div>` : `<div class="task-detail-assignee-read">${assignees.length ? assignees.map((person) => `<span>${avatarHtml(person)}${escapeHtml(person.name)}</span>`).join('') : '<span class="muted">Не назначено</span>'}</div>`}
                </div>
                <label class="task-detail-property"><span>Проект</span><span class="task-inline-edit ${canEdit ? 'is-editable' : ''}"><select id="tf-project" ${canEdit ? '' : 'disabled'}><option value="">—</option>${optionsHtml(store.projects, 'id', (p) => p.name, t.projectId)}</select>${canEdit ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>` : ''}</span></label>
                <label class="task-detail-property"><span>Дедлайн</span><span class="task-inline-edit task-inline-edit-due ${canEdit ? 'is-editable' : ''}"><span id="tf-due-empty" class="task-due-empty" ${t.dueDate ? 'hidden' : ''}>Не указан</span><input id="tf-due" type="date" value="${t.dueDate ? t.dueDate.slice(0,10) : ''}" ${t.dueDate ? '' : 'hidden'} ${canEdit ? '' : 'disabled'} />${canEdit ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>` : ''}</span></label>
              </div>
              <div class="task-detail-details-column">
                <div class="task-detail-property task-detail-status-property"><span>Статус</span>${(() => {
                  const status = t.status || 'todo';
                  const label = TASK_STATUS_LABEL[status] || '';
                  if (!(canEdit && !isArchived)) return `<div class="task-detail-status-control">${taskStatusBadge(status, null)}<span>${escapeHtml(label)}</span></div>`;
                  const statusActionId = registerAction((event) => openTaskStatusMenu(event, t.id, status));
                  return `<div class="task-detail-status-control task-detail-status-click-target task-status-interactive" role="button" tabindex="0" aria-label="Изменить статус: ${escapeHtml(label)}" data-action-id="${statusActionId}" data-action-stop="1">${taskStatusBadge(status, null)}<span>${escapeHtml(label)}</span></div>`;
                })()}</div>
                <label class="task-detail-property"><span>Тип</span><span class="task-inline-edit ${canEdit ? 'is-editable' : ''}"><select id="tf-type" ${canEdit ? '' : 'disabled'}>${['standard','development'].map((v) => `<option value="${v}" ${(t.taskType || 'standard') === v ? 'selected' : ''}>${TASK_TYPE_LABEL[v]}</option>`).join('')}</select>${canEdit ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>` : ''}</span></label>
                <label class="task-detail-property"><span>Приоритет</span><span class="task-inline-edit ${canEdit ? 'is-editable' : ''}"><select id="tf-priority" ${canEdit ? '' : 'disabled'}>${['normal','high'].map((s) => `<option value="${s}" ${(t.priority || 'normal') === s ? 'selected' : ''}>${PRIORITY_LABEL[s]}</option>`).join('')}</select>${canEdit ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>` : ''}</span></label>
              </div>
            </div>
          </section>

          <section class="task-detail-section task-detail-description-section">
            <div class="task-detail-section-label task-detail-section-title">Описание</div>
            <div class="task-inline-edit task-inline-edit-description ${canEdit ? 'is-editable' : ''}">
              ${canEdit
                // Ссылки в описании должны быть кликабельными без входа в режим
                // редактирования, поэтому по умолчанию показываем тот же читаемый
                // рендер, что и для пользователей без права правки (см. renderLinkedText
                // ниже), и переключаемся на textarea только по клику — как заголовок и
                // остальные inline-edit поля этой страницы.
                ? `<div id="tf-desc-display" class="task-detail-description task-detail-description-readonly" role="button" tabindex="0">${renderLinkedText(t.description || '') || '<span class="muted">Добавьте описание задачи</span>'}</div><textarea id="tf-desc" class="task-detail-description" rows="4" placeholder="Добавьте описание задачи" hidden>${escapeHtml(t.description || '')}</textarea>`
                : `<textarea id="tf-desc" class="task-detail-description" hidden disabled>${escapeHtml(t.description || '')}</textarea><div class="task-detail-description task-detail-description-readonly">${renderLinkedText(t.description || '') || '<span class="muted">Описание не добавлено</span>'}</div>`}
              ${canEdit ? `<span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>` : ''}
            </div>
          </section>

          <section class="task-detail-section task-relations-section">
            <div class="task-detail-section-head">
              <div class="task-detail-section-label task-detail-section-title">Связи</div>
              ${canEdit ? `<button type="button" class="task-section-add-btn" id="task-relation-add-toggle" aria-label="Добавить связь" title="Добавить связь">+</button>` : ''}
            </div>
            ${canEdit ? `<div class="task-relation-add-popover" id="task-relation-add-popover" hidden>
              <select id="task-relation-add-select"><option value="">Выберите связь…</option><optgroup label="Цели">${goalOptions.map((g) => `<option value="goal:${g.id}">${escapeHtml(g.title)}</option>`).join('')}</optgroup><optgroup label="Проблемы">${issueOptions.map((i) => `<option value="issue:${i.id}">${escapeHtml(i.title)}</option>`).join('')}</optgroup></select>
            </div>` : ''}
            <div class="task-relation-list task-relation-list-unified" id="task-relations"></div>
          </section>

          ${taskDetailCommentsSectionHtml(discussion)}

        </main>

      </div>

    </div>

    <aside class="task-detail-side" id="task-notes-drawer" aria-hidden="true">
      <div class="task-detail-note-head">
        <div><strong>Стикеры</strong></div>
        <div class="task-detail-note-actions"><button type="button" class="task-detail-icon-btn task-note-add" id="task-note-add" title="Добавить стикер" aria-label="Добавить стикер">+</button></div>
      </div>
      <div class="task-comments-list detail-sticky-comments-list unified-notes-list" id="task-comments-list">${commentThreadHtml(taskNotes, { variant: 'notes' })}</div>
    </aside>
  `;
}

// Notes are open by default on every task visit, but only where the layout
// can fit them without hiding the task itself. Below the same 940px
// breakpoint where detail-page.css switches the drawer to a full overlay
// (see "@media (max-width: 940px)" there), defaulting to open would cover
// the whole task the moment it's opened on a phone. Their state is scoped
// to the current task page instead of persisting into other routes.
function bindTaskNotesDrawer(view) {
  const taskPage = view.querySelector('.task-detail-page');
  const notesDrawer = document.getElementById('task-notes-drawer');
  const notesToggle = document.getElementById('task-notes-toggle');
  const mainShell = document.querySelector('.main');
  const setNotesDrawerOpen = (open) => {
    const isOpen = Boolean(open);
    taskPage?.classList.toggle('notes-open', isOpen);
    mainShell?.classList.toggle('task-notes-open', isOpen);
    notesDrawer?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (notesToggle) {
      const label = isOpen ? 'Скрыть панель стикеров' : 'Показать панель стикеров';
      notesToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      notesToggle.setAttribute('aria-label', label);
      notesToggle.setAttribute('title', label);
      notesToggle.classList.toggle('is-active', isOpen);
      notesToggle.innerHTML = icon('sticky', 16);
    }
  };
  setNotesDrawerOpen(window.innerWidth > 940);
  if (notesToggle) notesToggle.onclick = () => setNotesDrawerOpen(!taskPage?.classList.contains('notes-open'));
}

function bindTaskActionsMenuToggle(actionsToggle, actionsMenu) {
  if (!actionsToggle || !actionsMenu) return;
  const setActionsOpen = (open) => {
    actionsMenu.hidden = !open;
    actionsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const actionsWrap = actionsToggle.closest('.task-actions-menu-wrap');
  actionsToggle.onclick = (event) => {
    event.stopPropagation();
    const open = actionsMenu.hidden;
    setActionsOpen(open);
    if (open) bindOutsideClickClose(actionsWrap, () => setActionsOpen(false));
  };
  actionsMenu.onclick = (event) => event.stopPropagation();
}

async function openTaskModal(id, opts) {
  opts = opts || {};
  if (!id) return openTaskCreateModal(opts);

  // Existing tasks always open as a normal routed page. The modal is reserved
  // for creating a new task; taskDetailPage calls back here with asPage=true.
  if (!opts.asPage) {
    const task = opts.taskRecord || await Resources.tasks.get(id);
    Router.go(taskPath(task));
    return;
  }

  const detail = await TaskService.detail(id, opts.taskRecord);
  const t = detail.task;
  const goalOptions = detail.goals;
  const issueOptions = detail.issues;
  const personalNotesResponse = detail.personalNotes;
  const comments = detail.comments;
  let taskNotes = Array.isArray(comments) ? comments.slice() : [];
  const discussion = Array.isArray(detail.discussion) ? detail.discussion.slice() : [];
  const canEdit = Auth.canEditTask(t);
  const canDelete = Auth.canDeleteTask(t);
  const isArchived = Boolean(t.archivedAt);
  let personalNotes = Array.isArray(personalNotesResponse) ? personalNotesResponse.slice() : [];
  if (personalNotes.some((note) => String(note.text || '').trim())) {
    try {
      const existingTexts = new Set(taskNotes.map((note) => String(note.text || '').trim()).filter(Boolean));
      for (const note of personalNotes.filter((item) => String(item.text || '').trim())) {
        const text = String(note.text).trim();
        if (existingTexts.has(text)) continue;
        taskNotes.push(await Comments.create('task', t.id, { text, color: 'yellow' }));
        existingTexts.add(text);
      }
    } catch (_) {}
  }
  setTopbar(taskDetailTopbarHtml(t, canEdit, canDelete, isArchived), { crumbs: [
    { label: 'Garden', path: '/overview' },
    { label: 'Задачи', path: '/tasks' },
  ] });
  const assignees = (t.assigneeIds || []).map((personId) => store.person(personId)).filter(Boolean);
  const project = store.project(t.projectId);
  let linkedGoalIds = Relations.ids(t, 'task.goals');
  let linkedIssueIds = Relations.ids(t, 'task.issues');

  const taskDetailMarkup = taskDetailBodyHtml(t, canEdit, isArchived, assignees, goalOptions, issueOptions, taskNotes, discussion);

  const view = document.getElementById('view');
  view.classList.add('task-detail-page-view');
  view.innerHTML = `<section class="modal-panel modal-task-detail task-detail-page">${taskDetailMarkup}</section>`;


  // Keep the description field exactly as tall as its content. This runs on
  // initial render and after every edit so long descriptions never get clipped.
  const descriptionField = document.getElementById('tf-desc');
  const resizeTaskDescription = () => {
    if (!descriptionField) return;
    descriptionField.style.height = 'auto';
    descriptionField.style.height = `${Math.max(descriptionField.scrollHeight, 52)}px`;
  };
  resizeTaskDescription();
  descriptionField?.addEventListener('input', resizeTaskDescription);

  bindTaskNotesDrawer(view);

  const actionsToggle = document.getElementById('task-actions-toggle');
  const actionsMenu = document.getElementById('task-actions-menu');
  bindTaskActionsMenuToggle(actionsToggle, actionsMenu);

  const versionHistoryButton = document.getElementById('task-version-history');
  if (versionHistoryButton) versionHistoryButton.onclick = async () => {
    actionsMenu && (actionsMenu.hidden = true);
    if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
    openVersionHistory('tasks', t, { canRestore: canEdit });
  };

  let queueTaskAutosave = null;
  const assigneePicker = canEdit
    ? initPeoplePicker(document.getElementById('tf-assignee-wrap'), store.team(), t.assigneeIds || [], { multi: true, placeholder: 'Добавить исполнителя…', onChange: () => queueTaskAutosave?.(true) })
    : null;

  if (canEdit) {
    const titleShell = document.getElementById('tf-title-shell');
    const titleDisplay = document.getElementById('tf-title-display');
    const titleInput = document.getElementById('tf-title');
    const beginTitleEdit = () => {
      if (!titleInput.hidden) return;
      titleDisplay.hidden = true;
      titleInput.hidden = false;
      titleShell.classList.add('is-editing');
      titleInput.focus();
      const end = titleInput.value.length;
      try { titleInput.setSelectionRange(end, end); } catch (_) {}
    };
    titleDisplay.onclick = beginTitleEdit;
    titleDisplay.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginTitleEdit(); } };
    titleInput.onblur = () => {
      if (!titleInput.value.trim()) return;
      titleDisplay.textContent = titleInput.value.trim();
      titleInput.hidden = true;
      titleDisplay.hidden = false;
      titleShell.classList.remove('is-editing');
    };

    // Описание показывает кликабельные ссылки (renderLinkedText) по умолчанию
    // и переключается на textarea только по клику — как заголовок выше.
    const descriptionDisplay = document.getElementById('tf-desc-display');
    const beginDescriptionEdit = (event) => {
      if (event?.target?.closest?.('a')) return;
      if (!descriptionField.hidden) return;
      descriptionDisplay.hidden = true;
      descriptionField.hidden = false;
      descriptionField.focus();
      resizeTaskDescription();
      const end = descriptionField.value.length;
      try { descriptionField.setSelectionRange(end, end); } catch (_) {}
    };
    descriptionDisplay.onclick = beginDescriptionEdit;
    descriptionDisplay.onkeydown = (e) => {
      if (e.target.closest?.('a')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginDescriptionEdit(e); }
    };
    descriptionField.onblur = () => {
      descriptionDisplay.innerHTML = renderLinkedText(descriptionField.value) || '<span class="muted">Добавьте описание задачи</span>';
      descriptionField.hidden = true;
      descriptionDisplay.hidden = false;
    };

    const assigneeShell = document.getElementById('tf-assignee-shell');
    const assigneeDisplay = document.getElementById('tf-assignee-display');
    const assigneeEdit = document.getElementById('tf-assignee-edit');
    let assigneeOutsideHandler = null;
    const refreshAssigneeDisplay = () => {
      const selected = [...(assigneePicker?.getSelected?.() || [])].map((personId) => store.person(personId)).filter(Boolean);
      assigneeDisplay.innerHTML = selected.length
        ? selected.map((person) => `<span>${avatarHtml(person)}${escapeHtml(person.name)}</span>`).join('')
        : '<span class="muted">Не назначено</span>';
    };
    const closeAssigneeEdit = () => {
      if (assigneeEdit.hidden) return;
      refreshAssigneeDisplay();
      assigneeEdit.hidden = true;
      assigneeDisplay.hidden = false;
      assigneeShell.classList.remove('is-editing');
      if (assigneeOutsideHandler) {
        document.removeEventListener('pointerdown', assigneeOutsideHandler, true);
        assigneeOutsideHandler = null;
      }
    };
    const beginAssigneeEdit = () => {
      if (!assigneeEdit.hidden) return;
      assigneeDisplay.hidden = true;
      assigneeEdit.hidden = false;
      assigneeShell.classList.add('is-editing');
      assigneeEdit.querySelector('button, input, [tabindex]')?.focus();
      assigneeOutsideHandler = (event) => {
        if (!assigneeShell.contains(event.target)) closeAssigneeEdit();
      };
      requestAnimationFrame(() => document.addEventListener('pointerdown', assigneeOutsideHandler, true));
    };
    assigneeDisplay.onclick = beginAssigneeEdit;
    assigneeDisplay.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginAssigneeEdit(); } };

    const dueInput = document.getElementById('tf-due');
    const dueEmpty = document.getElementById('tf-due-empty');
    const dueShell = dueInput?.closest('.task-inline-edit-due');
    const openDueEditor = () => {
      if (!dueInput || !dueEmpty || dueInput.disabled) return;
      dueEmpty.hidden = true;
      dueInput.hidden = false;
      dueInput.focus();
      try { dueInput.showPicker?.(); } catch (_) {}
    };
    if (dueEmpty && dueShell) {
      dueEmpty.setAttribute('role', 'button');
      dueEmpty.tabIndex = 0;
      dueEmpty.onclick = (event) => { event.preventDefault(); openDueEditor(); };
      dueEmpty.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDueEditor(); } };
      dueShell.addEventListener('click', (event) => {
        if (!dueInput.hidden || event.target === dueInput) return;
        openDueEditor();
      });
      dueInput.addEventListener('blur', () => {
        if (!dueInput.value) { dueInput.hidden = true; dueEmpty.hidden = false; }
      });
      dueInput.addEventListener('change', () => {
        if (dueInput.value) dueEmpty.hidden = true;
      });
    }

    // The disclosure chevron sits outside native selects. Clicking that small
    // affordance should open the same picker as clicking the value itself.
    document.querySelectorAll('.task-detail-property .task-inline-edit select').forEach((select) => {
      const shell = select.closest('.task-inline-edit');
      if (!shell) return;
      shell.addEventListener('click', (event) => {
        if (event.target === select || select.disabled) return;
        event.preventDefault();
        select.focus();
        try { select.showPicker?.(); } catch (_) { select.click(); }
      });
    });
  }

  const renderTaskRelations = () => {
    const wrap = document.getElementById('task-relations');
    if (!wrap) return;
    const rows = [];
    linkedGoalIds.forEach((goalId) => {
      const goal = goalOptions.find((g) => g.id === goalId);
      if (!goal) return;
      rows.push(`<div class="task-relation-item"><span class="task-relation-kind">Цель</span><button type="button" class="task-relation-link" data-goal-open="${goal.id}">${escapeHtml(goal.title)}</button>${canEdit ? `<button type="button" class="task-relation-remove" data-goal-remove="${goal.id}" aria-label="Убрать связь">×</button>` : ''}</div>`);
    });
    linkedIssueIds.forEach((issueId) => {
      const issue = issueOptions.find((i) => i.id === issueId);
      if (!issue) return;
      rows.push(`<div class="task-relation-item"><span class="task-relation-kind">Проблема</span><button type="button" class="task-relation-link" data-issue-open="${issue.id}">${escapeHtml(issue.title)}</button>${canEdit ? `<button type="button" class="task-relation-remove" data-issue-remove="${issue.id}" aria-label="Убрать связь">×</button>` : ''}</div>`);
    });
    wrap.innerHTML = rows.length ? rows.join('') : '<div class="task-relation-empty">Связей пока нет</div>';
    wrap.querySelectorAll('[data-goal-open]').forEach((el) => { el.onclick = () => Router.go(goalPath(goalOptions.find((g) => g.id === el.dataset.goalOpen))); });
    wrap.querySelectorAll('[data-issue-open]').forEach((el) => { el.onclick = () => FeatureLoader.run('openIssueModal', el.dataset.issueOpen); });
    wrap.querySelectorAll('[data-goal-remove]').forEach((el) => { el.onclick = () => { linkedGoalIds = linkedGoalIds.filter((id) => id !== el.dataset.goalRemove); renderTaskRelations(); queueTaskAutosave?.(true); }; });
    wrap.querySelectorAll('[data-issue-remove]').forEach((el) => { el.onclick = () => { linkedIssueIds = linkedIssueIds.filter((id) => id !== el.dataset.issueRemove); renderTaskRelations(); queueTaskAutosave?.(true); }; });
  };

  renderTaskRelations();

  if (canEdit) {
    // Заголовок редактируется через #tf-title-shell/-display/-input — те же элементы,
    // что уже обвязаны выше в отдельном блоке if (canEdit). Там это локальные const
    // внутри своего блока, здесь нужны свои ссылки на те же элементы DOM.
    const titleShell = document.getElementById('tf-title-shell');
    const titleDisplay = document.getElementById('tf-title-display');
    const titleInput = document.getElementById('tf-title');
    const relationToggle = document.getElementById('task-relation-add-toggle');
    const relationPopover = document.getElementById('task-relation-add-popover');
    const relationSelect = document.getElementById('task-relation-add-select');
    relationToggle.onclick = () => {
      relationPopover.hidden = !relationPopover.hidden;
      if (!relationPopover.hidden) relationSelect.focus();
    };
    relationSelect.onchange = () => {
      const [kind, relationId] = String(relationSelect.value || '').split(':');
      if (!relationId) return;
      if (kind === 'goal' && !linkedGoalIds.includes(relationId)) linkedGoalIds.push(relationId);
      if (kind === 'issue' && !linkedIssueIds.includes(relationId)) linkedIssueIds.push(relationId);
      relationSelect.value = '';
      relationPopover.hidden = true;
      renderTaskRelations();
      queueTaskAutosave?.(true);
    };

    const currentTaskPayload = () => ({
      title: document.getElementById('tf-title').value.trim(),
      description: document.getElementById('tf-desc').value.trim(),
      taskType: document.getElementById('tf-type').value || 'standard',
      projectId: document.getElementById('tf-project').value || null,
      assigneeIds: [...assigneePicker.getSelected()].sort(),
      priority: document.getElementById('tf-priority').value || 'normal',
      dueDate: document.getElementById('tf-due').value || null,
      goalId: linkedGoalIds[0] || null,
      goalIds: [...linkedGoalIds].sort(),
      issueIds: [...linkedIssueIds].sort(),
    });
    let lastSavedTaskPayload = JSON.stringify(currentTaskPayload());

    const saveTaskChanges = async () => {
      const payload = currentTaskPayload();
      if (!payload.title) { toast('Укажите название задачи'); return false; }
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedTaskPayload) return true;
      try {
        const saved = await Resources.tasks.update(t.id, payload);
        lastSavedTaskPayload = serialized;
        Object.assign(t, saved || payload);
        const localIndex = (store.tasks || []).findIndex((item) => item.id === t.id);
        if (localIndex >= 0) store.tasks[localIndex] = { ...store.tasks[localIndex], ...saved };
        const newCopies = Number(saved?.createdCopies || 0);
        if (newCopies > 0) {
          await store.loadAll();
          toast(newCopies === 1 ? 'Создана копия для нового исполнителя' : `Создано копий: ${newCopies}`);
        }
        return true;
      } catch (error) {
        console.error(error);
        toast('Не удалось сохранить изменения');
        throw error;
      }
    };

    const autosave = DetailAutosave.set(createAutosave(saveTaskChanges, { delay: 550 }), { entityType: 'tasks', entityId: t.id });
    queueTaskAutosave = (immediate = false) => autosave.schedule(immediate);
    Router.setLeaveGuard(async () => { await autosave.flush(); await DetailAutosave.finalizeVersion(); return true; }, () => autosave.pending);

    ['tf-title','tf-desc'].forEach((fieldId) => {
      document.getElementById(fieldId)?.addEventListener('input', () => queueTaskAutosave(false));
    });
    ['tf-type','tf-project','tf-priority','tf-due'].forEach((fieldId) => {
      document.getElementById(fieldId)?.addEventListener('change', () => queueTaskAutosave(true));
    });

    // Enter commits immediately. In multiline detail fields Shift+Enter is the
    // explicit way to insert a new line.
    bindDetailCommitOnEnter(descriptionField, () => queueTaskAutosave(true));
    ['tf-title','tf-type','tf-project','tf-priority','tf-due'].forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      field?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        if (fieldId === 'tf-title') {
          const value = field.value.trim();
          if (!value) { toast('Укажите название задачи'); return; }
          field.value = value;
          titleDisplay.textContent = value;
          field.hidden = true;
          titleDisplay.hidden = false;
          titleShell.classList.remove('is-editing');
        } else {
          field.blur();
        }
        await queueTaskAutosave(true);
      });
    });

    titleInput.addEventListener('blur', () => queueTaskAutosave(true));
    descriptionField?.addEventListener('blur', () => queueTaskAutosave(true));
  }

  createCommentController({
    entityType: 'task', entityId: t.id, comments: taskNotes,
    listId: 'task-comments-list', countId: null,
    addId: 'task-note-add', variant: 'notes',
  }).bind();

  createCommentController({
    entityType: 'task-discussion', entityId: t.id, comments: discussion,
    listId: 'task-discussion-list', countId: 'task-discussion-count',
    inputId: 'task-discussion-input', sendId: 'task-discussion-send',
  }).bind();

  if (canEdit) {
    const archiveButton = document.getElementById('task-archive');
    if (archiveButton) archiveButton.onclick = () => archiveTask(t.id, t.status || 'todo');
    const restoreButton = document.getElementById('task-restore');
    if (restoreButton) restoreButton.onclick = () => restoreTask(t.id);
  }
  const deleteButton = document.getElementById('task-delete');
  if (deleteButton) deleteButton.onclick = () => deleteTask(t.id);
}



async function openTaskCreateModal(opts) {
  opts = opts || {};
  const t = opts.prefill ? Object.assign({}, opts.prefill) : {};
  const schema = [
    { key: 'title', label: 'Название', type: 'text', trim: true },
    { key: 'description', label: 'Описание', type: 'textarea', rows: 3, trim: true },
    { key: 'taskType', label: 'Тип', type: 'select', default: 'standard', options: Object.entries(TASK_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
    { key: 'projectId', label: 'Проект', type: 'select', emptyLabel: '—', options: () => (store.projects || []).map((p) => ({ value: p.id, label: p.name })), parse: (v) => v || null },
    { key: 'assigneeIds', label: 'Исполнители', type: 'people', multi: true, people: () => store.team(), emptyLabel: 'Не назначено', placeholder: 'Добавить исполнителя…', hint: 'Каждый новый исполнитель получает отдельную копию задачи со своим статусом.' },
    { key: 'status', label: 'Статус', type: 'select', default: 'todo', options: TASK_STATUS_ORDER.map((value) => ({ value, label: TASK_STATUS_LABEL[value] })) },
    { key: 'priority', label: 'Приоритет', type: 'select', default: 'normal', options: ['normal','high'].map((value) => ({ value, label: PRIORITY_LABEL[value] })) },
    {
      key: 'dueDate', label: 'Срок', type: 'date', parse: (v) => v || null,
      render: taskDueDateFieldHtml,
      init: bindTaskDueDateSuggestions,
    },
    // Relations and personal notes intentionally stay edit-only.
    { key: 'goalIds', label: 'Цели', type: 'text', create: false },
    { key: 'personalNotes', label: 'Заметки', type: 'textarea', create: false },
  ];
  EntityForm.open({
    title: 'Новая задача',
    saveLabel: 'Создать',
    mode: 'create',
    value: t,
    schema,
    validate: (payload) => !payload.title ? 'Укажите название задачи' : '',
    onSave: async (payload) => {
      // Обратная ссылка на Check-in, из которого создана задача (см. journal.js
      // обратная ссылка хранится только у созданной из Check-in сущности, без поля в форме
      // формы, чтобы не показывать служебный id пользователю).
      if (opts.prefill?.sourceCheckinId) payload.sourceCheckinId = opts.prefill.sourceCheckinId;
      const saved = await Resources.tasks.create(payload);
      Modal.close();
      const createdCopies = Array.isArray(saved?.copies) ? saved.copies.length : 0;
      if (createdCopies > 1) toast(`Создано ${createdCopies} экземпляра задачи`); else toast('Создано');
      if (opts.onSaved) await opts.onSaved(saved); else Router.render();
    },
    onReady: () => setTimeout(() => document.getElementById('ef-title')?.focus(), 0),
  });
}

function taskDueDateFieldHtml({ id, value, disabled }) {
  const isFriday = new Date().getDay() === 5;
  const suggestions = isFriday
    ? '<button type="button" class="task-date-suggestion" data-task-date-suggest="today">сегодня</button><span class="task-date-suggestion-separator" aria-hidden="true">·</span><button type="button" class="task-date-suggestion" data-task-date-suggest="next-monday">следующий понедельник</button>'
    : '<button type="button" class="task-date-suggestion" data-task-date-suggest="today">сегодня</button><span class="task-date-suggestion-separator" aria-hidden="true">·</span><button type="button" class="task-date-suggestion" data-task-date-suggest="tomorrow">завтра</button><span class="task-date-suggestion-separator" aria-hidden="true">·</span><button type="button" class="task-date-suggestion" data-task-date-suggest="week-end">конец недели</button>';
  return `<div class="task-due-date-create"><input id="${id}" type="date" value="${escapeHtml(value || '')}" ${disabled}/><div class="task-date-suggestions" aria-label="Быстрый выбор срока"><span class="task-date-suggestions-label">Поставить на:</span>${suggestions}</div></div>`;
}

function bindTaskDueDateSuggestions({ root }) {
  const field = root?.closest('.entity-form-field');
  if (!root || !field) return;
  const iso = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const targetDate = (kind) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    if (kind === 'tomorrow') date.setDate(date.getDate() + 1);
    if (kind === 'next-monday') {
      const day = date.getDay();
      const daysToMonday = ((8 - day) % 7) || 7;
      date.setDate(date.getDate() + daysToMonday);
    }
    if (kind === 'week-end') {
      const day = date.getDay();
      const daysToFriday = (5 - day + 7) % 7;
      // В выходные «до конца недели» означает ближайшее воскресенье,
      // чтобы саджест никогда не подставлял уже прошедшую пятницу.
      if (day === 6) date.setDate(date.getDate() + 1);
      else if (day === 0) {}
      else date.setDate(date.getDate() + daysToFriday);
    }
    return iso(date);
  };
  field.querySelectorAll('[data-task-date-suggest]').forEach((button) => {
    button.addEventListener('click', () => {
      root.value = targetDate(button.dataset.taskDateSuggest);
      root.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

async function archiveTask(id, currentStatus) {
  const ok = await new Promise((resolve) => {
    Modal.open(
      `<h2>Подтверждение</h2>
       <p class="muted" style="margin:0 0 4px">Переместить задачу в архив?</p>
       <div class="ui-modal-actions modal-actions">
         <button class="ui-button btn" id="task-archive-no">Нет</button>
         <button class="ui-button ui-button--primary btn btn-primary" id="task-archive-yes">Да</button>
       </div>`
    );
    document.getElementById('task-archive-no').onclick = () => { Modal.close(); resolve(false); };
    document.getElementById('task-archive-yes').onclick = () => { Modal.close(); resolve(true); };
  });
  if (!ok) return;
  if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
  const saved = await Resources.tasks.update(id, { archivedAt: new Date().toISOString() });
  const localIndex = (store.tasks || []).findIndex((item) => item.id === id);
  if (localIndex >= 0) store.tasks[localIndex] = { ...store.tasks[localIndex], ...(saved || {}), archivedAt: saved?.archivedAt || new Date().toISOString() };
  await Router.render();
  toast('Задача перемещена в архив');
}

async function restoreTask(id) {
  if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
  const saved = await Resources.tasks.update(id, { archivedAt: null });
  const localIndex = (store.tasks || []).findIndex((item) => item.id === id);
  if (localIndex >= 0) store.tasks[localIndex] = { ...store.tasks[localIndex], ...(saved || {}), archivedAt: null };
  Modal.close();
  await Router.render();
  toast('Задача возвращена из архива');
}

async function deleteTask(id) {
  const ok = await confirmAction('Удалить эту задачу без возможности восстановления?');
  if (!ok) return;
  if (typeof DetailAutosave !== 'undefined') DetailAutosave.clear();
  await Resources.tasks.remove(id);
  Modal.close();
  toast('Задача удалена');
  Router.go('/tasks');
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ toggleTaskGroup, taskDetailGoBack, openTaskModal });
