// Единый словарь доменной терминологии и визуальных соответствий.
// Views и UI используют эти значения вместо собственных копий.
const PRIORITY_LABEL = { high: 'Важная', normal: 'Обычный' };

const TASK_STATUS_LABEL = { todo: 'К выполнению', in_progress: 'В работе', in_review: 'На ревью', paused: 'Приостановлено', blocked: 'Заблокировано', done: 'Готово' };
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

const ISSUE_STATUS_LABEL = { open: 'Новая', in_progress: 'В работе', resolved: 'Решена' };
const ISSUE_SEVERITY_LABEL = { high: 'Высокая', normal: 'Обычная' };
const ISSUE_SEVERITY_COLOR = { high: 'var(--orange)', normal: 'var(--text-disabled)' };

const MEETING_TYPE_LABEL = { '1:1': '1:1', pr: 'PR', club: 'Клаб', retro: 'Ретро', project: 'Проектные', other: 'Другое' };
const MEETING_TYPE_ORDER = ['1:1', 'pr', 'club', 'retro', 'project', 'other'];

const JOURNAL_KIND_LABEL = { note: 'Заметка', idea: 'Идея', problem: 'Проблема', agreement: 'Договоренность' };

const LAB_STATUS_LABEL = { idea: 'Идея', in_progress: 'В работе', paused: 'Приостановлено', done: 'Готово' };
const LAB_TASK_STATUS = { idea: 'todo', in_progress: 'in_progress', paused: 'paused', done: 'done' };
const LAB_PROGRESS = { idea: 15, in_progress: 35, paused: 35, done: 100 };
const LAB_TYPE_LABEL = { pet: 'Пет-проект', tool: 'Инструмент', other: 'Другое' };

const PROJECT_STATUS_LABEL = { active: 'Активен', paused: 'На паузе', done: 'Завершён' };
const GOAL_STATUS_LABEL = { active: 'В работе', done: 'Достигнута', paused: 'Отложена' };
const AGREEMENT_STATUS_LABEL = { open: 'Открыта', done: 'Выполнена' };
