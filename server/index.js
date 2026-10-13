'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DATA_DIR, UPLOADS_DIR } = require('./storage');
const db = require('./db');
const { seedIfEmpty } = require('./seed');
const demoSeed = require('./demo-data');
const registerCrudRoutes = require('./routes/crud');
const registerCollaborationRoutes = require('./routes/collaboration');
const registerCommentRoutes = require('./routes/comments');
const registerSettingsRoutes = require('./routes/settings');
const registerAdminRoutes = require('./routes/admin');
const registerAuthRoutes = require('./routes/auth');
const registerSearchRoutes = require('./routes/search');
const registerSmartSearchRoutes = require('./routes/smart-search');
const registerAggregateRoutes = require('./routes/aggregates');
const registerPhotoRoutes = require('./routes/photos');
const registerVersionRoutes = require('./routes/versions');
const registerNotificationRoutes = require('./routes/notifications');
const { ensureCheckinReminder } = require('./notifications');
const { nextNumericKey } = require('./entity-keys');
const createAuthCore = require('./auth-core');
const createAccessControl = require('./access-control');
const createEntityIdentifiers = require('./entity-identifiers');
const createRecurringMeetings = require('./domain/recurring-meetings');
const { taskLifecyclePatch } = require('./domain/task-lifecycle');
const createTaskAutoArchive = require('./domain/task-auto-archive');
const createWorkspaceSettings = require('./domain/workspace-settings');
const { sanitizeKnowledgeHtmlServer } = require('./domain/knowledge-sanitize');
const createTeamleadSync = require('./domain/teamlead-sync');

const app = express();
const PORT = process.env.PORT || 4173;

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

seedIfEmpty(db);

// ---------- Аутентификация и учетные записи ----------
const authCore = createAuthCore({ db, crypto });
const {
  failedLogins, ACCESS_ROLES, ACCESS_PERMISSIONS, ACCESS_LEVELS, ACCESS_AREAS, DEFAULT_ROLE_ACCESS, PASSWORD_MIN_LENGTH,
  cleanUsername, validUsername, hashPassword, passwordMatches, generatePassword,
  isDemoUser, safeUser, clearSessionCookie, createSession, authenticate,
  normalizedRoles, normalizedPermissions, hasPermission, requireAdmin,
  isAdmin, isManager, isTeamlead, roleLabel, rolesLabel, validatePassword,
  normalizeRoleAccessPolicies, roleAccessPolicies, effectiveAccess, accessLevel, accessCapabilities,
  ensureInitialAdmin,
} = authCore;

ensureInitialAdmin();

// Пользовательские изображения хранятся вне приложения в GardenData/uploads.
app.use('/uploads', authenticate, express.static(UPLOADS_DIR, {
  fallthrough: false,
  index: false,
  maxAge: '1h',
}));

// ---------- Роли, владение и права доступа ----------
const access = createAccessControl({
  db, isAdmin, isManager, isTeamlead, hasPermission, accessLevel, accessCapabilities,
});
const {
  OWNER_COLLECTIONS, canManageCollection, canReadItem, sanitizeItem, visibleItems,
  memberPersonPatch, teamleadOwnsPerson, canCreate, canUpdate, canDelete, denied, withOwnership,
} = access;

// Workspace settings and task auto-archive are created up front so both can be
// handed to registerSettingsRoutes as ready-made dependencies — no forward
// reference to a function that doesn't exist yet.
const { workspaceSettings, setWorkspaceSettings } = createWorkspaceSettings({ db });
const taskAutoArchive = createTaskAutoArchive({ db, workspaceSettings });
const { autoArchiveCompletedTasks } = taskAutoArchive;

const { normalizeUserSettings } = registerSettingsRoutes(app, {
  db, authenticate, DATA_DIR, UPLOADS_DIR, path, isAdmin, isManager, hasPermission,
  denied, isDemoUser, workspaceSettings, setWorkspaceSettings, autoArchiveCompletedTasks,
});

autoArchiveCompletedTasks();
taskAutoArchive.startAutoArchiveTimer();

// ---------- Slugs and human-readable entity keys ----------
const identifiers = createEntityIdentifiers({ db, nextNumericKey });
const {
  SLUG_COLLECTIONS, uniqueSlug, resolveEntity, validateProjectKey,
  taskKeyPrefix, nextTaskKey, assignTaskKey, assignLabKey,
  nextCollectionKey, assignCollectionKey,
} = identifiers;

const COLLECTIONS = [
  'people',
  'projects',
  'labs',
  'tasks',
  'issues',
  'meetings',
  'journal',
  'goals',
  'agreements',
  'tools',
  'processes',
  'vacations',
  'kbFolders',
  'kbDocs',
  'docFolders',
  'toolFolders',
  'checkins',
  'technologyEvents',
];

registerAuthRoutes(app, {
  db, COLLECTIONS, demoSeed, cleanUsername, failedLogins, passwordMatches, createSession,
  safeUser, authenticate, clearSessionCookie, validatePassword, PASSWORD_MIN_LENGTH,
  hashPassword, generatePassword,
});

function isActiveTeamMember(person) {
  return Boolean(person && person.type === 'team' && !['dismissed', 'transferred', 'inactive'].includes(person.status));
}

// ---------- Плановые 1:1 и PR ----------
const {
  syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, ensureRecurringMeetingSchedules,
} = createRecurringMeetings({ db, isAdmin, isActiveTeamMember, nextMeetingKey: () => nextCollectionKey('meetings') });
ensureRecurringMeetingSchedules();

// ---------- Multi-assignee task copies ----------
// Copies may share taskGroupId internally, but there is no parent/group entity in the UI.

// Все рабочие API ниже требуют авторизованную сессию.
// Публичными остаются только health/login и явно защищённые auth/settings endpoints выше.
app.use('/api', authenticate);
app.use('/api', (req, res, next) => db.withWorkspace(isDemoUser(req.auth?.user) ? 'demo' : 'main', next));

const {
  ensureTeamleadSelfAssignment, syncExistingTeamleadSelfAssignments,
} = createTeamleadSync({ db, normalizedRoles, isTeamlead, syncRecurringMeetingsForPerson });
syncExistingTeamleadSelfAssignments();

// ---------- Администрирование учётных записей ----------
registerAdminRoutes(app, {
  db, requireAdmin, isDemoUser, safeUser, ACCESS_ROLES, ACCESS_PERMISSIONS, ACCESS_LEVELS, ACCESS_AREAS,
  roleLabel, cleanUsername, normalizedRoles, normalizedPermissions, validUsername, validatePassword,
  generatePassword, hashPassword, ensureTeamleadSelfAssignment, isAdmin, normalizeRoleAccessPolicies, roleAccessPolicies,
});

// ---------- Resource CRUD routes ----------
registerCrudRoutes(app, {
  COLLECTIONS, db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity,
  denied, canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead,
  canManageCollection, validateProjectKey, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, assignLabKey,
  syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix,
  teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignCollectionKey,
});

// ---------- Collaboration routes ----------
registerCollaborationRoutes(app, { db, canReadItem, denied });
registerCommentRoutes(app, { db, canReadItem, denied, isAdmin, resolveEntity });
registerVersionRoutes(app, { db, resolveEntity, canReadItem, canUpdate, sanitizeItem, denied });
registerNotificationRoutes(app, { db, ensureCheckinReminder });

// ---------- Aggregated read models ----------
registerAggregateRoutes(app, { db, resolveEntity, sanitizeItem, visibleItems, canReadItem, denied });

// ---------- Search ----------
const searchApi = registerSearchRoutes(app, { db, visibleItems, normalizeUserSettings });
// «Умный поиск» переиспользует разбор обычного поиска, а не заводит второй парсер.
registerSmartSearchRoutes(app, { db, visibleItems, search: searchApi, isTeamlead, normalizeUserSettings });

// ---------- Person photos ----------
registerPhotoRoutes(app, { db, resolveEntity, canUpdate, denied, UPLOADS_DIR, path, fs, crypto });

// SPA history fallback: клиентские маршруты вроде /journal и /labs
// должны открываться напрямую и после перезагрузки без hash-router.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log(`  Garden запущен → http://127.0.0.1:${PORT}`);
    if (HOST === '0.0.0.0') console.log('  Для команды: откройте этот порт на компьютере с Garden и используйте его IP в локальной сети.');
    console.log('');
  });
}

module.exports = { app };
