// Единый словарь доменной терминологии и визуальных соответствий.
// Views и UI используют эти значения вместо собственных копий.
const PRIORITY_LABEL = { high: 'Важная', normal: 'Обычный' };

const TASK_STATUS_LABEL = { todo: 'К выполнению', in_progress: 'В работе', in_review: 'На ревью', paused: 'Приостановлено', blocked: 'Заблокировано', done: 'Готово' };
const TASK_STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'paused', 'blocked', 'done'];
const TASK_TYPE_LABEL = { standard: 'Проектная', development: 'Развитие' };

const TASK_PRIORITY_STRATEGIES = {
  balanced: {
    label: 'Сбалансированный',
    description: 'Смотрим на срок и важность задачи. Ближайшие задачи обычно важнее просроченных.',
    weights: { important: 35, overdue: 40, overduePerDay: 2, overdueCap: 15, today: 50, tomorrow: 30, soon3: 20, soon7: 10 },
  },
  deadline: {
    label: 'По дедлайнам',
    description: 'Акцент на ближайших задачах. Важность влияет на порядок, но не так сильно.',
    weights: { important: 20, overdue: 55, overduePerDay: 2, overdueCap: 20, today: 60, tomorrow: 45, soon3: 30, soon7: 15 },
  },
  importance: {
    label: 'По важности',
    description: 'Поднимает важные задачи, сортирует их по сроку.',
    weights: { important: 60, overdue: 35, overduePerDay: 1, overdueCap: 10, today: 40, tomorrow: 25, soon3: 15, soon7: 5 },
  },
  overdue: {
    label: 'Разгребание долгов',
    description: 'Чем дольше задача просрочена, тем выше она в списке.',
    weights: { important: 25, overdue: 70, overduePerDay: 3, overdueCap: 25, today: 50, tomorrow: 35, soon3: 20, soon7: 10 },
  },
};

const TASK_STATUS_COLOR = { todo: '#6c6e76', in_progress: 'var(--blue)', in_review: 'var(--purple)', paused: 'var(--yellow)', blocked: 'var(--red)', done: 'var(--green)' };

// Общий скоринг приоритета задачи по весам TASK_PRIORITY_STRATEGIES выше.
// Зеркалит server/domain/task-priority.js (architecture-тесты держат веса в
// синхроне). Используется и виджетом «Обзора» (views/overview.js — своя
// версия, с доп. фильтрацией «что вообще стоит показать сегодня»), и
// сортировкой списка «Мои задачи» (views/tasks.js — сортирует все задачи как
// есть, без специальной фильтрации), поэтому вынесен сюда, а не дублирован.
//
// Статус задаёт ярус (tier) — сначала решает он, а срок/важность расставляют
// порядок только внутри яруса, а не наоборот: иначе просроченный дедлайн
// давно приостановленной задачи мог бы перевесить и вытащить её выше того,
// над чем реально работают прямо сейчас.
//   2 — активные (todo/в работе/на ревью): обычный расчёт по сроку и важности.
//   1 — приостановлено/заблокировано: ниже любой активной, но не потерялись —
//       заметны выше готовых, сортируются по тому же сроку/важности между собой.
//   0 — готово/архив: срочность здесь уже ничего не значит.
function taskPriorityScore(task, mode = 'balanced', todayKey = todayStr()) {
  if (task?.status === 'done' || task?.archivedAt) return { tier: 0, score: 0, days: null };
  const tier = (task?.status === 'paused' || task?.status === 'blocked') ? 1 : 2;
  const weights = (TASK_PRIORITY_STRATEGIES[mode] || TASK_PRIORITY_STRATEGIES.balanced).weights;
  const dueKey = String(task?.dueDate || '').slice(0, 10);
  let score = task?.priority === 'high' ? weights.important : 0;
  let days = null;
  if (dueKey) {
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const [dy, dm, dd] = dueKey.split('-').map(Number);
    days = Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000);
    if (days < 0) score += weights.overdue + Math.min(weights.overdueCap, Math.abs(days) * weights.overduePerDay);
    else if (days === 0) score += weights.today;
    else if (days === 1) score += weights.tomorrow;
    else if (days <= 3) score += weights.soon3;
    else if (days <= 7) score += weights.soon7;
  }
  return { tier, score, days };
}

function compareTasksByPriority(a, b, mode = 'balanced', todayKey = todayStr()) {
  const infoA = taskPriorityScore(a, mode, todayKey);
  const infoB = taskPriorityScore(b, mode, todayKey);
  return (infoB.tier - infoA.tier)
    || (infoB.score - infoA.score)
    || ((infoA.days ?? 99999) - (infoB.days ?? 99999))
    || String(a?.title || '').localeCompare(String(b?.title || ''), 'ru');
}

const ISSUE_STATUS_LABEL = { open: 'Новая', in_progress: 'В работе', paused: 'Отложена', resolved: 'Решена' };
const ISSUE_SEVERITY_LABEL = { high: 'Высокая', normal: 'Обычная' };
const ISSUE_SEVERITY_COLOR = { high: 'var(--orange)', normal: 'var(--text-disabled)' };

const MEETING_TYPE_LABEL = { '1:1': '1:1', pr: 'PR', club: 'Техна', retro: 'Ретро', project: 'Проект', other: 'Другое' };
const MEETING_TYPE_ORDER = ['1:1', 'pr', 'club', 'retro', 'project', 'other'];

const JOURNAL_KIND_LABEL = { note: 'Заметка', idea: 'Идея', problem: 'Проблема', agreement: 'Договоренность' };

const LAB_STATUS_LABEL = { idea: 'Идея', in_progress: 'В работе', paused: 'Приостановлено', done: 'Готово' };
const IDEA_STATUS_LABEL = { idea: 'Новая', in_progress: 'В работе', paused: 'Отложена', done: 'Готово' };
const LAB_TASK_STATUS = { idea: 'todo', in_progress: 'in_progress', paused: 'paused', done: 'done' };
const LAB_PROGRESS = { idea: 15, in_progress: 35, paused: 35, done: 100 };
const LAB_TYPE_LABEL = { pet: 'Пет-проект', tool: 'Инструмент', other: 'Другое' };

const PROJECT_STATUS_LABEL = { active: 'Активен', paused: 'На паузе', done: 'Завершён' };
const GOAL_STATUS_LABEL = { active: 'В работе', done: 'Достигнута', paused: 'Отложена' };
const AGREEMENT_STATUS_LABEL = { open: 'Открыта', done: 'Выполнена' };

const PROCESS_STATUS_LABEL = { ok: 'Работает', attention: 'Есть проблемы', broken: 'Сломан' };
const PROCESS_FIX_STATUS_LABEL = { unchecked: 'Не проверялось', effective: 'Эффективно', ineffective: 'Неэффективно' };
