'use strict';

// Generates stable human-readable keys PREFIX-XXXX.
// Numeric space is used first (0001..9999). Once Garden has entered the
// latin-letter range it keeps moving forward there even if older numeric rows
// are later deleted: 000A, 000B ... 000Z, 00AA ...
function alphaSuffix(index, width = 4) {
  let n = Number(index);
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  if (out.length > width) throw new Error(`entity_key_space_exhausted_${width}`);
  return out.padStart(width, '0');
}

function alphaIndex(suffix) {
  const letters = String(suffix || '').toUpperCase().replace(/^0+/, '');
  if (!letters || !/^[A-Z]+$/.test(letters)) return 0;
  let value = 0;
  for (const ch of letters) value = (value * 26) + (ch.charCodeAt(0) - 64);
  return value;
}

function keyRank(value, prefix, width = 4) {
  const cleanPrefix = String(prefix || '').trim().toUpperCase();
  const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(value || '').trim().toUpperCase().match(new RegExp(`^${escaped}-([0-9A-Z]{${width}})$`, 'i'));
  if (!match) return -1;
  const suffix = match[1].toUpperCase();
  if (/^\d+$/.test(suffix)) return Number(suffix) || 0;
  const index = alphaIndex(suffix);
  return index > 0 ? ((10 ** width) - 1) + index : -1;
}

function latestPublicKey(items, { prefix, readKey, width = 4 }) {
  let best = '';
  let bestRank = -1;
  for (const item of items || []) {
    const value = String(readKey(item) || '').trim().toUpperCase();
    const rank = keyRank(value, prefix, width);
    if (rank > bestRank) { best = value; bestRank = rank; }
  }
  return best;
}

function nextNumericKey(items, { prefix, readKey, width = 4, acceptPrefix = prefix }) {
  const cleanPrefix = String(prefix || '').trim().toUpperCase();
  const accepted = String(acceptPrefix || cleanPrefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffixRe = new RegExp(`^${accepted}-([0-9A-Z]{${width}})$`, 'i');
  const used = new Set();
  let numericMax = 0;
  let alphaMax = 0;
  for (const item of items || []) {
    const match = String(readKey(item) || '').trim().toUpperCase().match(suffixRe);
    if (!match) continue;
    const suffix = match[1].toUpperCase();
    used.add(suffix);
    if (/^\d+$/.test(suffix)) numericMax = Math.max(numericMax, Number(suffix) || 0);
    else alphaMax = Math.max(alphaMax, alphaIndex(suffix));
  }

  // Any alphabetic identifier means the numeric range has already been
  // exhausted in this sequence. Never go backwards into a numeric gap.
  if (alphaMax > 0) {
    for (let index = alphaMax + 1; ; index += 1) {
      const suffix = alphaSuffix(index, width);
      if (!used.has(suffix)) return `${cleanPrefix}-${suffix}`;
    }
  }

  const maxNumeric = (10 ** width) - 1;
  if (numericMax < maxNumeric) {
    let candidate = Math.max(1, numericMax + 1);
    while (candidate <= maxNumeric) {
      const suffix = String(candidate).padStart(width, '0');
      if (!used.has(suffix)) return `${cleanPrefix}-${suffix}`;
      candidate += 1;
    }
  }

  for (let index = 1; ; index += 1) {
    const suffix = alphaSuffix(index, width);
    if (!used.has(suffix)) return `${cleanPrefix}-${suffix}`;
  }
}

module.exports = { nextNumericKey, alphaSuffix, alphaIndex, keyRank, latestPublicKey };
