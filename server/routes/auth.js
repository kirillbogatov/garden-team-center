'use strict';

module.exports = function registerAuthRoutes(app, deps) {
  const {
    db,
    COLLECTIONS,
    demoSeed,
    cleanUsername,
    failedLogins,
    passwordMatches,
    createSession,
    safeUser,
    authenticate,
    clearSessionCookie,
    validatePassword,
    PASSWORD_MIN_LENGTH,
    hashPassword,
    generatePassword,
    normalizeWorkspaceIdentifiers,
  } = deps;

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/auth/demo', (req, res) => {
    let user = db.auth.users.byUsername('__demo__');
    if (!user) {
      const { hash, salt } = hashPassword(generatePassword());
      user = db.auth.users.create({
        id: 'usr_demo',
        username: '__demo__',
        displayName: 'Майкл Скотт · Демо',
        role: 'member',
        roles: ['member'],
        permissions: { 'workspace.manage': true },
        passwordHash: hash,
        passwordSalt: salt,
        active: true,
        mustChangePassword: false,
        personId: 'ppl_demo_michael',
      });
    }
    db.withWorkspace('demo', () => {
      db.versions.clearWorkspace();
      for (const name of COLLECTIONS) db[name].replaceAll(demoSeed[name] || []);
      normalizeWorkspaceIdentifiers?.();
    });
    createSession(user.id, res);
    res.json({ user: safeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const key = `${req.ip}:${username}`;
    const attempt = failedLogins.get(key);
    if (attempt && attempt.until > Date.now()) {
      return res.status(429).json({ error: 'too_many_attempts', retryAfter: Math.ceil((attempt.until - Date.now()) / 1000) });
    }

    const user = db.auth.users.byUsername(username);
    if (!user || !user.active || !passwordMatches(password, user)) {
      const failures = (attempt?.failures || 0) + 1;
      // После 5 неудачных попыток блокируем на 10 минут и сбрасываем счётчик,
      // чтобы следующая серия попыток снова считалась с нуля.
      failedLogins.set(key, failures >= 5 ? { failures: 0, until: Date.now() + 10 * 60 * 1000 } : { failures, until: 0 });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    failedLogins.delete(key);
    db.auth.users.update(user.id, { lastLoginAt: new Date().toISOString() });
    createSession(user.id, res);
    res.json({ user: safeUser(db.auth.users.get(user.id)) });
  });

  app.post('/api/auth/logout', authenticate, (req, res) => {
    db.auth.sessions.remove(req.auth.sessionTokenHash);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: safeUser(db.auth.users.get(req.auth.user.id)) });
  });

  app.post('/api/auth/password', authenticate, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const user = db.auth.users.get(req.auth.user.id);
    if (!passwordMatches(currentPassword, user)) return res.status(400).json({ error: 'wrong_current_password' });
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'password_too_short', minLength: PASSWORD_MIN_LENGTH });

    const { hash, salt } = hashPassword(newPassword);
    db.auth.users.update(user.id, { passwordHash: hash, passwordSalt: salt, mustChangePassword: false });
    db.auth.sessions.removeForUser(user.id);
    createSession(user.id, res);
    res.json({ user: safeUser(db.auth.users.get(user.id)) });
  });
};
