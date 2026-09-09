// Shared synchronous entity renderers used across views.

function documentRowHtml(d) {
  const openIdx = registerAction(() => window.open(d.url, '_blank'));
  return `<div class="ui-row list-row" data-action-id="${openIdx}">
    ${icon('external', 15)}<span class="title">${escapeHtml(d.title)}</span>
    ${Auth.canEditOwned(d) ? `<span class="meta" title="Редактировать документ" data-command="openDocumentModal" data-command-arg="${d.id}" data-command-stop="1">${icon('edit', 13)}</span>` : ''}
  </div>`;
}


function toolRowHtml(d) {
  const openIdx = registerAction(() => window.open(d.url, '_blank'));
  return `<div class="ui-row list-row" data-action-id="${openIdx}">
    ${icon('external', 15)}<span class="title">${escapeHtml(d.title)}</span>
    ${Auth.canEditOwned(d) ? `<span class="meta" data-command="openToolModal" data-command-arg="${d.id}" data-command-stop="1">${icon('edit', 13)}</span>` : ''}
  </div>`;
}


function issueCardHtml(i) {
  const project = store.project(i.projectId);
  const people = (i.relatedPersonIds || []).map((id) => store.person(id)).filter(Boolean);
  const openIdx = registerAction(() => FeatureLoader.run('openIssueModal', i.id));
  return `<div class="ui-row ui-row--issue list-row work-entity-row" data-action-id="${openIdx}">
    ${issueStatusBadge(i.status, i.id)}
    <div class="work-row-copy">
      <div class="work-row-title">${escapeHtml(i.title)}</div>
      ${i.description ? `<div class="work-row-meta formatted-text">${escapeHtml(i.description)}</div>` : ''}
    </div>
    <div class="work-row-right">
      ${project ? projectChip(project) : ''}
      ${i.severity === 'high' ? severityBadge(i.severity) : ''}
      ${people.length ? `<div class="work-row-avatars">${people.slice(0, 3).map((person) => personAvatarLinkHtml(person)).join('')}</div>` : ''}
      <span class="work-row-chevron">${icon('chevronRight', 12)}</span>
    </div>
  </div>`;
}


function processCardHtml(p) {
  const status = PROCESS_STATUS_LABEL[p.status] ? p.status : 'ok';
  const statusClass = status === 'broken' ? 'process-status-broken' : status === 'attention' ? 'process-status-attention' : 'process-status-ok';
  const summary = p.currentBehavior || p.brokenNote || p.expectedBehavior || p.description || '';
  const openIdx = registerAction(() => Router.go(`/processes/${encodeURIComponent(p.id)}`));
  return `<div class="ui-row list-row task-list-row process-list-row" data-action-id="${openIdx}">
    <span class="process-list-status"><span class="process-status-dot ${statusClass}"></span><span class="process-status-label">${escapeHtml(PROCESS_STATUS_LABEL[status])}</span></span>
    <span class="tl-title">${escapeHtml(p.title || 'Без названия')}</span>
    <div class="tl-right process-list-right">${summary ? `<span class="process-list-summary">${escapeHtml(summary)}</span>` : ''}<span class="ui-tag badge process-code-tag">PROCESS</span></div>
  </div>`;
}


function taskDueLabel(t) {
  if (!t?.dueDate) return '';
  if (t.status === 'done') return fmtDate(t.dueDate);
  return dueLabel(t.dueDate);
}

// Подсказка при наведении на срок в строке списка задач: в самой строке дата
// сокращена («через 3 дн», «2 дн. назад»), поэтому по ховеру показываем полную
// дату — так не приходится открывать задачу только ради точного дедлайна.
function taskDueTooltip(t) {
  return t?.dueDate ? `Дедлайн по задаче: ${fmtDate(t.dueDate)}` : '';
}

function taskListRowHtml(t) {
  const assignees = (t.assigneeIds || []).map((id) => store.person(id)).filter(Boolean);
  const project = store.project(t.projectId);
  const overdue = t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < todayStr();
  const openIdx = registerAction(() => FeatureLoader.run('openTaskModal', t.id));
  return `<div class="ui-row ui-row--task list-row task-list-row" data-action-id="${openIdx}">
    ${taskStatusBadge(t.status, t.id)}
    <span class="tl-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
    <div class="tl-right">
      <div class="task-tags-cell">${taskLabelsHtml(t)}</div>
      <div class="task-due-cell">${t.dueDate ? `<span class="tiny" title="${escapeHtml(taskDueTooltip(t))}" style="${overdue ? 'color:var(--red)' : ''}">${taskDueLabel(t)}</span>` : ''}</div>
      <div class="task-assignee-cell">${assignees.length ? `<div class="flex gap-4">${assignees.map((a) => personAvatarLinkHtml(a)).join('')}</div>` : avatarHtml(null)}</div>
    </div>
  </div>`;
}


function labStatusReadonlyIconHtml(status) {
  const taskStatus = LAB_TASK_STATUS[status] || 'todo';
  const symbol = TASK_STATUS_SYMBOL[taskStatus] ?? '○';
  const label = LAB_STATUS_LABEL[status] || status || 'Идея';
  return `<span class="task-status-icon task-status-${escapeHtml(taskStatus)}" aria-label="${escapeHtml(label)}">${symbol}</span>`;
}


function journalEntryHtml(j) {
  const editIdx = registerAction(() => FeatureLoader.run('openJournalEditModal', j));
  const attentionIdx = registerAction(async () => {
    const next = !j.attentionPinned;
    await api.put('/api/journal/' + j.id, { attentionPinned: next });
    if (next) {
      const settings = await GardenSettings.load();
      const hidden = { ...(settings.attentionHiddenUntil || {}) };
      delete hidden[`journal:${j.id}`];
      const updates = { attentionHiddenUntil: hidden };
      if (settings.overviewDashboard && typeof settings.overviewDashboard === 'object') {
        const dashboard = structuredClone(settings.overviewDashboard);
        dashboard.signals = Array.isArray(dashboard.signals) ? dashboard.signals : [];
        if (!dashboard.signals.some((item) => item?.type === 'attention-notes')) {
          dashboard.signals.push({ id: 'attention-notes', type: 'attention-notes' });
        }
        updates.overviewDashboard = dashboard;
      }
      await GardenSettings.update(updates);
    }
    toast(next ? 'Запись будет показана на главной странице' : 'Запись убрана с главной страницы');
    Router.render();
  });
  const deleteIdx = registerAction(() => FeatureLoader.run('deleteJournalEntry', j));
  let linkedEntity = '';
  if (j.kind === 'problem' && j.issueId) {
    const openIdx = registerAction(() => FeatureLoader.run('openIssueModal', j.issueId));
    linkedEntity = `<button class="je-linked-entity" type="button" data-action-id="${openIdx}" data-action-stop="1">· Открыть</button>`;
  } else if (j.kind === 'agreement' && j.agreementId) {
    const openIdx = registerAction(() => FeatureLoader.run('openAgreementModal', j.agreementId));
    linkedEntity = `<button class="je-linked-entity" type="button" data-action-id="${openIdx}" data-action-stop="1">· Открыть</button>`;
  } else if (j.kind === 'idea' && j.labId) {
    const openIdx = registerAction(async () => {
      const idea = await api.get('/api/labs/' + j.labId);
      FeatureLoader.run('openLabIdeaModal', idea);
    });
    linkedEntity = `<button class="je-linked-entity" type="button" data-action-id="${openIdx}" data-action-stop="1">· Открыть</button>`;
  }

  return `<div class="journal-entry clickable" id="journal-entry-${escapeHtml(j.id)}" data-action-id="${editIdx}">
    <div class="je-head">
      <span class="tiny">${fmtRelative(j.createdAt)}</span>
      <span class="tiny je-sep">·</span>
      <span class="tiny je-kind-label">${escapeHtml(JOURNAL_KIND_LABEL[j.kind] || '')}</span>
      ${j.kind === 'idea' && j.private ? `<span class="tiny lab-private-meta" title="Видна только вам">${icon('eyeOff', 12)} Приватная</span>` : ''}
      ${linkedEntity}
      <span class="je-actions ${j.attentionPinned ? 'has-attention' : ''}">
        <span class="je-action-btn ${j.attentionPinned ? 'attention-active' : ''}" data-action-id="${attentionIdx}" data-action-stop="1" title="Показывать запись на главной странице" aria-label="Показывать запись на главной странице">${icon('bookmark', 16)}</span>
        <span class="je-action-btn" data-action-id="${editIdx}" data-action-stop="1" title="Редактировать">${icon('edit', 16)}</span>
        <span class="je-action-btn" data-action-id="${deleteIdx}" data-action-stop="1" title="Удалить">${icon('trash', 16)}</span>
      </span>
    </div>
    <div class="je-text">${renderMentionText(j.text)}</div>
  </div>`;
}

