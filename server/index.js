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
const { nextNumericKey } = require('./entity-keys');
const createAuthCore = require('./auth-core');
const createAccessControl = require('./access-control');
const createEntityIdentifiers = require('./entity-identifiers');
const createJournalSync = require('./domain/journal-sync');
const createRecurringMeetings = require('./domain/recurring-meetings');

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

const { workspaceSettings } = registerSettingsRoutes(app, { db, authenticate, DATA_DIR, UPLOADS_DIR, path, isAdmin, isManager, hasPermission, denied, isDemoUser, autoArchiveCompletedTasks });

function taskLifecyclePatch(current, patch) {
  const next = { ...(patch || {}) };
  if (!Object.prototype.hasOwnProperty.call(next, 'status')) return next;
  const previousStatus = current?.status || null;
  const newStatus = next.status;
  if (newStatus === 'done') {
    if (!current?.completedAt || previousStatus !== 'done') next.completedAt = new Date().toISOString();
  } else if (previousStatus === 'done') {
    next.completedAt = null;
  }
  return next;
}

function autoArchiveCompletedTasks() {
  const days = workspaceSettings().taskAutoArchiveDays;
  const cutoff = Date.now() - days * 86400000;
  const nowIso = new Date().toISOString();
  let count = 0;
  for (const task of db.tasks.all()) {
    if (task.status !== 'done') continue;
    const completedAt = task.completedAt || task.updatedAt || task.createdAt;
    const completedMs = Date.parse(completedAt || '');
    if (!Number.isFinite(completedMs)) continue;
    if (!task.completedAt) db.tasks.update(task.id, { completedAt });
    if (completedMs <= cutoff) {
      db.tasks.update(task.id, { archivedAt: nowIso, completedAt });
      count += 1;
    }
  }
  return count;
}

autoArchiveCompletedTasks();
const autoArchiveTimer = setInterval(autoArchiveCompletedTasks, 60 * 60 * 1000);
if (autoArchiveTimer.unref) autoArchiveTimer.unref();

// ---------- Slugs and human-readable entity keys ----------
const identifiers = createEntityIdentifiers({ db, nextNumericKey });
const {
  SLUG_COLLECTIONS, uniqueSlug, resolveEntity, normalizeProjectTaskCode, uniqueProjectTaskCode,
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

const { syncJournalDerivedEntity } = createJournalSync({ db, isActiveTeamMember });



// ---------- Плановые 1:1 и PR ----------
const { syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, ensureRecurringMeetingSchedules } = createRecurringMeetings({ db, isAdmin, isActiveTeamMember, nextMeetingKey });
ensureRecurringMeetingSchedules();

// ---------- Multi-assignee task copies ----------
// Copies may share taskGroupId internally, but there is no parent/group entity in the UI.


function sanitizeKnowledgeHtmlServer(value) {
  return String(value || '')
    .replace(/<(script|style|iframe|object|embed|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

// Все рабочие API ниже требуют авторизованную сессию.
// Публичными остаются только health/login и явно защищённые auth/settings endpoints выше.
app.use('/api', authenticate);
app.use('/api', (req, res, next) => db.withWorkspace(isDemoUser(req.auth?.user) ? 'demo' : 'main', next));

function ensureTeamleadSelfAssignment(personId, roles, actorUser) {
  if (!normalizedRoles(roles).includes('teamlead') || !personId) return null;
  const person = db.people.get(personId);
  if (!person || person.type !== 'team' || person.teamLeadId) return person || null;
  const updated = db.people.update(personId, { teamLeadId: personId });
  try { syncRecurringMeetingsForPerson(personId, actorUser || null); } catch (err) {
    console.warn('Не удалось обновить плановые встречи после назначения тимлида самому себе', err);
  }
  return updated;
}

function syncExistingTeamleadSelfAssignments() {
  for (const user of db.auth.users.all()) {
    if (!user.active || !isTeamlead(user) || !user.personId) continue;
    const person = db.people.get(user.personId);
    if (person && person.type === 'team' && !person.teamLeadId) db.people.update(person.id, { teamLeadId: person.id });
  }
}
syncExistingTeamleadSelfAssignments();

// ---------- Администрирование учётных записей ----------
registerAdminRoutes(app, { db, requireAdmin, isDemoUser, safeUser, ACCESS_ROLES, ACCESS_PERMISSIONS, ACCESS_LEVELS, ACCESS_AREAS, roleLabel, cleanUsername, normalizedRoles, normalizedPermissions, validUsername, validatePassword, generatePassword, hashPassword, ensureTeamleadSelfAssignment, isAdmin, normalizeRoleAccessPolicies, roleAccessPolicies });

// ---------- Resource CRUD routes ----------
registerCrudRoutes(app, {
  COLLECTIONS, db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity, denied, canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead, canManageCollection, normalizeProjectTaskCode, uniqueProjectTaskCode, syncJournalDerivedEntity, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, nextLabKey, syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix, teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignMeetingKey, nextMeetingKey, assignProcessKey, nextProcessKey,
});

// ---------- Collaboration routes ----------
registerCollaborationRoutes(app, { db, canReadItem, denied });
registerCommentRoutes(app, { db, canReadItem, denied });
registerVersionRoutes(app, { db, resolveEntity, canReadItem, canUpdate, sanitizeItem, denied });

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
