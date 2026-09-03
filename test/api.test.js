'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test-'));
process.env.GARDEN_DATA_DIR = dataDir;
process.env.GARDEN_ADMIN_USER = 'admin';
process.env.GARDEN_ADMIN_PASSWORD = 'GardenTest123!';

const { app } = require('../server/index');
const db = require('../server/db');

let server;
let base;
let cookie = '';

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && typeof options.body !== 'string') {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(base + url, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { response, body };
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'GardenTest123!' } });
  assert.equal(login.response.status, 200);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('health endpoint works', async () => {
  const { response, body } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('Labs project gets stable LAB-XXXX key and resolves by key', async () => {
  const created = await request('/api/labs', {
    method: 'POST',
    body: { title: 'Refactor Lab', entityType: 'project', projectType: 'pet', status: 'idea', private: false },
  });
  assert.equal(created.response.status, 201);
  assert.match(created.body.labKey, /^LAB-\d{4,}$/);

  const fetched = await request('/api/labs/' + encodeURIComponent(created.body.labKey));
  assert.equal(fetched.response.status, 200);
  assert.equal(fetched.body.id, created.body.id);
});

test('Lab ideas attach to a project and comments can be created', async () => {
  const project = (await request('/api/labs', {
    method: 'POST', body: { title: 'Parent', entityType: 'project', status: 'idea', private: false },
  })).body;
  const idea = await request('/api/labs', {
    method: 'POST', body: { title: 'Idea', entityType: 'idea', labProjectId: project.id, status: 'idea', private: false },
  });
  assert.equal(idea.response.status, 201);
  assert.equal(idea.body.labProjectId, project.id);

  const comment = await request(`/api/comments/lab/${project.id}`, { method: 'POST', body: { text: 'Hello' } });
  assert.equal(comment.response.status, 201);
  assert.equal(comment.body.text, 'Hello');
  const comments = await request(`/api/comments/lab/${project.id}`);
  assert.equal(comments.response.status, 200);
  assert.equal(comments.body.length, 1);
  assert.equal(comments.body[0].text, 'Hello');
});

test('workspace is isolated at SQLite query level', () => {
  const main = db.projects.create({ name: 'Main-only' });
  const demo = db.withWorkspace('demo', () => db.projects.create({ name: 'Demo-only' }));
  assert.equal(db.projects.get(main.id).name, 'Main-only');
  assert.equal(db.projects.get(demo.id), null);
  assert.equal(db.withWorkspace('demo', () => db.projects.get(demo.id).name), 'Demo-only');
});

test('version history records edits and can restore an earlier Labs project version', async () => {
  const created = await request('/api/labs', {
    method: 'POST', body: { title: 'Version one', entityType: 'project', projectType: 'pet', status: 'idea', private: false },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/labs/${id}`, { method: 'PUT', body: { title: 'Version two' } });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.title, 'Version two');

  const history = await request(`/api/versions/labs/${id}`);
  assert.equal(history.response.status, 200);
  assert.ok(history.body.length >= 2);
  assert.equal(history.body[0].data.title, 'Version two');
  const original = history.body.find((entry) => entry.data.title === 'Version one');
  assert.ok(original);

  const restored = await request(`/api/versions/labs/${id}/${original.version}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.title, 'Version one');

  const after = await request(`/api/versions/labs/${id}`);
  assert.equal(after.response.status, 200);
  assert.equal(after.body[0].data.title, 'Version one');
  assert.ok(after.body.length >= 3);
});

test('task updates are versioned and task history can restore the prior state', async () => {
  const created = await request('/api/tasks', {
    method: 'POST', body: { title: 'Task version one', status: 'todo', taskType: 'standard', assigneeIds: [] },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/tasks/${id}`, { method: 'PUT', body: { title: 'Task version two', priority: 'high' } });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.title, 'Task version two');

  const history = await request(`/api/versions/tasks/${id}`);
  assert.equal(history.response.status, 200);
  const original = history.body.find((entry) => entry.data.title === 'Task version one');
  assert.ok(original);

  const restored = await request(`/api/versions/tasks/${id}/${original.version}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.title, 'Task version one');
  assert.equal(restored.body.taskKey, created.body.taskKey);
});

test('person development profile returns Labs projects but not Labs ideas', async () => {
  const person = await request('/api/people', { method: 'POST', body: { name: 'Labs Author', type: 'team', status: 'active' } });
  assert.equal(person.response.status, 201);
  const project = await request('/api/labs', { method: 'POST', body: { title: 'Visible project', entityType: 'project', authorId: person.body.id, status: 'idea', private: false } });
  assert.equal(project.response.status, 201);
  const idea = await request('/api/labs', { method: 'POST', body: { title: 'Hidden idea', entityType: 'idea', authorId: person.body.id, labProjectId: project.body.id, status: 'idea', private: false } });
  assert.equal(idea.response.status, 201);

  const profile = await request(`/api/people/${person.body.id}/profile`);
  assert.equal(profile.response.status, 200);
  assert.deepEqual(profile.body.labs.map((item) => item.id), [project.body.id]);
});

test('historical versions can be deleted but the current version is protected', async () => {
  const created = await request('/api/tasks', {
    method: 'POST', body: { title: 'Delete version one', status: 'todo', taskType: 'standard', assigneeIds: [] },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/tasks/${id}`, { method: 'PUT', body: { title: 'Delete version two' } });
  assert.equal(edited.response.status, 200);

  const before = await request(`/api/versions/tasks/${id}`);
  assert.equal(before.response.status, 200);
  const historical = before.body.find((entry) => !entry.current);
  const current = before.body.find((entry) => entry.current);
  assert.ok(historical);
  assert.ok(current);

  const deleted = await request(`/api/versions/tasks/${id}/${historical.version}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 204);

  const after = await request(`/api/versions/tasks/${id}`);
  assert.equal(after.response.status, 200);
  assert.equal(after.body.some((entry) => entry.version === historical.version), false);

  const protectedDelete = await request(`/api/versions/tasks/${id}/${current.version}`, { method: 'DELETE' });
  assert.equal(protectedDelete.response.status, 409);
  assert.equal(protectedDelete.body.error, 'current_version_cannot_be_deleted');
});

test('project startDate is stripped from create and update payloads', async () => {
  const created = await request('/api/projects', {
    method: 'POST',
    body: { name: 'No start date project', status: 'active', startDate: '2026-08-01', memberIds: [] },
  });
  assert.equal(created.response.status, 201);
  assert.equal(Object.hasOwn(created.body, 'startDate'), false);
  assert.equal(Object.hasOwn(db.projects.get(created.body.id), 'startDate'), false);

  const updated = await request(`/api/projects/${created.body.id}`, {
    method: 'PUT', body: { startDate: '2026-09-01', description: 'Updated' },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(Object.hasOwn(updated.body, 'startDate'), false);
  assert.equal(Object.hasOwn(db.projects.get(created.body.id), 'startDate'), false);
});

test('meeting updates are versioned and can restore a prior version', async () => {
  const created = await request('/api/meetings', {
    method: 'POST',
    body: { title: 'Weekly sync', type: 'other', date: '2026-08-29', participantIds: [], notes: 'First notes' },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/meetings/${id}`, {
    method: 'PUT', body: { notes: 'Updated notes' },
  });
  assert.equal(edited.response.status, 200);

  const history = await request(`/api/versions/meetings/${id}`);
  assert.equal(history.response.status, 200);
  assert.ok(history.body.length >= 2);
  const original = history.body.find((entry) => entry.data.notes === 'First notes');
  assert.ok(original);

  const restored = await request(`/api/versions/meetings/${id}/${original.version}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.notes, 'First notes');
  assert.equal(restored.body.meetingKey, created.body.meetingKey);
});
