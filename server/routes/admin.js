'use strict';

module.exports = function registerAdminRoutes(app, deps) {
  const {
    db,
    requireAdmin,
    isDemoUser,
    safeUser,
    ACCESS_ROLES,
    ACCESS_PERMISSIONS,
    ACCESS_LEVELS,
    ACCESS_AREAS,
    roleLabel,
    cleanUsername,
    normalizedRoles,
    normalizedPermissions,
    validUsername,
    validatePassword,
    generatePassword,
    hashPassword,
    ensureTeamleadSelfAssignment,
    isAdmin,
    normalizeRoleAccessPolicies,
    roleAccessPolicies,
  } = deps;

  // Общая проверка для создания и редактирования пользователя — оба роута
  // должны одинаково реагировать на пустое имя, занятого сотрудника и т.д.
  function userFieldsError({ username, displayName, roles, personId }) {
    if (!validUsername(username)) return 'invalid_username';
    if (!displayName) return 'display_name_required';
    if (!roles.includes('admin') && !personId) return 'person_required';
    if (personId && !db.people.get(personId)) return 'invalid_person';
    return null;
  }

  // За одним сотрудником может быть закреплён только один активный аккаунт.
  function personLinkedToAnotherActiveUser(personId, excludeUserId) {
    return db.auth.users.all().some((u) => u.active && u.personId === personId && u.id !== excludeUserId);
  }

  function issueTemporaryPassword(requestedPassword) {
    const temporaryPassword = validatePassword(requestedPassword) ? String(requestedPassword) : generatePassword();
    const { hash, salt } = hashPassword(temporaryPassword);
    return { temporaryPassword, hash, salt };
  }

  app.get('/api/admin/users', requireAdmin, (req, res) => {
    res.json(db.auth.users.all().filter((u) => !isDemoUser(u)).map(safeUser));
  });

  app.get('/api/admin/access-schema', requireAdmin, (req, res) => {
    res.json({
      roles: ACCESS_ROLES.map((id) => ({ id, label: roleLabel(id) })),
      permissions: Object.entries(ACCESS_PERMISSIONS).map(([id, label]) => ({ id, label })),
      levels: ACCESS_LEVELS,
      areas: ACCESS_AREAS,
      rolePolicies: roleAccessPolicies(),
    });
  });

  app.put('/api/admin/role-policies', requireAdmin, (req, res) => {
    const next = normalizeRoleAccessPolicies(req.body?.rolePolicies || req.body || {});
    db.meta.set('role_access_policies', next);
    res.json({ rolePolicies: next });
  });

  app.post('/api/admin/users', requireAdmin, (req, res) => {
    const username = cleanUsername(req.body?.username);
    const displayName = String(req.body?.displayName || '').trim();
    const roles = normalizedRoles(req.body?.roles || req.body?.role);
    const permissions = normalizedPermissions(req.body?.permissions);
    const personId = req.body?.personId || null;

    const fieldsError = userFieldsError({ username, displayName, roles, personId });
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    if (db.auth.users.byUsername(username)) return res.status(409).json({ error: 'username_exists' });
    if (personId && personLinkedToAnotherActiveUser(personId, null)) return res.status(409).json({ error: 'person_already_linked' });

    const { temporaryPassword, hash, salt } = issueTemporaryPassword(req.body?.password);
    const user = db.auth.users.create({
      username,
      displayName,
      roles,
      permissions,
      personId,
      passwordHash: hash,
      passwordSalt: salt,
      active: true,
      mustChangePassword: true,
    });
    ensureTeamleadSelfAssignment(personId, roles, req.auth.user);
    res.status(201).json({ user: safeUser(user), temporaryPassword });
  });

  app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    const user = db.auth.users.get(req.params.id);
    if (!user || isDemoUser(user)) return res.status(404).json({ error: 'not_found' });

    const username = req.body?.username !== undefined ? cleanUsername(req.body.username) : user.username;
    const displayName = req.body?.displayName !== undefined ? String(req.body.displayName).trim() : user.displayName;
    const roles = req.body?.roles !== undefined || req.body?.role !== undefined
      ? normalizedRoles(req.body.roles || req.body.role)
      : normalizedRoles(user.roles || user.role);
    const permissions = req.body?.permissions !== undefined ? normalizedPermissions(req.body.permissions) : normalizedPermissions(user.permissions);
    const personId = req.body?.personId !== undefined ? (req.body.personId || null) : (user.personId || null);
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : user.active;

    const fieldsError = userFieldsError({ username, displayName, roles, personId });
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    if (active && personId && personLinkedToAnotherActiveUser(personId, user.id)) return res.status(409).json({ error: 'person_already_linked' });
    const duplicate = db.auth.users.byUsername(username);
    if (duplicate && duplicate.id !== user.id) return res.status(409).json({ error: 'username_exists' });

    const removesLastAdmin = isAdmin(user) && user.active && (!roles.includes('admin') || !active) && db.auth.users.activeAdminCount() <= 1;
    if (removesLastAdmin) return res.status(400).json({ error: 'last_admin' });

    const updated = db.auth.users.update(user.id, { username, displayName, roles, permissions, personId, active });
    if (active) ensureTeamleadSelfAssignment(personId, roles, req.auth.user);
    if (!active) db.auth.sessions.removeForUser(user.id);
    res.json({ user: safeUser(updated) });
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
    const user = db.auth.users.get(req.params.id);
    if (!user || isDemoUser(user)) return res.status(404).json({ error: 'not_found' });

    const { temporaryPassword, hash, salt } = issueTemporaryPassword(req.body?.password);
    db.auth.users.update(user.id, { passwordHash: hash, passwordSalt: salt, mustChangePassword: true });
    db.auth.sessions.removeForUser(user.id);
    res.json({ user: safeUser(db.auth.users.get(user.id)), temporaryPassword });
  });

  app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const user = db.auth.users.get(req.params.id);
    if (!user || isDemoUser(user)) return res.status(404).json({ error: 'not_found' });
    if (user.id === req.auth.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
    if (isAdmin(user) && user.active && db.auth.users.activeAdminCount() <= 1) return res.status(400).json({ error: 'last_admin' });

    db.auth.sessions.removeForUser(user.id);
    db.auth.users.remove(user.id);
    res.status(204).end();
  });

  // Запросы умного поиска, которые парсер не смог распознать как команду —
  // база для расширения словаря SEARCH_TYPE_ALIASES реальными формулировками.
  app.get('/api/admin/search-misses', requireAdmin, (req, res) => {
    res.json({ misses: db.searchMisses.list(req.query.limit) });
  });

  app.delete('/api/admin/search-misses', requireAdmin, (req, res) => {
    res.json({ removed: db.searchMisses.clear() });
  });
};
