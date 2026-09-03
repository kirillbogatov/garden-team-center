'use strict';

// Единый генератор читаемых ключей сущностей PREFIX-XXXX.
function nextNumericKey(items, { prefix, readKey, width = 4, acceptPrefix = prefix }) {
  const cleanPrefix = String(prefix || '').toUpperCase();
  const accepted = String(acceptPrefix || cleanPrefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${accepted}-(\\d+)$`, 'i');
  let max = 0;
  for (const item of items || []) {
    const match = String(readKey(item) || '').match(re);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return `${cleanPrefix}-${String(max + 1).padStart(width, '0')}`;
}

module.exports = { nextNumericKey };
