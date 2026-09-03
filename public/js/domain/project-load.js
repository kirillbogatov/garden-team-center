// Shared project workload domain helpers.
// Единая модель проектной загрузки. В данных хранится только режим,
// а общий уровень всегда считается по верхней границе его диапазона.
const PROJECT_LOAD_OPTIONS = {
  full: { min: 6, max: 8, label: 'Фултайм', rangeLabel: '6–8 часов' },
  half: { min: 3, max: 5, label: 'Парт-тайм', rangeLabel: '3–5 часов' },
  support: { min: 1, max: 2, label: 'Саппорт', rangeLabel: '1–2 часа' },
};

function normalizeProjectMemberLoad(value) {
  const rawMode = value && typeof value === 'object' ? value.mode : value;
  const mode = PROJECT_LOAD_OPTIONS[rawMode] ? rawMode : 'full';
  return { mode };
}

function projectLoadLevel(maxHours) {
  if (maxHours > 10) return { label: 'Перегруз', tone: 'overloaded' };
  if (maxHours >= 8) return { label: 'Полная', tone: 'full' };
  if (maxHours >= 5) return { label: 'Средняя', tone: 'medium' };
  if (maxHours >= 1) return { label: 'Низкая', tone: 'small' };
  return { label: 'Нет загрузки', tone: 'none' };
}

function personProjectLoadSummary(personId, projects = store.projects) {
  const active = projects.filter((pr) => pr.status === 'active' && (pr.memberIds || []).includes(personId));
  const maxHours = active.reduce((sum, pr) => {
    const load = normalizeProjectMemberLoad((pr.memberLoads || {})[personId]);
    return sum + PROJECT_LOAD_OPTIONS[load.mode].max;
  }, 0);
  return { projects: active, maxHours, level: projectLoadLevel(maxHours) };
}

