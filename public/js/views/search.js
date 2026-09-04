// Полнотекстовый поиск по всему сервису.

Views.search = async function (q) {
  setTopbar(`<h1>Поиск</h1>`);
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="ui-field field" style="max-width:480px;margin-bottom:20px">
      <input id="search-input" value="${escapeHtml(q || '')}" placeholder="Например: мои задачи, встречи без итогов 1:1, процессы с проблемами…" />
    </div>
    <div id="search-results"><div class="tiny">Введите запрос</div></div>
  `;
  const input = document.getElementById('search-input');
  input.focus();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(input.value); });
  input.addEventListener('input', debounce(() => runSearch(input.value), 250));
  if (q) runSearch(q);
};

const SEARCH_VACATION_TYPE_LABEL = { vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Отгул' };

async function runSearch(q) {
  q = (q || '').trim();
  history.replaceState(null, '', '/search?q=' + encodeURIComponent(q));
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = `<div class="tiny">Введите запрос</div>`; return; }
  const data = await api.get('/api/search?q=' + encodeURIComponent(q));
  const g = data.groups;
  const vacations = g.vacations || [];
  const totalCount = g.people.length + g.projects.length + g.tasks.length + g.issues.length + g.meetings.length + g.journal.length + g.goals.length + g.agreements.length + g.documents.length + (g.tools || []).length + (g.labs || []).length + g.processes.length + vacations.length + (g.checkins || []).length;

  if (!totalCount) {
    const sectionRoute = typeof searchSectionRoute === 'function' ? searchSectionRoute(q) : null;
    if (sectionRoute) { results.innerHTML = `<div class="ui-row list-row" data-route="${escapeHtml(sectionRoute)}"><span class="title">Открыть раздел</span><span class="meta">${escapeHtml(q)}</span></div>`; return; }
    results.innerHTML = emptyState('Ничего не найдено', `По запросу «${q}» ничего нет`, 'search'); return;
  }

  let html = data.command ? `<div class="search-command-hint">${icon('search', 13)} Команда: ${escapeHtml(q)}</div>` : '';

  if (g.people.length) {
    html += `<div class="search-group"><h2 class="section-title mt-0">${icon('team', 15)} Люди</h2>`;
    g.people.forEach((block) => {
      const p = block.person;
      const openTasks = block.tasks.filter((t) => t.status !== 'done');
      const today = todayStr();
      const upcomingVacations = (block.vacations || []).filter((v) => v.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
      html += `<div class="search-person-block">
        <div class="flex items-center gap-10 clickable" data-route="${personPath(p)}">
          ${avatarHtml(p, 'lg')}
          <div><div style="font-weight:600;font-size:14px">${escapeHtml(p.name)}</div><div class="tiny">${escapeHtml(p.role || '')}</div></div>
        </div>
        <div class="sp-related">
          <div class="sp-related-col"><div class="col-title">Задачи (${openTasks.length})</div>${openTasks.slice(0, 4).map((t) => `<div class="tiny clickable" data-command="openTaskModal" data-command-arg="${t.id}">${escapeHtml(t.title)}</div>`).join('') || '<div class="tiny">—</div>'}</div>
          <div class="sp-related-col"><div class="col-title">Ближайшие отсутствия (${upcomingVacations.length})</div>${upcomingVacations.slice(0, 4).map((v) => `<div class="tiny">${escapeHtml(SEARCH_VACATION_TYPE_LABEL[v.type] || v.type)}, ${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</div>`).join('') || '<div class="tiny">—</div>'}</div>
          <div class="sp-related-col"><div class="col-title">Журнал (${block.journal.length})</div>${block.journal.slice(0, 4).map((j) => `<div class="tiny clickable" data-action-id="${registerAction(() => FeatureLoader.run('openJournalEditModal', j))}">${previewText(j.text, 60)}</div>`).join('') || '<div class="tiny">—</div>'}</div>
          <div class="sp-related-col"><div class="col-title">Проекты (${block.projects.length})</div>${block.projects.slice(0, 4).map((pr) => projectChip(pr)).join(' ') || '<div class="tiny">—</div>'}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  function simpleSection(title, arr, iconName, renderer) {
    if (!arr.length) return '';
    return `<div class="search-group"><h2 class="section-title">${icon(iconName, 15)} ${title} (${arr.length})</h2>${arr.map(renderer).join('')}</div>`;
  }

  html += simpleSection('Проекты', g.projects, 'projects', (p) => `<div class="ui-row list-row" data-route="${projectPath(p)}"><span class="title">${escapeHtml(p.name)}</span></div>`);
  html += simpleSection('Задачи', g.tasks, 'tasks', (t) => taskListRowHtml(t));
  html += simpleSection('Проблемы', g.issues, 'issues', (i) => issueCardHtml(i));
  html += simpleSection('Встречи', g.meetings, 'meetings', (m) => { const idx = registerAction(() => FeatureLoader.run('openMeetingModal', m)); return `<div class="ui-row list-row" data-action-id="${idx}"><span class="ui-tag badge">${MEETING_TYPE_LABEL[m.type] || m.type}</span><span class="title">${escapeHtml(meetingDisplayTitle(m))}</span><span class="meta">${fmtDate(m.date)}</span></div>`; });
  html += simpleSection('Отсутствия', vacations, 'calendar', (v) => {
    const p = store.person(v.personId);
    return `<div class="ui-row list-row" data-route="${p ? personPath(p) : '/calendar'}"><span class="title">${p ? escapeHtml(p.name) + ' — ' : ''}${escapeHtml(SEARCH_VACATION_TYPE_LABEL[v.type] || v.type)}</span><span class="meta">${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</span></div>`;
  });
  html += simpleSection('Журнал', g.journal, 'journal', (j) => { const idx = registerAction(() => FeatureLoader.run('openJournalEditModal', j)); return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${previewText(j.text, 90)}</span><span class="meta">${escapeHtml(JOURNAL_KIND_LABEL[j.kind] || '')}</span></div>`; });
  html += simpleSection('Цели', g.goals, 'goals', (goal) => `<div class="ui-row list-row" data-route="${goalPath(goal)}"><span class="title">${escapeHtml(goal.title)}</span></div>`);
  html += simpleSection('Договорённости', g.agreements, 'agreements', (a) => { const idx = registerAction(() => FeatureLoader.run('openAgreementModal', a.id)); return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${previewText(a.text, 90)}</span>${a.dueDate ? `<span class="meta">${dueLabel(a.dueDate)}</span>` : ''}</div>`; });
  html += simpleSection('Документы', g.documents, 'documents', (d) => documentRowHtml(d));
  html += simpleSection('Инструменты', g.tools || [], 'tools', (d) => toolRowHtml(d));
  html += simpleSection('The Labs', g.labs || [], 'tasks', (d) => `<div class="ui-row list-row" data-action-id="${registerAction(() => d.entityType === 'idea' ? FeatureLoader.run('openLabIdeaModal', d) : Router.go(`/labs/${encodeURIComponent(d.id)}`))}"><span class="title">${escapeHtml(d.title)}</span><span class="meta">The Labs</span></div>`);
  html += simpleSection('Процессы', g.processes, 'processes', (p) => processCardHtml(p));
  html += simpleSection('Check-in', g.checkins || [], 'checkins', (c) => { const p = store.person(c.personId); return `<div class="ui-row list-row" data-route="/checkins?person=${encodeURIComponent(c.personId || '')}"><span class="title">${p ? escapeHtml(p.name) : 'Check-in'}</span><span class="meta">${escapeHtml(c.weekStart || '')}</span></div>`; });

  results.innerHTML = html;
}


