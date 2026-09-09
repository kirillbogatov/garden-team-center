'use strict';

const crypto = require('crypto');
const db = require('./db');
const createAuthCore = require('./auth-core');

// Reuses the same scrypt-based hashing (and the same password-generation
// alphabet) as the running server, instead of keeping an independent copy
// that could silently drift from auth-core.js.
const { PASSWORD_MIN_LENGTH, hashPassword, generatePassword, cleanUsername } = createAuthCore({ db, crypto });

try {
  const requestedUsername = cleanUsername(process.argv[2]);
  const admins = db.auth.users.all().filter((u) => (u.roles || [u.role]).includes('admin'));

  if (!admins.length) {
    console.error('ADMIN_NOT_FOUND');
    process.exitCode = 2;
    return;
  }

  let user = null;
  if (requestedUsername) {
    const candidate = db.auth.users.byUsername(requestedUsername);
    if (candidate && (candidate.roles || [candidate.role]).includes('admin')) user = candidate;
    if (!user) {
      console.error('ADMIN_NOT_FOUND');
      process.exitCode = 2;
      return;
    }
  } else if (admins.length === 1) {
    user = db.auth.users.get(admins[0].id);
  } else {
    console.log('MULTIPLE_ADMINS');
    for (const admin of admins) console.log(`${admin.username}\t${admin.displayName}`);
    process.exitCode = 3;
    return;
  }

  const temporaryPassword = generatePassword();
  if (temporaryPassword.length < PASSWORD_MIN_LENGTH) throw new Error('Generated password is too short');
  const { hash, salt } = hashPassword(temporaryPassword);
  db.auth.users.update(user.id, {
    passwordHash: hash,
    passwordSalt: salt,
    mustChangePassword: true,
  });
  db.auth.sessions.removeForUser(user.id);

  console.log('RESET_OK');
  console.log(user.username);
  console.log(temporaryPassword);
} catch (err) {
  console.error('RESET_FAILED');
  console.error(err?.message || String(err));
  process.exitCode = 1;
} finally {
  try { db.close(); } catch (_) {}
}
