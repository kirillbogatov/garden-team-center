'use strict';

const { recordCreate: recordVersionCreate, recordUpdate: recordVersionUpdate } = require('../versioning');
const { notifyTaskAssigned, notifyProjectLoadChanges, notifyIssueCreated, notifyLabCreated } = require('../notifications');

module.exports = function registerCrudRoutes(app, deps) {
  const { COLLECTIONS, db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity, denied, canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead, canManageCollection, validateProjectTaskCode, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, nextLabKey, syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix, teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignMeetingKey, nextMeetingKey, assignProcessKey, nextProcessKey } = deps;

  // ---------- Journal <-> Issues/Labs/Agreements one-way sync ----------
  // A Journal entry can be a plain 'note', or a structured 'problem' / 'idea' /
  // 'agreement' that also gets its own row in the matching team-facing
  // collection (see access-control.js: the Journal itself stays private to its
  // author, but a structured entry's team-facing counterpart follows the usual
  // visibility rules for that collection).
  const JOURNAL_KINDS = new Set(['note', 'problem', 'idea', 'agreement']);

  function titleFromJournalText(text) {
    return String(text || '').trim().slice(0, 140) || 'Без названия';
  }

  function createLinkedIssue(text, user) {
    const issue = db.issues.create({
      title: titleFromJournalText(text),
      description: text,
      status: 'open',
      severity: 'normal',
      relatedPersonIds: user.personId ? [user.personId] : [],
      createdByUserId: user.id,
    });
    notifyIssueCreated(db, user, issue);
    return issue;
  }

  function createLinkedAgreement(text, user) {
    return db.agreements.create({
      text,
      date: new Date().toISOString().slice(0, 10),
      dueDate: null,
      status: 'open',
      withPersonIds: user.personId ? [user.personId] : [],
      createdByUserId: user.id,
    });
  }

  function createLinkedIdea(text, user, isPrivate) {
    const idea = db.labs.create({
      entityType: 'idea',
      title: titleFromJournalText(text),
      description: text,
      authorId: user.personId || null,
      private: Boolean(isPrivate),
      status: 'idea',
      createdByUserId: user.id,
    });
    notifyLabCreated(db, user, idea);
    return idea;
  }

  // The reverse direction: an idea created straight in The Labs (skipping the
  // Journal) still gets a matching Journal entry, so the author's Journal
  // stays a complete personal record either way.
  function mirrorDirectIdeaToJournal(idea, user) {
    db.journal.create({
      text: idea.title || idea.description || '',
      kind: 'idea',
      labId: idea.id,
      issueId: null,
      agreementId: null,
      authorUserId: user.id,
    });
  }

  // Deleting the team-facing counterpart (an issue, an agreement, or an idea)
  // must not delete the personal Journal note that spawned it — only the now
  // dangling link is cleared, so "Открыть" stops pointing at a removed entity.
  function detachJournalLink(field, entityId) {
    db.journal.all()
      .filter((entry) => entry[field] === entityId)
      .forEach((entry) => db.journal.update(entry.id, { [field]: null }));
  }

  const resourceConfig = {
    projects: {
      afterSave: (item, user) => item?.type === 'team' && syncRecurringMeetingsForPerson(item.id, user),
    },
    tasks: {
      beforeList: () => autoArchiveCompletedTasks(),
      prepareCreate: (payload) => assignTaskKey(payload),
      prepareUpdate: (current, payload) => ({ ...payload, taskKey: current.taskKey || nextTaskKey(taskKeyPrefix(current)) }),
      cleanup: (item) => {
        db.comments.related(`task:${item.id}`).forEach((comment) => db.comments.remove(comment.id));
        db.taskNotes.related(item.id).forEach((note) => db.taskNotes.remove(note.id));
      },
    },
    labs: {
      // Ideas don't get a LAB-XXXX key — only actual Labs projects do.
      prepareCreate: (payload) => (payload.entityType === 'idea' ? payload : { ...payload, labKey: nextLabKey() }),
      prepareUpdate: (current, payload) => (current.entityType === 'idea' ? payload : { ...payload, labKey: current.labKey || nextLabKey() }),
      cleanup: (item) => {
        db.comments.related(`lab:${item.id}`).forEach((comment) => db.comments.remove(comment.id));
        if (item.entityType !== 'idea') db.labs.related(item.id).forEach((idea) => db.labs.update(idea.id, { labProjectId: null }));
        else detachJournalLink('labId', item.id);
      },
    },
    issues: {
      cleanup: (item) => detachJournalLink('issueId', item.id),
    },
    agreements: {
      cleanup: (item) => detachJournalLink('agreementId', item.id),
    },
    meetings: {
      prepareCreate: (payload) => assignMeetingKey(payload),
      prepareUpdate: (current, payload) => ({ ...payload, meetingKey: current.meetingKey || nextMeetingKey() }),
      afterSave: (item, user) => syncRecurringMeetingsForMeeting(item, user),
      cleanup: (item, user) => syncRecurringMeetingsForMeeting(item, user),
    },
    processes: {
      prepareCreate: (payload) => assignProcessKey(payload),
      prepareUpdate: (current, payload) => ({ ...payload, processKey: current.processKey || nextProcessKey() }),
    },
  };
  const configFor = (name) => resourceConfig[name] || {};
  // Shared by task creation and update: a fresh id for the group of copies
  // that a multi-assignee task expands into (see both usages below).
  const makeTaskGroupId = () => `tgrp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const isVersioned = (name, item) => name === 'tasks' || name === 'meetings' || (name === 'labs' && item?.entityType !== 'idea');
  const recordVersionedCreate = (name, item, user) => {
    if (!isVersioned(name, item) || !item) return;
    recordVersionCreate(db, name, item, user?.id || null);
  };
  const recordVersionedUpdate = (name, before, after, user) => {
    if (!isVersioned(name, before) || !after) return;
    recordVersionUpdate(db, name, before, after, user?.id || null);
  };
  for (const name of COLLECTIONS) {
    app.get(`/api/${name}`, (req, res) => {
      configFor(name).beforeList?.();
      if (name === 'tasks' && req.query.archived === 'only') {
        const archived = db.tasks.all()
          .filter((item) => Boolean(item.archivedAt) && canReadItem('tasks', item, req.auth.user))
          .map((item) => sanitizeItem('tasks', item, req.auth.user));
        return res.json(archived);
      }
      if (name === 'tasks' && (req.query.includeArchived === '1' || req.query.includeArchived === 'true')) {
        return res.json(visibleItems(name, req.auth.user, { includeArchived: true }));
      }
      res.json(visibleItems(name, req.auth.user));
    });

    app.get(`/api/${name}/:id`, (req, res) => {
      configFor(name).beforeGet?.();
      const item = resolveEntity(name, req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      if (!canReadItem(name, item, req.auth.user)) return denied(res);
      res.json(sanitizeItem(name, item, req.auth.user));
    });

    app.post(`/api/${name}`, (req, res) => {
      const user = req.auth.user;
      if (!canCreate(name, user, req.body)) return denied(res);
      let payload = withOwnership(name, req.body, user);
      if (name === 'projects') delete payload.startDate;
      if (name === 'tasks') payload = taskLifecyclePatch(null, payload);
      if (name === 'kbDocs' && payload.contentHtml !== undefined) payload.contentHtml = sanitizeKnowledgeHtmlServer(payload.contentHtml);

      if (name === 'people') {
        // canCreate() already restricted an own_manage-only teamlead to
        // type:'team' payloads (see access-control.js), so no further gating
        // is needed here.
        if (payload.type === 'team') {
          // Тимлид фиксируется в момент создания: это сотрудник, от чьего имени создают карточку.
          // Поля выбора тимлида в интерфейсе больше нет.
          payload.teamLeadId = user.personId || null;
          payload.oneOnOneEveryMonths = Math.max(0, Number(payload.oneOnOneEveryMonths ?? 1));
          payload.prEveryMonths = Math.max(0, Number(payload.prEveryMonths ?? 3));
        }
      }

      if (name === 'projects') {
        const result = validateProjectTaskCode(db, payload, null, { autoGenerate: true });
        if (result.error) return res.status(result.status).json({ error: result.error });
        payload.taskCode = result.code;
      }

      if (name === 'journal') {
        const kind = JOURNAL_KINDS.has(payload.kind) ? payload.kind : 'note';
        const links = { issueId: null, agreementId: null, labId: null };
        if (kind === 'problem') links.issueId = createLinkedIssue(payload.text, user).id;
        if (kind === 'agreement') links.agreementId = createLinkedAgreement(payload.text, user).id;
        if (kind === 'idea') links.labId = createLinkedIdea(payload.text, user, payload.private).id;
        payload = { ...payload, kind, ...links };
        delete payload.private;
        return res.status(201).json(db.journal.create(payload));
      }

      if (name === 'vacations' && !canManageCollection('vacations', user) && !user.personId) return denied(res);

      // Для нескольких исполнителей создаём независимый экземпляр задачи на каждого.
      if (name === 'tasks') {
        const assigneeIds = Array.isArray(payload.assigneeIds) ? [...new Set(payload.assigneeIds.filter(Boolean))] : [];
        if (assigneeIds.length > 1) {
          const taskGroupId = makeTaskGroupId();
          const copies = assigneeIds.map((assigneeId, index) => db.tasks.create(assignTaskKey({
            ...payload,
            assigneeIds: [assigneeId],
            taskGroupId,
            taskGroupIndex: index,
          })));
          copies.forEach((copy) => { recordVersionedCreate('tasks', copy, user); notifyTaskAssigned(db, user, copy); });
          return res.status(201).json({ ...copies[0], copies });
        }
      }
      if (SLUG_COLLECTIONS[name] && !payload.slug) payload.slug = uniqueSlug(name, SLUG_COLLECTIONS[name](payload));
      payload = configFor(name).prepareCreate?.(payload) || payload;
      const item = db[name].create(payload);
      recordVersionedCreate(name, item, user);
      if (name === 'tasks') notifyTaskAssigned(db, user, item);
      if (name === 'issues') notifyIssueCreated(db, user, item);
      if (name === 'labs') notifyLabCreated(db, user, item);
      if (name === 'labs' && item.entityType === 'idea') mirrorDirectIdeaToJournal(item, user);
      if (name === 'people' && item.type === 'team') syncRecurringMeetingsForPerson(item.id, user);
      if (!(name === 'meetings' && item.autoRecurring)) configFor(name).afterSave?.(item, user);
      res.status(201).json(sanitizeItem(name, item, user));
    });

    app.put(`/api/${name}/:id`, (req, res) => {
      const user = req.auth.user;
      const current = db[name].get(req.params.id);
      if (!current) return res.status(404).json({ error: 'not_found' });
      if (!canUpdate(name, current, user)) return denied(res);

      if (name === 'journal') {
        if (current.kind && current.kind !== 'note') return res.status(404).json({ error: 'not_found' });
        const patch = { ...req.body, kind: 'note', authorUserId: current.authorUserId, issueId: null, agreementId: null, labId: null };
        delete patch.private;
        return res.json(db.journal.update(req.params.id, patch));
      }

      let requestBody = { ...req.body };
      if (name === 'projects') delete requestBody.startDate;
      if (name === 'kbDocs' && requestBody.contentHtml !== undefined) requestBody.contentHtml = sanitizeKnowledgeHtmlServer(requestBody.contentHtml);
      if (name === 'projects' && requestBody.taskCode !== undefined) {
        const result = validateProjectTaskCode(db, requestBody, current.id);
        if (result.error) return res.status(result.status).json({ error: result.error });
        requestBody.taskCode = result.code;
      }
      requestBody = configFor(name).prepareUpdate?.(current, requestBody) || requestBody;
      if (name === 'people' && isTeamlead(user) && !canManageCollection('people', user)) {
        if (!teamleadOwnsPerson(current, user) && current.id !== user.personId) return denied(res);
        requestBody = { ...requestBody, teamLeadId: current.id === user.personId ? current.teamLeadId : user.personId };
      } else if (name === 'people' && !canManageCollection('people', user)) requestBody = memberPersonPatch(requestBody);
      if (name === 'people' && current.type === 'team') {
        if (!requestBody.teamLeadId) {
          const linkedUser = db.auth.users.all().find((u) => u.active && u.personId === current.id && isTeamlead(u));
          if (linkedUser) requestBody.teamLeadId = current.id;
        }
        if (requestBody.oneOnOneEveryMonths !== undefined) requestBody.oneOnOneEveryMonths = Math.max(0, Number(requestBody.oneOnOneEveryMonths ?? 1));
        if (requestBody.prEveryMonths !== undefined) requestBody.prEveryMonths = Math.max(0, Number(requestBody.prEveryMonths ?? 3));
      }
      if (name === 'meetings' && current.autoRecurring) {
        // Как только пользователь редактирует автоматически поставленную встречу, она становится
        // обычной опорной встречей. Garden сразу планирует следующую по выбранной периодичности.
        requestBody.autoRecurring = false;
      }
      if (OWNER_COLLECTIONS.includes(name)) requestBody.createdByUserId = current.createdByUserId || user.id;
      if (name === 'vacations' && !canManageCollection('vacations', user)) requestBody.personId = user.personId;
      if (name === 'tasks') requestBody = taskLifecyclePatch(current, requestBody);

      // Одна задача = один ответственный. При добавлении исполнителей создаются независимые копии.
      if (name === 'tasks') {
        const requested = Array.isArray(requestBody.assigneeIds)
          ? [...new Set(requestBody.assigneeIds.filter(Boolean))]
          : null;

        if (requested) {
          const currentPersonId = (current.assigneeIds || [])[0] || null;
          const related = current.taskGroupId
            ? db.tasks.related(current.taskGroupId)
            : [current];
          const siblings = related.filter((t) => t.id !== current.id);
          const alreadyAssigned = new Set(related.flatMap((t) => t.assigneeIds || []).filter(Boolean));
          const siblingAssigned = new Set(siblings.flatMap((t) => t.assigneeIds || []).filter(Boolean));
          let primaryPersonId = currentPersonId;
          if (!primaryPersonId || !requested.includes(primaryPersonId)) primaryPersonId = requested[0] || null;
          // A sibling copy in the same group already owns this person — this row can't
          // also claim them, so it falls back to "no valid primary person" below.
          if (primaryPersonId && siblingAssigned.has(primaryPersonId)) primaryPersonId = null;

          if (!primaryPersonId && current.taskGroupId) {
            // This copy only exists because it was one member of a multi-assignee
            // group. With no valid assignee left for it, leaving it around as an
            // unassigned duplicate would orphan it forever — delete it instead,
            // mirroring the DELETE /api/tasks/:id handler below (same versioning
            // and cleanup conventions).
            db.tasks.remove(req.params.id);
            if (isVersioned('tasks', current)) db.versions.removeEntity('tasks', current.id);
            configFor('tasks').cleanup?.(current, user);
            return res.status(200).json({ deleted: true, id: req.params.id });
          }

          const extraPeople = requested.filter((id) => id !== primaryPersonId && !alreadyAssigned.has(id));
          let taskGroupId = current.taskGroupId || null;
          if (extraPeople.length && !taskGroupId) taskGroupId = makeTaskGroupId();

          const updatePayload = { ...requestBody, assigneeIds: primaryPersonId ? [primaryPersonId] : [] };
          if (taskGroupId) updatePayload.taskGroupId = taskGroupId;
          delete updatePayload.taskGroupIndex;
          const item = db.tasks.update(req.params.id, updatePayload);
          recordVersionedUpdate('tasks', current, item, user);
          const copies = [];
          for (const personId of extraPeople) {
            const copyPayload = { ...item, assigneeIds: [personId], status: item.status || 'todo', taskGroupId, createdByUserId: user.id };
            delete copyPayload.id;
            delete copyPayload.createdAt;
            delete copyPayload.updatedAt;
            delete copyPayload.taskGroupIndex;
            delete copyPayload.taskKey;
            const copy = db.tasks.create(assignTaskKey(copyPayload));
            recordVersionedCreate('tasks', copy, user);
            notifyTaskAssigned(db, user, copy);
            copies.push(copy);
          }
          return res.json({ ...item, copies, createdCopies: copies.length });
        }
      }

      const item = db[name].update(req.params.id, requestBody);
      recordVersionedUpdate(name, current, item, user);
      if (name === 'projects') notifyProjectLoadChanges(db, user, current, item);
      if (name === 'people' && item.type === 'team') syncRecurringMeetingsForPerson(item.id, user);
      configFor(name).afterSave?.(item, user);
      res.json(sanitizeItem(name, item, user));
    });

    app.delete(`/api/${name}/:id`, (req, res) => {
      const item = db[name].get(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      if (!canDelete(name, item, req.auth.user)) return denied(res);
      db[name].remove(req.params.id);
      if (isVersioned(name, item)) db.versions.removeEntity(name, item.id);
      configFor(name).cleanup?.(item, req.auth.user);
      res.status(204).end();
    });
  }

};
