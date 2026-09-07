'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSearchRanker } = require('../server/domain/search-ranking');
const { taskPriorityRank } = require('../server/domain/task-priority');

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const fuzzyTextMatch = (query, text) => norm(text).includes(norm(query));
const ranker = createSearchRanker({ norm, fuzzyTextMatch, taskPriorityRank });

test('meeting ranking prefers relevant title, then nearest future and recent past', () => {
  const today = new Date().toISOString().slice(0, 10);
  const shift = (days) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const rows = ranker.rankGroup('meetings', [
    { id:'past', title:'Синк', date:shift(-1) },
    { id:'future2', title:'Синк', date:shift(2) },
    { id:'future1', title:'Синк', date:shift(1) },
    { id:'exact', title:'Ретро', date:shift(20) },
  ], 'ретро');
  assert.equal(rows[0].id, 'exact');
  const noText = ranker.rankGroup('meetings', rows.filter((x) => x.id !== 'exact'), '');
  assert.deepEqual(noText.map((x) => x.id), ['future1','future2','past']);
});

test('issue ranking keeps unresolved and important issues above resolved ones', () => {
  const rows = ranker.rankGroup('issues', [
    { id:'resolved', title:'API', status:'resolved', severity:'high', updatedAt:'2026-09-06' },
    { id:'normal', title:'API', status:'open', severity:'normal', updatedAt:'2026-09-06' },
    { id:'high', title:'API', status:'open', severity:'high', updatedAt:'2026-09-01' },
  ], 'api');
  assert.deepEqual(rows.map((x) => x.id), ['high','normal','resolved']);
});

test('agreement ranking prefers open overdue work to completed agreements', () => {
  const rows = ranker.rankGroup('agreements', [
    { id:'done', text:'Отправить отчёт', status:'done', dueDate:'2025-01-01' },
    { id:'future', text:'Отправить отчёт', status:'open', dueDate:'2099-01-01' },
    { id:'overdue', text:'Отправить отчёт', status:'open', dueDate:'2025-01-01' },
  ], 'отправить отчет');
  assert.deepEqual(rows.map((x) => x.id), ['overdue','future','done']);
});

test('project ranking prefers active projects and then projects containing the current user', () => {
  const user = { personId:'me' };
  const rows = ranker.rankGroup('projects', [
    { id:'done', name:'ATOM', status:'done', memberIds:['me'] },
    { id:'active-other', name:'ATOM', status:'active', memberIds:[] },
    { id:'active-mine', name:'ATOM', status:'active', memberIds:['me'] },
  ], 'atom', { user });
  assert.deepEqual(rows.map((x) => x.id), ['active-mine','active-other','done']);
});

test('journal ranking uses text relevance before pinned state and recency', () => {
  const rows = ranker.rankGroup('journal', [
    { id:'pinned', text:'Что-то про найм', attentionPinned:true, updatedAt:'2026-09-06' },
    { id:'exact', text:'План найма', attentionPinned:false, updatedAt:'2026-08-01' },
  ], 'план найма');
  assert.equal(rows[0].id, 'exact');
});

test('links rank exact material titles over source-title-only matches', () => {
  const rows = ranker.rankGroup('links', [
    { id:'source', title:'Документ', sourceTitle:'Саммари встречи', sourceDate:'2026-09-06' },
    { id:'title', title:'Саммари', sourceTitle:'1:1', sourceDate:'2026-08-01' },
  ], 'саммари');
  assert.equal(rows[0].id, 'title');
});

test('labs, goals and check-ins use domain status/recency ordering when relevance ties', () => {
  const labs = ranker.rankGroup('labs', [
    { id:'done', title:'X', status:'done', updatedAt:'2026-09-06' },
    { id:'work', title:'X', status:'in_progress', updatedAt:'2026-08-01' },
  ], 'x');
  assert.deepEqual(labs.map((x) => x.id), ['work','done']);

  const goals = ranker.rankGroup('goals', [
    { id:'done', title:'X', status:'done' },
    { id:'active', title:'X', status:'active' },
  ], 'x');
  assert.deepEqual(goals.map((x) => x.id), ['active','done']);

  const checkins = ranker.rankGroup('checkins', [
    { id:'old', did:'X', weekStart:'2026-08-24' },
    { id:'new', did:'X', weekStart:'2026-08-31' },
  ], 'x');
  assert.deepEqual(checkins.map((x) => x.id), ['new','old']);
});
