// Локальная база Garden на SQLite.
// Все сущности хранятся как JSON-документы в одной транзакционной таблице records.
// Сущности хранятся как JSON-документы в SQLite и меняются атомарно.

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./storage');
const { extractMentions } = require('./mentions');
const { AsyncLocalStorage } = require('async_hooks');
const workspaceStorage = new AsyncLocalStorage();
function currentWorkspace() { return workspaceStorage.getStore() || 'main'; }

function scopedMetaKey(key) { const ws = currentWorkspace(); return ws === 'main' ? String(key) : `${ws}:${String(key)}`; }


let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (error) {
  throw new Error(
    'Garden использует встроенный SQLite и требует Node.js с поддержкой node:sqlite (Node.js 22.5+). ' +
      'Обновите Node.js и запустите Garden снова.'
  );
}

const DB_PATH = path.join(DATA_DIR, 'garden.sqlite');
const MENTION_COLLECTIONS = new Set(['journal', 'agreements']);

const COLLECTIONS = [
  'people',
  'projects',
  'labs',
  'comments',
  'tasks',
  'taskNotes',
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
  'technologyEvents',
];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });


const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS records (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT NOT NULL,
    workspace TEXT NOT NULL DEFAULT 'main',
    relation_key TEXT,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(collection, id)
  );

  CREATE INDEX IF NOT EXISTS idx_records_collection_seq
    ON records(collection, seq);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_versions (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'main',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    author_user_id TEXT,
    created_at TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    finalized INTEGER NOT NULL DEFAULT 1,
    UNIQUE(workspace, entity_type, entity_id, version)
  );

  CREATE INDEX IF NOT EXISTS idx_entity_versions_entity
    ON entity_versions(workspace, entity_type, entity_id, version DESC);

  CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,
    person_id TEXT,
    roles_json TEXT,
    permissions_json TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
    ON auth_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    workspace TEXT NOT NULL DEFAULT 'main',
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    route TEXT,
    dedupe_key TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(workspace, user_id, dedupe_key)
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(workspace, user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(workspace, user_id, read_at);
`);

function relationKeyFor(name, item) {
  if (!item || typeof item !== 'object') return null;
  if (name === 'comments') return item.entityType && item.entityId ? `${item.entityType}:${item.entityId}` : null;
  if (name === 'taskNotes') return item.taskId || null;
  if (name === 'labs' && item.entityType === 'idea') return item.labProjectId || null;
  if (name === 'tasks') return item.taskGroupId || null;
  return null;
}



const stmtAll = sqlite.prepare(
  'SELECT data FROM records WHERE workspace = ? AND collection = ? ORDER BY seq ASC'
);
const stmtGet = sqlite.prepare(
  'SELECT data FROM records WHERE workspace = ? AND collection = ? AND id = ?'
);
const stmtRelated = sqlite.prepare(
  'SELECT data FROM records WHERE workspace = ? AND collection = ? AND relation_key = ? ORDER BY seq ASC'
);
const stmtInsert = sqlite.prepare(`
  INSERT INTO records (workspace, collection, relation_key, id, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtUpdate = sqlite.prepare(`
  UPDATE records
  SET data = ?, relation_key = ?, updated_at = ?
  WHERE workspace = ? AND collection = ? AND id = ?
`);
const stmtDelete = sqlite.prepare(
  'DELETE FROM records WHERE workspace = ? AND collection = ? AND id = ?'
);
const stmtMetaGet = sqlite.prepare('SELECT value FROM meta WHERE key = ?');
const stmtMetaUpsert = sqlite.prepare(`
  INSERT INTO meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);


const versionColumns = new Set(sqlite.prepare('PRAGMA table_info(entity_versions)').all().map((column) => column.name));
if (!versionColumns.has('summary')) sqlite.exec("ALTER TABLE entity_versions ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
if (!versionColumns.has('finalized')) sqlite.exec("ALTER TABLE entity_versions ADD COLUMN finalized INTEGER NOT NULL DEFAULT 1");

const stmtVersionList = sqlite.prepare(`
  SELECT version, data, author_user_id AS authorUserId, created_at AS createdAt, summary, finalized
  FROM entity_versions
  WHERE workspace = ? AND entity_type = ? AND entity_id = ?
  ORDER BY version DESC
`);
const stmtVersionLatest = sqlite.prepare(`
  SELECT version, data, author_user_id AS authorUserId, created_at AS createdAt, summary, finalized
  FROM entity_versions
  WHERE workspace = ? AND entity_type = ? AND entity_id = ?
  ORDER BY version DESC LIMIT 1
`);
const stmtVersionGet = sqlite.prepare(`
  SELECT version, data, author_user_id AS authorUserId, created_at AS createdAt, summary, finalized
  FROM entity_versions
  WHERE workspace = ? AND entity_type = ? AND entity_id = ? AND version = ?
`);
const stmtVersionInsert = sqlite.prepare(`
  INSERT INTO entity_versions (workspace, entity_type, entity_id, version, data, author_user_id, created_at, summary, finalized)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtVersionUpdateLatest = sqlite.prepare(`
  UPDATE entity_versions SET data = ?, author_user_id = ?, summary = ?
  WHERE workspace = ? AND entity_type = ? AND entity_id = ? AND version = ?
`);
const stmtVersionFinalizeLatest = sqlite.prepare(`
  UPDATE entity_versions SET finalized = 1
  WHERE workspace = ? AND entity_type = ? AND entity_id = ? AND version = ?
`);
const stmtVersionDeleteOne = sqlite.prepare(`
  DELETE FROM entity_versions WHERE workspace = ? AND entity_type = ? AND entity_id = ? AND version = ?
`);
const stmtVersionDeleteEntity = sqlite.prepare(`
  DELETE FROM entity_versions WHERE workspace = ? AND entity_type = ? AND entity_id = ?
`);
const stmtVersionDeleteWorkspace = sqlite.prepare('DELETE FROM entity_versions WHERE workspace = ?');

function parseRow(row) {
  if (!row) return null;
  return JSON.parse(row.data);
}

function normalizeTask(task) {
  const t = { ...task };
  if (!Array.isArray(t.assigneeIds)) t.assigneeIds = [];
  if (!['standard', 'development'].includes(t.taskType)) t.taskType = 'standard';
  return t;
}

// Node:sqlite DatabaseSync не предоставляет callback-transaction API,
// поэтому используем явные BEGIN/COMMIT/ROLLBACK.
function transaction(fn) {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch (_) {
      // Сохраняем исходную ошибку.
    }
    throw error;
  }
}


function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const prefixes = {
  people: 'ppl',
  projects: 'prj',
  labs: 'lab',
  comments: 'cmt',
  tasks: 'tsk',
  taskNotes: 'tnote',
  issues: 'iss',
  meetings: 'mtg',
  journal: 'jrn',
  goals: 'gl',
  agreements: 'agr',
  documents: 'doc',
  tools: 'tool',
  processes: 'prc',
  vacations: 'vac',
  kbFolders: 'kbf',
  kbDocs: 'kbd',
  checkins: 'chk',
  technologyEvents: 'tech',
};

function prepareItem(name, data) {
  const item = name === 'tasks' ? normalizeTask(data) : { ...data };
  if (name === 'projects') delete item.startDate;
  if (MENTION_COLLECTIONS.has(name) && typeof item.text === 'string') {
    item.mentions = extractMentions(item.text);
  }
  return item;
}

const collection = (name) => ({
  all() {
    return stmtAll.all(currentWorkspace(), name).map(parseRow);
  },

  get(id) {
    return parseRow(stmtGet.get(currentWorkspace(), name, id));
  },

  related(relationKey) {
    if (!relationKey) return [];
    return stmtRelated.all(currentWorkspace(), name, String(relationKey)).map(parseRow);
  },

  create(data) {
    const now = new Date().toISOString();
    let item = Object.assign(
      { id: genId(prefixes[name] || name.slice(0, 3)), createdAt: now, updatedAt: now },
      data
    );
    item = prepareItem(name, item);
    stmtInsert.run(
      currentWorkspace(),
      name,
      relationKeyFor(name, item),
      item.id,
      JSON.stringify(item),
      item.createdAt || now,
      item.updatedAt || now
    );
    return item;
  },

  update(id, patch) {
    const current = this.get(id);
    if (!current) return null;

    const now = new Date().toISOString();
    let merged = Object.assign({}, current, patch, {
      id: current.id,
      createdAt: name === 'journal' && patch.createdAt ? patch.createdAt : current.createdAt,
      updatedAt: now,
    });

    // Упоминания пересчитываем только когда изменился текст — как и раньше.
    if (name === 'tasks') merged = normalizeTask(merged);
    if (name === 'projects') delete merged.startDate;
    if (MENTION_COLLECTIONS.has(name) && typeof patch.text === 'string') {
      merged.mentions = extractMentions(patch.text);
    }

    const result = stmtUpdate.run(JSON.stringify(merged), relationKeyFor(name, merged), now, currentWorkspace(), name, id);
    return Number(result.changes) > 0 ? merged : null;
  },

  remove(id) {
    if (!this.get(id)) return false;
    const result = stmtDelete.run(currentWorkspace(), name, id);
    return Number(result.changes) > 0;
  },

  replaceAll(items) {
    transaction(() => {
      for (const current of this.all()) stmtDelete.run(currentWorkspace(), name, current.id);
      for (const source of items) {
        let item = prepareItem(name, source);
        if (!item.id) throw new Error(`replaceAll(${name}): запись без id`);
        stmtInsert.run(currentWorkspace(), name, relationKeyFor(name, item), item.id, JSON.stringify(item), item.createdAt || null, item.updatedAt || null);
      }
    });
  },
});

const db = {};
for (const name of COLLECTIONS) {
  db[name] = collection(name);
}

db.isEmpty = () => COLLECTIONS.every((name) => db[name].all().length === 0);
db.withWorkspace = (workspace, fn) => workspaceStorage.run(workspace || 'main', fn);

db.versions = {
  _fromRow(row) {
    if (!row) return null;
    return {
      version: Number(row.version),
      data: JSON.parse(row.data),
      authorUserId: row.authorUserId || null,
      createdAt: row.createdAt,
      summary: row.summary || '',
      finalized: Boolean(row.finalized),
    };
  },
  list(entityType, entityId) {
    return stmtVersionList.all(currentWorkspace(), String(entityType), String(entityId)).map((row) => this._fromRow(row));
  },
  get(entityType, entityId, version) {
    return this._fromRow(stmtVersionGet.get(currentWorkspace(), String(entityType), String(entityId), Number(version)));
  },
  latest(entityType, entityId) {
    return this._fromRow(stmtVersionLatest.get(currentWorkspace(), String(entityType), String(entityId)));
  },
  record(entityType, entityId, data, authorUserId = null, options = {}) {
    const latest = this.latest(entityType, entityId);
    const version = (latest?.version || 0) + 1;
    const createdAt = options.createdAt || new Date().toISOString();
    const summary = String(options.summary || '');
    const finalized = options.finalized === false ? 0 : 1;
    stmtVersionInsert.run(currentWorkspace(), String(entityType), String(entityId), version, JSON.stringify(data), authorUserId || null, createdAt, summary, finalized);
    return { version, data, authorUserId: authorUserId || null, createdAt, summary, finalized: Boolean(finalized) };
  },
  updateLatest(entityType, entityId, data, authorUserId = null, summary = '') {
    const latest = this.latest(entityType, entityId);
    if (!latest) return this.record(entityType, entityId, data, authorUserId, { summary, finalized: false });
    stmtVersionUpdateLatest.run(JSON.stringify(data), authorUserId || null, String(summary || ''), currentWorkspace(), String(entityType), String(entityId), latest.version);
    return { ...latest, data, authorUserId: authorUserId || null, summary: String(summary || ''), finalized: false };
  },
  finalizeLatest(entityType, entityId) {
    const latest = this.latest(entityType, entityId);
    if (!latest || latest.finalized) return latest;
    stmtVersionFinalizeLatest.run(currentWorkspace(), String(entityType), String(entityId), latest.version);
    return { ...latest, finalized: true };
  },
  ensureInitial(entityType, entityId, data, authorUserId = null, options = {}) {
    return this.latest(entityType, entityId) || this.record(entityType, entityId, data, authorUserId, options);
  },
  remove(entityType, entityId, version) {
    const result = stmtVersionDeleteOne.run(currentWorkspace(), String(entityType), String(entityId), Number(version));
    return result.changes > 0;
  },
  removeEntity(entityType, entityId) {
    stmtVersionDeleteEntity.run(currentWorkspace(), String(entityType), String(entityId));
  },
  clearWorkspace() {
    stmtVersionDeleteWorkspace.run(currentWorkspace());
  },
};

db.meta = {
  get(key, fallback = null) {
    const row = stmtMetaGet.get(scopedMetaKey(key));
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
  },
  set(key, value) {
    stmtMetaUpsert.run(scopedMetaKey(key), JSON.stringify(value));
    return value;
  },
};

// Отдельные нормализованные таблицы для аутентификации. Пароли сюда попадают
// уже в виде scrypt-хэша; сырой пароль база никогда не хранит.
const authUserAll = sqlite.prepare(`
  SELECT id, username, display_name AS displayName, role, roles_json AS rolesJson, permissions_json AS permissionsJson, active,
         must_change_password AS mustChangePassword, created_at AS createdAt,
         updated_at AS updatedAt, last_login_at AS lastLoginAt, person_id AS personId
  FROM auth_users ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
`);
const authUserGet = sqlite.prepare('SELECT * FROM auth_users WHERE id = ?');
const authUserByUsername = sqlite.prepare('SELECT * FROM auth_users WHERE username = ? COLLATE NOCASE');
const authUserInsert = sqlite.prepare(`
  INSERT INTO auth_users
    (id, username, display_name, role, roles_json, permissions_json, password_hash, password_salt, active, must_change_password, created_at, updated_at, person_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const authUserUpdate = sqlite.prepare(`
  UPDATE auth_users SET username = ?, display_name = ?, role = ?, roles_json = ?, permissions_json = ?, active = ?,
    must_change_password = ?, password_hash = ?, password_salt = ?, updated_at = ?, last_login_at = ?, person_id = ?
  WHERE id = ?
`);
const authUserDelete = sqlite.prepare('DELETE FROM auth_users WHERE id = ?');
const authAdminsCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM auth_users WHERE active = 1 AND (role = 'admin' OR roles_json LIKE '%\"admin\"%')`);
const authUsersCount = sqlite.prepare('SELECT COUNT(*) AS count FROM auth_users');

const authSessionInsert = sqlite.prepare(`INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`);
const authSessionGet = sqlite.prepare(`
  SELECT s.token_hash, s.user_id, s.created_at, s.expires_at,
         u.id, u.username, u.display_name, u.role, u.roles_json, u.permissions_json, u.active, u.must_change_password, u.person_id
  FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
  WHERE s.token_hash = ?
`);
const authSessionDelete = sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash = ?');
const authSessionDeleteForUser = sqlite.prepare('DELETE FROM auth_sessions WHERE user_id = ?');
const authSessionCleanup = sqlite.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?');
const userPrefGet = sqlite.prepare('SELECT data FROM user_preferences WHERE user_id = ?');
const userPrefUpsert = sqlite.prepare(`
  INSERT INTO user_preferences (user_id, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);

const notifList = sqlite.prepare(`
  SELECT id, event_type AS eventType, title, body, route, created_at AS createdAt, read_at AS readAt
  FROM notifications WHERE workspace = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?
`);
const notifUnreadCount = sqlite.prepare('SELECT COUNT(*) AS count FROM notifications WHERE workspace = ? AND user_id = ? AND read_at IS NULL');
const notifInsert = sqlite.prepare(`
  INSERT OR IGNORE INTO notifications (id, workspace, user_id, event_type, title, body, route, dedupe_key, created_at, read_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
`);
const notifMarkRead = sqlite.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE workspace = ? AND user_id = ? AND id = ?');
const notifMarkAllRead = sqlite.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE workspace = ? AND user_id = ?');

function authRow(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, displayName: row.display_name, role: row.role,
    roles: (() => { try { const v = JSON.parse(row.roles_json || row.rolesJson || '[]'); return Array.isArray(v) && v.length ? v : [row.role || 'member']; } catch (_) { return [row.role || 'member']; } })(),
    permissions: (() => { try { const v = JSON.parse(row.permissions_json || row.permissionsJson || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } })(),
    passwordHash: row.password_hash, passwordSalt: row.password_salt,
    active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at || null,
    personId: row.person_id || row.personId || null,
  };
}

db.auth = {
  users: {
    all: () => authUserAll.all().map((row) => { const full = authRow({ ...row, display_name: row.displayName, roles_json: row.rolesJson, permissions_json: row.permissionsJson, must_change_password: row.mustChangePassword, created_at: row.createdAt, updated_at: row.updatedAt, last_login_at: row.lastLoginAt, person_id: row.personId }); delete full.passwordHash; delete full.passwordSalt; return full; }),
    get: (id) => authRow(authUserGet.get(id)),
    byUsername: (username) => authRow(authUserByUsername.get(username)),
    count: () => Number(authUsersCount.get().count),
    activeAdminCount: () => Number(authAdminsCount.get().count),
    create(data) {
      const now = new Date().toISOString();
      const id = data.id || genId('usr');
      const roles = Array.isArray(data.roles) && data.roles.length ? data.roles : [data.role || 'member'];
      const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('teamlead') ? 'teamlead' : 'member';
      authUserInsert.run(id, data.username, data.displayName, primaryRole, JSON.stringify(roles), JSON.stringify(data.permissions || {}), data.passwordHash, data.passwordSalt, data.active === false ? 0 : 1, data.mustChangePassword ? 1 : 0, now, now, data.personId || null);
      return this.get(id);
    },
    update(id, patch) {
      const cur = this.get(id);
      if (!cur) return null;
      const now = new Date().toISOString();
      const next = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: now };
      const roles = Array.isArray(next.roles) && next.roles.length ? next.roles : [next.role || 'member'];
      const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('teamlead') ? 'teamlead' : 'member';
      authUserUpdate.run(next.username, next.displayName, primaryRole, JSON.stringify(roles), JSON.stringify(next.permissions || {}), next.active ? 1 : 0, next.mustChangePassword ? 1 : 0, next.passwordHash, next.passwordSalt, now, next.lastLoginAt || null, next.personId || null, id);
      return this.get(id);
    },
    remove(id) {
      const result = authUserDelete.run(id);
      return Number(result.changes) > 0;
    },
  },
  preferences: {
    get(userId) {
      const row = userPrefGet.get(userId);
      if (!row) return {};
      try { return JSON.parse(row.data) || {}; } catch (_) { return {}; }
    },
    set(userId, data) {
      const value = data && typeof data === 'object' ? data : {};
      userPrefUpsert.run(userId, JSON.stringify(value), new Date().toISOString());
      return value;
    },
  },
  sessions: {
    create(tokenHash, userId, expiresAt) {
      authSessionInsert.run(tokenHash, userId, new Date().toISOString(), expiresAt);
    },
    get(tokenHash) {
      const row = authSessionGet.get(tokenHash);
      if (!row) return null;
      return {
        tokenHash: row.token_hash, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at,
        user: { id: row.id, username: row.username, displayName: row.display_name, role: row.role, roles: (() => { try { return JSON.parse(row.roles_json || '[]'); } catch (_) { return [row.role || 'member']; } })(), permissions: (() => { try { return JSON.parse(row.permissions_json || '{}') || {}; } catch (_) { return {}; } })(), active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password), personId: row.person_id || null },
      };
    },
    remove: (tokenHash) => authSessionDelete.run(tokenHash),
    removeForUser: (userId) => authSessionDeleteForUser.run(userId),
    cleanup: () => authSessionCleanup.run(new Date().toISOString()),
  },
};

db.notifications = {
  list(userId, limit = 50) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    return notifList.all(currentWorkspace(), String(userId), safeLimit).map((row) => ({ ...row, readAt: row.readAt || null, route: row.route || null }));
  },
  unreadCount(userId) { return Number(notifUnreadCount.get(currentWorkspace(), String(userId)).count || 0); },
  create(userId, data) {
    const createdAt = data.createdAt || new Date().toISOString();
    const id = data.id || genId('ntf');
    const dedupeKey = data.dedupeKey ? String(data.dedupeKey) : null;
    const result = notifInsert.run(id, currentWorkspace(), String(userId), String(data.eventType || 'general'), String(data.title || ''), String(data.body || ''), data.route ? String(data.route) : null, dedupeKey, createdAt);
    if (!result.changes) return null;
    return { id, eventType: String(data.eventType || 'general'), title: String(data.title || ''), body: String(data.body || ''), route: data.route || null, createdAt, readAt: null };
  },
  markRead(userId, id) {
    const now = new Date().toISOString();
    const result = notifMarkRead.run(now, currentWorkspace(), String(userId), String(id));
    return Number(result.changes) > 0;
  },
  markAllRead(userId) {
    const now = new Date().toISOString();
    return Number(notifMarkAllRead.run(now, currentWorkspace(), String(userId)).changes || 0);
  },
};

db.path = DB_PATH;
db.close = () => sqlite.close();

module.exports = db;
