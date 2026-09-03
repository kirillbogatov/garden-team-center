// Entity UI, action registry and status controls.
// Переиспользуемые кусочки интерфейса: аватарки, бейджи, модалки, тосты.

// Реестр обработчиков клика для случаев, когда в onclick нужно передать произвольный текст
// (например, URL документа) — вместо того чтобы вставлять его прямо в HTML-атрибут (что легко
// сломать кавычками внутри текста), кладём функцию в массив и вызываем по номеру.
const _actionRegistry = new Map();
let _actionSeq = 0;
function registerAction(fn) {
  const id = String(++_actionSeq);
  _actionRegistry.set(id, fn);
  return id;
}
function runAction(id, ...args) {
  const fn = _actionRegistry.get(String(id));
  if (fn) fn(...args);
}
function resetActionRegistry() {
  _actionRegistry.clear();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-action-id]');
  if (!target) return;
  if (target.dataset.actionStop === '1') event.stopPropagation();
  runAction(target.dataset.actionId, event);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest?.('[data-action-id][role="button"], [data-action-id][role="link"]');
  if (!target) return;
  event.preventDefault();
  if (target.dataset.actionStop === '1') event.stopPropagation();
  runAction(target.dataset.actionId, event);
});

function avatarImgStyle(person, size) {
  if (!person) return '';
  const parts = [];
  const pos = person.photoPosition || person.photoObjectPosition;
  if (pos) parts.push(`object-position:${String(pos)}`);
  const zoomRaw = person[`photoZoom${String(size || 'md').toUpperCase()}`] ?? person.photoZoom;
  const zoom = Number(zoomRaw);
  if (Number.isFinite(zoom) && zoom > 0 && Math.abs(zoom - 1) > 0.001) {
    parts.push(`transform:scale(${Math.max(0.8, Math.min(2, zoom)).toFixed(2)})`);
    parts.push('transform-origin:center center');
  }
  return parts.length ? ` style="${escapeHtml(parts.join(';'))}"` : '';
}

function avatarHtml(person, size) {
  size = size || 'md';
  const sizeClass = size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '';
  if (!person) {
    return `<span class="ui-avatar avatar ${sizeClass}" style="background:var(--avatar-empty-bg)">?</span>`;
  }
  if (person.photoUrl) {
    // Если фото не загрузится (битая ссылка, удалённый файл), делегированный
    // обработчик 'error' в interactions.js подставит те же инициалы, что ниже —
    // без этого сломанное изображение показывает alt-текст, «протекающий» за рамку.
    const fallbackBg = colorForId(person.id);
    const fallbackFg = readableInk(fallbackBg);
    const fallbackText = escapeHtml(initials(person.name));
    return `<span class="ui-avatar avatar ${sizeClass} has-photo" data-avatar-fallback-bg="${fallbackBg}" data-avatar-fallback-fg="${fallbackFg}" data-avatar-fallback-text="${fallbackText}"><img src="${escapeHtml(person.photoUrl)}" alt="${escapeHtml(person.name)}" loading="lazy" decoding="async"${avatarImgStyle(person, size)} /></span>`;
  }
  const background = colorForId(person.id);
  return `<span class="ui-avatar avatar ${sizeClass}" style="background:${background};color:${readableInk(background)}">${escapeHtml(initials(person.name))}</span>`;
}

// Кликабельный аватар для карточек других сущностей. Клик не должен всплывать
// до задачи/проекта/Labs и открывать их форму вместо профиля человека.
function personAvatarLinkHtml(person, size) {
  if (!person) return avatarHtml(person, size);
  const actionIdx = registerAction(() => Router.go(personPath(person)));
  return `<span class="ui-person-avatar person-avatar-link" role="link" tabindex="0" aria-label="Открыть профиль ${escapeHtml(person.name)}" data-action-id="${actionIdx}" data-action-stop="1">${avatarHtml(person, size)}</span>`;
}

// Аватар с точкой-индикатором в углу, если человек сейчас работает.
function avatarWithStatusHtml(person, vacations, size) {
  const s = personWorkStatus(person, vacations);
  const working = s && s.text === 'работает';
  return `<span class="ui-avatar-wrap avatar-wrap">${avatarHtml(person, size)}${working ? '<span class="avatar-status-dot"></span>' : ''}</span>`;
}

function personChip(person) {
  if (!person) return '<span class="tiny">—</span>';
  const actionIdx = registerAction(() => Router.go(personPath(person)));
  return `<span class="flex items-center gap-6 clickable" role="link" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1">${avatarHtml(person)}<span>${escapeHtml(person.name)}</span></span>`;
}

function projectChip(project) {
  if (!project) return '';
  const actionIdx = registerAction(() => Router.go(projectPath(project)));
  return `<span class="ui-tag ui-tag--project badge project-chip clickable" role="link" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1">${escapeHtml(project.name)}</span>`;
}

// Контекстные метки задачи: если меток несколько, проект всегда крайний справа.
function taskLabelsHtml(task) {
  if (!task) return '';
  const labels = [];
  if (task.taskType && task.taskType !== 'standard') {
    labels.push(`<span class="ui-tag ui-tag--task-type badge task-kind ${escapeHtml(task.taskType)}">${escapeHtml(TASK_TYPE_LABEL[task.taskType] || task.taskType)}</span>`);
  }
  if (task.priority === 'high') labels.push(priorityBadge(task.priority));
  const project = store.project(task.projectId);
  if (project) labels.push(projectChip(project));
  return labels.length ? `<span class="ui-tag-group task-labels-group">${labels.join('')}</span>` : '';
}

// Обычный приоритет не показывается — бейдж нужен только чтобы обратить внимание на высокий.
function priorityBadge(priority) {
  if (priority !== 'high') return '';
  return `<span class="ui-tag badge priority-high" style="--ui-tag-dot: var(--orange)">${PRIORITY_LABEL.high}</span>`;
}

// Аналогично приоритету — обычная серьёзность проблемы не показывается.
function severityBadge(severity) {
  if (severity !== 'high') return '';
  return `<span class="ui-tag badge" style="--ui-tag-dot:${ISSUE_SEVERITY_COLOR.high}">${ISSUE_SEVERITY_LABEL.high}</span>`;
}

const ISSUE_STATUS_SYMBOL = {
  open: '',
  in_progress: '◐',
  resolved: '✓',
};
const ISSUE_STATUS_ICON_CLASS = {
  open: 'todo',
  in_progress: 'in_progress',
  resolved: 'done',
};

// Статус проблемы показываем теми же иконками, что и в задачах: новая, в работе, решена.
function issueStatusBadge(status, issueId) {
  const label = ISSUE_STATUS_LABEL[status] || status || 'Статус';
  const iconClass = ISSUE_STATUS_ICON_CLASS[status] || 'todo';
  const symbol = ISSUE_STATUS_SYMBOL[status] ?? '';
  if (!issueId) {
    return `<span class="task-status-icon task-status-${escapeHtml(iconClass)} issue-status-icon" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${symbol}</span>`;
  }
  const actionIdx = registerAction((event) => openIssueStatusMenu(event, issueId, status));
  return `<span class="task-status-icon task-status-${escapeHtml(iconClass)} issue-status-icon task-status-interactive" aria-label="Изменить статус: ${escapeHtml(label)}" title="${escapeHtml(label)}" role="button" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1">${symbol}</span>`;
}

function openIssueStatusMenu(event, issueId, currentStatus) {
  closeTaskStatusMenu();
  const anchor = event?.currentTarget || event?.target;
  if (!anchor || !issueId) return;

  const order = ['open', 'in_progress', 'resolved'];
  const menu = document.createElement('div');
  menu.className = 'task-status-menu issue-status-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = order.map((status) => {
    const label = ISSUE_STATUS_LABEL[status] || status;
    const iconClass = ISSUE_STATUS_ICON_CLASS[status] || 'todo';
    const symbol = ISSUE_STATUS_SYMBOL[status] ?? '';
    return `<button type="button" class="task-status-menu-item ${status === currentStatus ? 'active' : ''}" role="menuitemradio" aria-checked="${status === currentStatus ? 'true' : 'false'}" data-status="${status}">
      <span class="task-status-icon task-status-${iconClass}" aria-hidden="true">${symbol}</span>
      <span class="task-status-menu-label">${escapeHtml(label)}</span>
      ${status === currentStatus ? `<span class="task-status-menu-check">✓</span>` : ''}
    </button>`;
  }).join('');
  document.body.appendChild(menu);
  _taskStatusMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 7;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
  if (top + menuRect.height > window.innerHeight - 10) top = Math.max(10, rect.top - menuRect.height - gap);
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;

  menu.querySelectorAll('.task-status-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newStatus = item.dataset.status;
      if (!newStatus || newStatus === currentStatus) { closeTaskStatusMenu(); return; }
      menu.classList.add('is-saving');
      try {
        await api.put('/api/issues/' + issueId, { status: newStatus });
        closeTaskStatusMenu();
        toast(`Статус: ${ISSUE_STATUS_LABEL[newStatus]}`);
        await store.loadAll();
        await Router.render();
      } catch (err) {
        console.error(err);
        menu.classList.remove('is-saving');
        toast('Не удалось изменить статус');
      }
    });
  });

  _taskStatusMenuOutsideHandler = (e) => {
    if (!_taskStatusMenu?.contains(e.target) && e.target !== anchor) closeTaskStatusMenu();
  };
  _taskStatusMenuKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeTaskStatusMenu(); anchor.focus?.(); }
  };
  setTimeout(() => document.addEventListener('mousedown', _taskStatusMenuOutsideHandler, true), 0);
  document.addEventListener('keydown', _taskStatusMenuKeyHandler, true);
  menu.querySelector('.task-status-menu-item.active')?.focus();
}

const TASK_STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'paused', 'blocked', 'done'];
const TASK_STATUS_SYMBOL = {
  todo: '',
  in_progress: '◐',
  in_review: '◎',
  paused: 'Ⅱ',
  blocked: '×',
  done: '✓',
};

function taskStatusBadge(status, taskId) {
  const label = TASK_STATUS_LABEL[status] || status || 'Статус';
  const symbol = TASK_STATUS_SYMBOL[status] ?? '○';
  if (!taskId) {
    return `<span class="task-status-icon task-status-${escapeHtml(status || 'unknown')}" aria-hidden="true">${symbol}</span>`;
  }
  const task = (store.tasks || []).find((t) => t.id === taskId);
  if (window.Auth && task && !Auth.canEditTask(task)) {
    return `<span class="task-status-icon task-status-${escapeHtml(status || 'unknown')}" aria-label="${escapeHtml(label)}">${symbol}</span>`;
  }
  const actionIdx = registerAction((event) => openTaskStatusMenu(event, taskId, status));
  return `<span class="task-status-icon task-status-${escapeHtml(status || 'unknown')} task-status-interactive" aria-label="Изменить статус: ${escapeHtml(label)}" role="button" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1">${symbol}</span>`;
}

let _taskStatusMenu = null;
let _taskStatusMenuOutsideHandler = null;
let _taskStatusMenuKeyHandler = null;

function closeTaskStatusMenu() {
  if (_taskStatusMenu) _taskStatusMenu.remove();
  _taskStatusMenu = null;
  if (_taskStatusMenuOutsideHandler) document.removeEventListener('mousedown', _taskStatusMenuOutsideHandler, true);
  if (_taskStatusMenuKeyHandler) document.removeEventListener('keydown', _taskStatusMenuKeyHandler, true);
  _taskStatusMenuOutsideHandler = null;
  _taskStatusMenuKeyHandler = null;
}

function openTaskStatusMenu(event, taskId, currentStatus) {
  closeTaskStatusMenu();
  const eventTarget = event?.target;
  const anchor = eventTarget?.closest?.('.task-status-interactive') || (eventTarget?.classList?.contains('task-status-icon') ? eventTarget : null);
  if (!anchor || !taskId) return;

  const menu = document.createElement('div');
  menu.className = 'task-status-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = TASK_STATUS_ORDER.map((status) => {
    const label = TASK_STATUS_LABEL[status] || status;
    const symbol = TASK_STATUS_SYMBOL[status] ?? '○';
    return `<button type="button" class="task-status-menu-item ${status === currentStatus ? 'active' : ''}" role="menuitemradio" aria-checked="${status === currentStatus ? 'true' : 'false'}" data-status="${status}">
      <span class="task-status-icon task-status-${status}" aria-hidden="true">${symbol}</span>
      <span class="task-status-menu-label">${escapeHtml(label)}</span>
      ${status === currentStatus ? `<span class="task-status-menu-check">✓</span>` : ''}
    </button>`;
  }).join('');
  document.body.appendChild(menu);
  _taskStatusMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 7;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
  if (top + menuRect.height > window.innerHeight - 10) top = Math.max(10, rect.top - menuRect.height - gap);
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;

  menu.querySelectorAll('.task-status-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newStatus = item.dataset.status;
      if (!newStatus || newStatus === currentStatus) { closeTaskStatusMenu(); return; }
      menu.classList.add('is-saving');
      try {
        if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
        await api.put('/api/tasks/' + taskId, { status: newStatus });
        closeTaskStatusMenu();
        toast(`Статус: ${TASK_STATUS_LABEL[newStatus]}`);
        await store.loadAll();
        await Router.render();
      } catch (err) {
        console.error(err);
        menu.classList.remove('is-saving');
        toast('Не удалось изменить статус');
      }
    });
  });

  _taskStatusMenuOutsideHandler = (e) => {
    if (!_taskStatusMenu?.contains(e.target) && e.target !== anchor) closeTaskStatusMenu();
  };
  _taskStatusMenuKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeTaskStatusMenu(); anchor.focus?.(); }
  };
  setTimeout(() => document.addEventListener('mousedown', _taskStatusMenuOutsideHandler, true), 0);
  document.addEventListener('keydown', _taskStatusMenuKeyHandler, true);
  menu.querySelector('.task-status-menu-item.active')?.focus();
}

