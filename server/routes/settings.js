'use strict';

module.exports = function registerSettingsRoutes(app, deps) {
  const { db, authenticate, DATA_DIR, UPLOADS_DIR, path, isAdmin, isManager, hasPermission, denied, isDemoUser, autoArchiveCompletedTasks } = deps;
  // Список должен совпадать с GARDEN_THEMES в public/js/lib/interactions.js.
  const THEME_VALUES = [
    'chernika', 'myata', 'lavanda', 'tuman',
    'grafit', 'khvoya', 'noch',
    'anuppuccin-latte', 'anuppuccin-mocha',
  ];
  // Допустимые значения акцента — должны совпадать с ACCENT_COLORS
  // в public/js/lib/interactions.js.
  const ACCENT_VALUES = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'lavender'];
  const DEFAULT_ACCENT = 'green';
  const DEFAULT_USER_SETTINGS = {
    theme: 'anuppuccin-latte', accentColor: DEFAULT_ACCENT, uiScale: 100, favoriteMenuItems: [], navSectionOverrides: {}, overviewDashboard: null, overviewNotesOpen: false, overviewNotesWidth: 300, overviewNoteOrder: [], projectNotesOpen: {}, personNotesOpen: {}, taskPriorityMode: 'balanced', notificationEvents: { task_assigned: true, project_load_changed: true, checkin_reminder: true, issue_created: true, lab_created: true },
    // 'ask' — каждый раз спрашивать диалогом видимость новой идеи; 'private'/'public' —
    // пользователь попросил больше не спрашивать и всегда использовать этот выбор
    // (см. askIdeaVisibility в public/js/lib/entity-ui.js).
    ideaVisibilityDefault: 'ask',
  };
  function normalizeUserSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const hiddenSource = source.attentionHiddenUntil && typeof source.attentionHiddenUntil === 'object' ? source.attentionHiddenUntil : {};
    const attentionHiddenUntil = {};
    Object.entries(hiddenSource).forEach(([key, value]) => {
      const until = Number(value);
      if (key && Number.isFinite(until) && until > Date.now()) attentionHiddenUntil[String(key).slice(0, 180)] = until;
    });
    const allowedFavoriteMenuItems = ['team','stakeholders','goals','projects','teamLoad','tasks','issues','agreements','processes','checkins','meetings','calendar','ideas','theLabs','knowledgeBase','documents','tools'];
    const favoriteMenuItems = Array.isArray(source.favoriteMenuItems) ? source.favoriteMenuItems.filter((x) => allowedFavoriteMenuItems.includes(x)) : [];
    // Оверрайды авто-сворачивания групп меню: ключ группы -> явно выставленное
    // пользователем состояние (true = развернуть, false = свернуть). Группы без
    // записи здесь разворачиваются автоматически только пока в них лежит текущий
    // маршрут (см. isNavSectionExpanded в app.js).
    const allowedNavSections = ['favorites','people','work','events','development','knowledge'];
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
      return items.slice(0, 24).filter((item) => item && typeof item === 'object' && allowed.has(item.type) && typeof item.id === 'string').map((item) => ({
        id: item.id.slice(0, 160),
        type: item.type,
        ...((item.type === 'project-tasks' || item.type === 'project-overview') && item.projectId ? { projectId: String(item.projectId).slice(0, 120) } : {}),
        ...(item.type === 'quick-link' && item.linkKey ? { linkKey: String(item.linkKey).slice(0, 80) } : {}),
        ...(item.breakBefore ? { breakBefore: true } : {}),
      }));
    };
    const overviewSource = source.overviewDashboard && typeof source.overviewDashboard === 'object' ? source.overviewDashboard : null;
    const overviewDashboard = overviewSource ? { quick: normalizeOverviewShelf(overviewSource.quick, 'quick') || [], signals: normalizeOverviewShelf(overviewSource.signals, 'signals') || [] } : null;
    const projectNotesSource = source.projectNotesOpen && typeof source.projectNotesOpen === 'object' && !Array.isArray(source.projectNotesOpen) ? source.projectNotesOpen : {};
    const projectNotesOpen = {};
    Object.entries(projectNotesSource).slice(0, 200).forEach(([key, value]) => {
      const id = String(key || '').slice(0, 120);
      if (id) projectNotesOpen[id] = !!value;
    });
    const personNotesSource = source.personNotesOpen && typeof source.personNotesOpen === 'object' && !Array.isArray(source.personNotesOpen) ? source.personNotesOpen : {};
    const personNotesOpen = {};
    Object.entries(personNotesSource).slice(0, 200).forEach(([key, value]) => {
      const id = String(key || '').slice(0, 120);
      if (id) personNotesOpen[id] = !!value;
    });
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
    const ideaVisibilityDefault = ['ask', 'private', 'public'].includes(source.ideaVisibilityDefault) ? source.ideaVisibilityDefault : DEFAULT_USER_SETTINGS.ideaVisibilityDefault;
    return {
      uiScale: scaleSteps.includes(rawUiScale) ? rawUiScale : 100,
      favoriteMenuItems, navSectionOverrides, overviewDashboard, overviewNotesOpen: !!source.overviewNotesOpen, overviewNotesWidth, overviewNoteOrder, projectNotesOpen, personNotesOpen,
      theme, accentColor, taskPriorityMode, notificationEvents, ideaVisibilityDefault,
      attentionHiddenUntil,
    };
  }
  app.get('/api/storage-info', authenticate, (req, res) => res.json({ dataDir: DATA_DIR, database: path.join(DATA_DIR, 'garden.sqlite'), uploadsDir: UPLOADS_DIR, source: process.env.GARDEN_DATA_DIR ? 'GARDEN_DATA_DIR' : 'GardenData' }));
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

  const DEFAULT_WORKSPACE_SETTINGS = { taskAutoArchiveDays: 14 };
  function normalizeWorkspaceSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const days = Number(source.taskAutoArchiveDays);
    return { taskAutoArchiveDays: Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : DEFAULT_WORKSPACE_SETTINGS.taskAutoArchiveDays };
  }
  function workspaceSettings() { return normalizeWorkspaceSettings(db.meta.get('workspace_settings', DEFAULT_WORKSPACE_SETTINGS)); }
  function canManageTaskAutomation(user) { return isAdmin(user) || isManager(user) || hasPermission(user, 'tasks.manage_all'); }
  app.get('/api/workspace-settings', authenticate, (req, res) => db.withWorkspace(isDemoUser(req.auth.user) ? 'demo' : 'main', () => res.json({ ...workspaceSettings(), canEdit: canManageTaskAutomation(req.auth.user) })));
  app.put('/api/workspace-settings', authenticate, (req, res) => db.withWorkspace(isDemoUser(req.auth.user) ? 'demo' : 'main', () => {
    if (!canManageTaskAutomation(req.auth.user)) return denied(res);
    const next = normalizeWorkspaceSettings({ ...workspaceSettings(), ...(req.body || {}) });
    db.meta.set('workspace_settings', next);
    autoArchiveCompletedTasks();
    res.json({ ...next, canEdit: true });
  }));
  return { workspaceSettings, normalizeUserSettings };
};
