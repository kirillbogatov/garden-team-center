// Договорённости — о чём и с кем договорился тимлид.

Views._agreementFilter = 'open';

Views.agreements = async function () {
  const mineOnly = Router.queryParam('mine') === '1';
  setTopbar(`<h1>${mineOnly ? 'Мои договорённости' : 'Договорённости'}</h1>${Auth.canCreate('agreements') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openAgreementModal">+ Добавить договорённость</button></div>` : ''}`);
  const view = document.getElementById('view');
  let agreements = (await Resources.agreements.list()).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (mineOnly) {
    const personId = Auth.user?.personId;
    agreements = agreements.filter((a) => a.createdByUserId === Auth.user?.id || (personId && (a.withPersonIds || []).includes(personId)));
  }

  const filters = [
    { key: 'open', label: 'Открытые', test: (a) => a.status !== 'done' },
    { key: 'done', label: 'Выполненные', test: (a) => a.status === 'done' },
    { key: 'all', label: 'Все', test: () => true },
  ];
  const active = filters.find((f) => f.key === Views._agreementFilter) || filters[0];
  const filtered = agreements.filter(active.test);

  const tabsHtml = `<div class="list-tabs" role="tablist" aria-label="Статус договорённостей">
    ${filters.map((f) => `<button type="button" class="list-tab ${Views._agreementFilter === f.key ? 'active' : ''}" role="tab" aria-selected="${Views._agreementFilter === f.key}" data-view-state="_agreementFilter" data-view-value="${f.key}" data-view-render="agreements">${f.label}</button>`).join('')}
  </div>`;

  view.innerHTML = `
    <div class="view-narrow work-list-page agreements-view">
      <div class="work-list-toolbar">${tabsHtml}</div>
      <div class="work-list-body">${filtered.length ? filtered.map(agreementCardHtml).join('') : emptyState('Договорённостей не найдено', '', 'agreements')}</div>
    </div>
  `;
};

function agreementCardHtml(a) {
  const project = store.project(a.projectId);
  const overdue = a.dueDate && a.status !== 'done' && a.dueDate.slice(0, 10) < todayStr();
  const people = (a.withPersonIds || []).map((id) => store.person(id)).filter(Boolean);
  const openIdx = registerAction(() => openAgreementModal(a.id));
  return `<div class="ui-row ui-row--agreement list-row work-entity-row ${a.status === 'done' ? 'is-done' : ''}" data-action-id="${openIdx}">
    <label class="agreement-row-check" title="${a.status === 'done' ? 'Выполнено' : 'Отметить выполненной'}" data-stop-propagation="1">
      <input type="checkbox" ${a.status === 'done' ? 'checked' : ''} data-command="toggleAgreement" data-command-arg="${a.id}" data-command-checked="1" data-command-stop="1" />
    </label>
    <div class="work-row-copy">
      <div class="work-row-title agreement-row-text">${renderMentionText(a.text)}</div>
      <div class="work-row-meta">${a.dueDate ? `<span class="${overdue ? 'is-overdue' : ''}">Срок — ${dueLabel(a.dueDate)}</span>` : `от ${fmtDate(a.date)}`}</div>
    </div>
    <div class="work-row-right">
      ${project ? projectChip(project) : ''}
      ${people.length ? `<div class="work-row-avatars">${people.slice(0, 3).map((person) => personAvatarLinkHtml(person)).join('')}</div>` : ''}
      <span class="work-row-chevron">${icon('chevronRight', 12)}</span>
    </div>
  </div>`;
}

async function toggleAgreement(id, checked) {
  await Resources.agreements.update(id, { status: checked ? 'done' : 'open' });
  Views.agreements();
}

async function openAgreementModal(id, opts) {
  opts = opts || {};
  const isEdit = !!id;
  // prefill приходит из «Умного поиска»: «создай договорённость …» открывает форму
  // с уже подставленным текстом, чтобы фразу не пришлось набирать второй раз.
  const a = isEdit ? await Resources.agreements.get(id) : (opts.prefill ? { ...opts.prefill } : {});
  const editable = !isEdit || Auth.canEditItem('agreements', a, ['withPersonIds']);
  return EntityForm.open({
    title: isEdit ? 'Редактировать договорённость' : 'Новая договорённость',
    value: { date: todayStr(), status: 'open', ...a },
    mode: isEdit ? 'edit' : 'create',
    editable,
    schema: [
      {
        key: 'text',
        label: 'О чём договорились (наберите @ для упоминания)',
        render: ({ id: fieldId, value }) => `<div id="${fieldId}" class="je-editable agreement-mention-editor" contenteditable="true" role="textbox" aria-multiline="true" tabindex="0">${mentionsToEditableHtml(value || '')}</div>`,
        init: ({ root }) => attachMentionAutocompleteCE(root, document.querySelector('.modal-panel')),
        read: () => serializeEditableToText(document.getElementById('ef-text')).trim(),
      },
      { key: 'date', label: 'Дата', type: 'date', default: todayStr() },
      { key: 'dueDate', label: 'Срок (необязательно)', type: 'date', parse: (value) => value || null },
      { key: 'projectId', label: 'Проект (необязательно)', type: 'select', emptyLabel: '—', options: () => (store.projects || []).map((project) => ({ value: project.id, label: project.name })), parse: (value) => value || null },
      { key: 'status', label: 'Статус', type: 'select', default: 'open', options: Object.entries(AGREEMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
    ],
    validate: (payload) => payload.text ? null : 'Опишите договорённость',
    onSave: async (payload) => {
      payload.withPersonIds = extractMentionIdsClient(payload.text);
      let saved;
      if (isEdit) saved = await Resources.agreements.update(a.id, payload);
      else saved = await Resources.agreements.create(payload);
      Modal.close();
      toast('Сохранено');
      if (!isEdit && opts.onSaved) await opts.onSaved(saved);
      else Views.agreements();
    },
    onDelete: isEdit && Auth.canDeleteItem('agreements', a) ? async () => {
      const ok = await confirmAction('Удалить эту договорённость?');
      if (!ok) return;
      await Resources.agreements.remove(a.id);
      Modal.close();
      toast('Договорённость удалена');
      Router.render();
    } : null,
  });
}

function extractMentionIdsClient(text) {
  const ids = [];
  let m;
  MENTION_DISPLAY_RE.lastIndex = 0;
  while ((m = MENTION_DISPLAY_RE.exec(text)) !== null) {
    if (m[2] !== 'project') ids.push(m[3]);
  }
  return ids;
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ toggleAgreement, openAgreementModal });
