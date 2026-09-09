// Каркас приложения: сайдбар, роутер, командная палитра (Cmd/Ctrl+K), топбар.

const GardenSettings = {
  value: null,
  async load(force = false) {
    if (GardenSettings.value && !force) return GardenSettings.value;
    try {
      GardenSettings.value = await api.get('/api/settings');
      if (GardenSettings.value && GardenSettings.value._initialized === false) {
        const localTheme = currentTheme();
        GardenSettings.value = await api.put('/api/settings', { ...GardenSettings.value, theme: localTheme });
      }
    } catch (_) {
      GardenSettings.value = { theme: currentTheme() };
    }
    return GardenSettings.value;
  },
  async update(patch) {
    const current = await GardenSettings.load();
    const next = {
      ...current,
      ...patch,
    };
    GardenSettings.value = await api.put('/api/settings', next);
    return GardenSettings.value;
  },
};

const NAV_GROUPS = [
  { key: 'people', label: 'Люди', icon: 'team', children: [
    { key: 'team', path: '/team', label: 'Команда' },
    { key: 'stakeholders', path: '/stakeholders', label: 'Стейкхолдеры' },
  ]},
  { key: 'work', label: 'Работа', icon: 'work', children: [
    { key: 'goals', path: '/goals', label: 'Цели' },
    { key: 'projects', path: '/projects', label: 'Проекты' },
    { key: 'tasks', path: '/tasks', label: 'Задачи' },
    { key: 'issues', path: '/issues', label: 'Проблемы' },
    { key: 'agreements', path: '/agreements', label: 'Договорённости' },
    { key: 'checkins', path: '/checkins', label: 'Check-in' },
    { key: 'processes', path: '/processes', label: 'Процессы' },
  ]},
  { key: 'events', label: 'События', icon: 'calendar', children: [
    { key: 'meetings', path: '/meetings', label: 'Встречи' },
    { key: 'calendar', path: '/calendar', label: 'Календарь' },
  ]},
  { key: 'development', label: 'Развитие', icon: 'labs', children: [
    { key: 'ideas', path: '/labs', href: '/labs?tab=ideas', labTab: 'ideas', label: 'Идеи' },
    { key: 'theLabs', path: '/labs', href: '/labs?tab=projects', labTab: 'projects', label: 'The Labs' },
    { key: 'technology', path: '/technology', label: 'План мероприятий' },
  ]},
  { key: 'knowledge', label: 'Знания', icon: 'documents', children: [
    { key: 'knowledgeBase', path: '/knowledge-base', label: 'База знаний' },
    { key: 'tools', path: '/tools', label: 'Инструменты' },
  ]},
];

// Единый источник структуры навигации для сайдбара и персональных настроек.
// Через window он доступен views/settings.js, который загружается раньше app.js.

const PRIMARY_NAV_ITEMS = [
  { key: 'overview', path: '/overview', label: 'Обзор', icon: 'overview' },
  { key: 'journal', path: '/journal', label: 'Журнал', icon: 'journal' },
];

function homeScreenNavLabel() {
  return GardenSettings.value?.overviewHomeMode === 'assistant' ? 'Ассистент' : 'Обзор';
}

function navItemDisplayLabel(item) {
  return item?.key === 'overview' ? homeScreenNavLabel() : item?.label;
}

const FAVORITE_NAV_ITEMS = Object.fromEntries(NAV_GROUPS.flatMap((group) => group.children).map((item) => [item.key, item]));
const FAVORITE_NAV_ORDER = NAV_GROUPS.flatMap((group) => group.children.map((item) => item.key));

function navEntryTarget(item) {
  return item.href || item.path;
}

function navEntryActive(item, currentPath) {
  if (currentPath !== item.path && !currentPath.startsWith(item.path + '/')) return false;
  if (item.labTab) {
    // /labs/:key — детальная страница конкретного лаба — не несёт ?tab=, по
    // которому обычно различают «Идеи» и «The Labs». Но идеи и не открываются
    // на таком URL как на самих себя: Views.labDetail сразу уводит их на
    // /labs?tab=ideas (lab.entityType === 'idea'), так что любой /labs/:key,
    // до которого дошёл рендер, — это всегда проект The Labs. Без этого правила
    // пункт «Идеи» подсвечивался бы активным на любой странице The Labs.
    const isDetailRoute = currentPath.startsWith(item.path + '/');
    const currentTab = isDetailRoute ? 'projects' : (Router.queryParam('tab') || 'ideas');
    if (currentTab !== item.labTab) return false;
  }
  if (item._navFamily) {
    const preferred = preferredNavInstance(item);
    if (preferred) return preferred === item._navInstance;
    return !String(item._navInstance || '').startsWith('favorites:');
  }
  return true;
}

function cloneNavItem(item, sectionKey) {
  return {
    ...item,
    _navInstance: `${sectionKey}:${item.key}`,
    _navFamily: sectionKey === 'primary' ? '' : item.key,
  };
}

function buildNav() {
  const favorites = new Set(GardenSettings.value?.favoriteMenuItems || []);
  const favoriteChildren = FAVORITE_NAV_ORDER
    .filter((key) => favorites.has(key) && FAVORITE_NAV_ITEMS[key] && navItemAllowed(FAVORITE_NAV_ITEMS[key]))
    .map((key) => cloneNavItem(FAVORITE_NAV_ITEMS[key], 'favorites'));
  const groups = NAV_GROUPS.map((group) => ({
    key: group.key,
    title: group.label,
    icon: group.icon,
    // Избранное — это быстрый доступ, а не перенос: пункт остаётся в своей группе.
    items: group.children.filter(navItemAllowed).map((child) => cloneNavItem(child, group.key)),
  })).filter((group) => group.items.length);

  return [
    { key: 'primary', title: '', items: PRIMARY_NAV_ITEMS.filter(navItemAllowed).map((item) => cloneNavItem({ ...item, label: navItemDisplayLabel(item) }, 'primary')) },
    ...(favoriteChildren.length ? [{ key: 'favorites', title: 'Избранное', items: favoriteChildren }] : []),
    ...groups,
  ];
}


function navAccessArea(item) {
  return ({
    team:'people', stakeholders:'people', goals:'goals', projects:'projects', tasks:'tasks', issues:'issues', agreements:'agreements', checkins:'checkins', processes:'processes',
    meetings:'meetings', calendar:'vacations', ideas:'labs', theLabs:'labs', technology:'labs', knowledgeBase:'knowledge', tools:'knowledge', journal:'journal',
  })[item?.key] || null;
}
function navItemAllowed(item) {
  const area = navAccessArea(item);
  return !area || !window.Auth || Auth.canView(area);
}

const NAV_SELECTION_STORAGE_KEY = 'garden:navSelection';

function readNavSelectionState() {
  try {
    const raw = localStorage.getItem(NAV_SELECTION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeNavSelectionState(next) {
  try {
    localStorage.setItem(NAV_SELECTION_STORAGE_KEY, JSON.stringify(next || {}));
  } catch (_) {}
}

function rememberNavSelectionByMeta(family, instance) {
  if (!family || !instance) return;
  const next = readNavSelectionState();
  next[family] = instance;
  writeNavSelectionState(next);
}

function preferredNavInstance(item) {
  if (!item?._navFamily) return '';
  return String(readNavSelectionState()[item._navFamily] || '');
}

window.rememberNavSelectionFromNode = function rememberNavSelectionFromNode(node) {
  if (!node?.dataset) return;
  rememberNavSelectionByMeta(String(node.dataset.navFamily || ''), String(node.dataset.navInstance || ''));
};

function applyUiScale(scale) {
  const normalized = [80, 90, 100, 110, 125].includes(Number(scale)) ? Number(scale) : 100;
  // Новый 100% равен прежним 110%: сохраняем привычный базовый размер,
  // а остальные ступени считаем относительно него.
  const factor = 1.1 * (normalized / 100);

  // Эмулируем browser zoom на уровне приложения: сначала уменьшаем доступную
  // layout-область, затем масштабируем её обратно до размеров viewport. В отличие
  // от CSS `zoom` на body этот вариант одинаково работает в Chromium/WebKit и не
  // оставляет часть интерфейса за правым или нижним краем экрана.
  document.documentElement.style.setProperty('--ui-scale', String(factor));
  document.documentElement.style.setProperty('--ui-scale-inverse', String(1 / factor));
  document.body.style.zoom = '';
  document.body.style.transformOrigin = '0 0';
  document.body.style.transform = factor === 1 ? '' : `scale(${factor})`;
  document.body.style.width = factor === 1 ? '100vw' : `${100 / factor}vw`;
  document.body.style.height = factor === 1 ? '100vh' : `${100 / factor}vh`;
}

let _collapsedNavCloseTimer = null;
let _collapsedNavOpenKey = null;

function cancelCollapsedNavClose() {
  if (_collapsedNavCloseTimer) clearTimeout(_collapsedNavCloseTimer);
  _collapsedNavCloseTimer = null;
}

function closeCollapsedNavMenu() {
  cancelCollapsedNavClose();
  document.querySelector('.collapsed-nav-menu')?.remove();
  _collapsedNavOpenKey = null;
}

function scheduleCloseCollapsedNavMenu(delay = 180) {
  cancelCollapsedNavClose();
  _collapsedNavCloseTimer = setTimeout(() => closeCollapsedNavMenu(), delay);
}

function openCollapsedNavMenu(event, sectionKey) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  cancelCollapsedNavClose();
  const section = buildNav().find((entry) => entry.key === sectionKey && (entry.items || []).length);
  if (!section?.items?.length) return;
  const anchor = event.currentTarget;
  const existing = document.querySelector('.collapsed-nav-menu');
  if (existing && _collapsedNavOpenKey === sectionKey) {
    existing.onmouseenter = cancelCollapsedNavClose;
    return;
  }
  closeCollapsedNavMenu();
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'collapsed-nav-menu';
  menu.style.left = `${Math.round(rect.right + 8)}px`;
  menu.style.top = `${Math.round(rect.top)}px`;
  menu.innerHTML = `${section.title ? `<div class="collapsed-nav-menu-title">${escapeHtml(section.title)}</div>` : ''}${section.items.map((item) => `<button type="button" class="collapsed-nav-menu-item" data-path="${navEntryTarget(item)}" data-nav-instance="${escapeHtml(item._navInstance || '')}" data-nav-family="${escapeHtml(item._navFamily || '')}">${icon(navItemIcon(item), 14)}<span>${escapeHtml(item.label)}</span></button>`).join('')}`;
  menu.onmouseenter = cancelCollapsedNavClose;
  menu.onmouseleave = () => scheduleCloseCollapsedNavMenu();
  menu.onclick = (e) => e.stopPropagation();
  menu.querySelectorAll('[data-path]').forEach((button) => {
    button.onclick = () => {
      const path = button.dataset.path;
      window.rememberNavSelectionFromNode(button);
      closeCollapsedNavMenu();
      Router.go(path);
    };
  });
  document.body.appendChild(menu);
  _collapsedNavOpenKey = sectionKey;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.collapsed-nav-menu') && !e.target.closest('.nav-rail-group')) closeCollapsedNavMenu();
  if (!e.target.closest('.header-menu-popover') && !e.target.closest('[data-header-menu]')) closeHeaderMenu();
});

// ---------------------------------------------------------------------------
// Глобальная шапка (иконки поиска/темы/уведомлений/команды/настроек/аккаунта).
// Живёт в #app-header — отдельном от #topbar узле, поэтому не перезаписывается
// каждым вызовом setTopbar() со страницы. Рендерится вместе с сайдбаром на
// каждую навигацию (см. конец renderSidebar), плюс обновляется точечно, когда
// обновляется отдельно от содержимого страниц.
// ---------------------------------------------------------------------------

let _headerMenuOpenKind = null;

function closeHeaderMenu() {
  document.querySelector('.header-menu-popover')?.remove();
  _headerMenuOpenKind = null;
}

function openHeaderMenu(event, kind) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (_headerMenuOpenKind === kind) {
    closeHeaderMenu();
    return;
  }
  closeHeaderMenu();
  // Событие приходит через делегирование на document, поэтому currentTarget —
  // это document, а не сама кнопка; настоящий якорь ищем через closest().
  const anchor = event.target.closest('[data-header-menu]') || event.currentTarget;
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = `header-menu-popover header-menu-popover--${kind}`;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = kind === 'account' ? accountMenuHtml() : notificationsMenuHtml();
  document.body.appendChild(menu);
  if (kind === 'notifications') {
    NotificationCenter.bindMenu(menu);
    NotificationCenter.load(true).then(() => {
      if (_headerMenuOpenKind !== 'notifications' || !menu.isConnected) return;
      menu.innerHTML = notificationsMenuHtml();
      NotificationCenter.bindMenu(menu);
    }).catch(() => {});
  }
  // body масштабируется applyUiScale(). Fixed-элементы внутри transform-контекста
  // тоже масштабируются, поэтому у нижнего аккаунтного меню мог обрезаться «Выйти».
  // Компенсируем масштаб и ограничиваем меню границами viewport.
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  menu.style.transformOrigin = '0 0';
  menu.style.transform = scale === 1 ? '' : `scale(${1 / scale})`;
  const menuWidth = menu.offsetWidth || 260;
  const menuHeight = menu.offsetHeight || 180;
  const visualWidth = menuWidth;
  const visualHeight = menuHeight;
  const desiredLeft = Math.max(8, Math.min(Math.round(rect.right - visualWidth), window.innerWidth - visualWidth - 8));
  const topBelow = rect.bottom + 8;
  const topAbove = rect.top - visualHeight - 8;
  const desiredTop = topBelow + visualHeight <= window.innerHeight - 8 ? topBelow : Math.max(8, topAbove);
  menu.style.maxHeight = `${Math.max(120, Math.floor(window.innerHeight - 16))}px`;
  menu.style.overflowY = 'auto';
  menu.style.top = `${Math.round(desiredTop / scale)}px`;
  menu.style.left = `${Math.round(desiredLeft / scale)}px`;
  _headerMenuOpenKind = kind;
}

function accountMenuHtml() {
  const accountPerson = Auth.user?.personId && typeof store !== 'undefined' && store?.person ? store.person(Auth.user.personId) : null;
  const avatar = accountPerson
    ? avatarHtml(accountPerson)
    : `<span class="sidebar-account-avatar">${escapeHtml((Auth.user?.displayName || '?').trim().charAt(0).toUpperCase())}</span>`;
  const name = accountPerson?.name || Auth.user?.displayName || 'Профиль';
  const email = Auth.user?.email || '';
  return `
    <div class="header-menu-head">${avatar}<div class="header-menu-head-copy"><strong>${escapeHtml(name)}</strong>${email ? `<small>${escapeHtml(email)}</small>` : ''}</div></div>
    <div class="header-menu-sep"></div>
    <button type="button" class="header-menu-item" data-route="${accountPerson ? personPath(accountPerson) : '/settings'}" data-close-header-menu>${icon('stakeholders', 15)}<span>Профиль</span></button>
    ${Auth.isAdmin() ? `<button type="button" class="header-menu-item" data-route="/admin" data-close-header-menu>${icon('admin', 15)}<span>Администрирование</span></button>` : ''}
    <button type="button" class="header-menu-item header-menu-item-danger" data-command="Auth.logout" data-close-header-menu>${icon('logout', 15)}<span>Выйти</span></button>
  `;
}

const NotificationCenter = {
  items: null,
  unreadCount: 0,
  loading: null,
  pollTimer: null,
  startPolling() {
    if (NotificationCenter.pollTimer) return;
    NotificationCenter.pollTimer = window.setInterval(() => NotificationCenter.load(true).catch(() => {}), 60000);
  },
  async load(force = false) {
    if (!force && NotificationCenter.items !== null) return NotificationCenter.items;
    if (NotificationCenter.loading) return NotificationCenter.loading;
    NotificationCenter.loading = api.get('/api/notifications').then((data) => {
      NotificationCenter.items = Array.isArray(data?.items) ? data.items : [];
      NotificationCenter.unreadCount = Number(data?.unreadCount || 0);
      NotificationCenter.refreshBadge();
      return NotificationCenter.items;
    }).finally(() => {
      NotificationCenter.loading = null;
    });
    return NotificationCenter.loading;
  },
  refreshBadge() {
    document.querySelectorAll('[data-notification-badge]').forEach((badge) => {
      const count = NotificationCenter.unreadCount;
      badge.textContent = count > 99 ? '99+' : String(count || '');
      badge.hidden = count <= 0;
    });
  },
  async markRead(id) {
    const data = await api.put(`/api/notifications/${encodeURIComponent(id)}/read`, {});
    const item = NotificationCenter.items?.find((entry) => entry.id === id);
    if (item) item.readAt = item.readAt || new Date().toISOString();
    NotificationCenter.unreadCount = Number(data?.unreadCount || Math.max(0, NotificationCenter.unreadCount - 1));
    NotificationCenter.refreshBadge();
  },
  async markAllRead() {
    await api.post('/api/notifications/read-all', {});
    (NotificationCenter.items || []).forEach((item) => {
      item.readAt = item.readAt || new Date().toISOString();
    });
    NotificationCenter.unreadCount = 0;
    NotificationCenter.refreshBadge();
  },
  bindMenu(menu) {
    menu.querySelectorAll('[data-notification-id]').forEach((row) => {
      row.onclick = async () => {
        const item = NotificationCenter.items?.find((entry) => entry.id === row.dataset.notificationId);
        if (!item) return;
        if (!item.readAt) await NotificationCenter.markRead(item.id).catch(() => {});
        closeHeaderMenu();
        if (item.route) Router.go(item.route);
      };
    });
    const readAll = menu.querySelector('[data-notifications-read-all]');
    if (readAll) readAll.onclick = async () => {
      await NotificationCenter.markAllRead().catch(() => {});
      if (menu.isConnected) menu.innerHTML = notificationsMenuHtml();
      NotificationCenter.bindMenu(menu);
    };
  },
};

function notificationEventLabel(eventType) {
  return ({
    task_assigned: 'Задача',
    project_load_changed: 'Загрузка',
    checkin_reminder: 'Check-in',
    issue_created: 'Проблема',
    lab_created: 'The Labs',
  })[eventType] || 'Уведомление';
}

function notificationsMenuHtml() {
  const items = NotificationCenter.items;
  if (items === null) return `<div class="header-menu-head-solo">Уведомления</div><div class="header-menu-empty">Загрузка…</div>`;
  const rows = items.slice(0, 20).map((item) => `<button type="button" class="header-menu-notif-row ${item.readAt ? '' : 'is-unread'}" data-notification-id="${escapeHtml(item.id)}">
      <span class="notification-unread-dot" aria-hidden="true"></span>
      <span class="header-menu-notif-copy"><span class="header-menu-notif-kind">${escapeHtml(notificationEventLabel(item.eventType))}</span><span class="header-menu-notif-title">${escapeHtml(item.title)}</span>${item.body ? `<span class="header-menu-notif-meta">${escapeHtml(item.body)}</span>` : ''}</span>
    </button>`).join('');
  const body = rows || `<div class="header-menu-empty">Новых уведомлений нет</div>`;
  return `<div class="header-menu-notif-head"><div class="header-menu-head-solo">Уведомления</div>${NotificationCenter.unreadCount ? '<button type="button" class="header-menu-link" data-notifications-read-all>Прочитать все</button>' : ''}</div><div class="header-menu-notif-list">${body}</div>`;
}

function renderAppHeader() {
  // Глобальная верхняя панель убрана: поиск и сервисные действия теперь живут в сайдбаре.
  const bar = document.getElementById('app-header');
  if (bar) bar.innerHTML = '';
}

// Хлебные крошки строятся из того же реестра NAV_GROUPS/PRIMARY_NAV_ITEMS, что
// и сайдбар — единый источник структуры навигации, никакого дублирования лейблов.
function pageBreadcrumbParts(currentPath) {
  const primary = PRIMARY_NAV_ITEMS.find((item) => navEntryActive(item, currentPath));
  if (primary) return [{ label: 'Garden', path: '/overview' }, { label: navItemDisplayLabel(primary), path: primary.path }];
  for (const group of NAV_GROUPS) {
    const item = group.children.find((child) => navEntryActive(child, currentPath));
    // Группы сайдбара (Работа, События, Люди и т. п.) — только организационные
    // заголовки и не имеют собственных страниц, поэтому в breadcrumbs не входят.
    if (item) return [{ label: 'Garden', path: '/overview' }, { label: item.label, path: navEntryTarget(item) }];
  }
  return [{ label: 'Garden', path: '/overview' }];
}

function breadcrumbRowHtml(parts) {
  const crumbs = parts.map((part, index) => {
    const sep = index > 0 ? '<span class="page-crumbs-sep">/</span>' : '';
    // Последний пункт тоже остаётся ссылкой, если у него есть реальный маршрут.
    const inner = part.path
      ? `<a href="${part.path}" data-route="${part.path}" class="page-crumbs-link">${escapeHtml(part.label)}</a>`
      : `<span class="page-crumbs-current">${escapeHtml(part.label)}</span>`;
    return sep + inner;
  }).join('');
  return `<nav class="page-crumbs" aria-label="Хлебные крошки">${crumbs}</nav>`;
}

// setTopbar — единая точка входа для вызовов из view-файлов: любая страница,
// начинающаяся с простого «<h1>Заголовок</h1><div class="actions">…</div>»,
// получает автоматические хлебные крошки и общий ритм отступов, вычисленные
// из активного пункта навигации для текущего пути (pageBreadcrumbParts).
// Для детальных страниц (задача/встреча/цель/проект/лаборатория/человек) это
// работало не всегда: их путь либо однозначно резолвится через NAV_GROUPS
// (/tasks/:key, /meetings/:key, /goals/:id, /projects/:id — тогда достаточно
// того же простого <h1>), либо нет — маршрут человека живёт под /people/:ref,
// а не под /team или /stakeholders, откуда на него ссылается меню, и The Labs
// (/labs/:key) не может по одному URL отличить идею от проекта. Для этих двух
// случаев второй необязательный параметр opts.crumbs передаёт готовый массив
// крошек напрямую, в обход pageBreadcrumbParts — так все детальные страницы
// используют один и тот же page-header, а не собственную мини-вёрстку крошек.
function setTopbar(html, opts) {
  const bar = document.getElementById('topbar');
  const isPlainHeader = /^\s*<h1[ >]/.test(html);
  if (isPlainHeader) {
    const headingMatch = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const headingLabel = headingMatch
      ? headingMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      : '';
    let parts = [...((opts && opts.crumbs) || pageBreadcrumbParts(Router.current()))];
    const last = parts[parts.length - 1];
    if (last && headingLabel && String(last.label || '').trim().localeCompare(headingLabel, 'ru', { sensitivity: 'base' }) === 0) {
      parts = parts.slice(0, -1);
    }
    const crumbs = breadcrumbRowHtml(parts);
    bar.innerHTML = `<div class="page-header">${crumbs}<div class="page-header-row"><button type="button" class="topbar-menu-btn" data-command="openMobileNav" aria-label="Открыть меню" aria-controls="sidebar" aria-expanded="false">${icon('menu', 18)}</button>${html}</div></div>`;
  } else {
    bar.innerHTML = html;
  }
  bar.classList.toggle('topbar-plain', isPlainHeader);
  const detailActions = bar.querySelector('.task-detail-topbar-actions');
  if (detailActions && !detailActions.querySelector('[data-detail-save-status]')) {
    detailActions.insertAdjacentHTML('afterbegin', '<span class="detail-save-status" data-detail-save-status aria-live="polite" aria-atomic="true"></span>');
  }
}

function navSectionActive(section, currentPath) {
  const items = section.items || [];
  return items.some((item) => navEntryActive(item, currentPath));
}

function navSectionOverrideMap() {
  const raw = GardenSettings.value?.navSectionOverrides;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

// Группа меню разворачивается автоматически, только пока в ней лежит текущий
// маршрут — иначе список из 5 групп/~18 пунктов не помещается в высоту
// сайдбара на обычном ноутбучном экране. Пользователь может вручную закрепить
// любую группу открытой или свёрнутой стрелкой в заголовке — это сохраняется
// в navSectionOverrides и имеет приоритет над авто-поведением.
function isNavSectionExpanded(key, isActive) {
  const overrides = navSectionOverrideMap();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return !!overrides[key];
  // По умолчанию раскрыто только «Избранное». Остальные группы открываются вручную.
  return key === 'favorites';
}

async function toggleNavSection(event, key) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const sections = buildNav();
  const section = sections.find((s) => s.key === key);
  const isActive = section ? navSectionActive(section, Router.current()) : false;
  const currentlyExpanded = isNavSectionExpanded(key, isActive);
  const willExpand = !currentlyExpanded;
  const next = { ...navSectionOverrideMap() };
  if (willExpand && key !== 'favorites') {
    // В обычной навигации одновременно раскрыта только одна группа.
    // «Избранное» — постоянный быстрый доступ и не участвует в аккордеоне.
    sections.forEach((candidate) => {
      if (candidate.key !== 'primary' && candidate.key !== 'favorites' && candidate.key !== key && candidate.title) {
        next[candidate.key] = false;
      }
    });
  }
  next[key] = willExpand;
  // Оптимистично обновляем состояние и анимируем уже отрисованное меню без полного rerender:
  // так CSS успевает интерполировать высоту/прозрачность секций.
  GardenSettings.value = { ...(GardenSettings.value || {}), navSectionOverrides: next };
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('collapsed')) {
    sidebar.querySelectorAll('[data-nav-section]').forEach((node) => {
      const nodeKey = node.dataset.navSection;
      if (!Object.prototype.hasOwnProperty.call(next, nodeKey)) return;
      const open = !!next[nodeKey];
      node.classList.toggle('is-expanded', open);
      node.querySelector('[data-nav-section-toggle]')?.setAttribute('aria-expanded', String(open));
      node.querySelector('.nav-section-chevron')?.classList.toggle('is-expanded', open);
      const shell = node.querySelector('.nav-section-items-shell');
      shell?.classList.toggle('is-expanded', open);
      shell?.setAttribute('aria-hidden', String(!open));
      if (shell) shell.toggleAttribute('inert', !open);
    });
  } else {
    renderSidebar(Router.current());
  }
  try {
    await GardenSettings.update({ navSectionOverrides: next });
  } catch (err) {
    console.error(err);
    toast('Не удалось сохранить состояние меню');
  }
}

function isSidebarCollapsed() {
  try {
    return localStorage.getItem('garden:sidebarCollapsed') === '1';
  } catch (_) {
    return false;
  }
}

function toggleSidebar() {
  const next = !isSidebarCollapsed();
  try {
    localStorage.setItem('garden:sidebarCollapsed', next ? '1' : '0');
  } catch (_) {}
  renderSidebar(Router.current());
}

function openMobileNav() {
  document.body.classList.add('nav-open');
  document.getElementById('nav-backdrop')?.removeAttribute('hidden');
  document.querySelector('.topbar-menu-btn')?.setAttribute('aria-expanded', 'true');
  // Первый пункт меню получает фокус, чтобы drawer был проходим с клавиатуры.
  document.querySelector('#sidebar .nav-item')?.focus();
  document.addEventListener('keydown', mobileNavKeyHandler, true);
}

function closeMobileNav(opts) {
  if (!document.body.classList.contains('nav-open')) return;
  document.body.classList.remove('nav-open');
  document.getElementById('nav-backdrop')?.setAttribute('hidden', '');
  const btn = document.querySelector('.topbar-menu-btn');
  btn?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', mobileNavKeyHandler, true);
  if (opts?.restoreFocus) btn?.focus();
}

function mobileNavKeyHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMobileNav({ restoreFocus: true });
    return;
  }
  if (e.key !== 'Tab') return;
  const sidebar = document.getElementById('sidebar');
  const items = focusableWithin(sidebar);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function navItemIcon(item) {
  if (item.icon) return item.icon;
  const iconMap = {
    team: 'team',
    stakeholders: 'stakeholders',
    goals: 'goals',
    projects: 'projects',
    teamLoad: 'workload',
    tasks: 'tasks',
    issues: 'issues',
    agreements: 'agreements',
    processes: 'processes',
    meetings: 'meetings',
    calendar: 'calendar',
    ideas: 'ideas',
    theLabs: 'labs',
    technology: 'events',
    knowledgeBase: 'documents',
    documents: 'documents',
    tools: 'tools',
  };
  return iconMap[item.key] || 'dotsHorizontal';
}

function navSectionIcon(section) {
  if (section.key === 'favorites') return 'star';
  return section.icon || 'dotsHorizontal';
}

function renderSidebar(currentPath) {
  const sidebar = document.getElementById('sidebar');
  const collapsed = isSidebarCollapsed();
  sidebar.classList.toggle('collapsed', collapsed);
  closeCollapsedNavMenu();
  const sections = buildNav();
  const sectionHtml = collapsed
    ? (() => {
        const primary = sections.find((section) => section.key === 'primary');
        const grouped = sections.filter((section) => section.key !== 'primary');
        const primaryItems = (primary?.items || []).map((item) => {
          const target = navEntryTarget(item);
          const active = navEntryActive(item, currentPath);
          return `<a class="nav-item nav-leaf nav-rail-leaf ${active ? 'active' : ''}" href="${target}" data-route="${target}" data-nav-instance="${escapeHtml(item._navInstance || '')}" data-nav-family="${escapeHtml(item._navFamily || '')}" data-close-collapsed-nav ${active ? 'aria-current="page"' : ''} title="${escapeHtml(item.label)}">${icon(navItemIcon(item))}<span>${escapeHtml(item.label)}</span></a>`;
        }).join('');
        const groupItems = grouped.map((section) => {
          const active = navSectionActive(section, currentPath);
          return `<button type="button" class="nav-item nav-leaf nav-rail-group ${active ? 'active' : ''}" title="${escapeHtml(section.title)}" aria-label="${escapeHtml(section.title)}" aria-haspopup="menu" data-collapsed-nav-section="${section.key}">${icon(navSectionIcon(section))}<span>${escapeHtml(section.title)}</span></button>`;
        }).join('');
        return `<div class="nav-collapsed-rail"><div class="nav-collapsed-cluster nav-collapsed-cluster-primary">${primaryItems}</div>${groupItems ? `<div class="nav-collapsed-divider"></div><div class="nav-collapsed-cluster nav-collapsed-cluster-groups">${groupItems}</div>` : ''}</div>`;
      })()
    : sections.map((section) => {
        const active = navSectionActive(section, currentPath);
        const expanded = isNavSectionExpanded(section.key, active);
        const itemsMarkup = `<div class="nav-section-items">${section.items.map((item) => {
            const target = navEntryTarget(item);
            const itemActive = navEntryActive(item, currentPath);
            return `<a class="nav-item nav-leaf ${itemActive ? 'active' : ''}" href="${target}" data-route="${target}" data-nav-instance="${escapeHtml(item._navInstance || '')}" data-nav-family="${escapeHtml(item._navFamily || '')}" ${itemActive ? 'aria-current="page"' : ''} title="${escapeHtml(item.label)}">${icon(navItemIcon(item))}<span>${escapeHtml(item.label)}</span></a>`;
          }).join('')}</div>`;
        const header = section.title
          ? `<button type="button" class="nav-section-header ${active ? 'is-active' : ''}" aria-expanded="${expanded}" data-nav-section-toggle="${section.key}">
              <span class="nav-section-title">${escapeHtml(section.title)}</span>
              <span class="nav-section-chevron ${expanded ? 'is-expanded' : ''}" aria-hidden="true">${icon('chevronRight', 12)}</span>
            </button>`
          : '';
        const body = section.title
          ? `<div class="nav-section-items-shell ${expanded ? 'is-expanded' : ''}" aria-hidden="${expanded ? 'false' : 'true'}" ${expanded ? '' : 'inert'}><div class="nav-section-items-clip">${itemsMarkup}</div></div>`
          : itemsMarkup;
        return `<section class="nav-section nav-section-block nav-section-${section.key} ${active ? 'is-active' : ''} ${expanded ? 'is-expanded' : ''} ${section.title ? '' : 'nav-section-ungrouped'}" data-nav-section="${section.key}">
          ${header}
          ${body}
        </section>`;
      }).join('');

  const accountPerson = Auth.user?.personId && typeof store !== 'undefined' && store?.person ? store.person(Auth.user.personId) : null;
  const accountAvatar = accountPerson
    ? avatarHtml(accountPerson)
    : `<span class="sidebar-account-avatar">${escapeHtml((Auth.user?.displayName || '?').trim().charAt(0).toUpperCase())}</span>`;
  const accountName = accountPerson?.name || Auth.user?.displayName || 'Профиль';

  sidebar.innerHTML = `
    <div class="sidebar-brand sidebar-brand-row">
      <button type="button" class="sidebar-brand-name" data-route="/overview" aria-label="Garden — на главную">
        <span class="sidebar-brand-word">Garden</span>
      </button>
      <button type="button" class="sidebar-collapse-btn sidebar-collapse-btn--menu" data-command="toggleSidebar" title="${collapsed ? 'Развернуть меню' : 'Свернуть меню'}" aria-label="${collapsed ? 'Развернуть меню' : 'Свернуть меню'}">${icon('sidebar', 16)}</button>
      <button type="button" class="sidebar-close-btn" data-close-mobile-nav aria-label="Закрыть меню">${icon('close', 16)}</button>
    </div>
    <button type="button" class="sidebar-search-field" data-command="openPalette" aria-label="Открыть поиск и быстрые команды">
      ${icon('search', 15)}
      <span class="sidebar-search-label">Поиск</span>
      <kbd>/</kbd>
    </button>
    <nav class="nav-sections nav-sections-stacked" aria-label="Разделы Garden">${sectionHtml}</nav>
    <div class="sidebar-footer sidebar-footer-bar">
      <button type="button" class="sidebar-user-compact" data-header-menu="account" aria-haspopup="menu" title="${escapeHtml(accountName)}" aria-label="Меню аккаунта">${accountAvatar}<span class="sidebar-user-name">${escapeHtml(accountName)}</span></button>
      <button type="button" class="sidebar-footer-icon sidebar-notifications-btn" data-header-menu="notifications" aria-haspopup="menu" title="Уведомления" aria-label="Уведомления">${icon('bell', 15)}<span class="sidebar-notification-badge" data-notification-badge hidden></span></button>
      <button type="button" class="sidebar-footer-icon ${currentPath === '/settings' ? 'active' : ''}" data-route="/settings" title="Настройки" aria-label="Настройки">${icon('settings', 15)}</button>
    </div>
  `;
  sidebar.querySelectorAll('[data-collapsed-nav-section]').forEach((node) => {
    node.addEventListener('mouseenter', (event) => openCollapsedNavMenu(event, node.dataset.collapsedNavSection));
    node.addEventListener('focus', (event) => openCollapsedNavMenu(event, node.dataset.collapsedNavSection), true);
    node.addEventListener('mouseleave', () => scheduleCloseCollapsedNavMenu());
  });
  normalizeSidebarActiveItems(sidebar);
  ensureActiveNavItemVisible(sidebar);
  renderAppHeader();
  NotificationCenter.refreshBadge();
  NotificationCenter.startPolling();
  NotificationCenter.load(true).catch(() => {});
}

// Пункты меню могут не помещаться в высоту сайдбара (особенно когда активная
// группа — одна из последних, «Знания»/«Развитие»): .nav-sections-stacked
// прокручивается, но по умолчанию не показывает индикатор прокрутки, и текущий
// активный пункт может оказаться почти полностью обрезан снизу — пользователь
// не видит, где он находится, и не видит соседние пункты группы. Подкручиваем
// список так, чтобы активный пункт был полностью виден, сразу при отрисовке.
function ensureActiveNavItemVisible(sidebar) {
  const active = sidebar?.querySelector('.nav-sections-stacked .nav-item.nav-leaf.active');
  if (!active) return;
  // Если прокрутка выполняется синхронно сразу после (пере)отрисовки сайдбара —
  // то есть до того, как браузер вообще успел один раз отрисовать список пунктов, —
  // на первой загрузке страницы (когда активный пункт лежит глубоко в «Знания»/
  // «Развитие», например «База знаний») часть пунктов иногда остаётся неотрисованной
  // после скролла: DOM и стили верны, но пиксели не закрашены. Откладываем скролл
  // на следующий кадр, чтобы список сначала отрисовался в исходном положении.
  requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest' }));
}

function normalizeSidebarActiveItems(sidebar) {
  if (!sidebar) return;
  const byFamily = new Map();
  sidebar.querySelectorAll('.nav-item.active[data-nav-family]').forEach((node) => {
    const family = String(node.dataset.navFamily || '');
    if (!family) return;
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(node);
  });
  byFamily.forEach((nodes, family) => {
    if (nodes.length <= 1) return;
    const preferred = String(readNavSelectionState()[family] || '');
    const winner = nodes.find((node) => node.dataset.navInstance === preferred)
      || nodes.find((node) => !String(node.dataset.navInstance || '').startsWith('favorites:'))
      || nodes[0];
    nodes.forEach((node) => {
      const isWinner = node === winner;
      node.classList.toggle('active', isWinner);
      if (isWinner) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
  });
}


