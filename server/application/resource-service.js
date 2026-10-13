'use strict';

const { recordCreate: recordVersionCreate, recordUpdate: recordVersionUpdate } = require('../versioning');
const { notifyTaskAssigned, notifyProjectLoadChanges, notifyIssueCreated, notifyLabCreated } = require('../notifications');

class ApplicationError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function createResourceService(deps) {
  const {
    db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity,
    canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead,
    canManageCollection, validateProjectKey, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, assignLabKey,
    syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix,
    teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignCollectionKey,
  } = deps;

  const fail = (status, code) => { throw new ApplicationError(status, code); };
  const makeTaskGroupId = () => `tgrp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const LAB_VISIBILITY = new Set(['team', 'me']);
  const validatedLabVisibility = (value) => {
    const visibility = String(value || 'team');
    if (!LAB_VISIBILITY.has(visibility)) fail(400, 'invalid_visibility');
    return visibility;
  };
  const canonicalGoalPayload = (payload = {}) => {
    const allowed = ['title', 'description', 'status', 'dueDate', 'taskIds', 'issueIds', 'links', 'createdByUserId'];
    return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(payload, key)).map((key) => [key, payload[key]]));
  };
  const isVersioned = (name, item) => name === 'tasks' || name === 'meetings' || name === 'processes' || name === 'projects' || (name === 'labs' && item?.entityType !== 'idea');
  const recordCreate = (name, item, user) => {
    if (isVersioned(name, item) && item) recordVersionCreate(db, name, item, user?.id || null);
  };
  const recordUpdate = (name, before, after, user) => {
    if (isVersioned(name, before) && after) recordVersionUpdate(db, name, before, after, user?.id || null);
  };

  const lifecycle = {
    projects: {
      prepareCreate(payload) {
        const next = { ...payload };
        const result = validateProjectKey(db, next, null);
        if (result.error) fail(result.status, result.error);
        next.projectKey = result.code;
        return next;
      },
      prepareUpdate(current, payload) {
        const next = { ...payload };
        if (next.projectKey !== undefined) {
          const result = validateProjectKey(db, next, current.id);
          if (result.error) fail(result.status, result.error);
          next.projectKey = result.code;
        }
        return next;
      },
      afterUpdate(current, item, user) {
        notifyProjectLoadChanges(db, user, current, item);
      },
    },
    tasks: {
      beforeList() { autoArchiveCompletedTasks(); },
      prepareCreate(payload) { return assignTaskKey(taskLifecyclePatch(null, payload)); },
      prepareUpdate(current, payload) {
        return taskLifecyclePatch(current, { ...payload, taskKey: current.taskKey || nextTaskKey(taskKeyPrefix(current)) });
      },
      afterCreate(item, user) { notifyTaskAssigned(db, user, item); },
      cleanup(item) {
        db.comments.related(`task:${item.id}`).forEach((comment) => db.comments.remove(comment.id));
        db.taskNotes.related(item.id).forEach((note) => db.taskNotes.remove(note.id));
      },
    },
    labs: {
      prepareCreate(payload) { return assignLabKey({ ...payload, visibility: validatedLabVisibility(payload.visibility) }); },
      prepareUpdate(current, payload) {
        const next = { ...payload };
        if (next.visibility !== undefined) next.visibility = validatedLabVisibility(next.visibility);
        if (current.entityType === 'idea') next.ideaKey = current.ideaKey || assignLabKey(current).ideaKey;
        else next.blueprintKey = current.blueprintKey || assignLabKey(current).blueprintKey;
        return next;
      },
      afterCreate(item, user) { notifyLabCreated(db, user, item); },
      cleanup(item) {
        db.comments.related(`lab:${item.id}`).forEach((comment) => db.comments.remove(comment.id));
        if (item.entityType !== 'idea') db.labs.related(item.id).forEach((idea) => db.labs.update(idea.id, { labProjectId: null }));
      },
    },
    issues: {
      prepareCreate(payload) { return assignCollectionKey('issues', payload); },
      prepareUpdate(current, payload) { return { ...payload, issueKey: current.issueKey || assignCollectionKey('issues', {}).issueKey }; },
      afterCreate(item, user) { notifyIssueCreated(db, user, item); },
    },
    meetings: {
      prepareCreate(payload) { return assignCollectionKey('meetings', payload); },
      prepareUpdate(current, payload) {
        return { ...payload, meetingKey: current.meetingKey || assignCollectionKey('meetings', {}).meetingKey, ...(current.autoRecurring ? { autoRecurring: false } : {}) };
      },
      afterSave(item, user) { syncRecurringMeetingsForMeeting(item, user); },
      cleanup(item, user) { syncRecurringMeetingsForMeeting(item, user); },
    },
    processes: {
      prepareCreate(payload) { return assignCollectionKey('processes', payload); },
      prepareUpdate(current, payload) { return { ...payload, processKey: current.processKey || assignCollectionKey('processes', {}).processKey }; },
    },
    agreements: {
      prepareCreate(payload) { return assignCollectionKey('agreements', payload); },
      prepareUpdate(current, payload) { return { ...payload, agreementKey: current.agreementKey || assignCollectionKey('agreements', {}).agreementKey }; },
    },
    goals: {
      prepareCreate(payload) { return assignCollectionKey('goals', canonicalGoalPayload(payload)); },
      prepareUpdate(current, payload) { return { ...canonicalGoalPayload(payload), goalKey: current.goalKey || assignCollectionKey('goals', {}).goalKey }; },
    },
    tools: {
      prepareCreate(payload) { return assignCollectionKey('tools', payload); },
      prepareUpdate(current, payload) { return { ...payload, toolKey: current.toolKey || assignCollectionKey('tools', {}).toolKey }; },
    },
    kbDocs: {
      prepareCreate(payload) { return payload.contentHtml === undefined ? payload : { ...payload, contentHtml: sanitizeKnowledgeHtmlServer(payload.contentHtml) }; },
      prepareUpdate(current, payload) { return payload.contentHtml === undefined ? payload : { ...payload, contentHtml: sanitizeKnowledgeHtmlServer(payload.contentHtml) }; },
    },
    journal: {
      prepareCreate(payload) { return assignCollectionKey('journal', payload); },
      prepareUpdate(current, payload) {
        return { ...payload, noteKey: current.noteKey || assignCollectionKey('journal', {}).noteKey, authorUserId: current.authorUserId };
      },
    },
    people: {
      prepareCreate(payload, user) {
        const next = { ...payload };
        if (next.type === 'team') {
          next.teamLeadId = user.personId || null;
          next.oneOnOneEveryMonths = Math.max(0, Number(next.oneOnOneEveryMonths ?? 1));
          next.prEveryMonths = Math.max(0, Number(next.prEveryMonths ?? 3));
        }
        return next;
      },
      prepareUpdate(current, payload, user) {
        let next = { ...payload };
        if (isTeamlead(user) && !canManageCollection('people', user)) {
          if (!teamleadOwnsPerson(current, user) && current.id !== user.personId) fail(403, 'forbidden');
          next = { ...next, teamLeadId: current.id === user.personId ? current.teamLeadId : user.personId };
        } else if (!canManageCollection('people', user)) next = memberPersonPatch(next);
        if (current.type === 'team') {
          if (!next.teamLeadId) {
            const linkedUser = db.auth.users.all().find((u) => u.active && u.personId === current.id && isTeamlead(u));
            if (linkedUser) next.teamLeadId = current.id;
          }
          if (next.oneOnOneEveryMonths !== undefined) next.oneOnOneEveryMonths = Math.max(0, Number(next.oneOnOneEveryMonths ?? 1));
          if (next.prEveryMonths !== undefined) next.prEveryMonths = Math.max(0, Number(next.prEveryMonths ?? 3));
        }
        return next;
      },
      afterSave(item, user) { if (item.type === 'team') syncRecurringMeetingsForPerson(item.id, user); },
    },
    vacations: {
      prepareCreate(payload, user) {
        if (!canManageCollection('vacations', user) && !user.personId) fail(403, 'forbidden');
        return payload;
      },
      prepareUpdate(current, payload, user) {
        return canManageCollection('vacations', user) ? payload : { ...payload, personId: user.personId };
      },
    },
  };

  const hooks = (name) => lifecycle[name] || {};

  function list(name, user, query = {}) {
    hooks(name).beforeList?.();
    if (name === 'tasks' && query.archived === 'only') {
      return db.tasks.all().filter((item) => Boolean(item.archivedAt) && canReadItem('tasks', item, user)).map((item) => sanitizeItem('tasks', item, user));
    }
    if (name === 'tasks' && (query.includeArchived === '1' || query.includeArchived === 'true')) return visibleItems(name, user, { includeArchived: true });
    return visibleItems(name, user);
  }

  function get(name, id, user) {
    const item = resolveEntity(name, id);
    if (!item) fail(404, 'not_found');
    if (!canReadItem(name, item, user)) fail(403, 'forbidden');
    return sanitizeItem(name, item, user);
  }

  function createTaskCopies(payload, user) {
    const assigneeIds = Array.isArray(payload.assigneeIds) ? [...new Set(payload.assigneeIds.filter(Boolean))] : [];
    if (assigneeIds.length <= 1) return null;
    return db.transaction(() => {
      const taskGroupId = makeTaskGroupId();
      const copies = assigneeIds.map((assigneeId, index) => db.tasks.create(assignTaskKey({ ...payload, assigneeIds: [assigneeId], taskGroupId, taskGroupIndex: index })));
      copies.forEach((copy) => { recordCreate('tasks', copy, user); notifyTaskAssigned(db, user, copy); });
      return { ...copies[0], copies };
    });
  }

  function create(name, input, user) {
    if (!canCreate(name, user, input)) fail(403, 'forbidden');
    let payload = withOwnership(name, input, user);
    payload = hooks(name).prepareCreate?.(payload, user) || payload;
    if (name === 'tasks') {
      const expanded = createTaskCopies(payload, user);
      if (expanded) return expanded;
    }
    if (SLUG_COLLECTIONS[name] && !payload.slug) payload.slug = uniqueSlug(name, SLUG_COLLECTIONS[name](payload));
    return db.transaction(() => {
      const item = db[name].create(payload);
      recordCreate(name, item, user);
      hooks(name).afterCreate?.(item, user);
      if (!(name === 'meetings' && item.autoRecurring)) hooks(name).afterSave?.(item, user);
      return sanitizeItem(name, item, user);
    });
  }

  function updateTaskCopies(current, requestBody, user) {
    const requested = Array.isArray(requestBody.assigneeIds) ? [...new Set(requestBody.assigneeIds.filter(Boolean))] : null;
    if (!requested) return null;
    return db.transaction(() => {
      const currentPersonId = (current.assigneeIds || [])[0] || null;
      const related = current.taskGroupId ? db.tasks.related(current.taskGroupId) : [current];
      const siblings = related.filter((task) => task.id !== current.id);
      const alreadyAssigned = new Set(related.flatMap((task) => task.assigneeIds || []).filter(Boolean));
      const siblingAssigned = new Set(siblings.flatMap((task) => task.assigneeIds || []).filter(Boolean));
      let primaryPersonId = currentPersonId;
      if (!primaryPersonId || !requested.includes(primaryPersonId)) primaryPersonId = requested[0] || null;
      if (primaryPersonId && siblingAssigned.has(primaryPersonId)) primaryPersonId = null;

      if (!primaryPersonId && current.taskGroupId) {
        db.tasks.remove(current.id);
        db.versions.removeEntity('tasks', current.id);
        hooks('tasks').cleanup?.(current, user);
        return { deleted: true, id: current.id };
      }

      const extraPeople = requested.filter((id) => id !== primaryPersonId && !alreadyAssigned.has(id));
      let taskGroupId = current.taskGroupId || null;
      if (extraPeople.length && !taskGroupId) taskGroupId = makeTaskGroupId();
      const updatePayload = { ...requestBody, assigneeIds: primaryPersonId ? [primaryPersonId] : [] };
      if (taskGroupId) updatePayload.taskGroupId = taskGroupId;
      delete updatePayload.taskGroupIndex;
      const item = db.tasks.update(current.id, updatePayload);
      recordUpdate('tasks', current, item, user);
      const copies = [];
      for (const personId of extraPeople) {
        const copyPayload = { ...item, assigneeIds: [personId], status: item.status || 'todo', taskGroupId, createdByUserId: user.id };
        delete copyPayload.id; delete copyPayload.createdAt; delete copyPayload.updatedAt; delete copyPayload.taskGroupIndex; delete copyPayload.taskKey;
        const copy = db.tasks.create(assignTaskKey(copyPayload));
        recordCreate('tasks', copy, user);
        notifyTaskAssigned(db, user, copy);
        copies.push(copy);
      }
      return { ...item, copies, createdCopies: copies.length };
    });
  }

  function update(name, id, input, user) {
    const current = resolveEntity(name, id);
    if (!current) fail(404, 'not_found');
    if (!canUpdate(name, current, user)) fail(403, 'forbidden');
    let payload = hooks(name).prepareUpdate?.(current, { ...input }, user) || { ...input };
    if (OWNER_COLLECTIONS.includes(name)) payload.createdByUserId = current.createdByUserId || user.id;
    if (name === 'tasks') {
      const expanded = updateTaskCopies(current, payload, user);
      if (expanded) return expanded;
    }
    return db.transaction(() => {
      const item = db[name].update(current.id, payload);
      recordUpdate(name, current, item, user);
      hooks(name).afterUpdate?.(current, item, user);
      hooks(name).afterSave?.(item, user);
      return sanitizeItem(name, item, user);
    });
  }

  function remove(name, id, user) {
    const item = resolveEntity(name, id);
    if (!item) fail(404, 'not_found');
    if (!canDelete(name, item, user)) fail(403, 'forbidden');
    db.transaction(() => {
      db[name].remove(item.id);
      if (isVersioned(name, item)) db.versions.removeEntity(name, item.id);
      hooks(name).cleanup?.(item, user);
    });
  }

  return { list, get, create, update, remove };
}

module.exports = { ApplicationError, createResourceService };
