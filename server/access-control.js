'use strict';

module.exports = function createAccessControl({ db, isAdmin, isManager, isTeamlead, hasPermission, accessLevel, accessCapabilities }) {
  const OWNER_COLLECTIONS = [
    'projects', 'goals', 'tasks', 'issues', 'meetings', 'agreements', 'tools', 'processes',
    'vacations', 'kbFolders', 'kbDocs', 'docFolders', 'toolFolders', 'labs', 'checkins', 'technologyEvents',
  ];
  const MEMBER_PERSON_FIELDS = new Set([
    'email', 'telegram', 'birthday', 'city', 'timezone', 'workStart', 'workEnd', 'tags', 'grade',
    'strengthsLikes', 'weaknessesDislikes', 'developmentFocus', 'developmentNextStep',
    'iprUrl', 'skillsetUrl', 'oneOnOneEveryMonths', 'prEveryMonths',
  ]);

  function owns(item, user) {
    return Boolean(item && user && item.createdByUserId === user.id);
  }

  function journalOwned(item, user) {
    return Boolean(item && user && item.authorUserId === user.id);
  }

  function linkedToPerson(item, personId, fields) {
    if (!item || !personId) return false;
    return fields.some((field) => Array.isArray(item[field]) && item[field].includes(personId));
  }

  // NOTE: the 'checkins':'checkins' entry's exact spacing (no space after the
  // colon) is pinned by test/architecture.test.js — keep this object compact
  // rather than reformatting it to one-key-per-line.
  function accessAreaForCollection(name) {
    return ({
      people:'people', projects:'projects', goals:'goals', tasks:'tasks', meetings:'meetings', issues:'issues', agreements:'agreements', journal:'journal', labs:'labs',
      tools:'knowledge', kbDocs:'knowledge', kbFolders:'knowledge', docFolders:'knowledge', toolFolders:'knowledge',
      processes:'processes', vacations:'vacations', checkins:'checkins', technologyEvents:'labs',
    })[name] || null;
  }

  function levelForCollection(name, user) {
    const area = accessAreaForCollection(name);
    return area ? accessLevel(user, area) : 'all_read';
  }

  function capabilitiesForCollection(name, user) {
    return accessCapabilities(levelForCollection(name, user));
  }

  function canManageCollection(name, user) {
    return capabilitiesForCollection(name, user).manage >= 2;
  }

  function canManageOwn(name, user) {
    return capabilitiesForCollection(name, user).manage >= 1;
  }

  function canViewAll(name, user) {
    return capabilitiesForCollection(name, user).view >= 2;
  }

  function teamleadOwnsPerson(person, user) {
    return Boolean(person && user && isTeamlead(user) && user.personId && person.type === 'team' && person.teamLeadId === user.personId);
  }
  // One guard clause per collection, since "own" means something different
  // in each one (author, assignee, participant, ...); falls back to plain
  // createdByUserId ownership for every other collection.
  function isOwnItem(name, item, user) {
    if (!item || !user) return false;
    if (name === 'journal') return journalOwned(item, user);
    if (name === 'people') return Boolean(user.personId && item.type === 'team' && item.id === user.personId);
    if (name === 'projects') return owns(item, user) || linkedToPerson(item, user.personId, ['memberIds']);
    if (name === 'tasks') return owns(item, user) || linkedToPerson(item, user.personId, ['assigneeIds']);
    if (name === 'meetings') return owns(item, user) || linkedToPerson(item, user.personId, ['participantIds']);
    if (name === 'issues') return owns(item, user) || linkedToPerson(item, user.personId, ['relatedPersonIds']);
    if (name === 'agreements') return owns(item, user) || linkedToPerson(item, user.personId, ['withPersonIds']);
    if (name === 'vacations') return Boolean(user.personId && item.personId === user.personId);
    if (name === 'checkins') return owns(item, user) || Boolean(user.personId && item.personId === user.personId);
    if (name === 'labs') return owns(item, user) || Boolean(user.personId && item.authorId === user.personId);
    return owns(item, user);
  }

  function canReadItem(name, item, user) {
    if (!item || !user) return false;
    const caps = capabilitiesForCollection(name, user);
    if (caps.view <= 0) return false;
    // Журнал — личное пространство: запись видна только автору (и администратору),
    // даже если роль пользователя в остальном имеет доступ "просмотр всех" к журналу.
    // Структурированные записи (проблемы/договорённости/идеи) всё равно попадают
    // в командные разделы через синхронизацию — там обычная видимость сохраняется.
    if (name === 'journal') return isOwnItem(name, item, user) || isAdmin(user);
    // Элементы Мастерской с видимостью "Только я" доступны только владельцу
    // и администратору. Командные элементы подчиняются обычным правам раздела.
    if (name === 'labs' && item.visibility === 'me') return isOwnItem(name, item, user) || isAdmin(user);
    return caps.view >= 2 || isOwnItem(name, item, user) || isAdmin(user);
  }

  function sanitizeItem(name, item, user) {
    if (!item) return item;
    if (name === 'people' && !canManageCollection('people', user)) {
      const copy = { ...item };
      if (!isOwnItem('people', item, user) && !teamleadOwnsPerson(item, user)) delete copy.notes;
      return copy;
    }
    return item;
  }

  function visibleItems(name, user, opts = {}) {
    let items = db[name].all().filter((item) => canReadItem(name, item, user));
    if ((name === 'tasks' || name === 'projects') && !opts.includeArchived) items = items.filter((item) => !item.archivedAt);
    return items.map((item) => sanitizeItem(name, item, user));
  }

  function memberPersonPatch(body) {
    const out = {};
    for (const [key, value] of Object.entries(body || {})) {
      if (MEMBER_PERSON_FIELDS.has(key)) out[key] = value;
    }
    return out;
  }

  function canCreate(name, user, payload) {
    const caps = capabilitiesForCollection(name, user);
    if (caps.manage < 1) return false;
    if (name === 'people') {
      if (caps.manage >= 2) return true;
      // A teamlead limited to "manage own" access on people still needs to be
      // able to onboard a new team-member card under their own leadership
      // (payload.teamLeadId is stamped to user.personId on create — see the
      // 'people' POST handler in routes/crud.js). Nothing else is allowed
      // through this carve-out: not other people's cards, not non-team people,
      // and no other collection gets an equivalent exception.
      return Boolean(isTeamlead(user) && payload && payload.type === 'team' && user.personId);
    }
    // NOTE: architecture.test.js pins this as one `new Set([...]).has(name)`
    // expression (no intervening statement) — keep the Set inline here.
    return new Set([
      'projects', 'goals', 'tasks', 'issues', 'meetings', 'journal', 'agreements', 'tools',
      'processes', 'vacations', 'kbDocs', 'kbFolders', 'docFolders', 'toolFolders', 'labs',
      'checkins', 'technologyEvents',
    ]).has(name);
  }

  function canUpdate(name, item, user) {
    const caps = capabilitiesForCollection(name, user);
    if (caps.manage <= 0) return false;
    if (caps.manage >= 2) return true;
    return isOwnItem(name, item, user);
  }

  function canDelete(name, item, user) {
    const caps = capabilitiesForCollection(name, user);
    if (caps.manage <= 0) return false;
    if (name === 'people') return caps.manage >= 2 && isAdmin(user);
    if (caps.manage >= 2) return true;
    return isOwnItem(name, item, user);
  }
  function denied(res) {
    return res.status(403).json({ error: 'forbidden' });
  }

  function withOwnership(name, body, user) {
    const payload = { ...(body || {}) };
    if (name === 'journal') payload.authorUserId = user.id;
    else if (OWNER_COLLECTIONS.includes(name)) payload.createdByUserId = user.id;
    if (name === 'vacations' && !canManageCollection('vacations', user)) payload.personId = user.personId;
    return payload;
  }

  return {
    OWNER_COLLECTIONS,
    canManageCollection,
    canManageOwn,
    canViewAll,
    canReadItem,
    sanitizeItem,
    visibleItems,
    memberPersonPatch,
    teamleadOwnsPerson,
    isOwnItem,
    canCreate,
    canUpdate,
    canDelete,
    denied,
    withOwnership,
    levelForCollection,
  };
};
