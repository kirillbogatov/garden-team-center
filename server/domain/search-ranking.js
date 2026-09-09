'use strict';

// Ранжирование результатов поиска по коллекциям. Каждая rankXxx-функция знает
// только формулу сортировки своей коллекции (релевантность текста + доменные
// признаки вроде статуса/срока/важности); rankGroup внизу файла — единая точка
// входа, которой пользуются и обычный поиск (server/routes/search.js), и
// «Умный поиск» (server/domain/smart-search.js), так что порядок результатов
// в них никогда не расходится.

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function timestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function createSearchRanker({ norm, fuzzyTextMatch, taskPriorityRank }) {
  // ---------- Релевантность текста ----------

  function textScore(query, fields) {
    const q = norm(query);
    if (!q) return 0;
    let best = 0;
    for (const field of fields || []) {
      const value = norm(field?.value);
      if (!value) continue;
      const weight = field?.weight || 1;
      let score = 0;
      if (value === q) score = 500;
      else if (value.startsWith(q)) score = 420;
      else if (value.includes(q)) score = 360;
      else if (fuzzyTextMatch(q, value)) score = 280;
      best = Math.max(best, score * weight);
    }
    return best;
  }

  const stableTitle = (item) => String(item?.title || item?.name || item?.text || item?.id || '');
  const stable = (a, b) => stableTitle(a).localeCompare(stableTitle(b), 'ru');

  // ---------- Формулы сортировки по коллекциям ----------

  function rankTasks(items, query, mode = 'balanced') {
    const today = new Date().toISOString().slice(0, 10);
    return [...(items || [])].map((task) => {
      const active = !task.archivedAt && task.status !== 'done';
      return {
        item: task,
        relevance: textScore(query, [
          { value: task.title, weight: 1 },
          { value: task.description, weight: 0.45 },
        ]),
        active,
        priority: taskPriorityRank(task, mode, today),
      };
    }).sort((a, b) => b.relevance - a.relevance
      || b.priority.tier - a.priority.tier
      || b.priority.score - a.priority.score
      || ((a.priority.days ?? 99999) - (b.priority.days ?? 99999))
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankMeetings(items, query) {
    const today = new Date().toISOString().slice(0, 10);
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.notes, weight: 0.5 },
      ]),
      date: dateKey(item.date),
    })).sort((a, b) => b.relevance - a.relevance
      || Number(b.date >= today) - Number(a.date >= today)
      || (a.date >= today && b.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankIssues(items, query) {
    const statusRank = { in_progress: 4, open: 3, paused: 2, resolved: 0 };
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.description, weight: 0.5 },
      ]),
      active: item.status !== 'resolved',
      severe: item.severity === 'high',
      status: statusRank[item.status] ?? 1,
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || Number(b.active) - Number(a.active)
      || Number(b.severe) - Number(a.severe)
      || b.status - a.status
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankAgreements(items, query) {
    const today = new Date().toISOString().slice(0, 10);
    return [...(items || [])].map((item) => {
      const due = dateKey(item.dueDate);
      const active = item.status !== 'done';
      return {
        item,
        relevance: textScore(query, [{ value: item.text, weight: 1 }]),
        active,
        overdue: active && !!due && due < today,
        due,
        recent: timestamp(item.updatedAt || item.createdAt),
      };
    }).sort((a, b) => b.relevance - a.relevance
      || Number(b.active) - Number(a.active)
      || Number(b.overdue) - Number(a.overdue)
      || ((a.due || '9999-99-99').localeCompare(b.due || '9999-99-99'))
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankProjects(items, query, user) {
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.name, weight: 1 },
        { value: item.description, weight: 0.45 },
      ]),
      status: item.status === 'active' ? 3 : item.status === 'paused' ? 2 : 0,
      member: !!user?.personId && (item.memberIds || []).includes(user.personId),
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || b.status - a.status
      || Number(b.member) - Number(a.member)
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankPeople(items, query, user) {
    const statusRank = { active: 3, transferred: 1, dismissed: 0 };
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.name, weight: 1 },
        { value: item.role, weight: 0.5 },
        { value: (item.tags || []).join(' '), weight: 0.35 },
      ]),
      status: statusRank[item.status] ?? 2,
      team: item.type === 'team',
      direct: item.leadId === user?.personId || item.managerId === user?.personId,
    })).sort((a, b) => b.relevance - a.relevance
      || b.status - a.status
      || Number(b.team) - Number(a.team)
      || Number(b.direct) - Number(a.direct)
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankLabs(items, query) {
    const statusRank = { in_progress: 4, idea: 3, paused: 2, done: 0 };
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.description, weight: 0.5 },
      ]),
      status: statusRank[item.status] ?? 1,
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || b.status - a.status
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankJournal(items, query) {
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [{ value: item.text, weight: 1 }]),
      pinned: !!item.attentionPinned,
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || Number(b.pinned) - Number(a.pinned)
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankGoals(items, query) {
    const statusRank = { active: 3, paused: 2, done: 0 };
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.description, weight: 0.45 },
      ]),
      status: statusRank[item.status] ?? 1,
      due: dateKey(item.dueDate || item.endDate),
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || b.status - a.status
      || (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99')
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankCheckins(items, query) {
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.did, weight: 1 },
        { value: item.willDo, weight: 1 },
        { value: item.blockers, weight: 0.8 },
      ]),
      week: dateKey(item.weekStart),
    })).sort((a, b) => b.relevance - a.relevance
      || b.week.localeCompare(a.week)
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankLinks(items, query, materialKind = null) {
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.sourceTitle, weight: 0.55 },
        { value: item.url, weight: 0.25 },
      ]),
      material: materialKind ? 1 : 0,
      recent: timestamp(item.sourceDate),
    })).sort((a, b) => b.relevance - a.relevance
      || b.material - a.material
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankDocuments(items, query) {
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.description, weight: 0.45 },
        { value: item.url, weight: 0.25 },
      ]),
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankProcesses(items, query) {
    const statusRank = { broken: 3, attention: 2, ok: 0 };
    return [...(items || [])].map((item) => ({
      item,
      relevance: textScore(query, [
        { value: item.title, weight: 1 },
        { value: item.description, weight: 0.5 },
        { value: item.brokenNote, weight: 0.55 },
        { value: item.currentBehavior, weight: 0.4 },
        { value: item.expectedBehavior, weight: 0.35 },
      ]),
      status: statusRank[item.status] ?? 1,
      recent: timestamp(item.updatedAt || item.createdAt),
    })).sort((a, b) => b.relevance - a.relevance
      || b.status - a.status
      || b.recent - a.recent
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankVacations(items, query) {
    const today = new Date().toISOString().slice(0, 10);
    return [...(items || [])].map((item) => {
      const start = dateKey(item.startDate);
      const end = dateKey(item.endDate);
      const active = !!start && !!end && start <= today && end >= today;
      const upcoming = !!start && start > today;
      return {
        item,
        relevance: textScore(query, [
          { value: item.note, weight: 1 },
          { value: item.type, weight: 0.4 },
        ]),
        phase: active ? 3 : upcoming ? 2 : 0,
        date: active ? end : start,
      };
    }).sort((a, b) => b.relevance - a.relevance
      || b.phase - a.phase
      || (a.phase === 2 && b.phase === 2 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
      || stable(a.item, b.item)).map((row) => row.item);
  }

  function rankTools(items, query) {
    return rankDocuments(items, query);
  }

  // ---------- Точка входа: выбор формулы по коллекции ----------

  function rankGroup(group, items, query, options = {}) {
    if (group === 'tasks') return rankTasks(items, query, options.taskPriorityMode);
    if (group === 'meetings') return rankMeetings(items, query);
    if (group === 'issues') return rankIssues(items, query);
    if (group === 'agreements') return rankAgreements(items, query);
    if (group === 'projects') return rankProjects(items, query, options.user);
    if (group === 'people') return rankPeople(items, query, options.user);
    if (group === 'labs') return rankLabs(items, query);
    if (group === 'journal') return rankJournal(items, query);
    if (group === 'goals') return rankGoals(items, query);
    if (group === 'checkins') return rankCheckins(items, query);
    if (group === 'links') return rankLinks(items, query, options.materialKind);
    if (group === 'documents') return rankDocuments(items, query);
    if (group === 'tools') return rankTools(items, query);
    if (group === 'processes') return rankProcesses(items, query);
    if (group === 'vacations') return rankVacations(items, query);
    return items;
  }

  return { textScore, rankGroup, rankTasks };
}

module.exports = { createSearchRanker };
