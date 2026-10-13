'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDomain() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/lib/domain.js'), 'utf8');
  const withoutExports = source.replace(/^export (function|const)/gm, '$1');
  const context = { module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(
    `${withoutExports}\nObject.assign(module.exports, { PROJECT_LOAD_OPTIONS, LOAD_FRAGMENTATION_PENALTY, projectLoadLevel, personProjectLoadSummary, normalizeProjectMemberLoad });`,
    context,
    { filename: 'domain.js' },
  );
  return context.module.exports;
}

function project(id, mode, personId) {
  return { id, name: id, status: 'active', memberIds: [personId], memberLoads: { [personId]: mode } };
}

test('PROJECT_LOAD_OPTIONS exposes flat weights, not hour ranges', () => {
  const { PROJECT_LOAD_OPTIONS, LOAD_FRAGMENTATION_PENALTY } = loadDomain();
  assert.deepEqual(Object.keys(PROJECT_LOAD_OPTIONS).sort(), ['full', 'half', 'support']);
  assert.equal(PROJECT_LOAD_OPTIONS.full.weight, 3);
  assert.equal(PROJECT_LOAD_OPTIONS.half.weight, 2);
  assert.equal(PROJECT_LOAD_OPTIONS.support.weight, 1);
  assert.equal(PROJECT_LOAD_OPTIONS.full.min, undefined);
  assert.equal(PROJECT_LOAD_OPTIONS.full.rangeLabel, undefined);
  assert.equal(LOAD_FRAGMENTATION_PENALTY, 0.5);
});

test('personProjectLoadSummary sums weights and adds the fragmentation penalty', () => {
  const { personProjectLoadSummary } = loadDomain();
  const personId = 'p1';

  assert.equal(personProjectLoadSummary(personId, []).score, 0);
  assert.equal(personProjectLoadSummary(personId, []).level.label, 'Нет загрузки');

  const oneSupport = [project('a', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, oneSupport).score, 1);
  assert.equal(personProjectLoadSummary(personId, oneSupport).level.label, 'Низкая');

  const oneHalf = [project('a', 'half', personId)];
  assert.equal(personProjectLoadSummary(personId, oneHalf).score, 2);
  assert.equal(personProjectLoadSummary(personId, oneHalf).level.label, 'Средняя');

  const oneFull = [project('a', 'full', personId)];
  assert.equal(personProjectLoadSummary(personId, oneFull).score, 3);
  assert.equal(personProjectLoadSummary(personId, oneFull).level.label, 'Полная');

  // Фултайм + саппорт: 3+1=4, n=2, +0.5 => 4.5 => Полная
  const fullPlusSupport = [project('a', 'full', personId), project('b', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, fullPlusSupport).score, 4.5);
  assert.equal(personProjectLoadSummary(personId, fullPlusSupport).level.label, 'Полная');

  // Два парт-тайма + саппорт: 2+2+1=5, n=3, +1.0 => 6.0 => Перегруз
  const twoHalvesPlusSupport = [project('a', 'half', personId), project('b', 'half', personId), project('c', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, twoHalvesPlusSupport).score, 6);
  assert.equal(personProjectLoadSummary(personId, twoHalvesPlusSupport).level.label, 'Перегруз');

  // Четыре саппорта: 1x4=4, n=4, +1.5 => 5.5 => Перегруз (the case the old hour-range model got wrong)
  const fourSupports = ['a', 'b', 'c', 'd'].map((id) => project(id, 'support', personId));
  assert.equal(personProjectLoadSummary(personId, fourSupports).score, 5.5);
  assert.equal(personProjectLoadSummary(personId, fourSupports).level.label, 'Перегруз');

  // Paused projects don't count
  const pausedOnly = [{ ...project('a', 'full', personId), status: 'paused' }];
  assert.equal(personProjectLoadSummary(personId, pausedOnly).score, 0);
});

test('projectLoadLevel thresholds', () => {
  const { projectLoadLevel } = loadDomain();
  assert.equal(projectLoadLevel(0).label, 'Нет загрузки');
  assert.equal(projectLoadLevel(0.5).label, 'Низкая');
  assert.equal(projectLoadLevel(1.5).label, 'Средняя');
  assert.equal(projectLoadLevel(2.9).label, 'Средняя');
  assert.equal(projectLoadLevel(3).label, 'Полная');
  assert.equal(projectLoadLevel(5).label, 'Полная');
  assert.equal(projectLoadLevel(5.01).label, 'Перегруз');
});

test('the /team-load page header explains the workload formula', () => {
  const resources = fs.readFileSync(path.join(__dirname, '..', 'src/pages/resources.jsx'), 'utf8');
  assert.match(resources, /import \{[^}]*\bTooltip\b[^}]*\} from '@\/components\/ui'/);
  assert.match(resources, /import \{[^}]*\bInfo\b[^}]*\} from 'lucide-react'/);
  assert.match(resources, /aria-label="Как считается загрузка"/);
  assert.match(resources, /Фултайм — 3, Парт-тайм — 2, Саппорт — 1/);
  assert.match(resources, /0\.5 за каждый проект сверх первого/);
});
