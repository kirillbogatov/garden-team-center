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
const registerAggregateRoutes = require('./routes/aggregates');
const registerPhotoRoutes = require('./routes/photos');
const registerVersionRoutes = require('./routes/versions');
const registerNotificationRoutes = require('./routes/notifications');
const { ensureCheckinReminder } = require('./notifications');
const { nextNumericKey } = require('./entity-keys');
const createAuthCore = require('./auth-core');
const createAccessControl = require('./access-control');
const createEntityIdentifiers = require('./entity-identifiers');
const createJournalSync = require('./domain/journal-sync');
const createRecurringMeetings = require('./domain/recurring-meetings');
const { taskLifecyclePatch } = require('./domain/task-lifecycle');
const createTaskAutoArchive = require('./domain/task-auto-archive');
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
  isAdmin, isManager, isTeamlead, roleLabel, rolesLabel, validatePassword, normalizeRoleAccessPolicies, roleAccessPolicies, effectiveAccess, accessLevel, accessCapabilities,
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
const access = createAccessControl({ db, isAdmin, isManager, isTeamlead, hasPermission, accessLevel, accessCapabilities });
const {
  OWNER_COLLECTIONS, canManageCollection, canReadItem, sanitizeItem, visibleItems,
  memberPersonPatch, teamleadOwnsPerson, canCreate, canUpdate, canDelete, denied, withOwnership,
} = access;

// registerSettingsRoutes needs a stable autoArchiveCompletedTasks reference to call after
// settings change, but the real implementation needs workspaceSettings back from it — broken
// via a thin forwarding proxy, resolved to the real function right below.
let autoArchiveCompletedTasks = () => {};
const { workspaceSettings } = registerSettingsRoutes(app, { db, authenticate, DATA_DIR, UPLOADS_DIR, path, isAdmin, isManager, hasPermission, denied, isDemoUser, autoArchiveCompletedTasks: (...args) => autoArchiveCompletedTasks(...args) });

const taskAutoArchive = createTaskAutoArchive({ db, workspaceSettings });
autoArchiveCompletedTasks = taskAutoArchive.autoArchiveCompletedTasks;
autoArchiveCompletedTasks();
taskAutoArchive.startAutoArchiveTimer();

// ---------- Slugs and human-readable entity keys ----------
const identifiers = createEntityIdentifiers({ db, nextNumericKey });
const {
  SLUG_COLLECTIONS, uniqueSlug, resolveEntity, validateProjectTaskCode,
  ensureSlugs, ensureProjectTaskCodes, taskKeyPrefix, nextTaskKey, assignTaskKey, nextLabKey, ensureLabKeys, ensureTaskKeys,
  nextMeetingKey, assignMeetingKey, ensureMeetingKeys, nextProcessKey, assignProcessKey, ensureProcessKeys,
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
  'documents',
  'tools',
  'processes',
  'vacations',
  'kbFolders',
  'kbDocs',
  'docFolders',
  'toolFolders',
  'checkins',
];

const normalizeWorkspaceIdentifiers = () => { ensureSlugs(); ensureProjectTaskCodes(); ensureTaskKeys(); ensureLabKeys(); ensureMeetingKeys(); ensureProcessKeys(); };
registerAuthRoutes(app, { db, COLLECTIONS, demoSeed, cleanUsername, failedLogins, passwordMatches, createSession, safeUser, authenticate, clearSessionCookie, validatePassword, PASSWORD_MIN_LENGTH, hashPassword, generatePassword, normalizeWorkspaceIdentifiers });


function isActiveTeamMember(person) {
  return Boolean(person && person.type === 'team' && !['dismissed', 'transferred', 'inactive'].includes(person.status));
}

const { syncJournalDerivedEntity, syncEntityToJournal, unlinkJournalFor } = createJournalSync({ db, isActiveTeamMember });



// ---------- Плановые 1:1 и PR ----------
const { syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, ensureRecurringMeetingSchedules } = createRecurringMeetings({ db, isAdmin, isActiveTeamMember, nextMeetingKey });
ensureRecurringMeetingSchedules();

// ---------- Multi-assignee task copies ----------
// Copies may share taskGroupId internally, but there is no parent/group entity in the UI.


// Все рабочие API ниже требуют авторизованную сессию.
// Публичными остаются только health/login и явно защищённые auth/settings endpoints выше.
app.use('/api', authenticate);
app.use('/api', (req, res, next) => db.withWorkspace(isDemoUser(req.auth?.user) ? 'demo' : 'main', next));

const { ensureTeamleadSelfAssignment, syncExistingTeamleadSelfAssignments } = createTeamleadSync({ db, normalizedRoles, isTeamlead, syncRecurringMeetingsForPerson });
syncExistingTeamleadSelfAssignments();

// ---------- Администрирование учётных записей ----------
registerAdminRoutes(app, { db, requireAdmin, isDemoUser, safeUser, ACCESS_ROLES, ACCESS_PERMISSIONS, ACCESS_LEVELS, ACCESS_AREAS, roleLabel, cleanUsername, normalizedRoles, normalizedPermissions, validUsername, validatePassword, generatePassword, hashPassword, ensureTeamleadSelfAssignment, isAdmin, normalizeRoleAccessPolicies, roleAccessPolicies });

// ---------- Resource CRUD routes ----------
registerCrudRoutes(app, {
  COLLECTIONS, db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity, denied, canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead, canManageCollection, validateProjectTaskCode, syncJournalDerivedEntity, syncEntityToJournal, unlinkJournalFor, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, nextLabKey, syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix, teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignMeetingKey, nextMeetingKey, assignProcessKey, nextProcessKey,
});

// ---------- Collaboration routes ----------
registerCollaborationRoutes(app, { db, canReadItem, denied });
registerCommentRoutes(app, { db, canReadItem, denied, isAdmin });
registerVersionRoutes(app, { db, resolveEntity, canReadItem, canUpdate, sanitizeItem, denied });
registerNotificationRoutes(app, { db, ensureCheckinReminder });

// ---------- Aggregated read models ----------
registerAggregateRoutes(app, { db, resolveEntity, sanitizeItem, visibleItems, canReadItem, denied });

// ---------- Search ----------
registerSearchRoutes(app, { db, visibleItems });

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
