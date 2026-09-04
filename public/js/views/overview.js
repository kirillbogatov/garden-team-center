// Персональный обзор Garden: две настраиваемые полки — быстрые действия и сигналы.

const OVERVIEW_DEFAULT_DASHBOARD = {
  quick: [
    { id: 'my-tasks', type: 'my-tasks' },
    { id: 'my-meetings', type: 'my-meetings' },
    { id: 'quick-links', type: 'quick-links' },
  ],
  signals: [
    { id: 'goals', type: 'goals' },
    { id: 'team-workload', type: 'team-workload' },
    { id: 'priority-tasks', type: 'priority-tasks' },
    { id: 'unresolved-issues', type: 'unresolved-issues' },
    { id: 'week-events', type: 'week-events' },
    { id: 'attention-notes', type: 'attention-notes' },
  ],
};

const OVERVIEW_WIDGET_LABELS = {
  'my-tasks': 'Мои задачи',
  'project-tasks': 'Задачи проекта',
  'project-overview': 'Обзор проекта',
  'my-issues': 'Мои проблемы',
  'my-agreements': 'Мои договорённости',
  'my-journal': 'Мой журнал',
  'my-ideas': 'Мои идеи',
  'my-meetings': 'Мои встречи',
  'quick-links': 'Быстрые переходы',
  goals: 'Цели',
  'team-workload': 'Проблемы с загрузкой',
  'priority-tasks': 'Мои задачи',
  'team-priority-tasks': 'Задачи команды',
  'missed-meetings': 'Встречи без итогов',
  'unresolved-issues': 'Нерешённые проблемы',
  'week-events': 'Ближайшие 7 дней',
  'attention-notes': 'Записи из журнала',
};

const OVERVIEW_QUICK_LINKS = {
  tasks: { label: 'Задачи', icon: 'tasks', route: '/tasks' },
  projects: { label: 'Проекты', icon: 'projects', route: '/projects' },
  workload: { label: 'Загрузка команды', icon: 'team', route: '/projects?tab=load' },
  team: { label: 'Команда', icon: 'team', route: '/team' },
  meetings: { label: 'Встречи', icon: 'meetings', route: '/meetings' },
  journal: { label: 'Журнал', icon: 'journal', route: '/journal' },
  labs: { label: 'The Labs', icon: 'labs', route: '/labs' },
  'labs-projects': { label: 'Проекты Labs', icon: 'labs', route: '/labs?tab=projects' },
  knowledge: { label: 'База знаний', icon: 'documents', route: '/knowledge-base' },
  calendar: { label: 'Календарь', icon: 'calendar', route: '/calendar' },
};


function overviewDefaultDashboardForCurrentUser() {
  const personId = Auth.user?.personId || null;
  const base = structuredClone(OVERVIEW_DEFAULT_DASHBOARD);
  if (Auth.isTeamlead()) {
    const priorityIndex = base.signals.findIndex((item) => item.type === 'priority-tasks');
    const insertAt = priorityIndex >= 0 ? priorityIndex + 1 : 0;
    base.signals.splice(insertAt, 0, { id: 'team-priority-tasks', type: 'team-priority-tasks' }, { id: 'missed-meetings', type: 'missed-meetings' });
    return base;
  }
  const isRegularMember = !!Auth.user && !Auth.isAdmin();
  if (!isRegularMember || !personId) return base;

  const memberProjects = (store.projects || [])
    .filter((project) => project?.status === 'active' && (project.memberIds || []).includes(personId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));

  const quick = [
    { id: 'my-tasks', type: 'my-tasks' },
    ...memberProjects.map((project) => ({ id: `project-tasks:${project.id}`, type: 'project-tasks', projectId: project.id })),
    { id: 'my-journal', type: 'my-journal', breakBefore: true },
    { id: 'my-meetings', type: 'my-meetings' },
    { id: 'my-issues', type: 'my-issues' },
    { id: 'my-agreements', type: 'my-agreements' },
    { id: 'quick-link:knowledge', type: 'quick-link', linkKey: 'knowledge', breakBefore: true },
    { id: 'quick-link:labs-projects', type: 'quick-link', linkKey: 'labs-projects' },
    { id: 'quick-link:calendar', type: 'quick-link', linkKey: 'calendar' },
  ];

  return {
    quick,
    signals: [{ id: 'priority-tasks', type: 'priority-tasks' }, { id: 'week-events', type: 'week-events' }, { id: 'attention-notes', type: 'attention-notes' }],
  };
}


function overviewNormalizeConfig(settings) {
  const raw = settings?.overviewDashboard;
  if (!raw || typeof raw !== 'object') return overviewDefaultDashboardForCurrentUser();
  const normalizeShelf = (items, shelf) => {
    if (!Array.isArray(items)) return structuredClone(overviewDefaultDashboardForCurrentUser()[shelf]);
    return items.filter((item) => item && typeof item.id === 'string' && typeof item.type === 'string')
      .map((item) => ({ id: item.id.slice(0, 160), type: item.type.slice(0, 80), ...(item.projectId ? { projectId: String(item.projectId).slice(0, 120) } : {}), ...(item.linkKey ? { linkKey: String(item.linkKey).slice(0, 80) } : {}), ...(item.breakBefore ? { breakBefore: true } : {}) }));
  };
  return { quick: normalizeShelf(raw.quick, 'quick'), signals: normalizeShelf(raw.signals, 'signals') };
}

function overviewWidgetTitle(widget) {
  if (widget.type === 'project-overview') {
    const project = store.project(widget.projectId);
    return project ? project.name : 'Проект';
  }
  if (widget.type === 'project-tasks') {
    const project = store.project(widget.projectId);
    return project ? `Задачи · ${project.name}` : 'Задачи проекта';
  }
  if (widget.type === 'quick-link') {
    const key = widget.linkKey || String(widget.id || '').replace(/^quick-link:/, '');
    return OVERVIEW_QUICK_LINKS[key]?.label || 'Раздел';
  }
  return OVERVIEW_WIDGET_LABELS[widget.type] || 'Виджет';
}

function overviewWidgetShell(widget, shelf, body, footer = '') {
  return `<article class="overview-widget${widget.breakBefore ? ' starts-new-row' : ''}" draggable="false" data-overview-widget="${escapeHtml(widget.id)}" data-overview-shelf="${shelf}">
    <header class="overview-widget-head">
      <h3>${escapeHtml(overviewWidgetTitle(widget))}</h3>
      <button type="button" class="overview-widget-remove overview-edit-control" data-overview-remove="${escapeHtml(widget.id)}" data-overview-shelf-name="${shelf}" aria-label="Убрать виджет" title="Убрать виджет">×</button>
    </header>
    <div class="overview-widget-body">${body}</div>
    ${footer ? `<footer class="overview-widget-footer">${footer}</footer>` : ''}
  </article>`;
}

function overviewEmpty(text) { return `<div class="overview-widget-empty">${escapeHtml(text)}</div>`; }
function overviewList(items) { return `<div class="overview-mini-list">${items.join('')}</div>`; }


function taskPriorityInfo(task, mode = 'balanced', todayKey = todayStr()) {
  const weights = (TASK_PRIORITY_STRATEGIES[mode] || TASK_PRIORITY_STRATEGIES.balanced).weights;
  const dueKey = String(task?.dueDate || '').slice(0, 10);
  let score = task?.priority === 'high' ? weights.important : 0;
  const reasons = [];
  if (task?.priority === 'high') reasons.push('Важная');

  if (dueKey) {
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const [dy, dm, dd] = dueKey.split('-').map(Number);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    const dueUtc = Date.UTC(dy, dm - 1, dd);
    const days = Math.round((dueUtc - todayUtc) / 86400000);
    if (days < 0) {
      const overdueDays = Math.abs(days);
      score += weights.overdue + Math.min(weights.overdueCap, overdueDays * weights.overduePerDay);
      reasons.unshift(`Просрочено ${overdueDays} дн.`);
    } else if (days === 0) {
      score += weights.today;
      reasons.unshift('Сегодня');
    } else if (days === 1) {
      score += weights.tomorrow;
      reasons.unshift('Завтра');
    } else if (days <= 3) {
      score += weights.soon3;
      reasons.unshift(`Через ${days} дн.`);
    } else if (days <= 7) {
      score += weights.soon7;
      reasons.unshift(`Через ${days} дн.`);
    } else {
      reasons.unshift(fmtDate(dueKey));
    }
    return { score, reasons, days, dueKey };
  }
  return { score, reasons, days: null, dueKey: '' };
}

function rankedPriorityTasks(tasks, mode = 'balanced', todayKey = todayStr()) {
  return (tasks || [])
    .filter((task) => !task.archivedAt && task.status !== 'done')
    .map((task) => ({ task, info: taskPriorityInfo(task, mode, todayKey) }))
    // Задачи без срока и без пометки «Важная» не являются сигналом приоритета.
    .filter(({ task, info }) => Boolean(task.dueDate) || task.priority === 'high' || info.score > 0)
    .sort((a, b) => b.info.score - a.info.score
      || ((a.info.days ?? 99999) - (b.info.days ?? 99999))
      || String(a.task.title || '').localeCompare(String(b.task.title || ''), 'ru'));
}
// metaHtml — то же самое, что meta, но уже готовый (безопасный) HTML вместо
// текста, который будет экранирован. Нужен виджетам, которым надо выделить
// цветом часть подписи (например, «Сегодня»/«Завтра» в «Ближайшие 7 дней»),
// не теряя экранирование остальных, произвольных данных.
function overviewMiniRow({ title, meta = '', metaHtml = '', iconName = '', route = '', command = '', commandArg = '', person = null, tone = '', trailingHtml = '' }) {
  const attrs = route ? `data-route="${escapeHtml(route)}"` : command ? `data-command="${escapeHtml(command)}" data-command-arg="${escapeHtml(commandArg)}"` : '';
  const metaContent = metaHtml || (meta ? escapeHtml(meta) : '');
  return `<div class="overview-mini-row ${tone ? `is-${tone}` : ''}" ${attrs}>
    ${person ? avatarHtml(person) : iconName ? `<span class="overview-mini-icon">${icon(iconName, 13)}</span>` : ''}
    <div class="overview-mini-copy"><span>${escapeHtml(title)}</span>${metaContent ? `<small>${metaContent}</small>` : ''}</div>
    ${trailingHtml ? `<span class="overview-mini-trailing">${trailingHtml}</span>` : ''}
    <span class="overview-mini-chevron">${icon('chevronRight', 11)}</span>
  </div>`;
}


function overviewQuickAction(widget, shelf) {
  let iconName = 'chevronRight';
  let attrs = '';
  let title = overviewWidgetTitle(widget);
  let tone = 'accent';
  if (widget.type === 'my-tasks') { iconName = 'tasks'; tone = 'blue'; attrs = 'data-route="/tasks?mine=1"'; }
  else if (widget.type === 'project-overview') {
    iconName = 'projects';
    tone = 'green';
    const project = store.project(widget.projectId);
    if (project) {
      title = project.name;
      attrs = `data-route="${escapeHtml(projectPath(project))}"`;
    }
  }
  else if (widget.type === 'project-tasks') {
    iconName = 'tasks';
    tone = 'purple';
    const actionId = registerAction(() => { Views._taskProjectFilter = `project:${widget.projectId}`; Router.go('/tasks'); });
    attrs = `data-action-id="${actionId}"`;
  }
  else if (widget.type === 'my-issues') { iconName = 'issues'; tone = 'red'; attrs = 'data-route="/issues?mine=1"'; }
  else if (widget.type === 'my-agreements') { iconName = 'agreements'; tone = 'teal'; attrs = 'data-route="/agreements?mine=1"'; }
  else if (widget.type === 'my-journal') { iconName = 'journal'; tone = 'yellow'; attrs = 'data-route="/journal"'; }
  else if (widget.type === 'my-ideas') { iconName = 'ideas'; tone = 'purple'; attrs = 'data-route="/labs?tab=ideas"'; }
  else if (widget.type === 'my-meetings') { iconName = 'meetings'; tone = 'green'; attrs = 'data-route="/meetings"'; }
  else if (widget.type === 'quick-link') {
    const key = widget.linkKey || String(widget.id || '').replace(/^quick-link:/, '');
    const link = OVERVIEW_QUICK_LINKS[key];
    if (link) {
      iconName = link.icon;
      title = link.label;
      tone = 'accent';
      const actionId = registerAction(() => Router.go(link.route));
      attrs = `data-action-id="${actionId}"`;
    }
  }
  else if (widget.type === 'quick-links') { iconName = 'search'; tone = 'accent'; title = 'Перейти к разделу'; attrs = 'data-command="openPalette"'; }
  return `<div class="overview-quick-action-wrap${widget.breakBefore ? ' starts-new-row' : ''}" draggable="false" data-overview-widget="${escapeHtml(widget.id)}" data-overview-shelf="${shelf}">
    <button type="button" class="overview-quick-action" ${attrs}><span class="overview-quick-action-icon tone-${tone}">${icon(iconName, 15)}</span><span>${escapeHtml(title)}</span></button>
    <button type="button" class="overview-quick-remove overview-edit-control" data-overview-remove="${escapeHtml(widget.id)}" data-overview-shelf-name="${shelf}" aria-label="Убрать быстрое действие" title="Убрать">×</button>
  </div>`;
}


function overviewRowsFromWidgets(widgets, maxPerRow = 3) {
  const rows = [];
  let row = [];
  (widgets || []).forEach((widget, index) => {
    if (row.length && (widget.breakBefore || row.length >= maxPerRow)) {
      rows.push(row);
      row = [];
    }
    row.push(widget);
  });
  if (row.length) rows.push(row);
  return rows;
}

function overviewShelfRowsHtml(widgets, shelf, renderWidget, addSlot) {
  const hasSignalColumns = shelf === 'signals' && (widgets || []).slice(1).some((widget) => widget.breakBefore);
  const maxPerRow = shelf === 'signals' ? (hasSignalColumns ? 999 : Math.max(1, Math.ceil((widgets || []).length / 3))) : 999;
  const rows = overviewRowsFromWidgets(widgets, maxPerRow);
  const rowClass = shelf === 'signals' ? 'overview-signal-row' : 'overview-quick-row';
  const rowsHtml = rows.map((row, rowIndex) => `<div class="${rowClass} count-${Math.min(3, row.length)}" data-overview-row="${shelf}" data-overview-row-index="${rowIndex}">${row.map((w) => renderWidget(w, shelf)).join('')}</div>`).join('');
  return `${rowsHtml}${addSlot}`;
}

Views.overview = async function () {
  Views._overviewEditing = !!Views._overviewEditing;
  const customizeLabel = Views._overviewEditing ? 'Готово' : 'Настроить';
  setTopbar(`<h1>Обзор</h1><div class="actions overview-topbar-actions"><button type="button" class="sidebar-collapse-btn overview-comments-sidebar-toggle" id="overview-comments-toggle" aria-label="Показать панель стикеров" title="Показать панель стикеров" aria-expanded="false">${icon('sticky', 16)}</button><button type="button" class="ui-button btn overview-customize-btn ${Views._overviewEditing ? 'active' : ''}" id="overview-customize">${icon(Views._overviewEditing ? 'tasks' : 'settings', 14)} ${customizeLabel}</button><button class="ui-button ui-button--primary btn btn-primary" data-command="openPalette">+ Добавить</button></div>`);
  const view = document.getElementById('view');
  view.classList.remove('overview-wide');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const [tasks, meetings, issues, goals, agreements, journal, labs, settings, overviewComments] = await Promise.all([
    Resources.tasks.list({ includeArchived: 1 }),
    Resources.meetings.list(),
    Resources.issues.list(),
    Resources.goals.list(),
    Resources.agreements.list(),
    Resources.journal.list(),
    Resources.labs.list(),
    GardenSettings.load(),
    Comments.list('overview', 'main'),
  ]);

  const noteOrder = Array.isArray(settings?.overviewNoteOrder) ? settings.overviewNoteOrder : [];
  if (noteOrder.length) {
    const rank = new Map(noteOrder.map((id, index) => [String(id), index]));
    overviewComments.sort((a,b) => (rank.get(String(a.id)) ?? 9999) - (rank.get(String(b.id)) ?? 9999) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  let config = overviewNormalizeConfig(settings);
  const needsFirstMemberDashboard = !settings?.overviewDashboard && !!Auth.user && !Auth.isAdmin() && !Auth.isTeamlead() && !!Auth.user?.personId;
  if (needsFirstMemberDashboard) {
    await GardenSettings.update({ overviewDashboard: config });
  }
  // Виджет «Check-in недели» убран из Обзора — вычищаем его из уже
  // сохранённых у пользователей конфигураций, чтобы не оставлять «призрачную»
  // ссылку на удалённый тип виджета (тот же приём, что и при удалении тем).
  if ((config.signals || []).some((item) => item.type === 'checkin-week')) {
    config = { ...config, signals: config.signals.filter((item) => item.type !== 'checkin-week') };
    Views._overviewConfig = config;
    await GardenSettings.update({ overviewDashboard: config });
  }
  // Тимлиду показываем два независимых списка: собственные приоритетные задачи
  // и задачи остальных участников команды. Добавляем второй виджет и в уже
  // сохранённые конфигурации, чтобы изменение появилось без сброса Обзора.
  if (Auth.isTeamlead()) {
    const signals = [...(config.signals || [])];
    let changed = false;
    if (!signals.some((item) => item.type === 'team-priority-tasks')) {
      const ownIndex = signals.findIndex((item) => item.type === 'priority-tasks');
      signals.splice(ownIndex >= 0 ? ownIndex + 1 : 0, 0, { id: 'team-priority-tasks', type: 'team-priority-tasks' });
      changed = true;
    }
    if (!signals.some((item) => item.type === 'missed-meetings')) {
      const teamTasksIndex = signals.findIndex((item) => item.type === 'team-priority-tasks');
      signals.splice(teamTasksIndex >= 0 ? teamTasksIndex + 1 : 0, 0, { id: 'missed-meetings', type: 'missed-meetings' });
      changed = true;
    }
    if (changed) {
      config = { ...config, signals };
      Views._overviewConfig = config;
      await GardenSettings.update({ overviewDashboard: config });
    }
  }
  if (!Auth.isTeamlead() && (config.signals || []).some((item) => item.type === 'team-priority-tasks' || item.type === 'missed-meetings')) {
    config = { ...config, signals: config.signals.filter((item) => item.type !== 'team-priority-tasks' && item.type !== 'missed-meetings') };
    Views._overviewConfig = config;
    await GardenSettings.update({ overviewDashboard: config });
  }
  // Виджет записей журнала возвращаем автоматически только тогда, когда
  // у пользователя действительно есть закреплённые записи. Так его можно
  // скрыть вручную, но новое закрепление снова делает содержимое заметным.
  const hasPinnedJournalEntries = journal.some((entry) => entry.attentionPinned);
  if (hasPinnedJournalEntries && !(config.signals || []).some((item) => item.type === 'attention-notes')) {
    config = { ...config, signals: [...(config.signals || []), { id: 'attention-notes', type: 'attention-notes' }] };
    Views._overviewConfig = config;
    await GardenSettings.update({ overviewDashboard: config });
  }
  Views._overviewConfig = config;
  Views._overviewData = { tasks, meetings, issues, goals, agreements, journal, labs };
  const personId = Auth.user?.personId || null;
  const userId = Auth.user?.id || null;
  const now = new Date();
  const today = todayStr();
  const weekEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
  const weekEnd = localDateKey(weekEndDate);
  const activeTaskStatuses = new Set(['todo', 'in_progress', 'in_review']);

  const myTasks = personId ? tasks.filter((t) => !t.archivedAt && t.status !== 'done' && (t.assigneeIds || []).includes(personId)) : [];
  const myIssues = issues.filter((i) => i.status !== 'resolved' && (i.createdByUserId === userId || (personId && (i.relatedPersonIds || []).includes(personId))));
  const myAgreements = agreements.filter((a) => a.status !== 'done' && (a.createdByUserId === userId || (personId && (a.withPersonIds || []).includes(personId))));
  const authoredJournal = journal.filter((j) => !j.createdByUserId || j.createdByUserId === userId);
  const myIdeas = labs.filter((item) => item.entityType === 'idea' && (!personId || item.authorId === personId || item.createdByUserId === userId));
  const myMeetings = meetings.filter((m) => !personId || (m.participantIds || []).includes(personId) || m.createdByUserId === userId);

  const renderWidget = (widget, shelf) => {
    if (widget.type === 'my-tasks') {
      const rows = myTasks.slice(0, 5).map((t) => overviewMiniRow({ title: t.title, meta: TASK_STATUS_LABEL[t.status] || '', iconName: 'tasks', command: 'openTaskModal', commandArg: t.id }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет открытых задач'), `<a data-route="/tasks?mine=1&project=all">Все мои задачи</a>`);
    }
    if (widget.type === 'project-tasks') {
      const project = store.project(widget.projectId);
      const list = tasks.filter((t) => !t.archivedAt && t.status !== 'done' && t.projectId === widget.projectId);
      const rows = list.slice(0, 5).map((t) => overviewMiniRow({ title: t.title, meta: TASK_STATUS_LABEL[t.status] || '', iconName: 'tasks', command: 'openTaskModal', commandArg: t.id }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty(project ? 'Нет открытых задач' : 'Проект недоступен'), project ? `<a data-route="${projectPath(project)}">Открыть проект</a>` : '');
    }
    if (widget.type === 'my-issues') {
      const rows = myIssues.slice(0, 5).map((i) => overviewMiniRow({ title: i.title, meta: ISSUE_STATUS_LABEL?.[i.status] || '', iconName: 'issues', command: 'openIssueModal', commandArg: i.id }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет нерешённых проблем'), `<a data-route="/issues?mine=1">Все мои проблемы</a>`);
    }
    if (widget.type === 'my-agreements') {
      const rows = myAgreements.slice(0, 5).map((a) => overviewMiniRow({ title: plainJournalText(a.text).slice(0, 100) || 'Договорённость', meta: a.dueDate ? fmtDate(a.dueDate) : '', iconName: 'agreements', command: 'openAgreementModal', commandArg: a.id }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет открытых договорённостей'), `<a data-route="/agreements?mine=1">Все мои договорённости</a>`);
    }
    if (widget.type === 'my-journal') {
      const rows = authoredJournal.slice().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0, 5).map((j) => overviewMiniRow({ title: plainJournalText(j.text).split(/\r?\n/)[0].slice(0, 100) || 'Запись', meta: JOURNAL_KIND_LABEL[j.kind] || '', iconName: 'journal', route: `/journal?entry=${encodeURIComponent(j.id)}` }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Журнал пока пуст'), `<a data-route="/journal">Открыть журнал</a>`);
    }
    if (widget.type === 'my-ideas') {
      const rows = myIdeas.slice().sort((a,b) => new Date(b.updatedAt || b.createdAt)-new Date(a.updatedAt || a.createdAt)).slice(0, 5).map((idea) => overviewMiniRow({ title: idea.title || 'Идея', meta: LAB_STATUS_LABEL?.[idea.status] || '', iconName: 'ideas', route: '/labs?tab=ideas' }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Идей пока нет'), `<a data-route="/labs?tab=ideas">Все идеи</a>`);
    }
    if (widget.type === 'my-meetings') {
      const upcoming = myMeetings.filter((m) => String(m.date || '').slice(0,10) >= today).sort((a,b) => String(a.date).localeCompare(String(b.date)));
      const rows = upcoming.slice(0, 5).map((m) => overviewMiniRow({ title: meetingDisplayTitle(m), meta: fmtDate(m.date), iconName: 'meetings', route: meetingPath ? meetingPath(m) : `/meetings/${encodeURIComponent(m.meetingKey || m.id)}` }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет предстоящих встреч'), `<a data-route="/meetings">Все встречи</a>`);
    }
    if (widget.type === 'quick-links') {
      const links = [
        ['tasks','Задачи','/tasks'], ['projects','Проекты','/projects'], ['team','Команда','/team'], ['meetings','Встречи','/meetings'],
        ['journal','Журнал','/journal'], ['labs','The Labs','/labs'], ['documents','База знаний','/knowledge-base'], ['calendar','Календарь','/calendar'],
      ];
      const body = `<div class="overview-quick-links">${links.map(([ico,label,path]) => `<button type="button" data-route="${path}">${icon(ico, 15)}<span>${label}</span></button>`).join('')}</div>`;
      return overviewWidgetShell(widget, shelf, body);
    }
    if (widget.type === 'goals') {
      const activeGoals = goals.slice(0, 5);
      const rows = activeGoals.map((g) => overviewMiniRow({ title: g.title, iconName: 'goals', route: goalPath(g) }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет активных целей'), `<a data-route="/goals">Все цели</a>`);
    }
    if (widget.type === 'attention-notes') {
      const pinned = journal.filter((entry) => entry.attentionPinned).sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      const rows = pinned.slice(0, 7).map((entry) => overviewMiniRow({ title: plainJournalText(entry.text).split(/\r?\n/)[0].slice(0, 110) || 'Заметка', meta: JOURNAL_KIND_LABEL[entry.kind] || '', iconName: 'bookmark', route: `/journal?entry=${encodeURIComponent(entry.id)}` }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Закрепите записи в журнале, чтобы увидеть их здесь'), `<a data-route="/journal">Открыть журнал</a>`);
    }
    if (widget.type === 'team-workload') {
      // «Проблемы с загрузкой»: вместо простого списка «кто сколько загружен»
      // показываем только тех, у кого реально стоит разобраться — нет
      // активных проектов, есть проекты без единой открытой задачи, или
      // суммарная загрузка по активным проектам неполная либо превышает норму.
      const activeProjects = store.projects.filter((pr) => pr.status === 'active');
      const openTaskStatuses = new Set(['todo', 'in_progress', 'in_review', 'paused', 'blocked']);
      const problems = store.activeTeam().map((p) => {
        const projects = activeProjects.filter((pr) => (pr.memberIds || []).includes(p.id));
        const maxHours = projects.reduce((sum, pr) => sum + PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((pr.memberLoads || {})[p.id]).mode].max, 0);
        const level = projectLoadLevel(maxHours);
        const projectIds = new Set(projects.map((pr) => pr.id));
        const hasOpenTaskOnProject = tasks.some((t) => !t.archivedAt && openTaskStatuses.has(t.status) && t.projectId && projectIds.has(t.projectId) && (t.assigneeIds || []).includes(p.id));
        const issues = [];
        if (!projects.length) issues.push({ label: 'Нет активных проектов', tone: 'danger' });
        else if (!hasOpenTaskOnProject) issues.push({ label: 'Нет задач на активном проекте', tone: 'warning' });
        if (projects.length && (level.tone === 'overloaded' || level.tone === 'medium' || level.tone === 'small')) {
          issues.push({ label: level.tone === 'overloaded' ? 'Перегруз' : 'Неполная загрузка', tone: level.tone === 'overloaded' ? 'danger' : 'warning' });
        }
        return { p, issues };
      }).filter(({ issues }) => issues.length)
        .sort((a, b) => (b.issues.some((i) => i.tone === 'danger') ? 1 : 0) - (a.issues.some((i) => i.tone === 'danger') ? 1 : 0));
      const rows = problems.slice(0, 6).map(({ p, issues }) => overviewMiniRow({
        title: p.name,
        meta: issues.map((i) => i.label).join(' · '),
        person: p,
        route: `${personPath(p)}?tab=load`,
        tone: issues.some((i) => i.tone === 'danger') ? 'danger' : 'warning',
      }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Проблем с загрузкой нет'), `<a data-route="/projects?tab=load">Загрузка команды</a>`);
    }
    if (widget.type === 'priority-tasks' || widget.type === 'team-priority-tasks') {
      const priorityMode = settings?.taskPriorityMode || 'balanced';
      const isTeamWidget = widget.type === 'team-priority-tasks';
      const sourceTasks = isTeamWidget
        ? tasks.filter((task) => !personId || !(task.assigneeIds || []).includes(personId))
        : (personId ? tasks.filter((task) => (task.assigneeIds || []).includes(personId)) : []);
      const ranked = rankedPriorityTasks(sourceTasks, priorityMode, today).slice(0, 5);
      const rows = ranked.map(({ task, info }) => {
        const assignee = store.person((task.assigneeIds || [])[0]) || null;
        const projectName = store.project(task.projectId)?.name || '';
        const metaParts = [...info.reasons];
        if (projectName) metaParts.push(projectName);
        return overviewMiniRow({
          title: task.title,
          meta: metaParts.join(' · '),
          person: isTeamWidget ? assignee : null,
          iconName: isTeamWidget ? '' : 'tasks',
          route: taskPath(task),
          tone: info.days != null && info.days < 0 ? 'warning' : '',
          trailingHtml: taskStatusBadge(task.status || 'todo', task.id),
        });
      });
      const emptyText = isTeamWidget ? 'Нет приоритетных задач команды' : 'Нет моих задач с дедлайном или пометкой «Важная»';
      const taskRoute = isTeamWidget ? '/tasks?project=all' : '/tasks?mine=1&project=all';
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty(emptyText), `<a data-route="${taskRoute}">${isTeamWidget ? 'Все задачи' : 'Все мои задачи'}</a>`);
    }
    if (widget.type === 'missed-meetings') {
      const missedMeetings = meetings
        .map((meeting) => ({ meeting, days: meetingMissedDays(meeting, today) }))
        .filter((item) => item.days > 0)
        .sort((a, b) => b.days - a.days || String(a.meeting.date || '').localeCompare(String(b.meeting.date || '')));
      const rows = missedMeetings.slice(0, 7).map(({ meeting, days }) => overviewMiniRow({
        title: meetingDisplayTitle(meeting),
        meta: `${MEETING_TYPE_LABEL[meeting.type] || 'Другое'} · ${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`,
        iconName: 'meetings',
        route: meetingPath ? meetingPath(meeting) : `/meetings/${encodeURIComponent(meeting.meetingKey || meeting.id)}`,
        tone: 'warning',
      }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нет встреч без итогов'), `<a data-route="/meetings?period=missed">Все без итогов</a>`);
    }
    if (widget.type === 'unresolved-issues') {
      const list = issues.filter((i) => i.status !== 'resolved').sort((a,b) => (a.severity === 'high' ? -1 : 0) - (b.severity === 'high' ? -1 : 0));
      const rows = list.slice(0, 6).map((i) => overviewMiniRow({ title: i.title, meta: store.project(i.projectId)?.name || '', iconName: 'issues', command: 'openIssueModal', commandArg: i.id, tone: i.severity === 'high' ? 'danger' : '' }));
      return overviewWidgetShell(widget, shelf, rows.length ? overviewList(rows) : overviewEmpty('Нерешённых проблем нет'), `<a data-route="/issues">Все проблемы</a>`);
    }
    if (widget.type === 'week-events') {
      const eventRows = [];
      const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const tomorrow = localDateKey(tomorrowDate);
      // «Сегодня»/«Завтра» выделяем цветом (metaHtml, не meta) — это то, на что
      // в первую очередь смотрят в виджете предстоящих 7 дней; более дальние
      // даты остаются обычным текстом.
      const dayLabelHtml = (value) => {
        const key = String(value || '').slice(0, 10);
        if (key === today) return `<span class="overview-day-flag">Сегодня</span> · ${escapeHtml(fmtDate(key))}`;
        if (key === tomorrow) return `<span class="overview-day-flag">Завтра</span> · ${escapeHtml(fmtDate(key))}`;
        return escapeHtml(fmtDate(key));
      };
      const eventMetaHtml = (type, value, extra = '') => [escapeHtml(type), extra ? escapeHtml(extra) : '', dayLabelHtml(value)].filter(Boolean).join(' · ');

      meetings
        .filter((m) => { const d = String(m.date || '').slice(0, 10); return d >= today && d <= weekEnd; })
        .forEach((m) => {
          const meetingType = MEETING_TYPE_LABEL[m.type] || 'Встреча';
          eventRows.push({
            sort: String(m.date),
            html: overviewMiniRow({
              title: meetingDisplayTitle(m),
              metaHtml: eventMetaHtml('Встреча', m.date, meetingType !== 'Встреча' ? meetingType : ''),
              iconName: 'meetings',
              route: `/meetings/${encodeURIComponent(m.meetingKey || m.id)}`,
            }),
          });
        });

      tasks
        .filter((t) => !t.archivedAt && t.status !== 'done' && t.dueDate && String(t.dueDate).slice(0, 10) >= today && String(t.dueDate).slice(0, 10) <= weekEnd)
        .forEach((t) => eventRows.push({
          sort: `${String(t.dueDate).slice(0, 10)}T23:59`,
          html: overviewMiniRow({
            title: t.title,
            metaHtml: eventMetaHtml('Задача', t.dueDate),
            iconName: 'tasks',
            command: 'openTaskModal',
            commandArg: t.id,
          }),
        }));

      const absenceTypeLabel = { vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Отгул' };
      store.vacations
        .filter((v) => v.startDate <= weekEnd && v.endDate >= today)
        .forEach((v) => {
          const person = store.person(v.personId);
          if (!person) return;
          const displayDate = v.startDate < today ? today : v.startDate;
          eventRows.push({
            sort: `${displayDate}T00:00`,
            html: overviewMiniRow({
              title: person.name,
              metaHtml: eventMetaHtml(absenceTypeLabel[v.type] || 'Отсутствие', displayDate),
              person,
              route: personPath(person),
            }),
          });
        });

      eventRows.sort((a, b) => a.sort.localeCompare(b.sort));
      return overviewWidgetShell(widget, shelf, eventRows.length ? overviewList(eventRows.slice(0, 7).map((x) => x.html)) : overviewEmpty('На ближайшие 7 дней событий нет'), `<a data-route="/calendar">Календарь</a>`);
    }
    return '';
  };

  const shelfHtml = (name, title) => {
    const widgets = config[name] || [];
    const isQuick = name === 'quick';
    const addSlot = `<button type="button" class="overview-add-slot overview-edit-control" data-overview-add-shelf="${name}">${icon('plus', 15)}<span>Добавить ${isQuick ? 'команду' : 'виджет'}</span></button>`;
    const items = overviewShelfRowsHtml(
      widgets,
      name,
      isQuick ? overviewQuickAction : renderWidget,
      addSlot,
    );
    return `<section class="overview-shelf${widgets.length ? '' : ' is-empty'}" data-overview-shelf-container="${name}">
      ${widgets.length ? `<div class="overview-shelf-head"><h2>${title}</h2></div>` : ''}
      <div class="${isQuick ? 'overview-quick-actions' : 'overview-widget-grid'} ${widgets.length ? '' : 'is-empty'}" data-overview-dropzone="${name}">${items}</div>
    </section>`;
  };

  view.innerHTML = `<div class="overview-page-shell">
    <div class="overview-dashboard ${Views._overviewEditing ? 'is-customizing' : ''}">
      ${shelfHtml('quick','Быстрые действия')}
      ${shelfHtml('signals','Сигналы')}
    </div>
    <aside class="overview-comments-drawer" id="overview-comments-drawer" aria-hidden="true">
      <div class="overview-comments-head">
        <div><strong>Стикеры</strong></div>
        <div class="overview-notes-head-actions"><button type="button" class="task-detail-icon-btn overview-note-add" id="overview-note-add" title="Добавить стикер" aria-label="Добавить стикер">+</button></div>
      </div>
      <div class="task-comments-list overview-comments-list" id="overview-comments-list">${commentThreadHtml(overviewComments, { variant: 'notes' })}</div>
    </aside>
  </div>`;

  const overviewDrawer = document.getElementById('overview-comments-drawer');
  const overviewToggle = document.getElementById('overview-comments-toggle');
  const mainShell = document.querySelector('.main');
  let overviewNotesController = null;
  const persistOverviewNotesState = async (isOpen) => {
    if (!overviewNotesController || overviewNotesController.filledCount() < 1) return;
    try { await GardenSettings.update({ overviewNotesOpen: !!isOpen }); } catch (_) {}
  };
  const setOverviewCommentsOpen = (open, options = {}) => {
    const isOpen = Boolean(open);
    view.classList.toggle('overview-comments-open', isOpen);
    mainShell?.classList.toggle('overview-comments-open', isOpen);
    overviewDrawer?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (overviewToggle) {
      const label = isOpen ? 'Скрыть панель стикеров' : 'Показать панель стикеров';
      overviewToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      overviewToggle.setAttribute('aria-label', label);
      overviewToggle.setAttribute('title', label);
      overviewToggle.classList.toggle('is-active', isOpen);
    }
    if (options.persist !== false) persistOverviewNotesState(isOpen);
  };
  overviewNotesController = createCommentController({
    entityType: 'overview', entityId: 'main', comments: overviewComments,
    listId: 'overview-comments-list', countId: 'overview-comments-count',
    addId: 'overview-note-add', variant: 'notes', suppressEmptyAfterDelete: true,
    onChange: ({ type, savedCount }) => {
      if ((type === 'create' || type === 'update') && overviewNotesController?.filledCount() > 0) persistOverviewNotesState(view.classList.contains('overview-comments-open'));
    },
    onReorder: (order) => GardenSettings.update({ overviewNoteOrder: order }),
  }).bind();
  const hasFilledOverviewNotes = overviewComments.some((note) => String(note?.text || '').trim());
  setOverviewCommentsOpen(hasFilledOverviewNotes ? !!settings.overviewNotesOpen : false, { persist: false, ensureDraft: false });
  if (overviewToggle) overviewToggle.onclick = () => setOverviewCommentsOpen(!view.classList.contains('overview-comments-open'));

  document.getElementById('overview-customize')?.addEventListener('click', () => {
    Views._overviewEditing = !Views._overviewEditing;
    overviewApplyEditingState(Views._overviewEditing);
  });
  view.querySelectorAll('[data-overview-add-shelf]').forEach((button) => button.addEventListener('click', () => openOverviewWidgetCatalog(button.dataset.overviewAddShelf)));
  view.querySelectorAll('[data-overview-remove]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!Views._overviewEditing) return;
    await overviewRemoveWidget(button.dataset.overviewShelfName, button.dataset.overviewRemove, button.closest('[data-overview-widget]'));
  }));
  wireOverviewDragAndDrop();
  overviewApplyEditingState(Views._overviewEditing, { updateTopbar: false });
};

async function overviewSaveConfig(config) {
  Views._overviewConfig = config;
  await GardenSettings.update({ overviewDashboard: config });
}

async function overviewRemoveWidget(shelf, id, element = null) {
  const config = structuredClone(Views._overviewConfig || OVERVIEW_DEFAULT_DASHBOARD);
  config[shelf] = (config[shelf] || []).filter((item) => item.id !== id);
  await overviewSaveConfig(config);
  if (element) element.remove();
  const dropzone = document.querySelector(`[data-overview-dropzone="${shelf}"]`);
  if (dropzone) dropzone.classList.toggle('is-empty', !dropzone.querySelector('[data-overview-widget]'));
  overviewNormalizeRowsDom(shelf);
  overviewRefreshRowDropzones(shelf);
}


function overviewApplyEditingState(editing, options = {}) {
  Views._overviewEditing = !!editing;
  const dashboard = document.querySelector('.overview-dashboard');
  dashboard?.classList.toggle('is-customizing', !!editing);
  document.querySelectorAll('[data-overview-widget]').forEach((el) => { el.draggable = !!editing; });
  if (options.updateTopbar !== false) {
    const button = document.getElementById('overview-customize');
    if (button) {
      button.classList.toggle('active', !!editing);
      button.innerHTML = `${icon(editing ? 'tasks' : 'settings', 14)} ${editing ? 'Готово' : 'Настроить'}`;
    }
  }
  overviewRefreshRowDropzones('quick');
  overviewRefreshRowDropzones('signals');
}

function overviewCatalogTypes(shelf) {
  return shelf === 'quick'
    ? ['my-tasks','project-overview','project-tasks','my-issues','my-agreements','my-journal','my-ideas','my-meetings','quick-link']
    : ['goals','team-workload','priority-tasks', ...(Auth.isTeamlead() ? ['team-priority-tasks'] : []), 'unresolved-issues','week-events','attention-notes'];
}

function overviewCatalogIcon(type) {
  return ({
    'my-tasks': 'tasks',
    'project-overview': 'projects',
    'project-tasks': 'projects',
    'my-issues': 'issues',
    'my-agreements': 'agreements',
    'my-journal': 'journal',
    'my-ideas': 'ideas',
    'my-meetings': 'meetings',
    'quick-link': 'search',
    goals: 'goals',
    'team-workload': 'issues',
    'priority-tasks': 'tasks',
    'team-priority-tasks': 'tasks',
    'unresolved-issues': 'issues',
    'week-events': 'calendar',
    'attention-notes': 'bookmark',
  })[type] || 'plus';
}

function openOverviewWidgetCatalog(initialShelf = 'quick') {
  const config = Views._overviewConfig || structuredClone(OVERVIEW_DEFAULT_DASHBOARD);
  Modal.open(`<div class="overview-catalog">
    <div class="overview-catalog-head"><h2>Добавить виджет</h2><button type="button" class="overview-catalog-close" data-modal-close aria-label="Закрыть" title="Закрыть">×</button></div>
    <div class="ui-segmented overview-catalog-tabs">
      <button type="button" class="ui-segmented-item ${initialShelf === 'quick' ? 'active' : ''}" data-overview-catalog-tab="quick">Быстрые действия</button>
      <button type="button" class="ui-segmented-item ${initialShelf === 'signals' ? 'active' : ''}" data-overview-catalog-tab="signals">Сигналы</button>
    </div>
    <div id="overview-catalog-list"></div>
  </div>`, { panelClass: 'overview-catalog-modal' });

  let shelf = initialShelf;
  const render = () => {
    const container = document.getElementById('overview-catalog-list');
    if (!container) return;
    const existingIds = new Set((config[shelf] || []).map((x) => x.id));
    container.innerHTML = `<div class="overview-catalog-list">${overviewCatalogTypes(shelf).map((type) => {
      if (type === 'project-overview') {
        return `<div class="overview-catalog-row overview-catalog-row-select"><span class="overview-catalog-row-icon">${icon(overviewCatalogIcon(type), 17)}</span><span class="overview-catalog-row-label">${escapeHtml(OVERVIEW_WIDGET_LABELS[type])}</span><div class="overview-catalog-row-controls"><select id="overview-project-overview-select">${store.projects.map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select><button type="button" class="ui-button btn btn-sm" id="overview-add-project-overview">Добавить</button></div></div>`;
      }
      if (type === 'project-tasks') {
        return `<div class="overview-catalog-row overview-catalog-row-select"><span class="overview-catalog-row-icon">${icon(overviewCatalogIcon(type), 17)}</span><span class="overview-catalog-row-label">${escapeHtml(OVERVIEW_WIDGET_LABELS[type])}</span><div class="overview-catalog-row-controls"><select id="overview-project-widget-select">${store.projects.map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select><button type="button" class="ui-button btn btn-sm" id="overview-add-project-widget">Добавить</button></div></div>`;
      }
      if (type === 'quick-link') {
        return `<div class="overview-catalog-row overview-catalog-row-select"><span class="overview-catalog-row-icon">${icon(overviewCatalogIcon(type), 17)}</span><span class="overview-catalog-row-label">Переход к разделу</span><div class="overview-catalog-row-controls"><select id="overview-quick-link-select">${Object.entries(OVERVIEW_QUICK_LINKS).map(([key,item])=>`<option value="${key}">${escapeHtml(item.label)}</option>`).join('')}</select><button type="button" class="ui-button btn btn-sm" id="overview-add-quick-link">Добавить</button></div></div>`;
      }
      const added = existingIds.has(type);
      return `<button type="button" class="overview-catalog-row overview-catalog-row-button" data-overview-catalog-add="${type}" ${added ? 'disabled' : ''}><span class="overview-catalog-row-icon">${icon(overviewCatalogIcon(type), 17)}</span><span class="overview-catalog-row-label">${escapeHtml(OVERVIEW_WIDGET_LABELS[type])}</span><span class="overview-catalog-row-action">${added ? 'Добавлен' : '+'}</span></button>`;
    }).join('')}</div>`;

    container.querySelectorAll('[data-overview-catalog-add]').forEach((button) => button.addEventListener('click', async () => {
      const type = button.dataset.overviewCatalogAdd;
      config[shelf].push({ id:type, type });
      await overviewSaveConfig(config);
      toast('Обзор сохранён');
      render();
      Views.overview();
    }));
    document.getElementById('overview-add-project-overview')?.addEventListener('click', async () => {
      const projectId = document.getElementById('overview-project-overview-select')?.value;
      if (!projectId) return;
      const id = `project-overview:${projectId}`;
      if (!config.quick.some((item) => item.id === id)) config.quick.push({ id, type:'project-overview', projectId });
      await overviewSaveConfig(config);
      toast('Обзор сохранён');
      render();
      Views.overview();
    });
    document.getElementById('overview-add-project-widget')?.addEventListener('click', async () => {
      const projectId = document.getElementById('overview-project-widget-select')?.value;
      if (!projectId) return;
      const id = `project-tasks:${projectId}`;
      if (!config.quick.some((item) => item.id === id)) config.quick.push({ id, type:'project-tasks', projectId });
      await overviewSaveConfig(config);
      toast('Обзор сохранён');
      render();
      Views.overview();
    });
    document.getElementById('overview-add-quick-link')?.addEventListener('click', async () => {
      const key = document.getElementById('overview-quick-link-select')?.value;
      if (!key || !OVERVIEW_QUICK_LINKS[key]) return;
      const id = `quick-link:${key}`;
      if (!config.quick.some((item) => item.id === id)) config.quick.push({ id, type:'quick-link', linkKey:key });
      await overviewSaveConfig(config);
      toast('Обзор сохранён');
      render();
      Views.overview();
    });
  };
  document.querySelectorAll('[data-overview-catalog-tab]').forEach((button) => button.addEventListener('click', () => {
    shelf = button.dataset.overviewCatalogTab;
    document.querySelectorAll('[data-overview-catalog-tab]').forEach((b) => b.classList.toggle('active', b === button));
    render();
  }));
  render();
}

function wireOverviewDragAndDrop() {
  const view = document.getElementById('view');
  let dragged = null;

  const clearTargets = () => view.querySelectorAll('.is-drag-target,.is-row-drop-target').forEach((x) => x.classList.remove('is-drag-target','is-row-drop-target'));
  overviewRefreshRowDropzones('quick');
  overviewRefreshRowDropzones('signals');

  view.querySelectorAll('[data-overview-widget]').forEach((widget) => {
    widget.addEventListener('dragstart', (event) => {
      if (!Views._overviewEditing) { event.preventDefault(); return; }
      dragged = widget;
      widget.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', widget.dataset.overviewWidget || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    widget.addEventListener('dragend', async () => {
      widget.classList.remove('is-dragging');
      clearTargets();
      overviewNormalizeRowsDom('quick');
      overviewNormalizeRowsDom('signals');
      overviewRefreshRowDropzones('quick');
      overviewRefreshRowDropzones('signals');
      await overviewPersistDomOrder();
      dragged = null;
    });
    widget.addEventListener('dragover', (event) => {
      if (!Views._overviewEditing || !dragged || dragged === widget || dragged.dataset.overviewShelf !== widget.dataset.overviewShelf) return;
      event.preventDefault();
      const row = widget.closest('[data-overview-row]');
      if (!row) return;
      widget.classList.add('is-drag-target');
      const rect = widget.getBoundingClientRect();
      const before = widget.dataset.overviewShelf === 'signals' ? event.clientY < rect.top + rect.height / 2 : event.clientX < rect.left + rect.width / 2;
      if (before) widget.before(dragged); else widget.after(dragged);
      overviewNormalizeRowsDom(widget.dataset.overviewShelf);
      overviewRefreshRowDropzones(widget.dataset.overviewShelf);
    });
    widget.addEventListener('dragleave', () => widget.classList.remove('is-drag-target'));
  });

  view.addEventListener('dragover', (event) => {
    const zone = event.target.closest?.('[data-overview-new-row-drop]');
    if (!zone || !Views._overviewEditing || !dragged || dragged.dataset.overviewShelf !== zone.dataset.overviewNewRowDrop) return;
    event.preventDefault();
    zone.classList.add('is-row-drop-target');
  });
  view.addEventListener('dragleave', (event) => {
    event.target.closest?.('[data-overview-new-row-drop]')?.classList.remove('is-row-drop-target');
  });
  view.addEventListener('drop', (event) => {
    const zone = event.target.closest?.('[data-overview-new-row-drop]');
    if (!zone || !Views._overviewEditing || !dragged || dragged.dataset.overviewShelf !== zone.dataset.overviewNewRowDrop) return;
    event.preventDefault();
    const shelf = zone.dataset.overviewNewRowDrop;
    const newRow = document.createElement('div');
    newRow.className = shelf === 'signals' ? 'overview-signal-row count-1' : 'overview-quick-row count-1';
    newRow.dataset.overviewRow = shelf;
    newRow.appendChild(dragged);
    zone.after(newRow);
    overviewNormalizeRowsDom(shelf);
    overviewRefreshRowDropzones(shelf);
    clearTargets();
  });
}

function overviewRefreshRowDropzones(shelf) {
  const zone = document.querySelector(`[data-overview-dropzone="${shelf}"]`);
  if (!zone) return;
  zone.querySelectorAll(':scope > .overview-row-dropzone').forEach((el) => el.remove());
  const rows = [...zone.querySelectorAll(`:scope > [data-overview-row="${shelf}"]`)];
  rows.forEach((row) => {
    const drop = document.createElement('div');
    drop.className = 'overview-row-dropzone overview-edit-control';
    drop.dataset.overviewNewRowDrop = shelf;
    row.before(drop);
  });
  if (rows.length) {
    const drop = document.createElement('div');
    drop.className = 'overview-row-dropzone overview-edit-control';
    drop.dataset.overviewNewRowDrop = shelf;
    rows.at(-1).after(drop);
  }
}

function overviewNormalizeRowsDom(shelf) {
  const zone = document.querySelector(`[data-overview-dropzone="${shelf}"]`);
  if (!zone) return;
  const maxPerRow = shelf === 'signals' ? 24 : 999;
  const rowSelector = `:scope > [data-overview-row="${shelf}"]`;
  [...zone.querySelectorAll(rowSelector)].forEach((row) => {
    let children = [...row.querySelectorAll(':scope > [data-overview-widget]')];
    if (!children.length) { row.remove(); return; }
    while (children.length > maxPerRow) {
      const overflow = children.splice(maxPerRow);
      const next = document.createElement('div');
      next.className = shelf === 'signals' ? `overview-signal-row count-${Math.min(3, overflow.length)}` : `overview-quick-row count-${overflow.length}`;
      next.dataset.overviewRow = shelf;
      overflow.forEach((item) => next.appendChild(item));
      row.after(next);
    }
  });
  [...zone.querySelectorAll(rowSelector)].forEach((row, index) => {
    const count = row.querySelectorAll(':scope > [data-overview-widget]').length;
    row.className = shelf === 'signals' ? `overview-signal-row count-${Math.min(3, count)}` : `overview-quick-row count-${count}`;
    row.dataset.overviewRow = shelf;
    row.dataset.overviewRowIndex = String(index);
  });
}

async function overviewPersistDomOrder() {
  const config = structuredClone(Views._overviewConfig || OVERVIEW_DEFAULT_DASHBOARD);
  for (const shelf of ['quick', 'signals']) {
    const itemMap = new Map((config[shelf] || []).map((item) => [item.id, item]));
    const ordered = [];
    document.querySelectorAll(`[data-overview-dropzone="${shelf}"] > [data-overview-row="${shelf}"]`).forEach((row, rowIndex) => {
      row.querySelectorAll(':scope > [data-overview-widget]').forEach((el, itemIndex) => {
        const source = itemMap.get(el.dataset.overviewWidget);
        if (!source) return;
        const item = { ...source };
        if (rowIndex > 0 && itemIndex === 0) item.breakBefore = true;
        else delete item.breakBefore;
        ordered.push(item);
      });
    });
    config[shelf] = ordered;
  }
  await overviewSaveConfig(config);
}

