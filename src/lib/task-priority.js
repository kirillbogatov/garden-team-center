export const TASK_PRIORITY_WEIGHTS = {
  balanced: { important: 35, overdue: 40, overduePerDay: 2, overdueCap: 15, today: 50, tomorrow: 30, soon3: 20, soon7: 10 },
  deadline: { important: 20, overdue: 55, overduePerDay: 2, overdueCap: 20, today: 60, tomorrow: 45, soon3: 30, soon7: 15 },
  importance: { important: 60, overdue: 35, overduePerDay: 1, overdueCap: 10, today: 40, tomorrow: 25, soon3: 15, soon7: 5 },
  overdue: { important: 25, overdue: 70, overduePerDay: 3, overdueCap: 25, today: 50, tomorrow: 35, soon3: 20, soon7: 10 },
};

function dateKey(value) { return String(value || '').slice(0, 10); }
function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

export function taskPriorityRank(task, mode = 'balanced', today = new Date().toISOString().slice(0, 10)) {
  const weights = TASK_PRIORITY_WEIGHTS[mode] || TASK_PRIORITY_WEIGHTS.balanced;
  const tier = (task?.status === 'done' || task?.archivedAt) ? 0
    : (task?.status === 'paused' || task?.status === 'blocked') ? 1
      : (mode === 'balanced' && task?.status === 'in_review') ? 2
        : (mode === 'balanced' ? 3 : 2);
  let score = tier === 0 ? 0 : (task?.priority === 'high' ? weights.important : 0);
  const days = tier > 0 && task?.dueDate ? daysBetween(today, dateKey(task.dueDate)) : null;
  if (days !== null) {
    if (days < 0) score += weights.overdue + Math.min(weights.overdueCap, Math.abs(days) * weights.overduePerDay);
    else if (days === 0) score += weights.today;
    else if (days === 1) score += weights.tomorrow;
    else if (days <= 3) score += weights.soon3;
    else if (days <= 7) score += weights.soon7;
  }
  return { tier, score, days };
}

export function compareTaskPriority(a, b, mode = 'balanced', today = new Date().toISOString().slice(0, 10)) {
  const ar = taskPriorityRank(a, mode, today);
  const br = taskPriorityRank(b, mode, today);
  return br.tier - ar.tier
    || br.score - ar.score
    || ((ar.days ?? 99999) - (br.days ?? 99999))
    || String(a?.title || '').localeCompare(String(b?.title || ''), 'ru');
}

export function rankTasksByPriority(items, mode = 'balanced', today = new Date().toISOString().slice(0, 10)) {
  return [...(items || [])].sort((a, b) => compareTaskPriority(a, b, mode, today));
}
