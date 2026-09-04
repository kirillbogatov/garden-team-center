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

// ---------------- Клавиатура для кликабельных строк и карточек ----------------
// В интерфейсе много строк и карточек, которые кликаются через onclick на <div>.
// Переписывать каждую разметку рискованно (внутри строк уже есть свои кнопки),
// поэтому один проход добавляет им роль и фокус, а один обработчик — Enter и Space.
// Элементы со своим onkeydown не задеваются: они гасят событие раньше.

const NATIVE_INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY', 'OPTION']);
const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex="0"]';

function accessibleTextOf(node) {
  return (node.getAttribute('aria-label') || node.textContent || '').replace(/\s+/g, ' ').trim();
}

// Строка со вложенными кнопками не может сама быть кнопкой: скринридер тогда не
// доберётся до вложенных действий. Поэтому в такую строку добавляется невидимая
// кнопка-«открыть», растянутая на всю строку. Клик по ней всплывает до onclick
// строки, поэтому обработчик ей не нужен, а вложенные кнопки лежат выше по z-index.
function ensureRowOpenButton(row) {
  if (row.querySelector(':scope > .row-open')) return;
  const label = accessibleTextOf(row).slice(0, 120) || 'Открыть';
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'row-open';
  cover.setAttribute('aria-label', label);
  row.classList.add('has-row-open');
  row.insertBefore(cover, row.firstChild);
}

function enhanceInteractive(root) {
  const scope = root || document.body;
  // Идём от самых вложенных к внешним: иначе строка успевает стать кнопкой раньше,
  // чем её собственные кнопки, и получается вложенность интерактивных элементов.
  const nodes = Array.from(scope.querySelectorAll('[onclick]')).reverse();
  nodes.forEach((node) => {
    if (NATIVE_INTERACTIVE_TAGS.has(node.tagName)) return;
    if (node.closest('[hidden]')) return;

    const hasInteractiveInside = !!node.querySelector(INTERACTIVE_SELECTOR);
    if (hasInteractiveInside) { ensureRowOpenButton(node); return; }

    // Иконка без текста получает имя из title — иначе кнопка будет безымянной.
    if (!accessibleTextOf(node)) {
      const title = node.getAttribute('title');
      if (!title) return;
      node.setAttribute('aria-label', title);
    }
    if (!node.hasAttribute('role')) {
      node.setAttribute('role', /Router\.go/.test(node.getAttribute('onclick') || '') ? 'link' : 'button');
    }
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
  });
}

let _enhanceScheduled = false;
function scheduleEnhanceInteractive() {
  if (_enhanceScheduled) return;
  _enhanceScheduled = true;
  requestAnimationFrame(() => {
    _enhanceScheduled = false;
    enhanceInteractive(document.body);
  });
}

function watchInteractive() {
  const observer = new MutationObserver(scheduleEnhanceInteractive);
  // Наблюдаем только за появлением узлов: атрибуты не слушаем, иначе наши же
  // правки вызывали бы новый проход.
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceInteractive(document.body);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const node = e.target;
  if (!(node instanceof HTMLElement)) return;
  if (NATIVE_INTERACTIVE_TAGS.has(node.tagName) || node.isContentEditable) return;
  const role = node.getAttribute('role');
  if (role !== 'button' && role !== 'link') return;
  if (!node.hasAttribute('onclick')) return;
  e.preventDefault();
  node.click();
});

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
  watchInteractive();
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
