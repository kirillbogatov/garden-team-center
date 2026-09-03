'use strict';

module.exports = function createEntityIdentifiers({ db, nextNumericKey }) {
  const SLUG_COLLECTIONS = {
    people: (item) => item.name,
    projects: (item) => item.name,
    goals: (item) => item.title,
    kbDocs: (item) => item.title,
  };

  function slugify(value) {
    const map = {
      а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
      к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
      х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
    };
    const raw = String(value || '').trim().toLowerCase();
    const translit = [...raw].map((ch) => map[ch] !== undefined ? map[ch] : ch).join('');
    return translit.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'item';
  }
  function uniqueSlug(name, label, excludeId) {
    const base = slugify(label);
    const used = new Set(db[name].all().filter((item) => item.id !== excludeId).map((item) => item.slug).filter(Boolean));
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }
  function ensureSlugs() {
    for (const [name, labelOf] of Object.entries(SLUG_COLLECTIONS)) {
      for (const item of db[name].all()) if (!item.slug) db[name].update(item.id, { slug: uniqueSlug(name, labelOf(item), item.id) });
    }
  }
  function resolveEntity(name, ref) {
    const byId = db[name].get(ref);
    if (byId) return byId;
    if (name === 'tasks') {
      const key = String(ref || '').trim().toUpperCase();
      return db.tasks.all().find((item) => String(item.taskKey || '').toUpperCase() === key) || null;
    }
    if (name === 'labs') {
      const key = String(ref || '').trim().toUpperCase();
      return db.labs.all().find((item) => item.entityType !== 'idea' && String(item.labKey || '').toUpperCase() === key) || null;
    }
    if (name === 'meetings') {
      const key = String(ref || '').trim().toUpperCase();
      return db.meetings.all().find((item) => String(item.meetingKey || '').toUpperCase() === key) || null;
    }
    if (!SLUG_COLLECTIONS[name]) return null;
    return db[name].all().find((item) => item.slug === ref) || null;
  }
  function normalizeProjectTaskCode(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
  function deriveProjectTaskCode(project) {
    const translit = slugify(project?.name || project?.slug || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const letters = translit.replace(/[^A-Z]/g, '');
    return (letters.slice(0, 4) || 'PRJT').padEnd(4, 'X').slice(0, 4);
  }
  function uniqueProjectTaskCode(project, excludeId) {
    const used = new Set(db.projects.all().filter((item) => item.id !== excludeId).map((item) => normalizeProjectTaskCode(item.taskCode)).filter(Boolean));
    const base = normalizeProjectTaskCode(project?.taskCode) || deriveProjectTaskCode(project);
    if (!used.has(base)) return base;
    const stem = base.slice(0, 3);
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const candidate = `${stem}${ch}`;
      if (!used.has(candidate)) return candidate;
    }
    return 'PRJT';
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
  function assignTaskKey(payload) { return { ...(payload || {}), taskKey: nextTaskKey(taskKeyPrefix(payload)) }; }
  function nextLabKey() {
    return nextNumericKey(db.labs.all().filter((lab) => lab.entityType !== 'idea'), { prefix: 'LAB', readKey: (lab) => String(lab.labKey || '') });
  }
  function ensureLabKeys() {
    const used = new Set();
    for (const lab of db.labs.all()) {
      if (lab.entityType === 'idea') continue;
      const current = String(lab.labKey || '').trim().toUpperCase();
      if (/^LAB-\d{4,}$/.test(current) && !used.has(current)) {
        used.add(current);
        continue;
      }
      const labKey = nextLabKey();
      db.labs.update(lab.id, { labKey });
      used.add(labKey);
    }
  }
  function ensureTaskKeys() {
    const used = new Set();
    for (const task of db.tasks.all()) {
      const current = String(task.taskKey || '').trim().toUpperCase();
      if (current && !used.has(current)) { used.add(current); continue; }
      const taskKey = nextTaskKey(taskKeyPrefix(task));
      db.tasks.update(task.id, { taskKey });
      used.add(taskKey);
    }
  }
  function nextMeetingKey() {
    return nextNumericKey(db.meetings.all(), { prefix: 'MEET', readKey: (meeting) => String(meeting.meetingKey || '') });
  }
  function assignMeetingKey(payload) { return { ...(payload || {}), meetingKey: nextMeetingKey() }; }
  function ensureMeetingKeys() {
    const used = new Set();
    for (const meeting of db.meetings.all()) {
      const current = String(meeting.meetingKey || '').trim().toUpperCase();
      if (/^MEET-\d{4,}$/.test(current) && !used.has(current)) { used.add(current); continue; }
      const meetingKey = nextMeetingKey();
      db.meetings.update(meeting.id, { meetingKey });
      used.add(meetingKey);
    }
  }

  return {
    SLUG_COLLECTIONS, slugify, uniqueSlug, resolveEntity, normalizeProjectTaskCode, uniqueProjectTaskCode,
    ensureSlugs, ensureProjectTaskCodes, taskKeyPrefix, nextTaskKey, assignTaskKey, nextLabKey, ensureLabKeys, ensureTaskKeys,
    nextMeetingKey, assignMeetingKey, ensureMeetingKeys,
  };
};
