'use strict';

module.exports = function createAuthCore({ db, crypto }) {
  const SESSION_COOKIE = 'garden_session';
  const SESSION_DAYS = 30;
  const PASSWORD_MIN_LENGTH = 8;
  const failedLogins = new Map();
  const ACCESS_ROLES = ['member', 'teamlead', 'admin'];
  const ACCESS_LEVELS = [
    { id:'none', label:'Нет доступа' },
    { id:'own_read', label:'Только свои · просмотр' },
    { id:'own_manage', label:'Только свои · управление' },
    { id:'all_read', label:'Все данные · просмотр' },
    { id:'all_own_manage', label:'Все данные · управление своими' },
    { id:'all_manage', label:'Все данные · полное управление' },
  ];
  const ACCESS_AREAS = [
    { id:'people', label:'Сотрудники' },
    { id:'projects', label:'Проекты' },
    { id:'goals', label:'Цели' },
    { id:'tasks', label:'Задачи' },
    { id:'meetings', label:'Встречи' },
    { id:'issues', label:'Проблемы' },
    { id:'agreements', label:'Договорённости' },
    { id:'journal', label:'Журнал' },
    { id:'labs', label:'The Labs' },
    { id:'knowledge', label:'База знаний' },
    { id:'processes', label:'Процессы' },
    { id:'vacations', label:'Отсутствия' },
    { id:'checkins', label:'Check-in' },
  ];
  const DEFAULT_ROLE_ACCESS = Object.fromEntries(ACCESS_ROLES.map((role) => [role, Object.fromEntries(ACCESS_AREAS.map((area) => [area.id, role === 'admin' || role === 'teamlead' ? 'all_manage' : 'all_own_manage']))]));
  const ACCESS_PERMISSIONS = {
    'workspace.manage': 'Полное управление рабочими данными',
    'people.manage_all': 'Управление всеми сотрудниками',
    'projects.manage': 'Управление проектами',
    'goals.manage': 'Управление целями',
    'tasks.manage_all': 'Управление всеми задачами',
    'meetings.manage_all': 'Управление всеми встречами',
    'issues.manage_all': 'Управление всеми проблемами',
    'agreements.manage_all': 'Управление всеми договорённостями',
    'knowledge.manage_all': 'Управление знаниями и документами',
    'processes.manage': 'Управление процессами',
    'vacations.manage_all': 'Управление отсутствиями',
    'checkins.manage_all': 'Управление чек-инами',
  };


  function normalizeAccessLevel(value) {
    const legacy = { read:'all_read', own:'all_own_manage', manage:'all_manage' };
    const candidate = legacy[value] || value;
    return ACCESS_LEVELS.some((item) => item.id === candidate) ? candidate : null;
  }
  function accessCapabilities(level) {
    return ({
      none:{ view:0, manage:0 },
      own_read:{ view:1, manage:0 },
      own_manage:{ view:1, manage:1 },
      all_read:{ view:2, manage:0 },
      all_own_manage:{ view:2, manage:1 },
      all_manage:{ view:2, manage:2 },
    })[normalizeAccessLevel(level) || 'none'];
  }
  function accessLevelFromCapabilities(view, manage) {
    if (view <= 0) return 'none';
    if (view === 1) return manage >= 1 ? 'own_manage' : 'own_read';
    if (manage >= 2) return 'all_manage';
    if (manage >= 1) return 'all_own_manage';
    return 'all_read';
  }
  function normalizeRoleAccessPolicies(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const role of ACCESS_ROLES) {
      out[role] = {};
      for (const area of ACCESS_AREAS) {
        const requested = normalizeAccessLevel(source?.[role]?.[area.id]);
        out[role][area.id] = role === 'admin' ? 'all_manage' : (requested || DEFAULT_ROLE_ACCESS[role][area.id]);
      }
    }
    return out;
  }
  function roleAccessPolicies() { return normalizeRoleAccessPolicies(db.meta.get('role_access_policies', DEFAULT_ROLE_ACCESS)); }
  function effectiveAccess(user) {
    const policies = roleAccessPolicies();
    const roles = normalizedRoles(user?.roles || user?.role);
    const result = {};
    for (const area of ACCESS_AREAS) {
      let view = 0;
      let manage = 0;
      for (const role of roles) {
        const caps = accessCapabilities(policies[role]?.[area.id] || 'none');
        view = Math.max(view, caps.view);
        manage = Math.max(manage, caps.manage);
      }
      let level = accessLevelFromCapabilities(view, manage);
      if (isAdmin(user) || hasPermission(user, 'workspace.manage')) level = 'all_manage';
      const legacy = ({ people:'people.manage_all', projects:'projects.manage', goals:'goals.manage', tasks:'tasks.manage_all', meetings:'meetings.manage_all', issues:'issues.manage_all', agreements:'agreements.manage_all', knowledge:'knowledge.manage_all', processes:'processes.manage', vacations:'vacations.manage_all', checkins:'checkins.manage_all' })[area.id];
      if (legacy && hasPermission(user, legacy)) level = 'all_manage';
      result[area.id] = level;
    }
    return result;
  }
  function accessLevel(user, area) { return effectiveAccess(user)[area] || 'none'; }

  function cleanUsername(value) { return String(value || '').trim().toLowerCase(); }
  function validUsername(value) { return /^[a-z0-9._-]{3,40}$/i.test(value); }
  function passwordDigest(password, salt) { return crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: passwordDigest(password, salt) };
  }
  function passwordMatches(password, user) {
    if (!user || !user.passwordHash || !user.passwordSalt) return false;
    const actual = Buffer.from(passwordDigest(password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  function generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
  }
  function isDemoUser(user) { return Boolean(user && user.username === '__demo__'); }
  function normalizedRoles(value) {
    let list = Array.isArray(value) ? value : [value];
    list = [...new Set(list.map(String).filter((r) => ACCESS_ROLES.includes(r)))];
    if (!list.length) list = ['member'];
    return list;
  }
  function normalizedPermissions(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const key of Object.keys(ACCESS_PERMISSIONS)) if (src[key] === true) out[key] = true;
    return out;
  }
  function hasRole(user, role) { return normalizedRoles(user?.roles || user?.role).includes(role); }
  function isAdmin(user) { return hasRole(user, 'admin'); }
  function hasPermission(user, key) { return isAdmin(user) || Boolean(normalizedPermissions(user?.permissions)[key]); }
  function isManager(user) { return isAdmin(user) || hasPermission(user, 'workspace.manage'); }
  function isTeamlead(user) { return hasRole(user, 'teamlead'); }
  function roleLabel(role) { return ({ admin: 'Администратор', teamlead: 'Тимлид', member: 'Сотрудник' })[role] || 'Сотрудник'; }
  function rolesLabel(user) { return normalizedRoles(user?.roles || user?.role).map(roleLabel).join(' · '); }
  function validatePassword(password) { return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH; }

  function safeUser(user) {
    if (!user) return null;
    return {
      id: user.id, username: user.username, displayName: user.displayName, role: user.role,
      roles: normalizedRoles(user.roles || user.role), permissions: normalizedPermissions(user.permissions),
      personId: user.personId || null, active: Boolean(user.active), mustChangePassword: Boolean(user.mustChangePassword),
      access: effectiveAccess(user),
      createdAt: user.createdAt || null, updatedAt: user.updatedAt || null, lastLoginAt: user.lastLoginAt || null,
      demo: isDemoUser(user),
    };
  }

  function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie || '';
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
    }
    return out;
  }
  function tokenHash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
  function setSessionCookie(res, token) {
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    const secure = process.env.GARDEN_SECURE_COOKIE === '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  }
  function clearSessionCookie(res) {
    const secure = process.env.GARDEN_SECURE_COOKIE === '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }
  function createSession(userId, res) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    db.auth.sessions.cleanup();
    db.auth.sessions.create(tokenHash(token), userId, expiresAt);
    setSessionCookie(res, token);
  }
  function authenticate(req, res, next) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: 'authentication_required' });
    const session = db.auth.sessions.get(tokenHash(token));
    if (!session || session.expiresAt <= new Date().toISOString() || !session.user.active) {
      if (session) db.auth.sessions.remove(session.tokenHash);
      clearSessionCookie(res);
      return res.status(401).json({ error: 'authentication_required' });
    }
    req.auth = { user: session.user, sessionTokenHash: session.tokenHash };
    next();
  }
  function requireAdmin(req, res, next) {
    if (!isAdmin(req.auth?.user)) return res.status(403).json({ error: 'admin_required' });
    next();
  }
  function ensureInitialAdmin() {
    if (db.auth.users.count() > 0) return;
    const username = cleanUsername(process.env.GARDEN_ADMIN_USER || 'admin');
    const password = process.env.GARDEN_ADMIN_PASSWORD || generatePassword();
    const { hash, salt } = hashPassword(password);
    db.auth.users.create({ username, displayName: 'Администратор', role: 'admin', roles: ['admin'], permissions: {}, passwordHash: hash, passwordSalt: salt, active: true, mustChangePassword: true });
    console.log('');
    console.log('  Первый администратор Garden создан');
    console.log(`  Логин:  ${username}`);
    console.log(`  Пароль: ${password}`);
    console.log('  После первого входа Garden попросит сменить пароль.');
    console.log('');
  }

  return {
    SESSION_COOKIE, SESSION_DAYS, PASSWORD_MIN_LENGTH, failedLogins, ACCESS_ROLES, ACCESS_PERMISSIONS, ACCESS_LEVELS, ACCESS_AREAS, DEFAULT_ROLE_ACCESS,
    cleanUsername, validUsername, hashPassword, passwordMatches, generatePassword, isDemoUser, safeUser,
    setSessionCookie, clearSessionCookie, createSession, authenticate, normalizedRoles, normalizedPermissions,
    hasRole, hasPermission, requireAdmin, isAdmin, isManager, isTeamlead, roleLabel, rolesLabel, validatePassword, normalizeRoleAccessPolicies, roleAccessPolicies, effectiveAccess, accessLevel, normalizeAccessLevel, accessCapabilities,
    ensureInitialAdmin,
  };
};
