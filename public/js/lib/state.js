// Центральное хранилище справочников (люди, проекты), чтобы не гонять лишние запросы
// при рендере списков, где нужно только имя/цвет/аватар.

const store = {
  people: [],
  projects: [],
  tasks: [],
  goals: [],
  vacations: [],

  async loadAll() {
    const [people, projects, tasks, goals, vacations] = await Promise.all([
      api.get('/api/people'),
      api.get('/api/projects'),
      api.get('/api/tasks'),
      api.get('/api/goals'),
      api.get('/api/vacations'),
    ]);
    store.people = Array.isArray(people) ? people : [];
    store.projects = Array.isArray(projects) ? projects : [];
    store.tasks = Array.isArray(tasks) ? tasks : [];
    store.goals = Array.isArray(goals) ? goals : [];
    store.vacations = Array.isArray(vacations) ? vacations : [];
  },

  person(id) {
    return store.people.find((p) => p.id === id) || null;
  },
  project(id) {
    return store.projects.find((p) => p.id === id) || null;
  },
  team() {
    return store.people.filter((p) => p.type === 'team');
  },
  activeTeam() {
    return store.people.filter((p) => isActiveTeamPerson(p));
  },
  stakeholders() {
    return store.people.filter((p) => p.type === 'stakeholder');
  },
};
