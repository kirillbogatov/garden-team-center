// Персональные и рабочие настройки Garden.
Views._settingsSection = Views._settingsSection || 'appearance';

Views.settings = async function () {
  setTopbar(`<h1>Настройки</h1>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const [settings, workspace, storage] = await Promise.all([GardenSettings.load(true), api.get('/api/workspace-settings'), api.get('/api/storage-info')]);
  const favorites = new Set(settings.favoriteMenuItems || []);
  const notificationRows = Auth.isTeamlead() ? [
    ['checkin_reminder', 'Напоминание о чек-апе', 'Во вторник, если Check-in не был заполнен в понедельник.'],
    ['issue_created', 'Новая проблема от сотрудника', 'Когда сотрудник добавляет новую проблему.'],
    ['lab_created', 'Новая идея или проект The Labs', 'Когда сотрудник добавляет идею или создаёт проект The Labs.'],
  ] : (!Auth.isAdmin() ? [
    ['task_assigned', 'Новая задача от тимлида', 'Когда тимлид ставит вам новую задачу.'],
    ['project_load_changed', 'Изменение загрузки на проекте', 'Когда тимлид меняет вашу загрузку на проекте.'],
  ] : []);
  const notificationsSettingsHtml = notificationRows.length
    ? notificationRows.map(([key, title, hint]) => `<label class="settings-toggle-row"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></span><input type="checkbox" data-notification-event="${key}" ${(settings.notificationEvents?.[key] !== false) ? 'checked' : ''}/></label>`).join('')
    : '<div class="settings-info-row"><span><strong>Нет доступных событий</strong><small>Для вашей роли персональные уведомления пока не настроены.</small></span></div>';
  // Список тем на экране «Оформление» держим самодостаточным: так он не
  // зависит от порядка загрузки общего реестра и старого браузерного кэша.
  // Значения должны совпадать с GARDEN_THEMES и серверным whitelist.
  const appearanceThemes = [
    { value: 'chernika', label: 'Черника', mode: 'light', note: 'прохладная' },
    { value: 'myata', label: 'Мята', mode: 'light', note: 'свежая' },
    { value: 'lavanda', label: 'Лаванда', mode: 'light', note: 'мягкая' },
    { value: 'tuman', label: 'Туман', mode: 'light', note: 'нейтральная' },
    { value: 'grafit', label: 'Графит', mode: 'dark', note: 'строгая' },
    { value: 'khvoya', label: 'Хвоя', mode: 'dark', note: 'природная' },
    { value: 'noch', label: 'Ночь', mode: 'dark', note: 'глубокая' },
    // Семейство AnuPpuccin: палитры Catppuccin, перенесённые в стиле темы AnuPpuccin
    // для Obsidian — https://github.com/AnubisNekhet/AnuPpuccin (сама AnuPpuccin
    // построена поверх Catppuccin — https://github.com/catppuccin/catppuccin).
    // Обе темы поддерживают настройку акцентного цвета — см. ACCENT_COLORS
    // в interactions.js и accentPickerHtml() ниже.
    { value: 'anuppuccin-latte', label: 'AnuPpuccin Latte', mode: 'light', note: 'настраиваемая' },
    { value: 'anuppuccin-mocha', label: 'AnuPpuccin Mocha', mode: 'dark', note: 'настраиваемая' },
  ];
  // Темы выводятся от самых светлых к самым тёмным внутри каждой группы;
  // «Туман» — тема по умолчанию. Группировка по mode отражена в самом списке —
  // явные подписи «Светлые»/«Тёмные» рендерятся отдельно, см. lightThemes/darkThemes ниже.
  const lightThemes = appearanceThemes.filter((t) => t.mode === 'light');
  const darkThemes = appearanceThemes.filter((t) => t.mode === 'dark');
  const themeChoiceHtml = (t) => `<label class="settings-choice settings-theme-choice"><input type="radio" name="theme" value="${t.value}" ${settings.theme === t.value ? 'checked' : ''}/><span class="settings-theme-swatch" data-theme-swatch="${t.value}" aria-hidden="true"></span><span class="settings-theme-copy"><strong>${t.label}</strong>${t.note ? `<small>${t.note}</small>` : ''}</span></label>`;
  // Акцентный цвет доступен только для тем из ACCENT_THEMES (interactions.js) —
  // блок рендерится всегда, но скрыт через [hidden], пока выбрана тема без
  // поддержки настройки; toggleAccentSection ниже переключает его при смене темы.
  const accentSwatchHex = (theme, accent) => (theme === 'anuppuccin-mocha' ? accent.mocha : accent.latte);
  const accentChoiceHtml = (theme, activeAccent) => (accent) => `<button type="button" class="settings-accent-choice ${accent.value === activeAccent ? 'active' : ''}" data-accent-value="${accent.value}" style="--accent-swatch:${accentSwatchHex(theme, accent)}" title="${accent.label}" aria-label="${accent.label}" aria-pressed="${accent.value === activeAccent ? 'true' : 'false'}"></button>`;
  // Акцентный блок рендерится сразу под тем списком (светлым/тёмным), где лежит
  // текущая AnuPpuccin-тема, — а не одним блоком в конце после обоих списков,
  // из-за чего при выборе AnuPpuccin Latte он оказывался далеко внизу, под всеми
  // тёмными темами. slot — 'light' или 'dark', соответствует списку, после
  // которого вызван accentPickerHtml; секция видна только когда выбранная тема
  // принадлежит этому списку.
  const accentPickerHtml = (theme, slot) => {
    const activeAccent = ACCENT_VALUES.includes(settings.accentColor) ? settings.accentColor : DEFAULT_ACCENT;
    const themeSlot = theme === 'anuppuccin-mocha' ? 'dark' : 'light';
    const visible = themeSupportsAccent(theme) && themeSlot === slot;
    return `
      <section class="settings-section settings-section-spaced" id="settings-accent-section-${slot}" ${visible ? '' : 'hidden'}>
        <div class="settings-section-head"><h2>Акцентный цвет</h2></div>
        <div class="ui-surface ui-surface--settings settings-card settings-accent-list">${ACCENT_COLORS.map(accentChoiceHtml(theme, activeAccent)).join('')}</div>
      </section>`;
  };
  // Избранное использует тот же реестр, что и сайдбар: второй ручной список больше не поддерживаем.
  const menuItems = (NAV_GROUPS || []).flatMap((group) =>
    group.children.map((item) => ({ key: item.key, label: item.label, group: group.label }))
  );
  const sections = [
    { key: 'appearance', label: 'Оформление' },
    { key: 'menu', label: 'Меню' },
    { key: 'tasks', label: 'Задачи' },
    { key: 'notifications', label: 'Уведомления' },
    { key: 'storage', label: 'Данные' },
    { key: 'account', label: 'Учётная запись' },
  ];
  if (!sections.some((x) => x.key === Views._settingsSection)) Views._settingsSection = 'appearance';

  const sectionHtml = {
    appearance: `
      <section class="settings-section">
        <div class="settings-section-head"><h2>Тема</h2></div>
        <div class="col-title" style="padding:0 2px 6px;">Светлые</div>
        <div class="ui-surface ui-surface--settings settings-card settings-theme-list">${lightThemes.map(themeChoiceHtml).join('')}</div>
        ${accentPickerHtml(settings.theme, 'light')}
        <div class="col-title" style="padding:14px 2px 6px;">Тёмные</div>
        <div class="ui-surface ui-surface--settings settings-card settings-theme-list">${darkThemes.map(themeChoiceHtml).join('')}</div>
        ${accentPickerHtml(settings.theme, 'dark')}
      </section>
      <section class="settings-section settings-section-spaced">
        <div class="settings-section-head"><h2>Размер интерфейса</h2></div>
        <div class="ui-surface ui-surface--settings settings-card settings-scale-card"><div class="settings-zoom-control" role="group" aria-label="Размер интерфейса">
          <button type="button" class="settings-zoom-button" id="ui-scale-minus" aria-label="Уменьшить масштаб">−</button>
          <span class="settings-zoom-value" id="ui-scale-value">${Number(settings.uiScale || 100)}%</span>
          <button type="button" class="settings-zoom-button" id="ui-scale-plus" aria-label="Увеличить масштаб">+</button>
        </div></div>
      </section>`,
    menu: `<section class="settings-section"><div class="settings-section-head"><h2>Избранное</h2><p>Добавьте часто используемые подразделы в «Избранное» под «Журналом».</p></div><div class="ui-surface ui-surface--settings settings-card">${menuItems.map((item) => `<label class="settings-toggle-row"><span><strong>${item.label}</strong><small>${item.group}</small></span><input type="checkbox" data-favorite-menu="${item.key}" ${favorites.has(item.key) ? 'checked' : ''}/></label>`).join('')}</div></section>`,
    tasks: `<section class="settings-section"><div class="settings-section-head"><h2>Приоритет задач</h2><p>Выберите, что сильнее влияет на порядок задач в виджетах.</p></div><div class="ui-surface ui-surface--settings settings-card">${Object.entries(TASK_PRIORITY_STRATEGIES).map(([value, strategy]) => `<label class="settings-choice"><input type="radio" name="task-priority-mode" value="${value}" ${settings.taskPriorityMode === value ? 'checked' : ''}/><span><strong>${strategy.label}</strong><small>${strategy.description}</small></span></label>`).join('')}</div></section>
    <section class="settings-section settings-section-spaced"><div class="settings-section-head"><h2>Архивация</h2><p>Правила жизненного цикла задач для всей команды.</p></div><div class="ui-surface ui-surface--settings settings-card"><label class="settings-number-row"><span><strong>Автоматически архивировать «Готово»</strong><small>Через сколько дней после завершения задача перемещается в архив.</small></span><div class="settings-number-control"><div class="settings-stepper" role="group" aria-label="Количество дней до архивации"><button type="button" class="settings-stepper-button" id="settings-auto-archive-minus" aria-label="Уменьшить число дней" ${workspace.canEdit ? '' : 'disabled'}>−</button><input class="settings-stepper-value" id="settings-auto-archive-days" type="number" min="1" max="365" step="1" value="${workspace.taskAutoArchiveDays}" ${workspace.canEdit ? '' : 'disabled'}/><button type="button" class="settings-stepper-button" id="settings-auto-archive-plus" aria-label="Увеличить число дней" ${workspace.canEdit ? '' : 'disabled'}>+</button></div><span>дн.</span></div></label></div>${workspace.canEdit ? '' : '<div class="ui-field-hint field-hint">Изменить этот срок может пользователь с правом управления всеми задачами.</div>'}</section>`,
    notifications: `<section class="settings-section"><div class="settings-section-head"><h2>Уведомления</h2><p>Выберите события, о которых Garden будет сообщать вам.</p></div><div class="ui-surface ui-surface--settings settings-card">${notificationsSettingsHtml}</div></section>`,
    storage: `<section class="settings-section"><div class="settings-section-head"><h2>Данные</h2><p>Все версии Garden используют одну внешнюю папку данных.</p></div><div class="ui-surface ui-surface--settings settings-card settings-storage-card"><div class="settings-info-row"><span><strong>Рабочая папка</strong><small>Сотрудники, задачи, встречи, настройки и загруженные файлы сохраняются здесь.</small></span><code class="settings-storage-path">${escapeHtml(storage.dataDir || '')}</code></div><div class="settings-info-row"><span><strong>База данных</strong><small>Этот файл не заменяется при обновлении Garden.</small></span><code class="settings-storage-path">${escapeHtml(storage.database || '')}</code></div></div></section>`,
    account: `<section class="settings-section"><div class="settings-section-head"><h2>Учётная запись</h2></div><div class="ui-surface ui-surface--settings settings-card"><button type="button" class="settings-action-row" id="settings-change-password"><span><strong>Сменить пароль</strong><small>Изменить пароль для входа в Garden</small></span><span class="settings-action-chevron">›</span></button></div></section>`,
  };

  view.innerHTML = `<div class="settings-layout"><nav class="settings-nav" aria-label="Разделы настроек">${sections.map((item) => `<button type="button" class="settings-nav-item ${Views._settingsSection === item.key ? 'active' : ''}" data-settings-section="${item.key}">${item.label}</button>`).join('')}</nav><div class="settings-content">${sectionHtml[Views._settingsSection]}</div></div>`;

  document.querySelectorAll('[data-settings-section]').forEach((button) => {
    button.onclick = () => { Views._settingsSection = button.dataset.settingsSection; Views.settings(); };
  });

  const password = document.getElementById('settings-change-password');
  if (password) password.onclick = () => Auth.openPasswordModal();

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
        if (accentSection) accentSection.outerHTML = accentPickerHtml(input.value, slot);
      });
      bindAccentChoices();
    });
  });

  function bindAccentChoices() {
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
  bindAccentChoices();

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

  document.querySelectorAll('input[name="task-priority-mode"]').forEach((input) => {
    input.onchange = async () => {
      if (!input.checked) return;
      await GardenSettings.update({ taskPriorityMode: input.value });
    };
  });

  document.querySelectorAll('[data-notification-event]').forEach((input) => {
    input.addEventListener('change', async () => {
      const current = { ...(GardenSettings.value?.notificationEvents || settings.notificationEvents || {}) };
      current[input.dataset.notificationEvent] = input.checked;
      await GardenSettings.update({ notificationEvents: current });
    });
  });

  document.querySelectorAll('[data-favorite-menu]').forEach((input) => {
    input.addEventListener('change', async () => {
      const next = new Set(GardenSettings.value?.favoriteMenuItems || []);
      if (input.checked) next.add(input.dataset.favoriteMenu); else next.delete(input.dataset.favoriteMenu);
      await GardenSettings.update({ favoriteMenuItems: Array.from(next) });
      renderSidebar(Router.current());
    });
  });



  const archiveDays = document.getElementById('settings-auto-archive-days');
  if (archiveDays && workspace.canEdit) {
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
};
