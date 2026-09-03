const crypto = require('crypto');
const db = require('./db');

const PASSWORD_MIN_LENGTH = 8;

function passwordDigest(password, salt) {
  return crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: passwordDigest(password, salt) };
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
}

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase();
}

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
