import * as React from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarRange, Contact, FlaskConical, Goal, Home,
  Layers, Library, Lightbulb, ListChecks, Menu, NotebookPen, Search, Settings, ShieldCheck, Sparkles, Sprout, Users, UsersRound, Workflow,
  Wrench, Handshake, BriefcaseBusiness, LogOut, Bell, Gauge, Star,
  PanelLeftClose, PanelLeftOpen, TriangleAlert,
} from 'lucide-react';
import {
  Avatar, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, ScrollArea, Tooltip, TooltipProvider,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { SearchPalette } from '@/components/search-palette';
import { BrandWordmark } from '@/components/brand';
import { api } from '@/lib/api';

// Every route and favourite key is unchanged; zones only group them. Each destination
// and each zone carries its own icon so the rail can be read by shape as well as label.
const navigationZones = [
  { id: 'work', label: 'Работа', icon: Layers, items: [
    ['/tasks', 'Задачи', ListChecks, 'tasks'], ['/projects', 'Проекты', BriefcaseBusiness, 'projects'], ['/issues', 'Проблемы', TriangleAlert, 'issues'], ['/agreements', 'Договорённости', Handshake, 'agreements'],
  ]},
  { id: 'people', label: 'Люди', icon: Contact, items: [
    ['/team', 'Команда', UsersRound, 'team'], ['/stakeholders', 'Стейкхолдеры', Building2, 'stakeholders'], ['/team-load', 'Загрузка', Gauge, 'teamLoad'],
  ]},
  { id: 'events', label: 'События', icon: CalendarRange, items: [
    ['/meetings', 'Встречи', CalendarClock, 'meetings'], ['/weekly', 'Weekly', CalendarCheck, 'checkins'], ['/calendar', 'Календарь', CalendarDays, 'calendar'], ['/technology', 'План мероприятий', Sparkles, 'technology'],
  ]},
  { id: 'development', label: 'Развитие', icon: Sprout, items: [
    ['/goals', 'Цели', Goal, 'goals'], ['/ideas', 'Идеи', Lightbulb, 'ideas'], ['/workshop', 'Мастерская', FlaskConical, 'theLabs'],
  ]},
  { id: 'knowledge', label: 'Знания', icon: Library, items: [
    ['/knowledge', 'База знаний', BookOpen, 'knowledgeBase'], ['/processes', 'Процессы', Workflow, 'processes'], ['/tools', 'Инструменты', Wrench, 'tools'],
  ]},
];

const favoriteItemRegistry = Object.fromEntries(navigationZones.flatMap((zone) => zone.items.map((item) => [item[3], item])));
const favoriteItemOrder = navigationZones.flatMap((zone) => zone.items.map((item) => item[3]));

const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_WIDTH = 184;
const SECONDARY_SIDEBAR_WIDTH = 216;

function NavIcon({ icon: Icon, size = 18, className }) {
  return <span className={cn('flex h-[22px] w-[22px] shrink-0 items-center justify-center', className)} aria-hidden="true"><Icon style={{ width: size, height: size }} className="shrink-0" strokeWidth={1.8}/></span>;
}

function routeMatches(pathname, route) {
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}

function zoneForPath(pathname) {
  if (routeMatches(pathname, '/people')) return navigationZones.find((zone) => zone.id === 'people') || null;
  return navigationZones.find((zone) => zone.items.some(([route]) => routeMatches(pathname, route))) || null;
}


function SidebarLink({ to, label, icon: Icon, onNavigate, collapsed = false, onContextMenu, suppressActive = false }) {
  const link = <NavLink to={to} end={to === '/'} onClick={onNavigate} onContextMenu={onContextMenu} aria-label={collapsed ? label : undefined} className={({ isActive }) => cn('sidebar-nav-entry group flex h-10 items-center rounded-[8px] text-[14px] font-normal text-muted-foreground transition-colors hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground ui-focus-ring', collapsed ? 'w-full justify-center px-0' : 'gap-2.5 px-2.5', suppressActive && 'v3-suppress-route-active', isActive && !suppressActive && 'bg-[hsl(var(--sidebar-hover))] text-foreground')}>
    <NavIcon icon={Icon} className="opacity-80 group-hover:opacity-100" />{!collapsed && <span className="truncate">{label}</span>}
  </NavLink>;
  return collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link;
}

function SidebarSectionButton({ section, active, open, collapsed = false, onClick }) {
  const Icon = section.icon;
  const button = <button type="button" onClick={onClick} aria-expanded={open} aria-label={collapsed ? section.label : undefined} className={cn('sidebar-nav-entry sidebar-section-button group flex h-10 w-full items-center rounded-[8px] text-[14px] font-normal transition-colors ui-focus-ring', collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5', active ? 'bg-[hsl(var(--sidebar-hover))] text-foreground' : 'text-muted-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground')}>
    <NavIcon icon={Icon} className="opacity-80 group-hover:opacity-100"/>
    {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>}
  </button>;
  return collapsed ? <Tooltip content={section.label} side="right">{button}</Tooltip> : button;
}

export function AppShell({ user, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [menuSectionId, setMenuSectionId] = React.useState(null);
  const [menuSettings, setMenuSettings] = React.useState({ favoriteMenuItems: [] });
  const [menuContext, setMenuContext] = React.useState(null);
  const [searchPaletteOpen, setSearchPaletteOpen] = React.useState(false);
  const [currentPerson, setCurrentPerson] = React.useState(null);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      const stored = window.localStorage.getItem('garden:sidebar-collapsed');
      return stored == null ? false : stored === '1';
    } catch { return false; }
  });
  const goSequenceUntil = React.useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  React.useEffect(() => {
    setMobileOpen(false);
    setMenuContext(null);
    setMenuSectionId(null);
  }, [location.pathname]);
  React.useEffect(() => {
    try { window.localStorage.setItem('garden:sidebar-collapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    const isEditable = (node) => Boolean(node && (node.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(node.tagName)));
    const targets = [
      ['KeyA','/'], ['KeyJ','/journal'], ['KeyT','/team'], ['KeyM','/meetings'], ['KeyC','/calendar'],
      ['KeyZ','/tasks'], ['KeyP','/projects'], ['KeyG','/goals'], ['KeyI','/issues'], ['KeyD','/agreements'],
      ['KeyL','/workshop'], ['KeyB','/knowledge'], ['KeyU','/tools'], ['KeyR','/processes'], ['KeyS','/settings'], ['KeyW','/weekly'],
    ];
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyK') { event.preventDefault(); setSearchPaletteOpen((value) => !value); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      if (goSequenceUntil.current > Date.now()) {
        const target = targets.find(([code]) => code === event.code);
        goSequenceUntil.current = 0;
        if (target) { event.preventDefault(); navigate(target[1]); return; }
      }
      if ((event.code === 'Slash' && event.shiftKey) || event.key === '?') { event.preventDefault(); setShortcutsOpen(true); return; }
      if (event.shiftKey) return;
      if (event.code === 'Slash' || event.key === '/') { event.preventDefault(); setSearchPaletteOpen(true); return; }
      if (event.code === 'KeyN') {
        const primary = document.querySelector('[data-primary-action="true"], main button[data-primary-action], main [data-primary-action], main button.bg-primary:not([disabled])');
        if (primary) { event.preventDefault(); primary.click(); return; }
        const composer = document.querySelector('main textarea, main [contenteditable="true"]');
        if (composer) { event.preventDefault(); composer.focus(); }
        return;
      }
      if (event.code === 'KeyG') goSequenceUntil.current = Date.now() + 1500;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  React.useEffect(() => {
    let alive = true;
    const load = async () => { try { const value = await api.get('/api/settings'); if (alive) setMenuSettings(value || { favoriteMenuItems: [] }); } catch {} };
    load();
    const refresh = () => load();
    window.addEventListener('garden:settings-updated', refresh);
    return () => { alive = false; window.removeEventListener('garden:settings-updated', refresh); };
  }, []);

  React.useEffect(() => {
    let alive = true;
    if (!user?.personId) { setCurrentPerson(null); return () => { alive = false; }; }
    api.resource('people').get(user.personId).then((person) => { if (alive) setCurrentPerson(person || null); }).catch(() => { if (alive) setCurrentPerson(null); });
    return () => { alive = false; };
  }, [user?.personId]);

  React.useEffect(() => {
    let alive = true;
    api.get('/api/notifications?limit=1').then((value) => { if (alive) setUnreadCount(Number(value?.unreadCount) || 0); }).catch(() => {});
    return () => { alive = false; };
  }, [location.pathname]);

  const doLogout = async () => { try { await api.post('/api/auth/logout'); } catch {} onLogout?.(); };
  const toggleFavorite = async (key) => {
    if (!key) return;
    const current = new Set(menuSettings.favoriteMenuItems || []);
    if (current.has(key)) current.delete(key); else current.add(key);
    const next = { ...menuSettings, favoriteMenuItems:[...current] };
    setMenuSettings(next); setMenuContext(null);
    try {
      const saved = await api.put('/api/settings', { favoriteMenuItems:next.favoriteMenuItems });
      setMenuSettings(saved || next);
      window.dispatchEvent(new CustomEvent('garden:settings-updated',{detail:saved || next}));
    } catch { setMenuSettings(menuSettings); }
  };
  const openMenuContext = (event, item) => {
    event.preventDefault(); event.stopPropagation();
    setMenuContext({ x:event.clientX, y:event.clientY, key:item[3], label:item[1] });
  };

  const activeZone = zoneForPath(location.pathname);
  const favoriteItems = favoriteItemOrder.filter((key) => (menuSettings.favoriteMenuItems || []).includes(key)).map((key) => favoriteItemRegistry[key]).filter(Boolean);
  const menuSections = [
    { id: 'favorites', label: 'Избранное', icon: Star, items: favoriteItems },
    ...navigationZones,
  ];
  const selectedSection = menuSections.find((section) => section.id === menuSectionId) || null;
  const secondarySection = selectedSection || activeZone;
  const hasSecondaryNavigation = !sidebarCollapsed && Boolean(secondarySection);
  // Exactly one primary item is visually active: an explicitly opened section wins
  // over the route underneath it; otherwise the current route determines the section.
  const primaryActiveSectionId = selectedSection?.id || activeZone?.id || null;
  const suppressDirectRouteActive = Boolean(selectedSection);
  const profilePerson = currentPerson || { name: user?.displayName || user?.username || 'Профиль' };
  const selectSection = (section, collapsed, mobile) => {
    setMenuSectionId(section.id);
    if (mobile) return;
    if (collapsed) setSidebarCollapsed(false);
    // A zone opens its first destination instead of only revealing a second rail.
    const firstRoute = section.items?.[0]?.[0];
    if (firstRoute && activeZone?.id !== section.id) navigate(firstRoute);
  };
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((value) => !value);
  };

  const renderSidebar = (collapsed, mobile = false) => {
    const isCollapsed = collapsed && !mobile;
    const closeMobile = () => { if (mobile) setMobileOpen(false); };
    return <aside className={cn('sidebar-surface v3-sidebar flex h-dvh flex-col', isCollapsed && 'is-collapsed')} style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}>
      <div className={cn('v3-sidebar-brand flex h-[56px] shrink-0 items-center', isCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
        {!isCollapsed && <Link to="/" className="garden-brand-link min-w-0" aria-label="Garden"><BrandWordmark className="sidebar-brand-wordmark truncate"/></Link>}
        {!mobile && <button type="button" onClick={toggleSidebarCollapsed} className="v3-sidebar-collapse grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground ui-focus-ring" aria-label={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'} title={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'}>{isCollapsed ? <PanelLeftOpen className="h-4 w-4"/> : <PanelLeftClose className="h-4 w-4"/>}</button>}
      </div>
      <div className={cn('shrink-0 pb-3', isCollapsed ? 'px-3' : 'px-3')}>
        <Tooltip content="Поиск" side="right" disabled={!isCollapsed}>
          <button type="button" onClick={()=>setSearchPaletteOpen(true)} className={cn('sidebar-menu-search flex h-8 items-center rounded-[8px] border bg-white text-left text-muted-foreground transition-colors', isCollapsed ? 'w-full justify-center px-0' : 'w-full gap-2 px-2.5')} aria-label="Открыть поиск по всему сервису">
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.8}/>{!isCollapsed && <><span className="min-w-0 flex-1 truncate text-[13px]">Поиск</span><kbd className="v3-search-kbd font-sans text-[11px]">/</kbd></>}
          </button>
        </Tooltip>
      </div>
      <ScrollArea className={cn('min-h-0 flex-1', isCollapsed ? 'px-3' : 'px-3')}>
        <nav className="v3-sidebar-nav pb-5">
          <SidebarLink to="/" label="Главная" icon={Home} collapsed={isCollapsed} suppressActive={suppressDirectRouteActive} onNavigate={()=>{ setMenuSectionId(null); closeMobile(); }}/>
          <SidebarLink to="/journal" label="Журнал" icon={NotebookPen} collapsed={isCollapsed} suppressActive={suppressDirectRouteActive} onNavigate={()=>{ setMenuSectionId(null); closeMobile(); }}/>
          <SidebarSectionButton section={{ id:'favorites', label:'Избранное', icon:Star }} active={primaryActiveSectionId === 'favorites'} open={selectedSection?.id === 'favorites'} collapsed={isCollapsed} onClick={()=>{ if (isCollapsed && !mobile) { setSidebarCollapsed(false); setMenuSectionId('favorites'); } else { setMenuSectionId((current)=>current === 'favorites' ? null : 'favorites'); } }}/>
          <div className={cn('sidebar-nav-gap', isCollapsed && 'sidebar-nav-gap-collapsed')} aria-hidden="true" />
          {navigationZones.map((zone) => <SidebarSectionButton key={zone.id} section={zone} active={primaryActiveSectionId === zone.id} open={secondarySection?.id === zone.id} collapsed={isCollapsed} onClick={()=>selectSection(zone, isCollapsed, mobile)}/>)}
        </nav>
      </ScrollArea>
      {<div className="v3-sidebar-profile shrink-0 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={unreadCount ? `Профиль, непрочитанных уведомлений: ${unreadCount}` : 'Профиль'} className={cn('relative flex w-full min-w-0 items-center rounded-[8px] text-left transition-colors hover:bg-white/65 ui-focus-ring', isCollapsed ? 'h-11 justify-center px-0' : 'min-h-11 gap-2.5 px-2 py-1.5')}>
              <span className="relative shrink-0"><Avatar person={profilePerson} size="sm"/>{unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</span>
              {!isCollapsed && <span className="min-w-0 flex-1"><span className="profile-name-one-line block max-w-full whitespace-nowrap text-[13px] font-medium leading-[16px] tracking-[-0.01em] text-foreground">{profilePerson.name}</span><span className="mt-0.5 block truncate text-[11px] leading-[13px] text-muted-foreground">{currentPerson?.role || 'Тимлид'}</span></span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{profilePerson.name}</DropdownMenuLabel>
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={() => navigate('/notifications')}><Bell className="h-4 w-4"/>Уведомления{unreadCount > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[12px] font-medium leading-5 text-primary-foreground">{unreadCount}</span>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}><Settings className="h-4 w-4"/>Настройки</DropdownMenuItem>
            {(user?.role === 'admin' || user?.roles?.includes?.('admin')) && <DropdownMenuItem onSelect={() => navigate('/admin')}><ShieldCheck className="h-4 w-4"/>Администрирование</DropdownMenuItem>}
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={doLogout}><LogOut className="h-4 w-4"/>Выйти</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </aside>;
  };

  const renderSecondarySidebar = (section, mobile = false) => {
    if (!section) return null;
    const items = section.id === 'favorites' ? favoriteItems : (section.items || []);
    const closeMobile = () => { if (mobile) setMobileOpen(false); };
    return <aside className="sidebar-secondary v3-secondary-sidebar flex h-dvh flex-col border-r bg-background" style={{ width: SECONDARY_SIDEBAR_WIDTH }}>
      <div className="flex h-[58px] shrink-0 items-center px-4 text-[14px] font-medium text-foreground">{section.label}</div>
      <ScrollArea className="min-h-0 flex-1 px-2.5">
        <nav className="flex flex-col gap-1 pb-4">
          {items.length ? items.map((item) => { const [to,label,Icon] = item; return <SidebarLink key={to} to={to} label={label} icon={Icon} onContextMenu={(event)=>openMenuContext(event,item)} onNavigate={closeMobile}/>; }) : <div className="px-2.5 py-3 text-[12px] leading-5 text-muted-foreground">Здесь появятся добавленные в избранное разделы.</div>}
        </nav>
      </ScrollArea>
    </aside>;
  };

  const primarySidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const secondarySidebarWidth = hasSecondaryNavigation ? SECONDARY_SIDEBAR_WIDTH : 0;
  const totalSidebarWidth = primarySidebarWidth + secondarySidebarWidth;

  return <TooltipProvider><div className="app-shell">
    <div className="fixed inset-y-0 left-0 z-20 hidden md:block">{renderSidebar(sidebarCollapsed)}</div>
    {hasSecondaryNavigation && <div className="v3-secondary-sidebar-wrap fixed inset-y-0 z-20 hidden md:block" style={{left: primarySidebarWidth}}>{renderSecondarySidebar(secondarySection)}</div>}
    {mobileOpen && <><button aria-label="Закрыть меню" className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMobileOpen(false)}/><div className="fixed inset-y-0 left-0 z-50 flex md:hidden">{renderSidebar(false, true)}{hasSecondaryNavigation && renderSecondarySidebar(secondarySection, true)}</div></>}
    <div style={{ '--sidebar-current-width': `${totalSidebarWidth}px` }} className="app-shell-content min-w-0 bg-background" data-two-level-sidebar={hasSecondaryNavigation ? 'true' : 'false'} data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-3 backdrop-blur md:hidden"><Button variant="ghost" size="icon" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5"/></Button><Link to="/" className="garden-brand-link" aria-label="Garden"><BrandWordmark className="text-sm"/></Link><Button variant="ghost" size="icon" aria-label="Открыть поиск по всему сервису" onClick={() => setSearchPaletteOpen(true)}><Search className="h-5 w-5"/></Button></div>
      <main id="main" className="min-h-dvh">{children}</main>
    </div>
    {menuContext && <><button type="button" className="fixed inset-0 z-[80] cursor-default" aria-label="Закрыть контекстное меню" onClick={()=>setMenuContext(null)} onContextMenu={(event)=>{event.preventDefault();setMenuContext(null);}}/><div className="fixed z-[81] min-w-[190px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md" style={{left:Math.min(menuContext.x, window.innerWidth-210), top:Math.min(menuContext.y, window.innerHeight-52)}}><button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={()=>toggleFavorite(menuContext.key)}><Star className="h-4 w-4"/>{(menuSettings.favoriteMenuItems||[]).includes(menuContext.key) ? 'Убрать из избранного' : 'Добавить в избранное'}</button></div></>}
    <SearchPalette open={searchPaletteOpen} onOpenChange={setSearchPaletteOpen} onOpenShortcuts={()=>setShortcutsOpen(true)}/>
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Горячие клавиши</DialogTitle></DialogHeader>
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <div><div className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Общие</div><ShortcutRow label="Поиск и команды" keys={[navigator.platform?.includes('Mac')?'⌘ K':'Ctrl K','/']}/><ShortcutRow label="Главное действие" keys={['N']}/><ShortcutRow label="Список клавиш" keys={['?']}/></div>
          <div><div className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Переходы · G, затем</div>{[['A','Главная'],['J','Журнал'],['T','Команда'],['M','Встречи'],['W','Weekly'],['Z','Задачи'],['P','Проекты'],['G','Цели'],['I','Проблемы'],['L','Мастерская'],['B','База знаний'],['U','Инструменты'],['R','Процессы'],['S','Настройки']].map(([key,label])=><ShortcutRow key={key} label={label} keys={['G',key]}/>)}</div>
        </div>
        <p className="text-xs text-muted-foreground">Клавиши работают в любой раскладке и не перехватываются, когда курсор находится в поле ввода.</p>
      </DialogContent>
    </Dialog>
  </div></TooltipProvider>;
}

function ShortcutRow({ label, keys }) { return <div className="flex items-center justify-between gap-4 py-1.5"><span>{label}</span><span className="flex gap-1">{keys.map((key,index)=><kbd key={`${key}-${index}`} className="min-w-7 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-[12px] text-muted-foreground">{key}</kbd>)}</span></div>; }
