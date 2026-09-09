// Проблемы — обзор проблем и варианты их решения.

Views._issueFilter = 'open';

function issueListTitleRowHtml(issue) {
  const openIdx = registerAction(() => FeatureLoader.run('openIssueModal', issue.id));
  const people = (issue.relatedPersonIds || []).map((id) => store.person(id)).filter(Boolean);
  const seriousBadgeHtml = issue.severity === 'high' ? '<span class="ui-tag badge issue-serious-badge">серьёзная</span>' : '';
  const overflowCount = people.length - 3;
  const avatarsHtml = people.length
    ? `<div class="work-row-avatars issue-list-avatars">${people.slice(0, 3).map((person) => personAvatarLinkHtml(person)).join('')}${overflowCount > 0 ? `<span class="issue-list-avatar-more" aria-label="Ещё ${overflowCount} причастных">+${overflowCount}</span>` : ''}</div>`
    : '';
  return `<div class="ui-row ui-row--issue list-row issue-list-row" data-action-id="${openIdx}">
    ${issueStatusBadge(issue.status, issue.id)}
    <span class="issue-list-title">${escapeHtml(issue.title)}</span>
    <div class="issue-list-right">
      ${seriousBadgeHtml}
      ${avatarsHtml}
    </div>
  </div>`;
}

Views.issues = async function () {
  const mineOnly = Router.queryParam('mine') === '1';
  const title = mineOnly ? 'Мои проблемы' : 'Проблемы';
  const addButton = Auth.canCreate('issues')
    ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openIssueModal">+ Добавить проблему</button></div>`
    : '';
  setTopbar(`<h1>${title}</h1>${addButton}`);
  const view = document.getElementById('view');
  let issues = (await Resources.issues.list()).sort((a, b) => {
    const sevOrder = { high: 0, normal: 1 };
    return (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
  });
  if (mineOnly) {
    const personId = Auth.user?.personId;
    issues = issues.filter((i) => i.createdByUserId === Auth.user?.id || (personId && (i.relatedPersonIds || []).includes(personId)));
  }

  const filters = [
    { key: 'open', label: 'Открытые', test: (i) => i.status !== 'resolved' },
    { key: 'paused', label: 'Отложенные', test: (i) => i.status === 'paused' },
    { key: 'resolved', label: 'Решённые', test: (i) => i.status === 'resolved' },
    { key: 'all', label: 'Все', test: () => true },
  ];
  const active = filters.find((f) => f.key === Views._issueFilter) || filters[0];
  const filtered = issues.filter(active.test);

  // Тот же приём, что и в «Задачах» — главный фильтр списка вынесен как ряд
  // вкладок со счётчиками (референс: /dashboard/user/list) вместо сегмент-переключателя.
  const tabButtons = filters.map((f) => {
    const active = Views._issueFilter === f.key;
    return `<button type="button" class="list-tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-view-state="_issueFilter" data-view-value="${f.key}" data-view-render="issues">${f.label}</button>`;
  }).join('');
  const tabsHtml = `<div class="list-tabs" role="tablist" aria-label="Статус проблем">${tabButtons}</div>`;
  const bodyHtml = filtered.length
    ? filtered.map(issueListTitleRowHtml).join('')
    : emptyState('Проблем не найдено', '', 'issues');

  view.innerHTML = `
    <div class="view-narrow work-list-page issues-view">
      <div class="work-list-toolbar">${tabsHtml}</div>
      <div class="work-list-body">${bodyHtml}</div>
    </div>
  `;
};

// Опции статуса/серьёзности рендерятся отдельными помощниками, а не инлайн
// в шаблоне модалки, чтобы список значений и порядок selected-логики были видны сразу.
function issueSeverityOptionsHtml(selected) {
  return ['normal', 'high'].map((s) => {
    const isSelected = (selected || 'normal') === s;
    return `<option value="${s}" ${isSelected ? 'selected' : ''}>${ISSUE_SEVERITY_LABEL[s]}</option>`;
  }).join('');
}

function issueStatusOptionsHtml(selected) {
  return ['open', 'in_progress', 'paused', 'resolved'].map((s) => {
    return `<option value="${s}" ${selected === s ? 'selected' : ''}>${ISSUE_STATUS_LABEL[s]}</option>`;
  }).join('');
}

async function openIssueModal(id, opts) {
  opts = opts || {};
  const isEdit = !!id;
  let i = {};
  if (isEdit) i = await Resources.issues.get(id);
  else if (opts.prefill) i = Object.assign({}, opts.prefill);
  const editable = !isEdit || Auth.canEditItem('issues', i, ['relatedPersonIds']);
  const canDelete = isEdit && Auth.canDeleteItem('issues', i);
  let solutionOptions = (i.solutionOptions || []).map((o) => ({ text: o.text || '', chosen: !!o.chosen }));
  Modal.open(`
    <h2>${isEdit ? 'Редактировать проблему' : 'Новая проблема'}</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="if-title">Название</label><input id="if-title" value="${escapeHtml(i.title || '')}" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="if-desc">Описание</label><textarea id="if-desc" rows="3">${escapeHtml(i.description || '')}</textarea></div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="if-project">Проект (необязательно)</label><select id="if-project"><option value="">—</option>${optionsHtml(store.projects, 'id', (p) => p.name, i.projectId)}</select></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="if-goal">Цель (необязательно)</label><select id="if-goal"><option value="">—</option>${optionsHtml(store.goals || [], 'id', (g) => g.title, i.goalId)}</select></div>
    </div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="if-severity">Серьёзность</label><select id="if-severity">${issueSeverityOptionsHtml(i.severity)}</select></div>
    </div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="if-status">Статус</label>
      <select id="if-status">${issueStatusOptionsHtml(i.status)}</select>
    </div>
    <div class="ui-field field"><span class="ui-field-label field-label">Причастные люди</span>
      <div id="if-people-wrap">${peoplePickerHtml('Добавить человека…')}</div>
    </div>
    <div class="ui-field field">
      <span class="ui-field-label field-label">Варианты решения</span>
      <div id="if-solutions"></div>
      <button class="ui-button ui-button--sm btn btn-sm btn-ghost" id="if-add-solution" type="button" style="margin-top:6px">Добавить вариант</button>
    </div>
    <div class="ui-modal-actions modal-actions">
      ${canDelete ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" data-command="deleteIssue" data-command-arg="${i.id}">${icon('trash',14)} Удалить</button>` : ''}
      <button class="ui-button btn" id="if-cancel">Отмена</button>
      ${editable ? `<button class="ui-button ui-button--primary btn btn-primary" id="if-save">Сохранить</button>` : ''}
    </div>
  `);
  const peoplePicker = initPeoplePicker(document.getElementById('if-people-wrap'), store.people, i.relatedPersonIds, { multi: true, placeholder: 'Добавить человека…' });
  if (!editable) {
    const panel = document.querySelector('.modal-panel');
    panel?.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
    panel?.querySelectorAll('#if-add-solution, [data-solution-up], [data-solution-down], [data-solution-remove]').forEach((el) => { el.disabled = true; });
  }

  const solutionRowHtml = (o, idx) => `
      <div class="solution-editor-row">
        <input type="checkbox" aria-label="Выбрать решение" ${o.chosen ? 'checked' : ''} data-solution-choice="${idx}" />
        <textarea rows="2" placeholder="Вариант решения" data-solution-text="${idx}">${escapeHtml(o.text)}</textarea>
        <div class="solution-order-actions">
          <button class="ui-button ui-button--ghost btn btn-ghost solution-move" type="button" aria-label="Переместить выше" title="Выше" data-solution-up="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="ui-button ui-button--ghost btn btn-ghost solution-move" type="button" aria-label="Переместить ниже" title="Ниже" data-solution-down="${idx}" ${idx === solutionOptions.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <button class="ui-button ui-button--ghost btn btn-ghost solution-remove" type="button" aria-label="Удалить вариант" data-solution-remove="${idx}">×</button>
      </div>`;

  const renderSolutions = () => {
    const wrap = document.getElementById('if-solutions');
    wrap.innerHTML = solutionOptions.length
      ? solutionOptions.map(solutionRowHtml).join('')
      : `<div class="tiny solution-empty">Вариантов пока нет</div>`;

    const fitSolutionTextarea = (el) => { el.style.height = 'auto'; el.style.height = Math.min(Math.max(el.scrollHeight, 54), 180) + 'px'; };
    wrap.querySelectorAll('[data-solution-text]').forEach((el) => {
      fitSolutionTextarea(el);
      el.oninput = () => { solutionOptions[Number(el.dataset.solutionText)].text = el.value; fitSolutionTextarea(el); };
    });
    wrap.querySelectorAll('[data-solution-choice]').forEach((el) => {
      el.onchange = () => {
        const selected = Number(el.dataset.solutionChoice);
        const checked = el.checked;
        solutionOptions = solutionOptions.map((o, idx) => ({ ...o, chosen: checked && idx === selected }));
        renderSolutions();
      };
    });
    const moveSolution = (from, to) => {
      if (to < 0 || to >= solutionOptions.length) return;
      [solutionOptions[from], solutionOptions[to]] = [solutionOptions[to], solutionOptions[from]];
      renderSolutions();
    };
    wrap.querySelectorAll('[data-solution-up]').forEach((el) => { el.onclick = () => moveSolution(Number(el.dataset.solutionUp), Number(el.dataset.solutionUp) - 1); });
    wrap.querySelectorAll('[data-solution-down]').forEach((el) => { el.onclick = () => moveSolution(Number(el.dataset.solutionDown), Number(el.dataset.solutionDown) + 1); });
    wrap.querySelectorAll('[data-solution-remove]').forEach((el) => {
      el.onclick = () => {
        solutionOptions.splice(Number(el.dataset.solutionRemove), 1);
        renderSolutions();
      };
    });
  };
  renderSolutions();
  document.getElementById('if-add-solution').onclick = () => {
    solutionOptions.push({ text: '', chosen: false });
    renderSolutions();
    const inputs = document.querySelectorAll('[data-solution-text]');
    inputs[inputs.length - 1]?.focus();
  };

  document.getElementById('if-cancel').onclick = () => Modal.close();
  if (editable) document.getElementById('if-save').onclick = async () => {
    solutionOptions = solutionOptions
      .map((o) => ({ text: (o.text || '').trim(), chosen: !!o.chosen }))
      .filter((o) => o.text);
    const payload = {
      title: document.getElementById('if-title').value.trim(),
      description: document.getElementById('if-desc').value.trim(),
      projectId: document.getElementById('if-project').value || null,
      goalId: document.getElementById('if-goal').value || null,
      severity: document.getElementById('if-severity').value,
      status: document.getElementById('if-status').value,
      relatedPersonIds: peoplePicker.getSelected(),
      solutionOptions,
    };
    // Обратная ссылка на Check-in, из которого создана проблема.
    if (!isEdit && opts.prefill?.sourceCheckinId) payload.sourceCheckinId = opts.prefill.sourceCheckinId;
    if (!payload.title) { toast('Укажите название проблемы'); return; }
    let saved;
    if (isEdit) saved = await Resources.issues.update(i.id, payload);
    else saved = await Resources.issues.create(payload);
    Modal.close();
    toast('Сохранено');
    if (!isEdit && opts.onSaved) await opts.onSaved(saved);
    else Router.render();
  };
}

async function deleteIssue(id) {
  const ok = await confirmAction('Удалить эту проблему?');
  if (!ok) return;
  await Resources.issues.remove(id);
  Modal.close();
  toast('Проблема удалена');
  Router.render();
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openIssueModal, deleteIssue });
