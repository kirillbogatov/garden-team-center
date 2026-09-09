// Персональные и рабочие настройки Garden.
Views._settingsSection = Views._settingsSection || 'appearance';

const SETTINGS_SECTIONS = [
  { key: 'appearance', label: 'Оформление' },
  { key: 'overview', label: 'Главный экран' },
  { key: 'menu', label: 'Меню' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'notifications', label: 'Уведомления' },
  { key: 'storage', label: 'Данные' },
  { key: 'account', label: 'Учётная запись' },
];

const SETTINGS_HOME_MODE_CHOICES = [
  { value: 'assistant', label: 'Ассистент', hint: 'Командная строка для быстрого поиска и создания элементов.' },
  { value: 'widgets', label: 'Обзор', hint: 'Настраиваемый экран с виджетами и кнопками быстрых действий.' },
];

// ---------------------------------------------------------------------------
// Notifications: per-role event catalog
// ---------------------------------------------------------------------------

function settingsNotificationRowsForUser() {
  return Auth.isTeamlead() ? [
    ['checkin_reminder', 'Напоминание о чек-апе', 'Во вторник, если Check-in не был заполнен в понедельник.'],
    ['issue_created', 'Новая проблема от сотрудника', 'Когда сотрудник добавляет новую проблему.'],
    ['lab_created', 'Новая идея или проект The Labs', 'Когда сотрудник добавляет идею или создаёт проект The Labs.'],
  ] : (!Auth.isAdmin() ? [
    ['task_assigned', 'Новая задача от тимлида', 'Когда тимлид ставит вам новую задачу.'],
    ['project_load_changed', 'Изменение загрузки на проекте', 'Когда тимлид меняет вашу загрузку на проекте.'],
  ] : []);
}

function settingsNotificationsListHtml(settings) {
  const rows = settingsNotificationRowsForUser();
  if (!rows.length) return '<div class="settings-info-row"><span><strong>Нет доступных событий</strong><small>Для вашей роли персональные уведомления пока не настроены.</small></span></div>';
  return rows.map(([key, title, hint]) => `<label class="settings-toggle-row"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></span><input type="checkbox" data-notification-event="${key}" ${(settings.notificationEvents?.[key] !== false) ? 'checked' : ''}/></label>`).join('');
}

// ---------------------------------------------------------------------------
// Appearance: theme and accent pickers
// ---------------------------------------------------------------------------

function settingsThemeChoiceHtml(settings) {
  return (t) => `<label class="settings-choice settings-theme-choice"><input type="radio" name="theme" value="${t.value}" ${settings.theme === t.value ? 'checked' : ''}/><span class="settings-theme-swatch" data-theme-swatch="${t.value}" aria-hidden="true"></span><span class="settings-theme-copy"><strong>${t.label}</strong>${t.note ? `<small>${t.note}</small>` : ''}</span></label>`;
}

function settingsAccentSwatchHex(theme, accent) {
  return theme === 'anuppuccin-mocha' ? accent.mocha : accent.latte;
}

function settingsAccentChoiceHtml(theme, activeAccent) {
  return (accent) => `<button type="button" class="settings-accent-choice ${accent.value === activeAccent ? 'active' : ''}" data-accent-value="${accent.value}" style="--accent-swatch:${settingsAccentSwatchHex(theme, accent)}" title="${accent.label}" aria-label="${accent.label}" aria-pressed="${accent.value === activeAccent ? 'true' : 'false'}"></button>`;
}

// Акцентный цвет доступен только для тем из ACCENT_THEMES (interactions.js) —
// блок рендерится всегда, но скрыт через [hidden], пока выбрана тема без
// поддержки настройки; смена темы перерисовывает его через ту же функцию.
//
// Акцентный блок рендерится сразу под тем списком (светлым/тёмным), где лежит
// текущая AnuPpuccin-тема, — а не одним блоком в конце после обоих списков,
// из-за чего при выборе AnuPpuccin Latte он оказывался далеко внизу, под всеми
// тёмными темами. slot — 'light' или 'dark', соответствует списку, после
// которого вызван accentPickerHtml; секция видна только когда выбранная тема
// принадлежит этому списку.
function settingsAccentPickerHtml(settings, theme, slot) {
  const activeAccent = ACCENT_VALUES.includes(settings.accentColor) ? settings.accentColor : DEFAULT_ACCENT;
  const themeSlot = theme === 'anuppuccin-mocha' ? 'dark' : 'light';
  const visible = themeSupportsAccent(theme) && themeSlot === slot;
  return `
      <section class="settings-section settings-section-spaced" id="settings-accent-section-${slot}" ${visible ? '' : 'hidden'}>
        <div class="settings-section-head"><h2>Акцентный цвет</h2></div>
        <div class="ui-surface ui-surface--settings settings-card settings-accent-list">${ACCENT_COLORS.map(settingsAccentChoiceHtml(theme, activeAccent)).join('')}</div>
      </section>`;
}

function settingsAppearanceSectionHtml(settings) {
  // Используем единый клиентский реестр тем из interactions.js.
  const appearanceThemes = GARDEN_THEMES;
  const lightThemes = appearanceThemes.filter((t) => t.mode === 'light');
  const darkThemes = appearanceThemes.filter((t) => t.mode === 'dark');
  const themeChoiceHtml = settingsThemeChoiceHtml(settings);

  const glowSection = isDarkTheme(settings.theme) ? `<section class="settings-section settings-section-spaced" id="settings-glow-section">
        <div class="settings-section-head"><h2>Свечение</h2></div>
        <div class="ui-surface ui-surface--settings settings-card">
          <label class="settings-toggle-row"><span>Накладывать мягкий градиент в верхней части страницы</span><input type="checkbox" id="settings-glow-enabled" ${settings.glowEnabled ? 'checked' : ''}/></label>
        </div>
      </section>` : '';

  return `
      <section class="settings-section">
        <div class="settings-section-head"><h2>Тема</h2></div>
        <div class="col-title" style="padding:0 2px 6px;">Светлые</div>
        <div class="ui-surface ui-surface--settings settings-card settings-theme-list">${lightThemes.map(themeChoiceHtml).join('')}</div>
        ${settingsAccentPickerHtml(settings, settings.theme, 'light')}
        <div class="col-title" style="padding:14px 2px 6px;">Тёмные</div>
        <div class="ui-surface ui-surface--settings settings-card settings-theme-list">${darkThemes.map(themeChoiceHtml).join('')}</div>
        ${settingsAccentPickerHtml(settings, settings.theme, 'dark')}
      </section>
      ${glowSection}
      <section class="settings-section settings-section-spaced">
        <div class="settings-section-head"><h2>Размер интерфейса</h2></div>
        <div class="ui-surface ui-surface--settings settings-card settings-scale-card"><div class="settings-zoom-control" role="group" aria-label="Размер интерфейса">
          <button type="button" class="settings-zoom-button" id="ui-scale-minus" aria-label="Уменьшить масштаб">−</button>
          <span class="settings-zoom-value" id="ui-scale-value">${Number(settings.uiScale || 100)}%</span>
          <button type="button" class="settings-zoom-button" id="ui-scale-plus" aria-label="Увеличить масштаб">+</button>
        </div></div>
      </section>`;
}

// ---------------------------------------------------------------------------
// Other sections
// ---------------------------------------------------------------------------

function settingsMenuSectionHtml(favorites) {
  // Избранное использует тот же реестр, что и сайдбар: второй ручной список больше не поддерживаем.
  const menuItems = (NAV_GROUPS || []).flatMap((group) =>
    group.children.map((item) => ({ key: item.key, label: item.label, group: group.label }))
  );
  const rows = menuItems.map((item) => `<label class="settings-toggle-row"><span><strong>${item.label}</strong><small>${item.group}</small></span><input type="checkbox" data-favorite-menu="${item.key}" ${favorites.has(item.key) ? 'checked' : ''}/></label>`).join('');
  return `<section class="settings-section"><div class="settings-section-head"><h2>Избранное</h2><p>Добавьте часто используемые подразделы в «Избранное» под «Журналом».</p></div><div class="ui-surface ui-surface--settings settings-card">${rows}</div></section>`;
}

function settingsTasksSectionHtml(settings, workspace) {
  const priorityRows = Object.entries(TASK_PRIORITY_STRATEGIES).map(([value, strategy]) => `<label class="settings-choice"><input type="radio" name="task-priority-mode" value="${value}" ${settings.taskPriorityMode === value ? 'checked' : ''}/><span><strong>${strategy.label}</strong><small>${strategy.description}</small></span></label>`).join('');
  const archiveHint = workspace.canEdit ? '' : '<div class="ui-field-hint field-hint">Изменить этот срок может пользователь с правом управления всеми задачами.</div>';
  return `<section class="settings-section"><div class="settings-section-head"><h2>Приоритет задач</h2><p>В каком порядке показывать задачи.</p></div><div class="ui-surface ui-surface--settings settings-card">${priorityRows}</div></section>
    <section class="settings-section settings-section-spaced"><div class="settings-section-head"><h2>Архивация</h2><p>Правила жизненного цикла задач для всей команды.</p></div><div class="ui-surface ui-surface--settings settings-card"><label class="settings-number-row"><span><strong>Автоматически архивировать «Готово»</strong><small>Через сколько дней после завершения задача перемещается в архив.</small></span><div class="settings-number-control"><div class="settings-stepper" role="group" aria-label="Количество дней до архивации"><button type="button" class="settings-stepper-button" id="settings-auto-archive-minus" aria-label="Уменьшить число дней" ${workspace.canEdit ? '' : 'disabled'}>−</button><input class="settings-stepper-value" id="settings-auto-archive-days" type="number" min="1" max="365" step="1" value="${workspace.taskAutoArchiveDays}" ${workspace.canEdit ? '' : 'disabled'}/><button type="button" class="settings-stepper-button" id="settings-auto-archive-plus" aria-label="Увеличить число дней" ${workspace.canEdit ? '' : 'disabled'}>+</button></div><span>дн.</span></div></label></div>${archiveHint}</section>`;
}

function settingsOverviewSectionHtml(overviewHomeMode) {
  const rows = SETTINGS_HOME_MODE_CHOICES.map((c) => `<label class="settings-choice"><input type="radio" name="overview-home-mode" value="${c.value}" ${overviewHomeMode === c.value ? 'checked' : ''}/><span><strong>${c.label}</strong><small>${c.hint}</small></span></label>`).join('');
  return `<section class="settings-section"><div class="settings-section-head"><h2>Что показывать на главном экране</h2></div><div class="ui-surface ui-surface--settings settings-card">${rows}</div></section>`;
}

function settingsNotificationsSectionHtml(settings) {
  return `<section class="settings-section"><div class="settings-section-head"><h2>Уведомления</h2><p>Выберите события, о которых Garden будет сообщать вам.</p></div><div class="ui-surface ui-surface--settings settings-card">${settingsNotificationsListHtml(settings)}</div></section>`;
}

function settingsStorageSectionHtml(storage) {
  return `<section class="settings-section"><div class="settings-section-head"><h2>Данные</h2><p>Все версии Garden используют одну внешнюю папку данных.</p></div><div class="ui-surface ui-surface--settings settings-card settings-storage-card"><div class="settings-info-row"><span><strong>Рабочая папка</strong><small>Сотрудники, задачи, встречи, настройки и загруженные файлы сохраняются здесь.</small></span><code class="settings-storage-path">${escapeHtml(storage.dataDir || '')}</code></div><div class="settings-info-row"><span><strong>База данных</strong><small>Этот файл не заменяется при обновлении Garden.</small></span><code class="settings-storage-path">${escapeHtml(storage.database || '')}</code></div></div></section>`;
}

function settingsAccountSectionHtml() {
  return `<section class="settings-section"><div class="settings-section-head"><h2>Учётная запись</h2></div><div class="ui-surface ui-surface--settings settings-card"><button type="button" class="settings-action-row" id="settings-change-password"><span><strong>Сменить пароль</strong><small>Изменить пароль для входа в Garden</small></span><span class="settings-action-chevron">›</span></button></div></section>`;
}

function settingsSectionHtmlMap(settings, workspace, storage, favorites) {
  const overviewHomeMode = settings.overviewHomeMode === 'assistant' ? 'assistant' : 'widgets';
  return {
    appearance: settingsAppearanceSectionHtml(settings),
    menu: settingsMenuSectionHtml(favorites),
    tasks: settingsTasksSectionHtml(settings, workspace),
    overview: settingsOverviewSectionHtml(overviewHomeMode),
    notifications: settingsNotificationsSectionHtml(settings),
    storage: settingsStorageSectionHtml(storage),
    account: settingsAccountSectionHtml(),
  };
}

// ---------------------------------------------------------------------------
// Interaction bindings
// ---------------------------------------------------------------------------

function bindSettingsSectionNav() {
  document.querySelectorAll('[data-settings-section]').forEach((button) => {
    button.onclick = () => {
      Views._settingsSection = button.dataset.settingsSection;
      Views.settings();
    };
  });
}

function bindSettingsAccentChoices() {
  document.querySelectorAll('[data-accent-value]').forEach((button) => {
    button.onclick = async () => {
      const value = button.dataset.accentValue;
      applyAccent(value, { persistLocal: true });
      await GardenSettings.update({ accentColor: value });
      document.querySelectorAll('[data-accent-value]').forEach((b) => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
      });
    };
  });
}

function bindSettingsThemeChoices(settings) {
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.checked) return;
      applyTheme(input.value, { persistLocal: true });
      await GardenSettings.update({ theme: input.value });
      renderSidebar(Router.current());
      // Акцентный блок перерисовываем целиком под новую тему в ОБОИХ местах
      // (после светлого и после тёмного списков) — виден останется только тот,
      // что стоит сразу за списком с выбранной темой, второй скрыт через [hidden].
      ['light', 'dark'].forEach((slot) => {
        const accentSection = document.getElementById(`settings-accent-section-${slot}`);
        if (accentSection) accentSection.outerHTML = settingsAccentPickerHtml(settings, input.value, slot);
      });
      bindSettingsAccentChoices();
      Views.settings();
    });
  });
}

function bindSettingsGlowToggle() {
  const glowEnabled = document.getElementById('settings-glow-enabled');
  if (!glowEnabled) return;
  glowEnabled.onchange = async () => {
    const enabled = !!glowEnabled.checked;
    applyGlow(enabled, { persistLocal: true });
    await GardenSettings.update({ glowEnabled: enabled });
  };
}

function bindSettingsUiScale(settings) {
  const scaleSteps = [80, 90, 100, 110, 125];
  const changeScale = async (direction) => {
    const current = Number(GardenSettings.value?.uiScale || settings.uiScale || 100);
    const index = Math.max(0, scaleSteps.indexOf(current));
    const next = scaleSteps[Math.max(0, Math.min(scaleSteps.length - 1, index + direction))];
    if (next === current) return;
    applyUiScale(next);
    await GardenSettings.update({ uiScale: next });
    Views.settings();
  };
  const scaleMinus = document.getElementById('ui-scale-minus');
  const scalePlus = document.getElementById('ui-scale-plus');
  if (scaleMinus) {
    scaleMinus.disabled = Number(settings.uiScale || 100) <= scaleSteps[0];
    scaleMinus.onclick = () => changeScale(-1);
  }
  if (scalePlus) {
    scalePlus.disabled = Number(settings.uiScale || 100) >= scaleSteps[scaleSteps.length - 1];
    scalePlus.onclick = () => changeScale(1);
  }
}

function bindSettingsTaskPriorityMode() {
  document.querySelectorAll('input[name="task-priority-mode"]').forEach((input) => {
    input.onchange = async () => {
      if (!input.checked) return;
      await GardenSettings.update({ taskPriorityMode: input.value });
    };
  });
}

function bindSettingsOverviewHomeMode() {
  document.querySelectorAll('input[name="overview-home-mode"]').forEach((input) => {
    input.onchange = async () => {
      if (!input.checked) return;
      await GardenSettings.update({ overviewHomeMode: input.value });
      renderSidebar(Router.current());
      toast('Главный экран обновлён');
    };
  });
}

function bindSettingsNotificationToggles(settings) {
  document.querySelectorAll('[data-notification-event]').forEach((input) => {
    input.addEventListener('change', async () => {
      const current = { ...(GardenSettings.value?.notificationEvents || settings.notificationEvents || {}) };
      current[input.dataset.notificationEvent] = input.checked;
      await GardenSettings.update({ notificationEvents: current });
    });
  });
}

function bindSettingsFavoriteMenuToggles() {
  document.querySelectorAll('[data-favorite-menu]').forEach((input) => {
    input.addEventListener('change', async () => {
      const next = new Set(GardenSettings.value?.favoriteMenuItems || []);
      if (input.checked) next.add(input.dataset.favoriteMenu);
      else next.delete(input.dataset.favoriteMenu);
      await GardenSettings.update({ favoriteMenuItems: Array.from(next) });
      renderSidebar(Router.current());
    });
  });
}

function bindSettingsAutoArchiveDays(workspace) {
  const archiveDays = document.getElementById('settings-auto-archive-days');
  if (!archiveDays || !workspace.canEdit) return;

  const persistArchiveDays = async () => {
    const value = Math.max(1, Math.min(365, Math.round(Number(archiveDays.value) || 14)));
    archiveDays.value = value;
    await api.put('/api/workspace-settings', { taskAutoArchiveDays: value });
    toast('Настройка сохранена');
  };
  archiveDays.addEventListener('change', persistArchiveDays);

  const changeArchiveDays = (delta) => {
    const current = Math.max(1, Math.min(365, Math.round(Number(archiveDays.value) || 14)));
    archiveDays.value = Math.max(1, Math.min(365, current + delta));
    archiveDays.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const archiveMinus = document.getElementById('settings-auto-archive-minus');
  const archivePlus = document.getElementById('settings-auto-archive-plus');
  if (archiveMinus) archiveMinus.onclick = () => changeArchiveDays(-1);
  if (archivePlus) archivePlus.onclick = () => changeArchiveDays(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

Views.settings = async function () {
  setTopbar(`<h1>Настройки</h1>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const [settings, workspace, storage] = await Promise.all([GardenSettings.load(true), api.get('/api/workspace-settings'), api.get('/api/storage-info')]);
  const favorites = new Set(settings.favoriteMenuItems || []);
  if (!SETTINGS_SECTIONS.some((x) => x.key === Views._settingsSection)) Views._settingsSection = 'appearance';

  const sectionHtml = settingsSectionHtmlMap(settings, workspace, storage, favorites);
  const navHtml = SETTINGS_SECTIONS.map((item) => `<button type="button" class="settings-nav-item ${Views._settingsSection === item.key ? 'active' : ''}" data-settings-section="${item.key}">${item.label}</button>`).join('');
  view.innerHTML = `<div class="settings-layout"><nav class="settings-nav" aria-label="Разделы настроек">${navHtml}</nav><div class="settings-content">${sectionHtml[Views._settingsSection]}</div></div>`;

  bindSettingsSectionNav();

  const password = document.getElementById('settings-change-password');
  if (password) password.onclick = () => Auth.openPasswordModal();

  bindSettingsThemeChoices(settings);
  bindSettingsAccentChoices();
  bindSettingsGlowToggle();
  bindSettingsUiScale(settings);
  bindSettingsTaskPriorityMode();
  bindSettingsOverviewHomeMode();
  bindSettingsNotificationToggles(settings);
  bindSettingsFavoriteMenuToggles();
  bindSettingsAutoArchiveDays(workspace);
};
