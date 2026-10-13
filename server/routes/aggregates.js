'use strict';

module.exports = function registerAggregateRoutes(app, { db, resolveEntity, sanitizeItem, visibleItems, canReadItem, denied }) {
  // Профиль сотрудника собирает всё, что на него ссылается, из разных
  // коллекций — набор фильтров у каждой коллекции свой, извлекать общий
  // хелпер тут не имеет смысла (не одна и та же логика).
  app.get('/api/people/:id/profile', (req, res) => {
    const rawPerson = resolveEntity('people', req.params.id);
    if (!rawPerson) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('people', rawPerson, req.auth.user)) return denied(res);

    const person = sanitizeItem('people', rawPerson, req.auth.user);
    const id = rawPerson.id;
    const tasks = visibleItems('tasks', req.auth.user, { includeArchived: true })
      .filter((t) => (t.assigneeIds || []).includes(id) && (!t.archivedAt || t.taskType === 'development'));
    const meetings = visibleItems('meetings', req.auth.user)
      .filter((m) => (m.participantIds || []).includes(id))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const journal = visibleItems('journal', req.auth.user)
      .filter((j) => (j.mentions || []).some((m) => m.id === id || (m.type === 'team' && rawPerson.type === 'team')))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const agreements = visibleItems('agreements', req.auth.user)
      .filter((a) => (a.withPersonIds || []).includes(id) || (a.mentions || []).some((m) => m.id === id));
    const projects = visibleItems('projects', req.auth.user).filter((p) => (p.memberIds || []).includes(id));
    const issues = visibleItems('issues', req.auth.user).filter((i) => (i.relatedPersonIds || []).includes(id));
    const vacations = visibleItems('vacations', req.auth.user).filter((v) => v.personId === id);
    const labs = visibleItems('labs', req.auth.user).filter((l) => l.entityType !== 'idea' && l.authorId === id);

    res.json({ person, tasks, meetings, journal, agreements, projects, issues, vacations, labs });
  });

  app.get('/api/projects/:id/detail', (req, res) => {
    const project = resolveEntity('projects', req.params.id);
    if (!project) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('projects', project, req.auth.user)) return denied(res);

    const id = project.id;
    const tasks = visibleItems('tasks', req.auth.user).filter((t) => !t.archivedAt && t.projectId === id);
    const issues = visibleItems('issues', req.auth.user)
      .filter((i) => i.projectId === id || (i.relatedProjectIds || []).includes(id));
    const journal = visibleItems('journal', req.auth.user)
      .filter((j) => (j.mentions || []).some((m) => m.id === id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const meetings = visibleItems('meetings', req.auth.user).filter((m) => m.projectId === id);
    const agreements = visibleItems('agreements', req.auth.user)
      .filter((a) => a.projectId === id || (a.relatedProjectIds || []).includes(id) || (a.mentions || []).some((m) => m.type === 'project' && m.id === id));
    const members = visibleItems('people', req.auth.user).filter((p) => (project.memberIds || []).includes(p.id));
    res.json({ project, tasks, issues, journal, meetings, agreements, members });
  });

  app.get('/api/goals/:id/detail', (req, res) => {
    const goal = resolveEntity('goals', req.params.id);
    if (!goal) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('goals', goal, req.auth.user)) return denied(res);

    const tasks = visibleItems('tasks', req.auth.user, { includeArchived: true })
      .filter((t) => t.goalKey === goal.goalKey || (t.goalKeys || []).includes(goal.goalKey));
    const issues = visibleItems('issues', req.auth.user).filter((i) => i.goalKey === goal.goalKey);

    res.json({ goal, tasks, issues });
  });

  app.get('/api/calendar/month', (req, res) => {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) return res.status(400).json({ error: 'year_and_month_required' });

    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const meetings = visibleItems('meetings', req.auth.user).filter((m) => (m.date || '').startsWith(prefix));
    const vacations = visibleItems('vacations', req.auth.user)
      .filter((v) => v.startDate.slice(0, 7) <= prefix && v.endDate.slice(0, 7) >= prefix);
    const birthdays = visibleItems('people', req.auth.user)
      .filter((p) => p.birthday && p.birthday.slice(5, 7) === String(month).padStart(2, '0'));
    const agreementsDue = visibleItems('agreements', req.auth.user).filter((a) => (a.dueDate || '').startsWith(prefix));
    const tasksDue = visibleItems('tasks', req.auth.user).filter((t) => (t.dueDate || '').startsWith(prefix));

    res.json({ year, month, meetings, vacations, birthdays, agreementsDue, tasksDue });
  });
};
