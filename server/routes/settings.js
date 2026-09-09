'use strict';

const { themeValues: THEME_VALUES, accentValues: ACCENT_VALUES, defaultAccent: DEFAULT_ACCENT, defaultTheme: DEFAULT_THEME } = require('../../public/js/domain/appearance-config');

module.exports = function registerSettingsRoutes(app, deps) {
  const { db, authenticate, DATA_DIR, UPLOADS_DIR, path, isAdmin, isManager, hasPermission, denied, isDemoUser, workspaceSettings, setWorkspaceSettings, autoArchiveCompletedTasks } = deps;
  const DEFAULT_USER_SETTINGS = {
    theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT,
    glowEnabled: false,
    uiScale: 100,
    favoriteMenuItems: [],
    navSectionOverrides: {},
    overviewDashboard: null,
    overviewNotesOpen: false,
    overviewNotesWidth: 300,
    overviewNoteOrder: [],
    projectNotesOpen: {},
    personNotesOpen: {},
    taskPriorityMode: 'balanced',
    notificationEvents: { task_assigned: true, project_load_changed: true, checkin_reminder: true, issue_created: true, lab_created: true },
    // Что показывать на главном экране: 'widgets' — привычный набор виджетов,
    // 'assistant' — строка ассистента («Умный поиск») во всю рабочую область.
    overviewHomeMode: 'widgets',
    // Ассистент: последние запросы и запомненные разрешения неоднозначных
    // имён («маша» → id конкретного человека), см. server/domain/smart-search.js.
    smartSearchHistory: [],
    smartSearchPersonHints: {},
  };
  // Общий разбор пользовательских настроек вида "id -> открыт/скрыт"
  // (панель стикеров проекта, панель стикеров сотрудника): валидные строковые
  // ключи, обрезанные до разумной длины, не больше maxEntries записей.
  function sanitizeOpenStateMap(source, maxEntries) {
    const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const result = {};
    Object.entries(raw).slice(0, maxEntries).forEach(([key, value]) => {
      const id = String(key || '').slice(0, 120);
      if (id) result[id] = !!value;
    });
    return result;
  }

  function normalizeUserSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const hiddenSource = source.attentionHiddenUntil && typeof source.attentionHiddenUntil === 'object' ? source.attentionHiddenUntil : {};
    const attentionHiddenUntil = {};
    Object.entries(hiddenSource).forEach(([key, value]) => {
      const until = Number(value);
      if (key && Number.isFinite(until) && until > Date.now()) attentionHiddenUntil[String(key).slice(0, 180)] = until;
    });
    const allowedFavoriteMenuItems = [
      'team', 'stakeholders', 'goals', 'projects', 'teamLoad', 'tasks', 'issues', 'agreements',
      'processes', 'checkins', 'meetings', 'calendar', 'ideas', 'theLabs', 'knowledgeBase', 'documents', 'tools',
    ];
    const favoriteMenuItems = Array.isArray(source.favoriteMenuItems)
      ? source.favoriteMenuItems.filter((x) => allowedFavoriteMenuItems.includes(x))
      : [];
    // Оверрайды авто-сворачивания групп меню: ключ группы -> явно выставленное
    // пользователем состояние (true = развернуть, false = свернуть). Группы без
    // записи здесь разворачиваются автоматически только пока в них лежит текущий
    // маршрут (см. isNavSectionExpanded в app.js).
    const allowedNavSections = ['favorites', 'people', 'work', 'events', 'development', 'knowledge'];
    const navSectionOverridesSource = source.navSectionOverrides && typeof source.navSectionOverrides === 'object' && !Array.isArray(source.navSectionOverrides) ? source.navSectionOverrides : {};
    const navSectionOverrides = {};
    allowedNavSections.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(navSectionOverridesSource, key)) navSectionOverrides[key] = !!navSectionOverridesSource[key];
    });
    const normalizeOverviewShelf = (items, shelf) => {
      if (!Array.isArray(items)) return null;
      const allowed = shelf === 'quick'
        ? new Set(['my-tasks','project-overview','project-tasks','my-issues','my-agreements','my-journal','my-ideas','my-meetings','quick-link','quick-links'])
        : new Set(['goals','team-workload','priority-tasks','team-priority-tasks','missed-meetings','unresolved-issues','week-events','attention-notes']);
      return items
        .slice(0, 24)
        .filter((item) => item && typeof item === 'object' && allowed.has(item.type) && typeof item.id === 'string')
        .map((item) => ({
          id: item.id.slice(0, 160),
          type: item.type,
          ...((item.type === 'project-tasks' || item.type === 'project-overview') && item.projectId ? { projectId: String(item.projectId).slice(0, 120) } : {}),
          ...(item.type === 'quick-link' && item.linkKey ? { linkKey: String(item.linkKey).slice(0, 80) } : {}),
          ...(item.breakBefore ? { breakBefore: true } : {}),
        }));
    };
    const overviewSource = source.overviewDashboard && typeof source.overviewDashboard === 'object' ? source.overviewDashboard : null;
    const overviewDashboard = overviewSource
      ? {
          quick: normalizeOverviewShelf(overviewSource.quick, 'quick') || [],
          signals: normalizeOverviewShelf(overviewSource.signals, 'signals') || [],
        }
      : null;
    const projectNotesOpen = sanitizeOpenStateMap(source.projectNotesOpen, 200);
    const personNotesOpen = sanitizeOpenStateMap(source.personNotesOpen, 200);
    const overviewNotesWidthRaw = Number(source.overviewNotesWidth);
    const overviewNotesWidth = Number.isFinite(overviewNotesWidthRaw) ? Math.max(240, Math.min(640, Math.round(overviewNotesWidthRaw))) : 300;
    const overviewNoteOrder = Array.isArray(source.overviewNoteOrder) ? source.overviewNoteOrder.map((id) => String(id).slice(0, 120)).filter(Boolean).slice(0, 200) : [];
    const priorityModes = ['balanced', 'deadline', 'importance', 'overdue'];
    const taskPriorityMode = priorityModes.includes(source.taskPriorityMode) ? source.taskPriorityMode : DEFAULT_USER_SETTINGS.taskPriorityMode;
    const notificationEventKeys = ['task_assigned', 'project_load_changed', 'checkin_reminder', 'issue_created', 'lab_created'];
    const notificationSource = source.notificationEvents && typeof source.notificationEvents === 'object' && !Array.isArray(source.notificationEvents) ? source.notificationEvents : {};
    const notificationEvents = Object.fromEntries(notificationEventKeys.map((key) => [key, notificationSource[key] !== false]));
    const scaleSteps = [80, 90, 100, 110, 125];
    const rawUiScale = Number(source.uiScale);
    const theme = THEME_VALUES.includes(source.theme) ? source.theme : DEFAULT_USER_SETTINGS.theme;
    // Акцент хранится независимо от того, активна ли сейчас тема, которая его
    // поддерживает, — так выбор не теряется при временном переключении на
    // другую тему и предложенном возврате к AnuPpuccin. Применяется акцент
    // только когда theme входит в ACCENT_THEMES (см. applyTheme в interactions.js).
    const accentColor = ACCENT_VALUES.includes(source.accentColor) ? source.accentColor : DEFAULT_ACCENT;
    const glowEnabled = typeof source.glowEnabled === 'boolean'
      ? source.glowEnabled
      : ['grafit', 'khvoya', 'noch', 'anuppuccin-mocha'].includes(theme);
    const overviewHomeMode = ['widgets', 'assistant'].includes(source.overviewHomeMode) ? source.overviewHomeMode : DEFAULT_USER_SETTINGS.overviewHomeMode;
    const smartSearchHistory = Array.isArray(source.smartSearchHistory)
      ? source.smartSearchHistory.map((item) => String(item || '').trim().slice(0, 200)).filter(Boolean).slice(0, 12)
      : [];
    const hintsSource = source.smartSearchPersonHints && typeof source.smartSearchPersonHints === 'object' && !Array.isArray(source.smartSearchPersonHints) ? source.smartSearchPersonHints : {};
    const smartSearchPersonHints = {};
    Object.entries(hintsSource).slice(0, 40).forEach(([key, value]) => {
      const fragment = String(key || '').trim().slice(0, 80);
      const personId = String(value || '').trim().slice(0, 120);
      if (fragment && personId) smartSearchPersonHints[fragment] = personId;
    });
    return {
      uiScale: scaleSteps.includes(rawUiScale) ? rawUiScale : 100,
      favoriteMenuItems,
      navSectionOverrides,
      overviewDashboard,
      overviewNotesOpen: !!source.overviewNotesOpen,
      overviewNotesWidth,
      overviewNoteOrder,
      projectNotesOpen,
      personNotesOpen,
      theme,
      accentColor,
      glowEnabled,
      taskPriorityMode,
      notificationEvents,
      overviewHomeMode,
      smartSearchHistory,
      smartSearchPersonHints,
      attentionHiddenUntil,
    };
  }
  app.get('/api/storage-info', authenticate, (req, res) => {
    res.json({
      dataDir: DATA_DIR,
      database: path.join(DATA_DIR, 'garden.sqlite'),
      uploadsDir: UPLOADS_DIR,
      source: process.env.GARDEN_DATA_DIR ? 'GARDEN_DATA_DIR' : 'GardenData',
    });
  });

  app.get('/api/settings', authenticate, (req, res) => {
    const raw = db.auth.preferences.get(req.auth.user.id);
    res.json({ ...normalizeUserSettings(raw), _initialized: Object.keys(raw || {}).length > 0 });
  });

  app.put('/api/settings', authenticate, (req, res) => {
    const current = normalizeUserSettings(db.auth.preferences.get(req.auth.user.id));
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const merged = normalizeUserSettings({ ...current, ...patch });
    db.auth.preferences.set(req.auth.user.id, merged);
    res.json({ ...merged, _initialized: true });
  });

  function canManageTaskAutomation(user) {
    return isAdmin(user) || isManager(user) || hasPermission(user, 'tasks.manage_all');
  }

  // Настройки рабочего пространства (например, авто-архивация задач) общие на
  // всю команду — демо-пользователь работает со своим отдельным воркспейсом,
  // чтобы не путать реальные данные с демонстрационными.
  function withUserWorkspace(user, fn) {
    return db.withWorkspace(isDemoUser(user) ? 'demo' : 'main', fn);
  }

  app.get('/api/workspace-settings', authenticate, (req, res) => {
    withUserWorkspace(req.auth.user, () => {
      res.json({ ...workspaceSettings(), canEdit: canManageTaskAutomation(req.auth.user) });
    });
  });

  app.put('/api/workspace-settings', authenticate, (req, res) => {
    withUserWorkspace(req.auth.user, () => {
      if (!canManageTaskAutomation(req.auth.user)) return denied(res);
      const next = setWorkspaceSettings(req.body || {});
      autoArchiveCompletedTasks();
      res.json({ ...next, canEdit: true });
    });
  });

  return { normalizeUserSettings };
};
