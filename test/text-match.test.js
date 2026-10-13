'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeRe, containsPhrase, norm, stemRu } = require('../server/domain/text-match');

test('escapeRe escapes regex metacharacters so phrase matching is literal', () => {
  assert.equal(escapeRe('C++'), 'C\\+\\+');
  assert.match(escapeRe('a.b(c)'), /a\\\.b\\\(c\\\)/);
});

test('containsPhrase matches whole words only, not substrings', () => {
  assert.ok(containsPhrase('задача важная', 'задача'));
  assert.ok(!containsPhrase('задачами', 'задача'));
});

test('norm lowercases and folds ё to е', () => {
  assert.equal(norm('Ёлка'), 'елка');
});

test('stemRu strips common Russian case endings', () => {
  assert.equal(stemRu('задачи'), stemRu('задача'));
});
