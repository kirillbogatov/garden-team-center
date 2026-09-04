'use strict';

const { recordCreate: recordVersionCreate, recordUpdate: recordVersionUpdate } = require('../versioning');

module.exports = function registerCrudRoutes(app, deps) {
  const { COLLECTIONS, db, autoArchiveCompletedTasks, canReadItem, sanitizeItem, visibleItems, resolveEntity, denied, canCreate, withOwnership, taskLifecyclePatch, sanitizeKnowledgeHtmlServer, isTeamlead, canManageCollection, normalizeProjectTaskCode, uniqueProjectTaskCode, syncJournalDerivedEntity, assignTaskKey, SLUG_COLLECTIONS, uniqueSlug, nextLabKey, syncRecurringMeetingsForPerson, syncRecurringMeetingsForMeeting, canUpdate, nextTaskKey, taskKeyPrefix, teamleadOwnsPerson, memberPersonPatch, OWNER_COLLECTIONS, canDelete, assignMeetingKey, nextMeetingKey, assignProcessKey, nextProcessKey } = deps;

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
      prepareCreate: (payload) => payload.entityType === 'idea' ? payload : { ...payload, labKey: nextLabKey() },
      prepareUpdate: (current, payload) => current.entityType === 'idea' ? payload : { ...payload, labKey: current.labKey || nextLabKey() },
      cleanup: (item) => {
        db.comments.related(`lab:${item.id}`).forEach((comment) => db.comments.remove(comment.id));
        if (item.entityType !== 'idea') db.labs.related(item.id).forEach((idea) => db.labs.update(idea.id, { labProjectId: null }));
      },
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
      if (!canCreate(name, user)) return denied(res);
      let payload = withOwnership(name, req.body, user);
      if (name === 'projects') delete payload.startDate;
      if (name === 'tasks') payload = taskLifecyclePatch(null, payload);
      if (name === 'kbDocs' && payload.contentHtml !== undefined) payload.contentHtml = sanitizeKnowledgeHtmlServer(payload.contentHtml);
  
      if (name === 'people') {
        if (isTeamlead(user) && !canManageCollection('people', user)) {
          if (payload.type !== 'team' || !user.personId) return denied(res);
        }
        if (payload.type === 'team') {
          // Тимлид фиксируется в момент создания: это сотрудник, от чьего имени создают карточку.
          // Поля выбора тимлида в интерфейсе больше нет.
          payload.teamLeadId = user.personId || null;
          payload.oneOnOneEveryMonths = Math.max(0, Number(payload.oneOnOneEveryMonths ?? 1));
          payload.prEveryMonths = Math.max(0, Number(payload.prEveryMonths ?? 3));
        }
      }
  
      if (name === 'projects') {
        const requestedCode = normalizeProjectTaskCode(payload.taskCode);
        if (payload.taskCode && requestedCode.length !== 4) return res.status(400).json({ error: 'invalid_project_task_code' });
        payload.taskCode = requestedCode || uniqueProjectTaskCode(payload, null);
        const duplicate = db.projects.all().some((project) => normalizeProjectTaskCode(project.taskCode) === payload.taskCode);
        if (duplicate) return res.status(409).json({ error: 'project_task_code_exists' });
      }
  
      if (name === 'journal') {
        const journal = syncJournalDerivedEntity(db.journal.create(payload), user);
        return res.status(201).json(journal);
      }
  
      if (name === 'vacations' && !canManageCollection('vacations', user) && !user.personId) return denied(res);
  
      // Для нескольких исполнителей создаём независимый экземпляр задачи на каждого.
      if (name === 'tasks') {
        const assigneeIds = Array.isArray(payload.assigneeIds) ? [...new Set(payload.assigneeIds.filter(Boolean))] : [];
        if (assigneeIds.length > 1) {
          const taskGroupId = `tgrp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          const copies = assigneeIds.map((assigneeId, index) => db.tasks.create(assignTaskKey({
            ...payload,
            assigneeIds: [assigneeId],
            taskGroupId,
            taskGroupIndex: index,
          })));
          copies.forEach((copy) => recordVersionedCreate('tasks', copy, user));
          return res.status(201).json({ ...copies[0], copies });
        }
      }
      if (SLUG_COLLECTIONS[name] && !payload.slug) payload.slug = uniqueSlug(name, SLUG_COLLECTIONS[name](payload));
      payload = configFor(name).prepareCreate?.(payload) || payload;
      const item = db[name].create(payload);
      recordVersionedCreate(name, item, user);
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
        const patch = { ...req.body, authorUserId: current.authorUserId };
        const updated = db.journal.update(req.params.id, patch);
        return res.json(syncJournalDerivedEntity(updated, user));
      }
  
      let requestBody = { ...req.body };
      if (name === 'projects') delete requestBody.startDate;
      if (name === 'kbDocs' && requestBody.contentHtml !== undefined) requestBody.contentHtml = sanitizeKnowledgeHtmlServer(requestBody.contentHtml);
      if (name === 'projects' && requestBody.taskCode !== undefined) {
        const taskCode = normalizeProjectTaskCode(requestBody.taskCode);
        if (taskCode.length !== 4) return res.status(400).json({ error: 'invalid_project_task_code' });
        const duplicate = db.projects.all().some((project) => project.id !== current.id && normalizeProjectTaskCode(project.taskCode) === taskCode);
        if (duplicate) return res.status(409).json({ error: 'project_task_code_exists' });
        requestBody.taskCode = taskCode;
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
          const alreadyAssigned = new Set(related.flatMap((t) => t.assigneeIds || []).filter(Boolean));
          let primaryPersonId = currentPersonId;
          if (!primaryPersonId || !requested.includes(primaryPersonId)) primaryPersonId = requested[0] || null;
  
          const extraPeople = requested.filter((id) => id !== primaryPersonId && !alreadyAssigned.has(id));
          let taskGroupId = current.taskGroupId || null;
          if (extraPeople.length && !taskGroupId) taskGroupId = `tgrp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  
          const updatePayload = { ...requestBody, assigneeIds: primaryPersonId ? [primaryPersonId] : [] };
          if (taskGroupId) updatePayload.taskGroupId = taskGroupId;
          delete updatePayload.taskGroupIndex;
          const item = db.tasks.update(req.params.id, updatePayload);
          recordVersionedUpdate('tasks', current, item, user);
          const copies = [];
          for (const personId of extraPeople) {
            const copyPayload = { ...item, assigneeIds: [personId], status: item.status || 'todo', taskGroupId, createdByUserId: user.id };
            delete copyPayload.id; delete copyPayload.createdAt; delete copyPayload.updatedAt; delete copyPayload.taskGroupIndex; delete copyPayload.taskKey;
            const copy = db.tasks.create(assignTaskKey(copyPayload));
            recordVersionedCreate('tasks', copy, user);
            copies.push(copy);
          }
          return res.json({ ...item, copies, createdCopies: copies.length });
        }
      }
  
      const item = db[name].update(req.params.id, requestBody);
      recordVersionedUpdate(name, current, item, user);
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
