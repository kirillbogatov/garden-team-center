'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const status = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'status.jsx'), 'utf8');
const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'hooks', 'use-entity-status.js'), 'utf8');

test('TaskStatusIcon, IssueStatusIcon, ProcessStatusIcon, AgreementStatusIcon, IdeaStatusIcon, LabStatusIcon share one StatusControl implementation', () => {
  assert.match(status, /function StatusControl\(/);
  for (const name of ['TaskStatusIcon', 'IssueStatusIcon', 'ProcessStatusIcon', 'AgreementStatusIcon', 'IdeaStatusIcon', 'LabStatusIcon']) {
    const start = status.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, `${name} not found`);
    const end = status.indexOf('\n}', start);
    const body = status.slice(start, end);
    assert.match(body, /<StatusControl/, `${name} should delegate to StatusControl`);
  }
  assert.match(hook, /export function useEntityStatus/);
});

test('idea/lab status glyphs cover the new idea (💡) and rejected (muted ×) symbols', () => {
  const start = status.indexOf('export function IdeaStatusGlyph(');
  assert.ok(start >= 0, 'IdeaStatusGlyph not found');
  const end = status.indexOf('\n}', start);
  const body = status.slice(start, end);
  assert.match(body, /💡/);
  assert.match(body, /idea-status-glyph-rejected/);
  assert.match(body, /<TaskStatusGlyph/, 'should delegate in_progress/paused/done to the existing task glyph');
});

test('AgreementStatusCheckbox reuses useEntityStatus instead of its own optimistic-update state', () => {
  const start = status.indexOf('export function AgreementStatusCheckbox(');
  const end = status.indexOf('\n}', start);
  const body = status.slice(start, end);
  assert.match(body, /useEntityStatus\(/);
  assert.doesNotMatch(body, /React\.useState/);
});
