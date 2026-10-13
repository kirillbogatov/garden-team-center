'use strict';

// Минимальный posix-path: только то, что используют server/ и storage.
function normalize(input) {
  const absolute = input.startsWith('/');
  const out = [];
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return (absolute ? '/' : '') + out.join('/');
}

const join = (...parts) => normalize(parts.filter(Boolean).join('/')) || '.';
const basename = (value) => String(value).split('/').filter(Boolean).pop() || '';
const extname = (value) => {
  const name = basename(value);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
};

module.exports = { join, resolve: join, basename, extname, sep: '/' };
