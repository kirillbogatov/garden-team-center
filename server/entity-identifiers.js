'use strict';

module.exports = function createEntityIdentifiers({ db, nextNumericKey }) {
  const SLUG_COLLECTIONS = {
    people: (item) => item.name,
    projects: (item) => item.name,
    goals: (item) => item.title,
    kbDocs: (item) => item.title,
  };

  // Транслитерация кириллицы в латиницу для человекочитаемых URL-слагов.
  const CYRILLIC_TO_LATIN = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };

  function slugify(value) {
    const raw = String(value || '').trim().toLowerCase();
    const translit = [...raw].map((ch) => (CYRILLIC_TO_LATIN[ch] !== undefined ? CYRILLIC_TO_LATIN[ch] : ch)).join('');
    return translit
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'item';
  }

  function uniqueSlug(name, label, excludeId) {
    const base = slugify(label);
    const used = new Set(
      db[name].all()
        .filter((item) => item.id !== excludeId)
        .map((item) => item.slug)
        .filter(Boolean),
    );
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  function ensureSlugs() {
    for (const [name, labelOf] of Object.entries(SLUG_COLLECTIONS)) {
      for (const item of db[name].all()) {
        if (!item.slug) db[name].update(item.id, { slug: uniqueSlug(name, labelOf(item), item.id) });
      }
    }
  }

  /** Looks up a collection item by whichever public reference the caller has: internal id,
   * a human-readable entity key (TASK-1, MEET-1, PROCESS-1), or a slug. */
  function resolveEntity(name, ref) {
    const byId = db[name].get(ref);
    if (byId) return byId;

    function findByKey(collection, keyField) {
      const key = String(ref || '').trim().toUpperCase();
      return db[collection].all().find((item) => String(item[keyField] || '').toUpperCase() === key) || null;
    }

    if (name === 'tasks') {
      return findByKey('tasks', 'taskKey');
    }
    if (name === 'labs') {
      // Idea-type lab rows never get a labKey (see ensureLabKeys), so a bare
      // idea can't be resolved by key here — only by id.
      const key = String(ref || '').trim().toUpperCase();
      return db.labs.all().find((item) => item.entityType !== 'idea' && String(item.labKey || '').toUpperCase() === key) || null;
    }
    if (name === 'meetings') {
      return findByKey('meetings', 'meetingKey');
    }
    if (name === 'processes') {
      return findByKey('processes', 'processKey');
    }
    if (!SLUG_COLLECTIONS[name]) return null;
    return db[name].all().find((item) => item.slug === ref) || null;
  }

  function normalizeProjectTaskCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  }

  function deriveProjectTaskCode(project) {
    const translit = slugify(project?.name || project?.slug || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const letters = translit.replace(/[^A-Z]/g, '');
    return (letters.slice(0, 4) || 'PRJT').padEnd(4, 'X').slice(0, 4);
  }

  function uniqueProjectTaskCode(project, excludeId) {
    const used = new Set(
      db.projects.all()
        .filter((item) => item.id !== excludeId)
        .map((item) => normalizeProjectTaskCode(item.taskCode))
        .filter(Boolean),
    );
    const base = normalizeProjectTaskCode(project?.taskCode) || deriveProjectTaskCode(project);
    if (!used.has(base)) return base;
    const stem = base.slice(0, 3);
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const candidate = `${stem}${ch}`;
      if (!used.has(candidate)) return candidate;
    }
    return 'PRJT';
  }
  /** Normalizes, length-checks and dedupe-checks a project's taskCode. Used by both the
   * projects POST and PUT handlers in routes/crud.js, which previously duplicated this
   * logic independently.
   *
   * - autoGenerate:false (PUT/update): taskCode must already be a full valid code —
   *   returns { error, status } on an invalid or duplicate code, else { code }.
   * - autoGenerate:true (POST/create): an empty/missing taskCode is filled in with a
   *   freshly derived unique one instead of erroring. */
  function validateProjectTaskCode(db, payload, excludeId, { autoGenerate = false } = {}) {
    const requested = normalizeProjectTaskCode(payload?.taskCode);
    const isDuplicate = (code) => db.projects.all().some(
      (project) => project.id !== excludeId && normalizeProjectTaskCode(project.taskCode) === code,
    );

    if (autoGenerate) {
      if (payload?.taskCode && requested.length !== 4) return { error: 'invalid_project_task_code', status: 400 };
      const code = requested || uniqueProjectTaskCode(payload, excludeId);
      if (isDuplicate(code)) return { error: 'project_task_code_exists', status: 409 };
      return { code };
    }

    if (requested.length !== 4) return { error: 'invalid_project_task_code', status: 400 };
    if (isDuplicate(requested)) return { error: 'project_task_code_exists', status: 409 };
    return { code: requested };
  }

  function ensureProjectTaskCodes() {
    for (const project of db.projects.all()) {
      const current = normalizeProjectTaskCode(project.taskCode);
      const duplicate = current && db.projects.all().some((other) => other.id !== project.id && normalizeProjectTaskCode(other.taskCode) === current);
      if (current.length === 4 && !duplicate) continue;
      db.projects.update(project.id, { taskCode: uniqueProjectTaskCode(project, project.id) });
    }
  }

  function taskKeyPrefix(task) {
    if ((task?.taskType || 'standard') === 'development') return 'IPR';
    if (task?.projectId) {
      const project = db.projects.get(task.projectId);
      if (project) return normalizeProjectTaskCode(project.taskCode) || deriveProjectTaskCode(project);
    }
    return 'GARDEN';
  }

  function nextTaskKey(prefix) {
    const cleanPrefix = String(prefix || 'GARDEN').toUpperCase();
    return nextNumericKey(db.tasks.all(), { prefix: cleanPrefix, readKey: (task) => task.taskKey });
  }

  function assignTaskKey(payload) {
    return { ...(payload || {}), taskKey: nextTaskKey(taskKeyPrefix(payload)) };
  }

  function nextLabKey() {
    return nextNumericKey(db.labs.all().filter((lab) => lab.entityType !== 'idea'), { prefix: 'LAB', readKey: (lab) => String(lab.labKey || '') });
  }

  function nextMeetingKey() {
    return nextNumericKey(db.meetings.all(), { prefix: 'MEET', readKey: (meeting) => String(meeting.meetingKey || '') });
  }

  function assignMeetingKey(payload) {
    return { ...(payload || {}), meetingKey: nextMeetingKey() };
  }

  function nextProcessKey() {
    return nextNumericKey(db.processes.all(), { prefix: 'PROCESS', readKey: (process) => String(process.processKey || '') });
  }

  function assignProcessKey(payload) {
    return { ...(payload || {}), processKey: nextProcessKey() };
  }

  /** Shared backfill loop for the ensure*Keys functions below: walks `items`,
   * leaves an already-valid, not-yet-seen key alone, and assigns+persists a
   * freshly generated one (via `computeNext`) otherwise — so every item ends
   * up with a unique key. `isValid` defaults to "any non-empty key". */
  function ensureUniqueKeys(items, { currentKey, computeNext, applyKey, isValid = (key) => Boolean(key) }) {
    const used = new Set();
    for (const item of items) {
      const current = String(currentKey(item) || '').trim().toUpperCase();
      if (isValid(current) && !used.has(current)) {
        used.add(current);
        continue;
      }
      const key = computeNext(item);
      applyKey(item, key);
      used.add(key);
    }
  }

  function ensureLabKeys() {
    ensureUniqueKeys(db.labs.all().filter((lab) => lab.entityType !== 'idea'), {
      currentKey: (lab) => lab.labKey,
      isValid: (key) => /^LAB-\d{4,}$/.test(key),
      computeNext: () => nextLabKey(),
      applyKey: (lab, labKey) => db.labs.update(lab.id, { labKey }),
    });
  }

  function ensureTaskKeys() {
    ensureUniqueKeys(db.tasks.all(), {
      currentKey: (task) => task.taskKey,
      computeNext: (task) => nextTaskKey(taskKeyPrefix(task)),
      applyKey: (task, taskKey) => db.tasks.update(task.id, { taskKey }),
    });
  }

  function ensureMeetingKeys() {
    ensureUniqueKeys(db.meetings.all(), {
      currentKey: (meeting) => meeting.meetingKey,
      isValid: (key) => /^MEET-\d{4,}$/.test(key),
      computeNext: () => nextMeetingKey(),
      applyKey: (meeting, meetingKey) => db.meetings.update(meeting.id, { meetingKey }),
    });
  }

  function ensureProcessKeys() {
    ensureUniqueKeys(db.processes.all(), {
      currentKey: (process) => process.processKey,
      isValid: (key) => /^PROCESS-\d{4,}$/.test(key),
      computeNext: () => nextProcessKey(),
      applyKey: (process, processKey) => db.processes.update(process.id, { processKey }),
    });
  }

  return {
    SLUG_COLLECTIONS,
    slugify,
    uniqueSlug,
    resolveEntity,
    normalizeProjectTaskCode,
    uniqueProjectTaskCode,
    validateProjectTaskCode,
    ensureSlugs,
    ensureProjectTaskCodes,
    taskKeyPrefix,
    nextTaskKey,
    assignTaskKey,
    nextLabKey,
    ensureLabKeys,
    ensureTaskKeys,
    nextMeetingKey,
    assignMeetingKey,
    ensureMeetingKeys,
    nextProcessKey,
    assignProcessKey,
    ensureProcessKeys,
  };
};
