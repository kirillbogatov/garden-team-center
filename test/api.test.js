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

// Runs a request under a different session cookie without disturbing the
// module-level admin session other tests rely on. Returns the (possibly
// updated, e.g. after a login) cookie alongside the usual response/body.
async function requestAs(sessionCookie, url, options = {}) {
  const previous = cookie;
  cookie = sessionCookie || '';
  const result = await request(url, options);
  const updatedCookie = cookie;
  cookie = previous;
  return { ...result, cookie: updatedCookie };
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

test('demo opens as teamlead with assistant home mode', async () => {
  const demoLogin = await requestAs('', '/api/auth/demo', { method: 'POST', body: {} });
  assert.equal(demoLogin.response.status, 200);
  assert.equal(demoLogin.body.user.role, 'teamlead');
  assert.ok(demoLogin.body.user.roles.includes('teamlead'));

  const settings = await requestAs(demoLogin.cookie, '/api/settings');
  assert.equal(settings.response.status, 200);
  assert.equal(settings.body.overviewHomeMode, 'assistant');
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

test('task discussion comments are a separate thread from the sticky task notes', async () => {
  const created = await request('/api/tasks', {
    method: 'POST', body: { title: 'Task with comments', status: 'todo', taskType: 'standard', assigneeIds: [] },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const note = await request(`/api/comments/task/${id}`, { method: 'POST', body: { text: 'Sticky note', color: 'pink' } });
  assert.equal(note.response.status, 201);
  const discussionComment = await request(`/api/comments/task-discussion/${id}`, { method: 'POST', body: { text: 'A real comment' } });
  assert.equal(discussionComment.response.status, 201);

  const notes = await request(`/api/comments/task/${id}`);
  assert.equal(notes.body.length, 1);
  assert.equal(notes.body[0].text, 'Sticky note');

  const discussion = await request(`/api/comments/task-discussion/${id}`);
  assert.equal(discussion.body.length, 1);
  assert.equal(discussion.body[0].text, 'A real comment');
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

test('clearing a multi-assignee task copy down to no assignees deletes the orphaned copy, not its sibling', async () => {
  const person1 = (await request('/api/people', { method: 'POST', body: { name: 'Group Assignee One', type: 'team', status: 'active' } })).body;
  const person2 = (await request('/api/people', { method: 'POST', body: { name: 'Group Assignee Two', type: 'team', status: 'active' } })).body;

  const created = await request('/api/tasks', {
    method: 'POST',
    body: { title: 'Shared task', status: 'todo', taskType: 'standard', assigneeIds: [person1.id, person2.id] },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.copies.length, 2);
  const [copyA, copyB] = created.body.copies;
  assert.ok(copyA.taskGroupId);
  assert.equal(copyA.taskGroupId, copyB.taskGroupId);

  const beforeA = await request(`/api/tasks/${copyA.id}`);
  const beforeB = await request(`/api/tasks/${copyB.id}`);
  assert.equal(beforeA.response.status, 200);
  assert.equal(beforeB.response.status, 200);

  // Removing copyA's only assignee must delete the orphaned copy rather than
  // leaving it around unassigned forever.
  const cleared = await request(`/api/tasks/${copyA.id}`, { method: 'PUT', body: { assigneeIds: [] } });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.body.deleted, true);
  assert.equal(cleared.body.id, copyA.id);

  const afterA = await request(`/api/tasks/${copyA.id}`);
  assert.equal(afterA.response.status, 404);

  const afterB = await request(`/api/tasks/${copyB.id}`);
  assert.equal(afterB.response.status, 200);
  assert.deepEqual(afterB.body.assigneeIds, [person2.id]);
  assert.equal(afterB.body.taskGroupId, copyA.taskGroupId);
});

test('a normal single-assignee task can still be cleared to no assignee without being deleted', async () => {
  const person = (await request('/api/people', { method: 'POST', body: { name: 'Solo Assignee', type: 'team', status: 'active' } })).body;
  const created = await request('/api/tasks', {
    method: 'POST', body: { title: 'Solo task', status: 'todo', taskType: 'standard', assigneeIds: [person.id] },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.taskGroupId, undefined);

  const cleared = await request(`/api/tasks/${created.body.id}`, { method: 'PUT', body: { assigneeIds: [] } });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.body.deleted, undefined);
  assert.deepEqual(cleared.body.assigneeIds, []);

  const after = await request(`/api/tasks/${created.body.id}`);
  assert.equal(after.response.status, 200);
  assert.deepEqual(after.body.assigneeIds, []);
});

test('a task copy cannot claim a person already assigned to a sibling copy in the same group', async () => {
  const person1 = (await request('/api/people', { method: 'POST', body: { name: 'Claim Assignee One', type: 'team', status: 'active' } })).body;
  const person2 = (await request('/api/people', { method: 'POST', body: { name: 'Claim Assignee Two', type: 'team', status: 'active' } })).body;

  const created = await request('/api/tasks', {
    method: 'POST',
    body: { title: 'Claim task', status: 'todo', taskType: 'standard', assigneeIds: [person1.id, person2.id] },
  });
  assert.equal(created.response.status, 201);
  const [copyA, copyB] = created.body.copies;

  // copyA tries to switch to person2, who copyB already owns in this group.
  const clashed = await request(`/api/tasks/${copyA.id}`, { method: 'PUT', body: { assigneeIds: [person2.id] } });
  assert.equal(clashed.response.status, 200);
  assert.equal(clashed.body.deleted, true);

  const afterB = await request(`/api/tasks/${copyB.id}`);
  assert.equal(afterB.response.status, 200);
  assert.deepEqual(afterB.body.assigneeIds, [person2.id]);
});

test('teamlead with own_manage-only access to people can self-register their own type:team card, but nothing else', async () => {
  const policyRes = await request('/api/admin/role-policies', { method: 'PUT', body: { rolePolicies: { teamlead: { people: 'own_manage' } } } });
  assert.equal(policyRes.response.status, 200);
  assert.equal(policyRes.body.rolePolicies.teamlead.people, 'own_manage');

  try {
    const existingPerson = (await request('/api/people', { method: 'POST', body: { name: 'Teamlead Own Card', type: 'team', status: 'active' } })).body;
    const newUser = await request('/api/admin/users', {
      method: 'POST',
      body: { username: 'teamlead-selfreg', displayName: 'Teamlead Selfreg', roles: ['teamlead'], personId: existingPerson.id },
    });
    assert.equal(newUser.response.status, 201);

    const teamleadLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'teamlead-selfreg', password: newUser.body.temporaryPassword } });
    assert.equal(teamleadLogin.response.status, 200);
    const teamleadCookie = teamleadLogin.cookie;

    // Allowed: creating their own type:'team' card.
    const ownCard = await requestAs(teamleadCookie, '/api/people', { method: 'POST', body: { name: 'Second Team Card', type: 'team', status: 'active' } });
    assert.equal(ownCard.response.status, 201);

    // Denied: creating a non-team person is still out of reach for own_manage-only access.
    const stakeholder = await requestAs(teamleadCookie, '/api/people', { method: 'POST', body: { name: 'Some Stakeholder', type: 'stakeholder' } });
    assert.equal(stakeholder.response.status, 403);
  } finally {
    const restore = await request('/api/admin/role-policies', { method: 'PUT', body: { rolePolicies: { teamlead: { people: 'all_manage' } } } });
    assert.equal(restore.response.status, 200);
  }
});

test('admin can delete or edit any comment; a non-author, non-admin user cannot', async () => {
  const personA = (await request('/api/people', { method: 'POST', body: { name: 'Comment Author Person', type: 'team', status: 'active' } })).body;
  const personB = (await request('/api/people', { method: 'POST', body: { name: 'Comment Bystander Person', type: 'team', status: 'active' } })).body;

  const userA = await request('/api/admin/users', { method: 'POST', body: { username: 'comment-author', displayName: 'Comment Author', roles: ['member'], personId: personA.id } });
  assert.equal(userA.response.status, 201);
  const userB = await request('/api/admin/users', { method: 'POST', body: { username: 'comment-bystander', displayName: 'Comment Bystander', roles: ['member'], personId: personB.id } });
  assert.equal(userB.response.status, 201);

  const loginA = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'comment-author', password: userA.body.temporaryPassword } });
  assert.equal(loginA.response.status, 200);
  const cookieA = loginA.cookie;
  const loginB = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'comment-bystander', password: userB.body.temporaryPassword } });
  assert.equal(loginB.response.status, 200);
  const cookieB = loginB.cookie;

  const created = await requestAs(cookieA, '/api/comments/overview/main', { method: 'POST', body: { text: 'Author note' } });
  assert.equal(created.response.status, 201);
  const commentId = created.body.id;

  const bystanderEdit = await requestAs(cookieB, `/api/comments/${commentId}`, { method: 'PUT', body: { text: 'Hacked' } });
  assert.equal(bystanderEdit.response.status, 403);
  const bystanderDelete = await requestAs(cookieB, `/api/comments/${commentId}`, { method: 'DELETE' });
  assert.equal(bystanderDelete.response.status, 403);

  const adminEdit = await request(`/api/comments/${commentId}`, { method: 'PUT', body: { text: 'Moderated by admin' } });
  assert.equal(adminEdit.response.status, 200);
  assert.equal(adminEdit.body.text, 'Moderated by admin');

  const adminDelete = await request(`/api/comments/${commentId}`, { method: 'DELETE' });
  assert.equal(adminDelete.response.status, 204);
});

test('project taskCode validation still rejects invalid/duplicate codes and accepts a valid unique one', async () => {
  const first = await request('/api/projects', { method: 'POST', body: { name: 'Task Code Project One', status: 'active', taskCode: 'ABCD' } });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.taskCode, 'ABCD');

  const invalid = await request('/api/projects', { method: 'POST', body: { name: 'Task Code Project Bad', status: 'active', taskCode: 'AB' } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'invalid_project_task_code');

  const duplicate = await request('/api/projects', { method: 'POST', body: { name: 'Task Code Project Dup', status: 'active', taskCode: 'ABCD' } });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error, 'project_task_code_exists');

  const second = await request('/api/projects', { method: 'POST', body: { name: 'Task Code Project Two', status: 'active', taskCode: 'WXYZ' } });
  assert.equal(second.response.status, 201);

  const updateDuplicate = await request(`/api/projects/${second.body.id}`, { method: 'PUT', body: { taskCode: 'ABCD' } });
  assert.equal(updateDuplicate.response.status, 409);
  assert.equal(updateDuplicate.body.error, 'project_task_code_exists');

  const updateOk = await request(`/api/projects/${second.body.id}`, { method: 'PUT', body: { taskCode: 'wxyz' } });
  assert.equal(updateOk.response.status, 200);
  assert.equal(updateOk.body.taskCode, 'WXYZ');
});

test('journal is personal: a problem/idea/agreement created there also appears in its own section, and the raw journal note is not visible to other members', async () => {
  const personA = (await request('/api/people', { method: 'POST', body: { name: 'Journal Owner', type: 'team', status: 'active' } })).body;
  const personB = (await request('/api/people', { method: 'POST', body: { name: 'Journal Bystander', type: 'team', status: 'active' } })).body;
  const userA = await request('/api/admin/users', { method: 'POST', body: { username: 'journal-owner', displayName: 'Journal Owner', roles: ['member'], personId: personA.id } });
  assert.equal(userA.response.status, 201);
  const userB = await request('/api/admin/users', { method: 'POST', body: { username: 'journal-bystander', displayName: 'Journal Bystander', roles: ['member'], personId: personB.id } });
  assert.equal(userB.response.status, 201);
  const loginA = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'journal-owner', password: userA.body.temporaryPassword } });
  const cookieA = loginA.cookie;
  const loginB = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'journal-bystander', password: userB.body.temporaryPassword } });
  const cookieB = loginB.cookie;

  const problemEntry = await requestAs(cookieA, '/api/journal', { method: 'POST', body: { text: 'У нас проблема с деплоем', kind: 'problem', createdAt: new Date().toISOString() } });
  assert.equal(problemEntry.response.status, 201);
  assert.ok(problemEntry.body.issueId, 'ожидаем автосвязь с разделом «Проблемы»');
  const linkedIssue = await requestAs(cookieA, `/api/issues/${problemEntry.body.issueId}`);
  assert.equal(linkedIssue.response.status, 200);
  assert.match(linkedIssue.body.title, /деплоем/);

  // По умолчанию доступ member = "все данные, управление своими" — раньше это давало
  // просмотр вообще всего журнала. Теперь журнал личный: другой сотрудник не увидит
  // ни сам список, ни конкретную запись автора.
  const bystanderList = await requestAs(cookieB, '/api/journal');
  assert.equal(bystanderList.response.status, 200);
  assert.ok(!bystanderList.body.some((j) => j.id === problemEntry.body.id), 'запись журнала не должна быть видна другому сотруднику');
  const bystanderGet = await requestAs(cookieB, `/api/journal/${problemEntry.body.id}`);
  assert.equal(bystanderGet.response.status, 403);

  // Связанная проблема при этом остаётся видна всем как обычно — приватность
  // журнала не прячет то, что уже вынесено в командный раздел.
  const bystanderIssue = await requestAs(cookieB, `/api/issues/${problemEntry.body.issueId}`);
  assert.equal(bystanderIssue.response.status, 200);
});

test('an idea created in the Journal is auto-published to The Labs, respecting the chosen public/private visibility', async () => {
  const author = (await request('/api/people', { method: 'POST', body: { name: 'Idea Author', type: 'team', status: 'active' } })).body;
  const other = (await request('/api/people', { method: 'POST', body: { name: 'Idea Onlooker', type: 'team', status: 'active' } })).body;
  const authorUser = await request('/api/admin/users', { method: 'POST', body: { username: 'idea-author', displayName: 'Idea Author', roles: ['member'], personId: author.id } });
  const otherUser = await request('/api/admin/users', { method: 'POST', body: { username: 'idea-onlooker', displayName: 'Idea Onlooker', roles: ['member'], personId: other.id } });
  const authorLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'idea-author', password: authorUser.body.temporaryPassword } });
  const authorCookie = authorLogin.cookie;
  const otherLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'idea-onlooker', password: otherUser.body.temporaryPassword } });
  const otherCookie = otherLogin.cookie;

  const publicIdea = await requestAs(authorCookie, '/api/journal', { method: 'POST', body: { text: 'Публичная идея про виджет', kind: 'idea', private: false, createdAt: new Date().toISOString() } });
  assert.equal(publicIdea.response.status, 201);
  assert.ok(publicIdea.body.labId, 'публичная идея должна сразу попасть в The Labs');
  const publicLabsView = await requestAs(otherCookie, `/api/labs/${publicIdea.body.labId}`);
  assert.equal(publicLabsView.response.status, 200, 'публичная идея видна всем');

  const privateIdea = await requestAs(authorCookie, '/api/journal', { method: 'POST', body: { text: 'Секретная идея', kind: 'idea', private: true, createdAt: new Date().toISOString() } });
  assert.equal(privateIdea.response.status, 201);
  assert.ok(privateIdea.body.labId);
  const privateLabsListForOther = await requestAs(otherCookie, '/api/labs');
  assert.ok(!privateLabsListForOther.body.some((l) => l.id === privateIdea.body.labId), 'приватная идея не должна попадать в список другого сотрудника');
  const privateLabsGetForOther = await requestAs(otherCookie, `/api/labs/${privateIdea.body.labId}`);
  assert.equal(privateLabsGetForOther.response.status, 403);
  const privateLabsGetForAuthor = await requestAs(authorCookie, `/api/labs/${privateIdea.body.labId}`);
  assert.equal(privateLabsGetForAuthor.response.status, 200);
  const privateLabsGetForAdmin = await request(`/api/labs/${privateIdea.body.labId}`);
  assert.equal(privateLabsGetForAdmin.response.status, 200, 'администратор видит приватную идею как техническое исключение');
});

test('creating an idea directly in The Labs (not via Journal) syncs it back into the author\'s Journal', async () => {
  const author = (await request('/api/people', { method: 'POST', body: { name: 'Direct Lab Author', type: 'team', status: 'active' } })).body;
  const authorUser = await request('/api/admin/users', { method: 'POST', body: { username: 'direct-lab-author', displayName: 'Direct Lab Author', roles: ['member'], personId: author.id } });
  const authorLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'direct-lab-author', password: authorUser.body.temporaryPassword } });
  const authorCookie = authorLogin.cookie;

  const idea = await requestAs(authorCookie, '/api/labs', { method: 'POST', body: { entityType: 'idea', title: 'Идея, заведённая прямо в The Labs', authorId: author.id, private: false } });
  assert.equal(idea.response.status, 201);

  const journalList = await requestAs(authorCookie, '/api/journal');
  assert.equal(journalList.response.status, 200);
  const linked = journalList.body.find((j) => j.labId === idea.body.id);
  assert.ok(linked, 'прямое создание идеи в The Labs должно завести запись в Журнале');
  assert.equal(linked.kind, 'idea');
  assert.match(linked.text, /Идея, заведённая прямо в The Labs/);
});

test('an existing private Labs project is actually hidden from other members now (previously the checkbox had no server-side effect)', async () => {
  const owner = (await request('/api/people', { method: 'POST', body: { name: 'Private Project Owner', type: 'team', status: 'active' } })).body;
  const other = (await request('/api/people', { method: 'POST', body: { name: 'Private Project Onlooker', type: 'team', status: 'active' } })).body;
  const ownerUser = await request('/api/admin/users', { method: 'POST', body: { username: 'private-project-owner', displayName: 'Private Project Owner', roles: ['member'], personId: owner.id } });
  const otherUser = await request('/api/admin/users', { method: 'POST', body: { username: 'private-project-onlooker', displayName: 'Private Project Onlooker', roles: ['member'], personId: other.id } });
  const ownerLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'private-project-owner', password: ownerUser.body.temporaryPassword } });
  const ownerCookie = ownerLogin.cookie;
  const otherLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'private-project-onlooker', password: otherUser.body.temporaryPassword } });
  const otherCookie = otherLogin.cookie;

  const project = await requestAs(ownerCookie, '/api/labs', { method: 'POST', body: { entityType: 'project', title: 'Секретный пет-проект', authorId: owner.id, private: true, status: 'idea' } });
  assert.equal(project.response.status, 201);

  const otherGet = await requestAs(otherCookie, `/api/labs/${project.body.id}`);
  assert.equal(otherGet.response.status, 403);
  const otherList = await requestAs(otherCookie, '/api/labs');
  assert.ok(!otherList.body.some((l) => l.id === project.body.id));
  const ownerGet = await requestAs(ownerCookie, `/api/labs/${project.body.id}`);
  assert.equal(ownerGet.response.status, 200);
});

test('deleting a problem directly keeps its Journal note but clears the now-dangling issueId link', async () => {
  const created = await request('/api/journal', { method: 'POST', body: { text: 'Проблема для проверки отвязки', kind: 'problem', createdAt: new Date().toISOString() } });
  assert.equal(created.response.status, 201);
  assert.ok(created.body.issueId);

  const del = await request(`/api/issues/${created.body.issueId}`, { method: 'DELETE' });
  assert.equal(del.response.status, 204);

  const journalAfter = await request(`/api/journal/${created.body.id}`);
  assert.equal(journalAfter.response.status, 200, 'note itself must survive — deleting the issue must not silently delete the journal entry');
  assert.equal(journalAfter.body.issueId, null, 'the dangling link must be cleared so "Открыть" does not point at a deleted issue');
  assert.match(journalAfter.body.text, /Проблема для проверки отвязки/);
});

test('legacy idea visibility default is ignored by user settings', async () => {
  const result = await request('/api/settings', { method: 'PUT', body: { ideaVisibilityDefault: 'private' } });
  assert.equal(result.response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(result.body, 'ideaVisibilityDefault'), false);
});

test('smart search endpoint answers create, digest and search intents for the logged-in user', async () => {
  const create = await request('/api/smart-search?q=' + encodeURIComponent('создай задачу Проверить отчёт'));
  assert.equal(create.response.status, 200);
  assert.equal(create.body.kind, 'create');
  assert.equal(create.body.create.target, 'tasks');
  assert.equal(create.body.create.title, 'Проверить отчёт', 'заголовок должен сохранять регистр и букву «ё»');

  const digest = await request('/api/smart-search?q=' + encodeURIComponent('на что обратить внимание сегодня'));
  assert.equal(digest.body.kind, 'digest');
  assert.equal(digest.body.digest.type, 'today');
  assert.ok(digest.body.digest.signals.length);

  const fallback = await request('/api/smart-search?q=' + encodeURIComponent('совершенно несуществующая фраза'));
  assert.equal(fallback.body.kind, 'search');
});

test('unrecognized search queries are logged for the admin to review, recognized ones are not', async () => {
  await request('/api/admin/search-misses', { method: 'DELETE' }); // чистый лист от fallback-запросов других тестов

  const gibberish = 'совершенно несуществующая фраза для поиска подсказок';
  await request('/api/search?q=' + encodeURIComponent(gibberish));
  await request('/api/search?q=' + encodeURIComponent(gibberish)); // повтор — считаем счётчиком, не дублируем строку
  await request('/api/smart-search?q=' + encodeURIComponent(gibberish));
  await request('/api/search?q=' + encodeURIComponent('задачи')); // распознанная команда — в лог не попадает

  const misses = await request('/api/admin/search-misses');
  assert.equal(misses.response.status, 200);
  const entry = misses.body.misses.find((m) => m.sampleQuery === gibberish);
  assert.ok(entry, 'непонятый запрос должен попасть в лог');
  assert.equal(entry.hitCount, 3, 'обращения к /api/search и /api/smart-search должны схлопнуться в один общий счётчик');
  assert.ok(!misses.body.misses.some((m) => m.sampleQuery === 'задачи'), 'распознанная команда не должна попадать в лог непонятых запросов');

  const personC = (await request('/api/people', { method: 'POST', body: { name: 'Search Log Onlooker', type: 'team', status: 'active' } })).body;
  const memberUser = await request('/api/admin/users', { method: 'POST', body: { username: 'search-log-onlooker', displayName: 'Search Log Onlooker', roles: ['member'], personId: personC.id } });
  assert.equal(memberUser.response.status, 201);
  const loginMember = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'search-log-onlooker', password: memberUser.body.temporaryPassword } });
  assert.equal(loginMember.response.status, 200);
  const memberDenied = await requestAs(loginMember.cookie, '/api/admin/search-misses');
  assert.equal(memberDenied.response.status, 403);

  const cleared = await request('/api/admin/search-misses', { method: 'DELETE' });
  assert.equal(cleared.response.status, 200);
  assert.ok(cleared.body.removed >= 1);
  const afterClear = await request('/api/admin/search-misses');
  assert.equal(afterClear.body.misses.length, 0);
});

test('smart search asks which person is meant when a short name fits several, and remembers the answer', async () => {
  const first = await request('/api/people', { method: 'POST', body: { name: 'Мария Тестова', role: 'Дизайнер', type: 'team', status: 'active' } });
  const second = await request('/api/people', { method: 'POST', body: { name: 'Мария Пробная', role: 'Аналитик', type: 'team', status: 'active' } });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);

  const ambiguous = await request('/api/smart-search?q=' + encodeURIComponent('как дела у Маши'));
  assert.equal(ambiguous.body.kind, 'ambiguous');
  const names = ambiguous.body.ambiguous.candidates.map((item) => item.name);
  assert.ok(names.includes('Мария Тестова') && names.includes('Мария Пробная'), `обе Марии должны быть предложены, а получено: ${names.join(', ')}`);

  const chosen = await request(`/api/smart-search?q=${encodeURIComponent('как дела у Маши')}&personId=${encodeURIComponent(second.body.id)}`);
  assert.equal(chosen.body.kind, 'digest');
  assert.equal(chosen.body.digest.person.name, 'Мария Пробная');

  const hintKey = ambiguous.body.ambiguous.hintKey;
  await request('/api/settings', { method: 'PUT', body: { smartSearchPersonHints: { [hintKey]: second.body.id } } });
  const remembered = await request('/api/smart-search?q=' + encodeURIComponent('как дела у Маши'));
  assert.equal(remembered.body.kind, 'digest', 'запомненный выбор должен сниматься с сервера, а не приходить с клиента');
  assert.equal(remembered.body.resolution.via, 'hint');
  assert.equal(remembered.body.digest.person.name, 'Мария Пробная');

  await request('/api/settings', { method: 'PUT', body: { smartSearchPersonHints: {} } });
});

test('server-side knowledge base sanitizer neutralizes dangerous href/src schemes', () => {
  const { sanitizeKnowledgeHtmlServer } = require('../server/domain/knowledge-sanitize');
  const dirty = '<a href="javascript:alert(1)">bad</a><a href="https://ok.example">ok</a><a href="#anchor">anchor</a><img src="javascript:alert(2)"><img src="https://ok.example/img.png"><img src="data:image/png;base64,AAAA">';
  const clean = sanitizeKnowledgeHtmlServer(dirty);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.match(clean, /href="https:\/\/ok\.example"/);
  assert.match(clean, /href="#anchor"/);
  assert.match(clean, /src="https:\/\/ok\.example\/img\.png"/);
  assert.match(clean, /src="data:image\/png;base64,AAAA"/);
});
