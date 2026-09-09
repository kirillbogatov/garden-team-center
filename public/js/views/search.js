// Полнотекстовый поиск по всему сервису.

const SEARCH_VACATION_TYPE_LABEL = { vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Отгул' };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch(input.value);
  });
  input.addEventListener('input', debounce(() => runSearch(input.value), 250));
  if (q) runSearch(q);
};

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

function searchTotalCount(g, vacations) {
  return g.people.length
    + g.projects.length
    + g.tasks.length
    + g.issues.length
    + g.meetings.length
    + g.journal.length
    + g.goals.length
    + g.agreements.length
    + (g.links || []).length
    + g.documents.length
    + (g.tools || []).length
    + (g.labs || []).length
    + g.processes.length
    + vacations.length
    + (g.checkins || []).length;
}

async function runSearch(q) {
  q = (q || '').trim();
  history.replaceState(null, '', '/search?q=' + encodeURIComponent(q));
  const results = document.getElementById('search-results');
  if (!q) {
    results.innerHTML = `<div class="tiny">Введите запрос</div>`;
    return;
  }

  const data = await api.get('/api/search?q=' + encodeURIComponent(q));
  const g = data.groups;
  const vacations = g.vacations || [];
  const totalCount = searchTotalCount(g, vacations);

  if (!totalCount) {
    results.innerHTML = searchEmptyResultHtml(q);
    return;
  }

  results.innerHTML = searchResultsHtml(data, g, vacations, q);
}

// ---------------------------------------------------------------------------
// Result rendering
// ---------------------------------------------------------------------------

function searchEmptyResultHtml(q) {
  // Пустая выдача иногда всё же значит: пользователь назвал раздел, а не искал
  // текст внутри него ("открой процессы") — тогда предлагаем перейти туда напрямую.
  const sectionRoute = typeof searchSectionRoute === 'function' ? searchSectionRoute(q) : null;
  if (sectionRoute) {
    return `<div class="ui-row list-row" data-route="${escapeHtml(sectionRoute)}"><span class="title">Открыть раздел</span><span class="meta">${escapeHtml(q)}</span></div>`;
  }
  return emptyState('Ничего не найдено', `По запросу «${q}» ничего нет`, 'search');
}

function searchResultsHtml(data, g, vacations, q) {
  let html = data.command ? `<div class="search-command-hint">${icon('search', 13)} Команда: ${escapeHtml(q)}</div>` : '';

  if (g.people.length) html += searchPeopleSectionHtml(g.people);

  html += simpleSection('Проекты', g.projects, 'projects', (p) => `<div class="ui-row list-row" data-route="${projectPath(p)}"><span class="title">${escapeHtml(p.name)}</span></div>`);
  html += simpleSection('Задачи', g.tasks, 'tasks', (t) => taskListRowHtml(t));
  html += simpleSection('Проблемы', g.issues, 'issues', (i) => issueCardHtml(i));
  html += simpleSection('Встречи', g.meetings, 'meetings', searchMeetingRowHtml);
  html += simpleSection('Отсутствия', vacations, 'calendar', searchVacationRowHtml);
  html += simpleSection('Журнал', g.journal, 'journal', searchJournalRowHtml);
  html += simpleSection('Цели', g.goals, 'goals', (goal) => `<div class="ui-row list-row" data-route="${goalPath(goal)}"><span class="title">${escapeHtml(goal.title)}</span></div>`);
  html += simpleSection('Договорённости', g.agreements, 'agreements', searchAgreementRowHtml);
  html += simpleSection('Ссылки и материалы', g.links || [], 'documents', searchLinkRowHtml);
  html += simpleSection('Документы', g.documents, 'documents', (d) => documentRowHtml(d));
  html += simpleSection('Инструменты', g.tools || [], 'tools', (d) => toolRowHtml(d));
  html += simpleSection('The Labs', g.labs || [], 'tasks', searchLabRowHtml);
  html += simpleSection('Процессы', g.processes, 'processes', (p) => processCardHtml(p));
  html += simpleSection('Check-in', g.checkins || [], 'checkins', searchCheckinRowHtml);

  return html;
}

// Обёртка для секций-списков: заголовок с иконкой и счётчиком + строки из renderer.
// Секция «Люди» рендерится отдельно (searchPeopleSectionHtml), т.к. у неё
// нестандартная карточка со связанными задачами/отсутствиями/журналом/проектами.
function simpleSection(title, arr, iconName, renderer) {
  if (!arr.length) return '';
  return `<div class="search-group"><h2 class="section-title">${icon(iconName, 15)} ${title} (${arr.length})</h2>${arr.map(renderer).join('')}</div>`;
}

function searchPeopleSectionHtml(peopleBlocks) {
  const rows = peopleBlocks.map(searchPersonBlockHtml).join('');
  return `<div class="search-group"><h2 class="section-title mt-0">${icon('team', 15)} Люди</h2>${rows}</div>`;
}

function searchPersonBlockHtml(block) {
  const p = block.person;
  const openTasks = block.tasks.filter((t) => t.status !== 'done');
  const today = todayStr();
  const upcomingVacations = (block.vacations || [])
    .filter((v) => v.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const tasksCol = openTasks.slice(0, 4)
    .map((t) => `<div class="tiny clickable" data-command="openTaskModal" data-command-arg="${t.id}">${escapeHtml(t.title)}</div>`)
    .join('') || '<div class="tiny">—</div>';

  const vacationsCol = upcomingVacations.slice(0, 4)
    .map((v) => `<div class="tiny">${escapeHtml(SEARCH_VACATION_TYPE_LABEL[v.type] || v.type)}, ${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</div>`)
    .join('') || '<div class="tiny">—</div>';

  const journalCol = block.journal.slice(0, 4)
    .map((j) => `<div class="tiny clickable" data-action-id="${registerAction(() => FeatureLoader.run('openJournalEditModal', j))}">${previewText(j.text, 60)}</div>`)
    .join('') || '<div class="tiny">—</div>';

  const projectsCol = block.projects.slice(0, 4).map((pr) => projectChip(pr)).join(' ') || '<div class="tiny">—</div>';

  return `<div class="search-person-block">
    <div class="flex items-center gap-10 clickable" data-route="${personPath(p)}">
      ${avatarHtml(p, 'lg')}
      <div><div style="font-weight:600;font-size:14px">${escapeHtml(p.name)}</div><div class="tiny">${escapeHtml(p.role || '')}</div></div>
    </div>
    <div class="sp-related">
      <div class="sp-related-col"><div class="col-title">Задачи (${openTasks.length})</div>${tasksCol}</div>
      <div class="sp-related-col"><div class="col-title">Ближайшие отсутствия (${upcomingVacations.length})</div>${vacationsCol}</div>
      <div class="sp-related-col"><div class="col-title">Журнал (${block.journal.length})</div>${journalCol}</div>
      <div class="sp-related-col"><div class="col-title">Проекты (${block.projects.length})</div>${projectsCol}</div>
    </div>
  </div>`;
}

function searchMeetingRowHtml(m) {
  const idx = registerAction(() => FeatureLoader.run('openMeetingModal', m));
  return `<div class="ui-row list-row" data-action-id="${idx}"><span class="ui-tag badge">${MEETING_TYPE_LABEL[m.type] || m.type}</span><span class="title">${escapeHtml(meetingDisplayTitle(m))}</span><span class="meta">${fmtDate(m.date)}</span></div>`;
}

function searchVacationRowHtml(v) {
  const p = store.person(v.personId);
  return `<div class="ui-row list-row" data-route="${p ? personPath(p) : '/calendar'}"><span class="title">${p ? escapeHtml(p.name) + ' — ' : ''}${escapeHtml(SEARCH_VACATION_TYPE_LABEL[v.type] || v.type)}</span><span class="meta">${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</span></div>`;
}

function searchJournalRowHtml(j) {
  const idx = registerAction(() => FeatureLoader.run('openJournalEditModal', j));
  return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${previewText(j.text, 90)}</span><span class="meta">${escapeHtml(JOURNAL_KIND_LABEL[j.kind] || '')}</span></div>`;
}

function searchAgreementRowHtml(a) {
  const idx = registerAction(() => FeatureLoader.run('openAgreementModal', a.id));
  return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${previewText(a.text, 90)}</span>${a.dueDate ? `<span class="meta">${dueLabel(a.dueDate)}</span>` : ''}</div>`;
}

function searchLinkRowHtml(link) {
  const idx = registerAction(() => window.open(link.url, '_blank', 'noopener'));
  const meta = [link.sourceTitle, link.sourceDate ? fmtDate(link.sourceDate) : ''].filter(Boolean).join(' — ');
  return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${escapeHtml(link.title || link.url)}</span>${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}</div>`;
}

function searchLabRowHtml(d) {
  const idx = registerAction(() => (d.entityType === 'idea' ? FeatureLoader.run('openLabIdeaModal', d) : Router.go(`/labs/${encodeURIComponent(d.id)}`)));
  return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${escapeHtml(d.title)}</span><span class="meta">The Labs</span></div>`;
}

function searchCheckinRowHtml(c) {
  const p = store.person(c.personId);
  return `<div class="ui-row list-row" data-route="/checkins?person=${encodeURIComponent(c.personId || '')}"><span class="title">${p ? escapeHtml(p.name) : 'Check-in'}</span><span class="meta">${escapeHtml(c.weekStart || '')}</span></div>`;
}
