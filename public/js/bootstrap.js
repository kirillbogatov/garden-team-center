// ---------------- Boot ----------------

async function startGardenApp() {
  if (Auth._starting) return;
  Auth._starting = true;
  try {
    Router.normalizeLegacyHash();
    const prefs = await GardenSettings.load(true);
    if (prefs?.theme) applyTheme(prefs.theme, { persistLocal: true });
    applyUiScale(prefs?.uiScale || 100);
    await store.loadAll();
    if (!Auth._started) {
      window.addEventListener('popstate', () => Router.handlePopState());
      window.addEventListener('beforeunload', (event) => {
        if (!Router._leaveDirtyCheck?.()) return;
        event.preventDefault();
        event.returnValue = '';
      });
      Auth._started = true;
    }
    await Router.render();
  } finally {
    Auth._starting = false;
  }
}

function initTopbarScrollState() {
  const view = document.getElementById('view');
  const topbar = document.getElementById('topbar');
  if (!view || !topbar || view.dataset.topbarScrollBound === '1') return;
  view.dataset.topbarScrollBound = '1';
  const sync = () => topbar.classList.toggle('is-scrolled', view.scrollTop > 2);
  view.addEventListener('scroll', sync, { passive: true });
  sync();
}

async function boot() {
  Modal.init();
  document.querySelector('[data-close-mobile-nav]')?.addEventListener('click', () => closeMobileNav({ restoreFocus: true }));
  initTopbarScrollState();
  const authenticated = await Auth.init();
  if (authenticated) await startGardenApp();
}

boot();

// Common declarative actions: navigation and modal close do not need inline JS.
document.addEventListener('click', (event) => {
  // Вложенные самостоятельные действия (статус, аватар, кнопка) не должны
  // активировать route родительской строки. stopPropagation на document уже
  // слишком поздний, поэтому отсекаем их до поиска маршрута.
  if (event.target.closest?.('[data-action-stop="1"]')) return;
  const route = event.target.closest?.('[data-route]');
  if (route) {
    event.preventDefault();
    window.rememberNavSelectionFromNode?.(route);
    if (route.dataset.routeStop === '1') event.stopPropagation();
    Router.go(route.dataset.route);
    return;
  }
  if (event.target.closest?.('[data-router-back]')) { event.preventDefault(); Router.back(); return; }
  if (event.target.closest?.('[data-modal-close]')) { event.preventDefault(); Modal.close(); }
});

document.addEventListener('click', (event) => {
  // Не запускаем команду родительской строки, если клик пришёл из вложенного
  // самостоятельного action-контрола (например, смены статуса задачи).
  if (event.target.closest?.('[data-action-stop="1"]')) return;
  const node = event.target.closest?.('[data-command]');
  if (!node) return;
  const command = String(node.dataset.command || '');
  const args = [];
  if (Object.prototype.hasOwnProperty.call(node.dataset, 'commandArg')) args.push(node.dataset.commandArg);
  if (Object.prototype.hasOwnProperty.call(node.dataset, 'commandArg2')) args.push(node.dataset.commandArg2);
  if (node.dataset.commandChecked === '1') args.push(Boolean(node.checked));
  if (node.dataset.commandSelf === '1') args.push(node);

  if (FeatureLoader.canRun(command)) {
    event.preventDefault();
    if (node.dataset.commandStop === '1') event.stopPropagation();
    FeatureLoader.run(command, ...args).catch((error) => { console.error(error); toast('Не удалось выполнить действие'); });
    return;
  }

  const path = command.split('.');
  let target = window;
  for (const part of path) target = target?.[part];
  if (typeof target !== 'function') return;
  event.preventDefault();
  if (node.dataset.commandStop === '1') event.stopPropagation();
  target(...args);
});

// Small declarative state bridge for view-local tabs/filters. It keeps stateful
// UI out of HTML event attributes without introducing a framework.
document.addEventListener('click', (event) => {
  const node = event.target.closest?.('[data-view-state]');
  if (!node) return;
  const key = node.dataset.viewState;
  const render = node.dataset.viewRender;
  if (!key || !render || typeof Views?.[render] !== 'function') return;
  event.preventDefault();
  Views[key] = node.dataset.viewValue ?? null;
  if (node.dataset.viewReset) {
    for (const resetKey of node.dataset.viewReset.split(',').map((v) => v.trim()).filter(Boolean)) Views[resetKey] = null;
  }
  const arg = node.dataset.viewRenderArg;
  if (arg !== undefined) Views[render](arg); else Views[render]();
});

// Sidebar interactions are declarative as well: no inline mouse/focus/click JS.
document.addEventListener('click', (event) => {
  const sectionToggle = event.target.closest?.('[data-nav-section-toggle]');
  if (sectionToggle) {
    event.preventDefault();
    toggleNavSection(event, sectionToggle.dataset.navSectionToggle);
    return;
  }
  if (event.target.closest?.('[data-close-collapsed-nav]')) closeCollapsedNavMenu();
});

document.addEventListener('mouseover', (event) => {
  const section = event.target.closest?.('[data-collapsed-nav-section]');
  if (section && !section.contains(event.relatedTarget)) openCollapsedNavMenu(event, section.dataset.collapsedNavSection);
});
document.addEventListener('mouseout', (event) => {
  const section = event.target.closest?.('[data-collapsed-nav-section]');
  if (section && !section.contains(event.relatedTarget)) scheduleCloseCollapsedNavMenu();
});
document.addEventListener('focusin', (event) => {
  const section = event.target.closest?.('[data-collapsed-nav-section]');
  if (section) openCollapsedNavMenu(event, section.dataset.collapsedNavSection);
});
document.addEventListener('focusout', (event) => {
  const section = event.target.closest?.('[data-collapsed-nav-section]');
  if (section && !section.contains(event.relatedTarget)) scheduleCloseCollapsedNavMenu();
});

// Всплывающие меню шапки (колокольчик уведомлений, аккаунт) — открываются по
// клику, в отличие от hover-флайаутов свёрнутого сайдбара выше.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('[data-header-menu]');
  if (trigger) { openHeaderMenu(event, trigger.dataset.headerMenu); return; }
  if (event.target.closest?.('[data-close-header-menu]')) closeHeaderMenu();
});

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-stop-propagation]')) event.stopPropagation();
  const taskCard = event.target.closest?.('[data-task-open-action]');
  if (taskCard && !Views._taskJustDragged) runAction(taskCard.dataset.taskOpenAction, event);
});
