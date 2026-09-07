// Client router.
const Router = {
  normalizeLegacyHash() {
    const hash = location.hash || '';
    if (!hash.startsWith('#/')) return;
    const target = hash.slice(1);
    history.replaceState(null, '', target || '/overview');
  },
  routes: [
    [/^\/overview\/?$/, async () => { await loadViewScripts(['meetings','tasks','issues','agreements','journal','overview']); return Views.overview(); }],
    [/^\/journal\/?$/, async () => { await loadViewScripts(['issues','agreements','tasks','journal']); return Views.journal(); }],
    [/^\/team\/?$/, async () => { await loadViewScripts(['tasks','labs','meetings','issues','agreements','people']); return Views.team(); }],
    [/^\/stakeholders\/?$/, async () => { await loadViewScripts(['tasks','labs','meetings','issues','agreements','people']); return Views.stakeholders(); }],
    [/^\/people\/([^/]+)\/?$/, async (m) => { await loadViewScripts(['tasks','labs','meetings','issues','agreements','people']); return Views.personDetail(m[1]); }],
    [/^\/meetings\/?$/, async () => { await loadViewScript('meetings'); return Views.meetings(); }],
    [/^\/meetings\/([^/]+)\/?$/, async (m) => { await loadViewScripts(['tasks','labs','issues','agreements','meetings']); return Views.meetingDetailPage(m[1]); }],
    [/^\/calendar\/?$/, async () => { await loadViewScripts(['meetings','calendar']); return Views.calendar(); }],
    [/^\/goals\/?$/, async () => { await loadViewScripts(['tasks','issues','goals']); return Views.goals(); }],
    [/^\/goals\/([^/]+)\/?$/, async (m) => { await loadViewScripts(['tasks','issues','goals']); return Views.goalDetail(m[1]); }],
    [/^\/team-load\/?$/, async () => { await loadViewScripts(['tasks','issues','meetings','agreements','projects']); return Views.projects('load'); }],
    [/^\/projects\/?$/, async () => { await loadViewScripts(['tasks','issues','meetings','agreements','projects']); return Views.projects(); }],
    [/^\/projects\/([^/]+)\/?$/, async (m) => { await loadViewScripts(['tasks','issues','meetings','agreements','projects']); return Views.projectDetail(m[1]); }],
    [/^\/labs\/?$/, async () => { await loadViewScript('labs'); return Views.labs(); }],
    [/^\/labs\/([^/]+)\/?$/, async (m) => { await loadViewScript('labs'); return Views.labDetail(m[1]); }],
    [/^\/technology\/?$/, async () => { await loadViewScript('technology'); return Views.technology(); }],
    [/^\/tasks\/([^/]+)\/?$/, async (m) => { await loadViewScript('tasks'); return Views.taskDetailPage(m[1]); }],
    [/^\/tasks\/?$/, async () => { await loadViewScript('tasks'); return Views.tasks(); }],
    [/^\/issues\/?$/, async () => { await loadViewScript('issues'); return Views.issues(); }],
    [/^\/agreements\/?$/, async () => { await loadViewScript('agreements'); return Views.agreements(); }],
    // Check-in умеет создавать Задачу/Проблему прямо из ячейки таблицы, поэтому
    // грузим tasks/issues заранее — как это уже делает Обзор.
    [/^\/checkins\/?$/, async () => { await loadViewScripts(['tasks','issues','checkins']); return Views.checkins(); }],
    [/^\/knowledge-base\/?$/, async () => { await loadViewScript('knowledge-base'); return Views.knowledgeBase(); }],
    [/^\/knowledge-base\/([^/]+)\/?$/, async (m) => { await loadViewScript('knowledge-base'); return Views.knowledgeDocument(m[1]); }],
    // resource-folders.js подключён отдельным <script> в index.html (общая логика папок
    // для Документов и Инструментов, не ES-модуль представления) — его не нужно и нельзя
    // грузить через loadViewScripts: файла views/resource-folders.js не существует, и
    // попытка его лениво загрузить валила всю страницу с "Не удалось загрузить feature".
    [/^\/documents\/?$/, async () => { await loadViewScript('documents'); return Views.documents(); }],
    [/^\/tools\/?$/, async () => { await loadViewScript('tools'); return Views.tools(); }],
    [/^\/processes\/([^/]+)\/?$/, async (m) => { await loadViewScript('processes'); return Views.processDetailPage(m[1]); }],
    [/^\/processes\/?$/, async () => { await loadViewScript('processes'); return Views.processes(); }],
    [/^\/search\/?$/, async () => { await loadViewScripts(['meetings','tasks','issues','agreements','journal','labs','search']); return Views.search(Router.queryParam('q')); }],
    [/^\/admin\/roles\/?$/, async () => { await loadViewScript('admin'); return Auth.isAdmin() ? Views.adminRoleAccess() : Router.go('/overview'); }],
    [/^\/admin\/?$/, async () => { await loadViewScript('admin'); return Auth.isAdmin() ? Views.admin() : Router.go('/overview'); }],
    [/^\/settings\/?$/, async () => { await loadViewScript('settings'); return Views.settings(); }],
  ],
  _leaveGuard: null,
  _leaveGuardPath: null,
  _leaveDirtyCheck: null,
  _ignoreNextPopState: false,
  setLeaveGuard(guard, isDirty) {
    Router._leaveGuard = typeof guard === 'function' ? guard : null;
    Router._leaveGuardPath = Router.current();
    Router._leaveDirtyCheck = typeof isDirty === 'function' ? isDirty : null;
  },
  clearLeaveGuard() {
    if (typeof DetailAutosave !== 'undefined') DetailAutosave.clear();
    Router._leaveGuard = null;
    Router._leaveGuardPath = null;
    Router._leaveDirtyCheck = null;
  },
  async confirmLeave(target) {
    if (!Router._leaveGuard || (target && target === Router._leaveGuardPath)) return true;
    try {
      return (await Router._leaveGuard(target)) !== false;
    } catch (e) {
      console.error(e);
      toast('Не удалось сохранить изменения');
      return false;
    }
  },
  async go(path) {
    const target = path || '/overview';
    if (!(await Router.confirmLeave(target))) return;
    Router.clearLeaveGuard();
    history.pushState(null, '', target);
    Router.render();
  },
  async back() {
    if (!(await Router.confirmLeave('__back__'))) return;
    Router.clearLeaveGuard();
    if (window.history.length > 1) {
      Router._ignoreNextPopState = true;
      history.back();
      return;
    }
    history.replaceState(null, '', '/tasks');
    Router.render();
  },
  async handlePopState() {
    if (Router._ignoreNextPopState) {
      Router._ignoreNextPopState = false;
      Router.render();
      return;
    }
    const target = Router.current();
    if (!(await Router.confirmLeave(target))) {
      Router._ignoreNextPopState = true;
      history.go(1);
      return;
    }
    Router.clearLeaveGuard();
    Router.render();
  },
  replace(path) {
    let target = path || '/overview';
    history.replaceState(null, '', target);
  },
  current() {
    const path = location.pathname || '/overview';
    return path === '/' ? '/overview' : path.replace(/\/+$/, '') || '/overview';
  },
  queryParam(name) {
    return new URLSearchParams(location.search || '').get(name) || '';
  },
  _previousPath: null,
  async render() {
    resetActionRegistry();
    const path = Router.current();
    const previousPath = Router._previousPath;
    // Ассистент — одноразовый рабочий контекст. После ухода на другую страницу
    // при возвращении начинаем с чистого поля, а не показываем старый ответ.
    if (path === '/overview' && previousPath && previousPath !== '/overview' && Views._smartSearch) {
      Views._smartSearch = { query: '', result: null, busy: false, error: '', note: null };
    }
    if (path === '/tasks' && Router._previousPath !== '/tasks' && !Auth.isAdmin() && !Auth.isTeamlead() && !Auth.isManager() && Auth.user?.personId) {
      Views._taskPersonFilter = Auth.user.personId;
    }
    if (path !== '/tasks' && Router._previousPath === '/tasks') {
      // Пользовательский выбор фильтров сохраняется только внутри текущего захода в раздел.
    }
    Router._previousPath = path;
    // Notes drawer is task-detail-only. Always reset the application shift before
    // rendering a route; task detail will opt back in when its drawer is opened.
    document.querySelector('.main')?.classList.remove('task-notes-open', 'overview-comments-open');
    closeMobileNav();
    renderSidebar(path);
    const view = document.getElementById('view');
    const topbar = document.getElementById('topbar');
    view.classList.remove('task-board-wide', 'task-page', 'gcal-wide', 'gcal-fit-height', 'labs-page-view', 'task-detail-page-view', 'process-detail-page-view', 'checkins-wide', 'overview-wide', 'overview-comments-open');
    // topbar-hidden ставит только Обзор в режиме ассистента — на других страницах
    // шапка обязана вернуться.
    topbar.classList.remove('task-board-wide', 'task-list-toolbar-wide', 'topbar-hidden');
    for (const [pattern, handler] of Router.routes) {
      const m = path.match(pattern);
      if (m) {
        view.scrollTop = 0;
        try {
          await handler(m);
        } catch (e) {
          // Технические детали (HTTP-метод/URL/статус, стек) — только в консоль
          // для разработчика. Пользователю сырую английскую строку вида
          // «GET /api/tasks -> 500» показывать нельзя: он не может её понять
          // или как-то на неё среагировать.
          console.error(e);
          const hint = e?.status === 404
            ? 'Запись не найдена или у вас нет к ней доступа.'
            : 'Попробуйте обновить страницу. Если ошибка повторится — сообщите команде разработки.';
          view.innerHTML = emptyState('Что-то пошло не так', hint, 'issues');
        }
        return;
      }
    }
    Router.go('/overview');
  },
};

