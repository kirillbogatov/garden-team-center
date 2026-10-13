'use strict';

module.exports = function createEntityIdentifiers({ db, nextNumericKey }) {
  const SLUG_COLLECTIONS = {
    people: (item) => item.name,
    projects: (item) => item.name,
    kbDocs: (item) => item.title,
  };

  const KEY_SPECS = {
    issues: { field: 'issueKey', prefix: 'ISSUE' },
    processes: { field: 'processKey', prefix: 'PROCESS' },
    agreements: { field: 'agreementKey', prefix: 'AGREE' },
    goals: { field: 'goalKey', prefix: 'GOAL' },
    journal: { field: 'noteKey', prefix: 'NOTE' },
    tools: { field: 'toolKey', prefix: 'TOOL' },
    meetings: { field: 'meetingKey', prefix: 'MEET' },
  };

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
      db[name].all().filter((item) => item.id !== excludeId).map((item) => item.slug).filter(Boolean),
    );
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  function findByField(collection, field, ref) {
    const key = String(ref || '').trim().toUpperCase();
    return db[collection].all().find((item) => String(item[field] || '').trim().toUpperCase() === key) || null;
  }

  function resolveEntity(name, ref) {
    const byId = db[name].get(ref);
    if (byId) return byId;

    if (name === 'tasks') return findByField('tasks', 'taskKey', ref);
    if (name === 'projects') {
      return findByField('projects', 'projectKey', ref)
        || db.projects.all().find((item) => item.slug === ref) || null;
    }
    if (name === 'labs') {
      const key = String(ref || '').trim().toUpperCase();
      return db.labs.all().find((item) => String(item.entityType === 'idea' ? item.ideaKey : item.blueprintKey || '').toUpperCase() === key) || null;
    }
    if (KEY_SPECS[name]) return findByField(name, KEY_SPECS[name].field, ref);
    if (!SLUG_COLLECTIONS[name]) return null;
    return db[name].all().find((item) => item.slug === ref) || null;
  }

  function normalizeProjectKey(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }

  function deriveProjectKey(project) {
    const translit = slugify(project?.name || project?.slug || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    return (translit.slice(0, 4) || 'PRJ').slice(0, 4);
  }

  function uniqueProjectKey(project, excludeId) {
    const used = new Set(db.projects.all()
      .filter((item) => item.id !== excludeId)
      .map((item) => normalizeProjectKey(item.projectKey))
      .filter(Boolean));
    const requested = normalizeProjectKey(project?.projectKey);
    const base = requested || deriveProjectKey(project);
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n += 1) {
      const suffix = String(n);
      const candidate = `${base.slice(0, Math.max(1, 4 - suffix.length))}${suffix}`.slice(0, 4);
      if (!used.has(candidate)) return candidate;
    }
    throw new Error('project_key_space_exhausted');
  }

  function validateProjectKey(dbRef, payload, excludeId, { autoGenerate = false } = {}) {
    const raw = String(payload?.projectKey || '').trim();
    const requested = normalizeProjectKey(raw);
    const duplicate = (code) => dbRef.projects.all().some(
      (project) => project.id !== excludeId && normalizeProjectKey(project.projectKey) === code,
    );
    if (!raw && autoGenerate) return { code: uniqueProjectKey(payload, excludeId) };
    if (!requested || requested.length > 4 || requested !== raw.toUpperCase().replace(/\s+/g, '')) {
      return { error: 'invalid_project_key', status: 400 };
    }
    if (duplicate(requested)) return { error: 'project_key_exists', status: 409 };
    return { code: requested };
  }

  function taskKeyPrefix(task) {
    if ((task?.taskType || 'standard') === 'development') return 'IPR';
    if (task?.projectId) {
      const project = db.projects.get(task.projectId);
      if (project) return normalizeProjectKey(project.projectKey) || 'GARDEN';
    }
    return 'GARDEN';
  }

  function nextTaskKey(prefix) {
    return nextNumericKey(db.tasks.all(), { prefix: String(prefix || 'GARDEN').toUpperCase(), readKey: (task) => task.taskKey });
  }

  function assignTaskKey(payload) { return { ...(payload || {}), taskKey: nextTaskKey(taskKeyPrefix(payload)) }; }

  function allocateSequencedKey({ metaKey, items, prefix, readKey }) {
    const lastAllocated = db.meta.get(metaKey, '');
    const source = lastAllocated ? [...items, { __lastAllocatedKey: lastAllocated }] : items;
    const key = nextNumericKey(source, {
      prefix,
      readKey: (item) => item.__lastAllocatedKey || readKey(item),
    });
    // Persist the cursor separately from entity rows so deleting the most recent
    // entity never makes its public identifier available for reuse.
    db.meta.set(metaKey, key);
    return key;
  }

  function nextCollectionKey(name) {
    const spec = KEY_SPECS[name];
    if (!spec) throw new Error(`unknown_key_collection_${name}`);
    return allocateSequencedKey({
      metaKey: `public-key-sequence:${spec.prefix}`,
      items: db[name].all(),
      prefix: spec.prefix,
      readKey: (item) => item[spec.field],
    });
  }

  function assignCollectionKey(name, payload) {
    const spec = KEY_SPECS[name];
    return { ...(payload || {}), [spec.field]: nextCollectionKey(name) };
  }

  function nextIdeaKey() {
    return allocateSequencedKey({
      metaKey: 'public-key-sequence:IDEA',
      items: db.labs.all().filter((item) => item.entityType === 'idea'),
      prefix: 'IDEA',
      readKey: (item) => item.ideaKey,
    });
  }
  function nextBlueprintKey() {
    return allocateSequencedKey({
      metaKey: 'public-key-sequence:BLUEPRINT',
      items: db.labs.all().filter((item) => item.entityType !== 'idea'),
      prefix: 'BLUEPRINT',
      readKey: (item) => item.blueprintKey,
    });
  }
  function assignLabKey(payload) {
    return payload?.entityType === 'idea'
      ? { ...(payload || {}), ideaKey: nextIdeaKey() }
      : { ...(payload || {}), blueprintKey: nextBlueprintKey() };
  }



  return {
    SLUG_COLLECTIONS,
    KEY_SPECS,
    slugify,
    uniqueSlug,
    resolveEntity,
    normalizeProjectKey,
    uniqueProjectKey,
    validateProjectKey,
    taskKeyPrefix,
    nextTaskKey,
    assignTaskKey,
    nextCollectionKey,
    assignCollectionKey,
    nextIdeaKey,
    nextBlueprintKey,
    assignLabKey,
  };
};
