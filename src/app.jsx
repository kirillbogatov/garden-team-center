import * as React from 'react';
import { BrowserRouter, HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate } from '@/components/auth';
import { AppShell } from '@/components/app-shell';
import { EmptyState, Button, Skeleton } from '@/components/ui';
import { Page } from '@/components/page';
import { HomePage } from '@/pages/home';

// Pages other than Home load on first visit, so the first paint ships one small chunk
// instead of the whole product.
const lazyPage = (load, name) => React.lazy(() => load().then((module) => ({ default: module[name] })));
const TasksPage = lazyPage(() => import('@/pages/tasks'), 'TasksPage');
const TaskDetailPage = lazyPage(() => import('@/pages/tasks'), 'TaskDetailPage');
const ResourcePage = lazyPage(() => import('@/pages/resources'), 'ResourcePage');
const ResourceDetailPage = lazyPage(() => import('@/pages/resources'), 'ResourceDetailPage');
const PeoplePage = lazyPage(() => import('@/pages/resources'), 'PeoplePage');
const ProjectsPage = lazyPage(() => import('@/pages/resources'), 'ProjectsPage');
const TeamLoadPage = lazyPage(() => import('@/pages/resources'), 'TeamLoadPage');
const PersonDetailPage = lazyPage(() => import('@/pages/resources'), 'PersonDetailPage');
const ProjectDetailPage = lazyPage(() => import('@/pages/resources'), 'ProjectDetailPage');
const GoalDetailPage = lazyPage(() => import('@/pages/resources'), 'GoalDetailPage');
const LabsPage = lazyPage(() => import('@/pages/workspace'), 'LabsPage');
const WorkshopDetailPage = lazyPage(() => import('@/pages/workspace'), 'WorkshopDetailPage');
const JournalPage = lazyPage(() => import('@/pages/journal'), 'JournalPage');
const MeetingsPage = lazyPage(() => import('@/pages/operations'), 'MeetingsPage');
const MeetingDetailPage = lazyPage(() => import('@/pages/operations'), 'MeetingDetailPage');
const CalendarPage = lazyPage(() => import('@/pages/operations'), 'CalendarPage');
const CheckinsPage = lazyPage(() => import('@/pages/operations'), 'CheckinsPage');
const NotificationsPage = lazyPage(() => import('@/pages/misc'), 'NotificationsPage');
const SearchPage = lazyPage(() => import('@/pages/misc'), 'SearchPage');
const SettingsPage = lazyPage(() => import('@/pages/misc'), 'SettingsPage');
const KnowledgePage = lazyPage(() => import('@/pages/knowledge-tools'), 'KnowledgePage');
const KnowledgeDocumentPage = lazyPage(() => import('@/pages/knowledge-tools'), 'KnowledgeDocumentPage');
const ToolsPage = lazyPage(() => import('@/pages/knowledge-tools'), 'ToolsPage');
const AdminPage = lazyPage(() => import('@/pages/admin'), 'AdminPage');
const AdminRoleAccessPage = lazyPage(() => import('@/pages/admin'), 'AdminRoleAccessPage');
const TechnologyPage = lazyPage(() => import('@/pages/technology'), 'TechnologyPage');

function NotFound() {
  return <Page narrow><EmptyState title="Страница не найдена" description="Возможно, ссылка устарела после перехода на новый интерфейс." action={<Button asChild><Link to="/">На главную</Link></Button>}/></Page>;
}

function AppRoutes({ user }) {
  return <Routes>
    <Route path="/" element={<HomePage user={user}/>}/>
    <Route path="/journal" element={<JournalPage/>}/>
    <Route path="/tasks" element={<TasksPage user={user}/>}/>
    <Route path="/tasks/:id" element={<TaskDetailPage/>}/>
    <Route path="/meetings" element={<MeetingsPage/>}/>
    <Route path="/meetings/:id" element={<MeetingDetailPage/>}/>
    <Route path="/calendar" element={<CalendarPage/>}/>
    <Route path="/team" element={<PeoplePage type="team"/>}/>
    <Route path="/stakeholders" element={<PeoplePage type="stakeholder"/>}/>
    <Route path="/people" element={<Navigate to="/team" replace/>}/>
    <Route path="/people/:id" element={<PersonDetailPage user={user}/>}/>
    <Route path="/projects" element={<ProjectsPage/>}/>
    <Route path="/team-load" element={<TeamLoadPage/>}/>
    <Route path="/projects/:id" element={<ProjectDetailPage/>}/>
    <Route path="/issues" element={<ResourcePage resource="issues"/>}/>
    <Route path="/issues/:id" element={<ResourceDetailPage resource="issues"/>}/>
    <Route path="/processes" element={<ResourcePage resource="processes"/>}/>
    <Route path="/processes/:id" element={<ResourceDetailPage resource="processes"/>}/>
    <Route path="/agreements" element={<ResourcePage resource="agreements"/>}/>
    <Route path="/agreements/:id" element={<ResourceDetailPage resource="agreements"/>}/>
    <Route path="/goals" element={<ResourcePage resource="goals"/>}/>
    <Route path="/goals/:goalKey" element={<GoalDetailPage/>}/>
    <Route path="/tools" element={<ToolsPage/>}/>
    <Route path="/tools/:id" element={<ResourceDetailPage resource="tools"/>}/>
    <Route path="/ideas" element={<LabsPage mode="ideas"/>}/>
    <Route path="/workshop" element={<LabsPage mode="workshop"/>}/>
    <Route path="/workshop/:id" element={<WorkshopDetailPage/>}/>
    <Route path="/weekly" element={<CheckinsPage/>}/>
    <Route path="/checkins" element={<LegacyWeeklyRedirect/>}/>
    <Route path="/knowledge" element={<KnowledgePage/>}/>
    <Route path="/knowledge/:id" element={<KnowledgeDocumentPage/>}/>
    <Route path="/knowledge-base/:id" element={<LegacyKnowledgeRedirect/>}/>
    <Route path="/technology" element={<TechnologyPage user={user}/>}/>
    <Route path="/search" element={<SearchPage/>}/>
    <Route path="/notifications" element={<NotificationsPage/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
    <Route path="/admin" element={<AdminPage/>}/>
    <Route path="/admin/roles" element={<AdminRoleAccessPage/>}/>

    <Route path="/labs" element={<Navigate to="/workshop" replace/>}/>
    <Route path="/labs/ideas" element={<Navigate to="/ideas" replace/>}/>
    <Route path="/labs/:id" element={<LegacyWorkshopRedirect/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes>;
}

function LegacyKnowledgeRedirect() {
  const id = useLocation().pathname.split('/').filter(Boolean).pop();
  return <Navigate to={`/knowledge/${encodeURIComponent(id)}`} replace/>;
}

function LegacyWeeklyRedirect() {
  return <Navigate to={`/weekly${useLocation().search || ''}`} replace/>;
}

function LegacyWorkshopRedirect() {
  const id = useLocation().pathname.split('/').filter(Boolean).pop();
  return <Navigate to={`/workshop/${encodeURIComponent(id)}`} replace/>;
}

// GitHub Pages не умеет SPA-фолбэк, поэтому демо живёт на hash-маршрутах (/#/tasks).
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

export default function App() {
  return <Router><AuthGate>{(user, logout)=><AppShell user={user} onLogout={logout}><React.Suspense fallback={<Page narrow><Skeleton className="h-80"/></Page>}><AppRoutes user={user}/></React.Suspense></AppShell>}</AuthGate></Router>;
}
