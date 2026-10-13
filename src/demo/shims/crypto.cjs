'use strict';

const { Buffer } = require('buffer');
const { sha256 } = require('@noble/hashes/sha256');
const { scrypt } = require('@noble/hashes/scrypt');

// buffer@6 не знает кодировку base64url, которой сервер кодирует токен сессии.
function withBase64Url(buffer) {
  const toString = buffer.toString.bind(buffer);
  buffer.toString = (encoding, ...rest) => (encoding === 'base64url'
    ? toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : toString(encoding, ...rest));
  return buffer;
}

function randomBytes(size) {
  const out = new Uint8Array(size);
  globalThis.crypto.getRandomValues(out);
  return withBase64Url(Buffer.from(out));
}

function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error(`Демо поддерживает только sha256, получено ${algorithm}`);
  const chunks = [];
  const hash = {
    update(value) { chunks.push(Buffer.from(String(value))); return hash; },
    digest(encoding) { return Buffer.from(sha256(Buffer.concat(chunks))).toString(encoding); },
  };
  return hash;
}

// Пароли в демо нужны только для формы входа; стоимость понижена, чтобы
// создание пользователей не подвешивало вкладку.
function scryptSync(password, salt, keylen) {
  return Buffer.from(scrypt(String(password), String(salt), { N: 1024, r: 8, p: 1, dkLen: keylen }));
}

function timingSafeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

module.exports = { randomBytes, createHash, scryptSync, timingSafeEqual };
