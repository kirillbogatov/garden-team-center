'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

test('styles.css is syntactically valid CSS (parses without error)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  assert.doesNotThrow(() => postcss.parse(css), (error) => {
    throw new Error(`src/styles.css failed to parse: ${error.message}`);
  });
});

test('patterns.css is syntactically valid CSS (parses without error)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'patterns.css'), 'utf8');
  assert.doesNotThrow(() => postcss.parse(css), (error) => {
    throw new Error(`src/patterns.css failed to parse: ${error.message}`);
  });
});
