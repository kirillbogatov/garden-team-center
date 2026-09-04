// Единый словарь доменной терминологии и визуальных соответствий.
// Views и UI используют эти значения вместо собственных копий.
const PRIORITY_LABEL = { high: 'Важная', normal: 'Обычный' };

const TASK_STATUS_LABEL = { todo: 'К выполнению', in_progress: 'В работе', in_review: 'На ревью', paused: 'Приостановлено', blocked: 'Заблокировано', done: 'Готово' };
const TASK_TYPE_LABEL = { standard: 'Проектная', development: 'Развитие' };
const TASK_STATUS_COLOR = { todo: '#6c6e76', in_progress: 'var(--blue)', in_review: 'var(--purple)', paused: 'var(--yellow)', blocked: 'var(--red)', done: 'var(--green)' };

const ISSUE_STATUS_LABEL = { open: 'Новая', in_progress: 'В работе', resolved: 'Решена' };
const ISSUE_SEVERITY_LABEL = { high: 'Высокая', normal: 'Обычная' };
const ISSUE_SEVERITY_COLOR = { high: 'var(--orange)', normal: 'var(--text-disabled)' };

const MEETING_TYPE_LABEL = { '1:1': '1:1', pr: 'PR', club: 'Клаб', retro: 'Ретро', project: 'Проектные', other: 'Другое' };

const JOURNAL_KIND_LABEL = { note: 'Заметка', idea: 'Идея', problem: 'Проблема', agreement: 'Договоренность' };

const LAB_STATUS_LABEL = { idea: 'Идея', in_progress: 'В работе', paused: 'Приостановлено', done: 'Готово' };
const LAB_TASK_STATUS = { idea: 'todo', in_progress: 'in_progress', paused: 'paused', done: 'done' };
const LAB_PROGRESS = { idea: 15, in_progress: 35, paused: 35, done: 100 };
const LAB_TYPE_LABEL = { pet: 'Пет-проект', tool: 'Инструмент', other: 'Другое' };

const PROJECT_STATUS_LABEL = { active: 'Активен', paused: 'На паузе', done: 'Завершён' };
const GOAL_STATUS_LABEL = { active: 'В работе', done: 'Достигнута', paused: 'Отложена' };
const AGREEMENT_STATUS_LABEL = { open: 'Открыта', done: 'Выполнена' };
