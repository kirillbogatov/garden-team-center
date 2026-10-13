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
});

test('Workshop projects and ideas get stable public keys and resolve by key', async () => {
  const created = await request('/api/labs', {
    method: 'POST',
    body: { title: 'Refactor Lab', entityType: 'project', projectType: 'pet', status: 'idea', visibility: 'team' },
  });
  assert.equal(created.response.status, 201);
  assert.match(created.body.blueprintKey, /^BLUEPRINT-[0-9A-Z]{4}$/);

  const fetched = await request('/api/labs/' + encodeURIComponent(created.body.blueprintKey));
  assert.equal(fetched.response.status, 200);
  assert.equal(fetched.body.id, created.body.id);
});

test('Lab ideas attach to a project and comments can be created', async () => {
  const project = (await request('/api/labs', {
    method: 'POST', body: { title: 'Parent', entityType: 'project', status: 'idea', visibility: 'team' },
  })).body;
  const idea = await request('/api/labs', {
    method: 'POST', body: { title: 'Idea', entityType: 'idea', labProjectId: project.id, status: 'idea', visibility: 'team' },
  });
  assert.equal(idea.response.status, 201);
  assert.match(project.blueprintKey, /^BLUEPRINT-[0-9A-Z]{4}$/);
  assert.match(idea.body.ideaKey, /^IDEA-[0-9A-Z]{4}$/);
  assert.equal(idea.body.labProjectId, project.id);

  const comment = await request(`/api/comments/lab/${project.id}`, { method: 'POST', body: { text: 'Hello' } });
  assert.equal(comment.response.status, 201);
  assert.equal(comment.body.text, 'Hello');
  const comments = await request(`/api/comments/lab/${project.id}`);
  assert.equal(comments.response.status, 200);
  assert.equal(comments.body.length, 1);
  assert.equal(comments.body[0].text, 'Hello');
});

test('idea can link to a work project via projectId and take the rejected status', async () => {
  const project = (await request('/api/projects', {
    method: 'POST', body: { name: 'Ideas Target Project', status: 'active', projectKey: 'IDPJ' },
  })).body;
  const idea = await request('/api/labs', {
    method: 'POST', body: { title: 'Linked idea', entityType: 'idea', projectId: project.id, status: 'idea', visibility: 'team' },
  });
  assert.equal(idea.response.status, 201);
  assert.equal(idea.body.projectId, project.id);
  assert.equal(idea.body.labProjectId, undefined);

  const rejected = await request(`/api/labs/${encodeURIComponent(idea.body.ideaKey)}`, { method: 'PUT', body: { status: 'rejected' } });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.status, 'rejected');
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
    method: 'POST', body: { title: 'Version one', entityType: 'project', projectType: 'pet', status: 'idea', visibility: 'team' },
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
  const project = await request('/api/labs', { method: 'POST', body: { title: 'Visible project', entityType: 'project', authorId: person.body.id, status: 'idea', visibility: 'team' } });
  assert.equal(project.response.status, 201);
  const idea = await request('/api/labs', { method: 'POST', body: { title: 'Hidden idea', entityType: 'idea', authorId: person.body.id, labProjectId: project.body.id, status: 'idea', visibility: 'team' } });
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

test('archived projects are excluded from the default project list but stay reachable directly', async () => {
  const created = await request('/api/projects', {
    method: 'POST', body: { name: 'Archivable Project', status: 'active', projectKey: 'ARCP' },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const archived = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: new Date().toISOString() } });
  assert.equal(archived.response.status, 200);
  assert.ok(archived.body.archivedAt);

  const list = await request('/api/projects');
  assert.equal(list.response.status, 200);
  assert.ok(!list.body.some((p) => p.id === id), 'archived project should not appear in the default list');

  const direct = await request(`/api/projects/${id}`);
  assert.equal(direct.response.status, 200);
  assert.equal(direct.body.id, id);

  const restored = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: null } });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.archivedAt, null);

  const listAfterRestore = await request('/api/projects');
  assert.ok(listAfterRestore.body.some((p) => p.id === id), 'restored project should reappear in the default list');
});

test('project updates are versioned and project history can restore the prior state, including archiving', async () => {
  const created = await request('/api/projects', {
    method: 'POST', body: { name: 'Project version one', status: 'active', projectKey: 'PJV1' },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/projects/${id}`, { method: 'PUT', body: { name: 'Project version two', status: 'paused' } });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.name, 'Project version two');

  const history = await request(`/api/versions/projects/${id}`);
  assert.equal(history.response.status, 200);
  const original = history.body.find((entry) => entry.data.name === 'Project version one');
  assert.ok(original);

  const restored = await request(`/api/versions/projects/${id}/${original.version}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.name, 'Project version one');
  assert.equal(restored.body.projectKey, created.body.projectKey);

  const archivedForHistory = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: new Date().toISOString() } });
  assert.equal(archivedForHistory.response.status, 200);
  const historyAfterArchive = await request(`/api/versions/projects/${id}`);
  assert.equal(historyAfterArchive.response.status, 200);
  assert.ok(historyAfterArchive.body[0].data.archivedAt, 'latest version should record the archived timestamp');
});

test('project keeps attributes that are not rendered by the current client', async () => {
  const created = await request('/api/projects', {
    method: 'POST',
    body: { name: 'Preserved project model', projectKey: 'PRSV', status: 'active', startDate: '2026-08-01', color: '#5E6AD2', customHiddenAttribute: { source: 'database' }, memberIds: [] },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.projectKey, 'PRSV');
  assert.equal(created.body.startDate, '2026-08-01');
  assert.equal(created.body.color, '#5E6AD2');
  assert.deepEqual(created.body.customHiddenAttribute, { source: 'database' });

  const updated = await request(`/api/projects/${created.body.projectKey}`, {
    method: 'PUT', body: { description: 'Updated without touching hidden fields' },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.startDate, '2026-08-01');
  assert.equal(updated.body.color, '#5E6AD2');
  assert.deepEqual(updated.body.customHiddenAttribute, { source: 'database' });
  assert.deepEqual(db.projects.get(created.body.id).customHiddenAttribute, { source: 'database' });
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

test('public identifiers are assigned to core entities and work as CRUD references', async () => {
  const cases = [
    ['issues', 'issueKey', /^ISSUE-[0-9A-Z]{4}$/, { title: 'Public issue', status: 'open', severity: 'medium' }],
    ['processes', 'processKey', /^PROCESS-[0-9A-Z]{4}$/, { title: 'Public process', status: 'active' }],
    ['agreements', 'agreementKey', /^AGREE-[0-9A-Z]{4}$/, { text: 'Public agreement', status: 'active' }],
    ['goals', 'goalKey', /^GOAL-[0-9A-Z]{4}$/, { title: 'Public goal', status: 'active' }],
    ['tools', 'toolKey', /^TOOL-[0-9A-Z]{4}$/, { name: 'Public tool', url: 'https://example.com' }],
    ['meetings', 'meetingKey', /^MEET-[0-9A-Z]{4}$/, { title: 'Public meeting', type: 'other', date: '2026-09-15', participantIds: [] }],
  ];

  for (const [collection, field, pattern, payload] of cases) {
    const created = await request(`/api/${collection}`, { method: 'POST', body: { ...payload, hiddenDatabaseField: { keep: true } } });
    assert.equal(created.response.status, 201, `${collection} create`);
    assert.match(created.body[field], pattern, `${collection} key`);
    assert.deepEqual(created.body.hiddenDatabaseField, { keep: true });

    const key = created.body[field];
    const fetched = await request(`/api/${collection}/${encodeURIComponent(key)}`);
    assert.equal(fetched.response.status, 200, `${collection} get by public key`);
    assert.equal(fetched.body.id, created.body.id);

    const updated = await request(`/api/${collection}/${encodeURIComponent(key)}`, { method: 'PUT', body: { description: 'Updated through public key' } });
    assert.equal(updated.response.status, 200, `${collection} update by public key`);
    assert.equal(updated.body[field], key, `${collection} public key stays stable`);
    assert.deepEqual(updated.body.hiddenDatabaseField, { keep: true }, `${collection} hidden field stays intact`);
  }
});

test('Workshop comments resolve a blueprint public identifier', async () => {
  const project = await request('/api/labs', {
    method: 'POST', body: { title: 'Comment by blueprint key', entityType: 'project', status: 'idea', visibility: 'team' },
  });
  assert.equal(project.response.status, 201);
  const ref = project.body.blueprintKey;
  const comment = await request(`/api/comments/lab/${encodeURIComponent(ref)}`, { method: 'POST', body: { text: 'Public ref comment' } });
  assert.equal(comment.response.status, 201);
  const list = await request(`/api/comments/lab/${encodeURIComponent(ref)}`);
  assert.equal(list.response.status, 200);
  assert.equal(list.body.at(-1).text, 'Public ref comment');
});

test('project public key accepts 1-4 latin letters/digits, is unique, and resolves as the project identifier', async () => {
  const first = await request('/api/projects', { method: 'POST', body: { name: 'Public Key Project One', status: 'active', projectKey: 'AB' } });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.projectKey, 'AB');

  const fetched = await request(`/api/projects/${first.body.projectKey}`);
  assert.equal(fetched.response.status, 200);
  assert.equal(fetched.body.id, first.body.id);

  const invalid = await request('/api/projects', { method: 'POST', body: { name: 'Public Key Project Bad', status: 'active', projectKey: 'ABCDE' } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'invalid_project_key');

  const invalidAlphabet = await request('/api/projects', { method: 'POST', body: { name: 'Public Key Project Cyrillic', status: 'active', projectKey: 'КОД' } });
  assert.equal(invalidAlphabet.response.status, 400);

  const duplicate = await request('/api/projects', { method: 'POST', body: { name: 'Public Key Project Dup', status: 'active', projectKey: 'AB' } });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error, 'project_key_exists');

  const second = await request('/api/projects', { method: 'POST', body: { name: 'Public Key Project Two', status: 'active', projectKey: 'WXYZ' } });
  assert.equal(second.response.status, 201);

  const updateDuplicate = await request(`/api/projects/${second.body.projectKey}`, { method: 'PUT', body: { projectKey: 'AB' } });
  assert.equal(updateDuplicate.response.status, 409);
  assert.equal(updateDuplicate.body.error, 'project_key_exists');

  const updateOk = await request(`/api/projects/${second.body.projectKey}`, { method: 'PUT', body: { projectKey: 'WX9' } });
  assert.equal(updateOk.response.status, 200);
  assert.equal(updateOk.body.projectKey, 'WX9');
});

test('journal remains private while preserving legacy and hidden attributes', async () => {
  const personA = (await request('/api/people', { method: 'POST', body: { name: 'Journal Owner', type: 'team', status: 'active' } })).body;
  const personB = (await request('/api/people', { method: 'POST', body: { name: 'Journal Bystander', type: 'team', status: 'active' } })).body;
  const userA = await request('/api/admin/users', { method: 'POST', body: { username: 'journal-owner', displayName: 'Journal Owner', roles: ['member'], personId: personA.id } });
  const userB = await request('/api/admin/users', { method: 'POST', body: { username: 'journal-bystander', displayName: 'Journal Bystander', roles: ['member'], personId: personB.id } });
  const cookieA = (await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'journal-owner', password: userA.body.temporaryPassword } })).cookie;
  const cookieB = (await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'journal-bystander', password: userB.body.temporaryPassword } })).cookie;

  const beforeIssues = (await requestAs(cookieA, '/api/issues')).body.length;
  const beforeLabs = (await requestAs(cookieA, '/api/labs')).body.length;
  const beforeAgreements = (await requestAs(cookieA, '/api/agreements')).body.length;
  const note = await requestAs(cookieA, '/api/journal', { method: 'POST', body: {
    text: 'Обычная личная заметка', kind: 'problem', issueId: 'legacy', agreementId: 'legacy', labId: 'legacy', private: true,
  } });
  assert.equal(note.response.status, 201);
  assert.match(note.body.noteKey, /^NOTE-[0-9A-Z]{4}$/);
  for (const field of ['kind', 'issueId', 'agreementId', 'labId', 'private']) assert.equal(Object.hasOwn(note.body, field), true);
  assert.equal(note.body.kind, 'problem');
  assert.equal(note.body.issueId, 'legacy');
  assert.equal((await requestAs(cookieA, '/api/issues')).body.length, beforeIssues);
  assert.equal((await requestAs(cookieA, '/api/labs')).body.length, beforeLabs);
  assert.equal((await requestAs(cookieA, '/api/agreements')).body.length, beforeAgreements);

  const bystanderList = await requestAs(cookieB, '/api/journal');
  assert.ok(!bystanderList.body.some((entry) => entry.id === note.body.id));
  assert.equal((await requestAs(cookieB, `/api/journal/${note.body.id}`)).response.status, 403);
});

test('ideas created directly in Мастерская do not create shadow Journal records', async () => {
  const before = (await request('/api/journal')).body.map((entry) => entry.id);
  const idea = await request('/api/labs', { method: 'POST', body: { entityType: 'idea', title: 'Самостоятельная идея', visibility: 'team', status: 'idea' } });
  assert.equal(idea.response.status, 201);
  const after = (await request('/api/journal')).body;
  assert.deepEqual(after.map((entry) => entry.id), before);
  assert.ok(!after.some((entry) => entry.labId === idea.body.id));
});

test('a Labs project visible only to its owner is hidden from other members', async () => {
  const owner = (await request('/api/people', { method: 'POST', body: { name: 'Private Project Owner', type: 'team', status: 'active' } })).body;
  const other = (await request('/api/people', { method: 'POST', body: { name: 'Private Project Onlooker', type: 'team', status: 'active' } })).body;
  const ownerUser = await request('/api/admin/users', { method: 'POST', body: { username: 'private-project-owner', displayName: 'Private Project Owner', roles: ['member'], personId: owner.id } });
  const otherUser = await request('/api/admin/users', { method: 'POST', body: { username: 'private-project-onlooker', displayName: 'Private Project Onlooker', roles: ['member'], personId: other.id } });
  const ownerLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'private-project-owner', password: ownerUser.body.temporaryPassword } });
  const ownerCookie = ownerLogin.cookie;
  const otherLogin = await requestAs('', '/api/auth/login', { method: 'POST', body: { username: 'private-project-onlooker', password: otherUser.body.temporaryPassword } });
  const otherCookie = otherLogin.cookie;

  const project = await requestAs(ownerCookie, '/api/labs', { method: 'POST', body: { entityType: 'project', title: 'Секретный пет-проект', authorId: owner.id, visibility: 'me', status: 'idea' } });
  assert.equal(project.response.status, 201);

  const otherGet = await requestAs(otherCookie, `/api/labs/${project.body.id}`);
  assert.equal(otherGet.response.status, 403);
  const otherList = await requestAs(otherCookie, '/api/labs');
  assert.ok(!otherList.body.some((l) => l.id === project.body.id));
  const ownerGet = await requestAs(ownerCookie, `/api/labs/${project.body.id}`);
  assert.equal(ownerGet.response.status, 200);
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

test('technology events can be planned, edited, completed and linked to a meeting', async () => {
  const event = await request('/api/technologyEvents', {
    method: 'POST',
    body: { plannedDate: '2026-10-14', topic: 'Product thinking workshop', hours: 2, personIds: [], completed: false },
  });
  assert.equal(event.response.status, 201);
  assert.equal(event.body.topic, 'Product thinking workshop');
  assert.equal(event.body.completed, false);

  const updated = await request(`/api/technologyEvents/${event.body.id}`, {
    method: 'PUT',
    body: { topic: 'Product thinking lecture', completed: true },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.topic, 'Product thinking lecture');
  assert.equal(updated.body.completed, true);

  const meeting = await request('/api/meetings', {
    method: 'POST',
    body: {
      type: 'club', date: '2026-10-14', title: 'Product thinking lecture', participantIds: [], projectId: null,
      notes: '', actionItems: [], prepNotes: '', documentLinks: [], sourceTechnologyEventId: event.body.id,
    },
  });
  assert.equal(meeting.response.status, 201);
  assert.equal(meeting.body.sourceTechnologyEventId, event.body.id);

  const list = await request('/api/technologyEvents');
  assert.equal(list.response.status, 200);
  assert.ok(list.body.some((item) => item.id === event.body.id));
});
