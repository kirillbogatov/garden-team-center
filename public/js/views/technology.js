// Технологизация — план и история развивающих мероприятий.

Views._technologyYear = Views._technologyYear || null;
Views._technologyQuarter = Views._technologyQuarter || 'all';
let _lastTechnologyEvents = [];
let _lastTechnologyMeetings = [];

function technologyCurrentYear() { return new Date().getFullYear(); }
function technologyYearValue() { return Number(Views._technologyYear || technologyCurrentYear()); }
function technologyQuarterOf(dateKey) {
  const month = Number(String(dateKey || '').slice(5, 7));
  return month >= 1 && month <= 12 ? Math.floor((month - 1) / 3) + 1 : null;
}
function technologyQuarterLabel(value, year = technologyYearValue()) {
  const q = Number(value);
  return q >= 1 && q <= 4 ? `Q${q} ${year}` : 'Весь год';
}
function technologyTimingLabel(hours) {
  const value = Number(hours || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${String(value).replace('.', ',')} ч`;
}


function technologyMeetingForEvent(item, meetings = _lastTechnologyMeetings) {
  if (!item) return null;
  const topic = String(item.topic || '').trim().toLocaleLowerCase('ru');
  return (meetings || []).find((meeting) => {
    if (meeting?.sourceTechnologyEventId && String(meeting.sourceTechnologyEventId) === String(item.id)) return true;
    if (meeting?.type !== 'club') return false;
    const sameDate = String(meeting.date || '').slice(0, 10) === String(item.plannedDate || '').slice(0, 10);
    const sameTitle = String(meeting.title || '').trim().toLocaleLowerCase('ru') === topic;
    return Boolean(topic && sameDate && sameTitle);
  }) || null;
}

function technologyPeopleNames(ids) {
  return (ids || []).map((id) => store.person(id)?.name).filter(Boolean);
}

function technologyPeopleHtml(ids) {
  const people = (ids || []).map((id) => store.person(id)).filter(Boolean);
  if (!people.length) return '<span class="technology-empty-cell">—</span>';
  return `<div class="technology-people" aria-label="Драйверы и гости">${people.map((person) => `<div class="technology-person-row">${personAvatarLinkHtml(person, 22)}<span class="technology-person-name">${escapeHtml(person.name || '')}</span></div>`).join('')}</div>`;
}

function technologyInlineInputHtml(item, key, value, editable) {
  const common = `class="technology-inline-input" data-technology-inline="1" data-technology-id="${escapeHtml(item.id)}" data-technology-key="${key}" ${editable ? '' : 'disabled'}`;
  if (key === 'plannedDate') return `<div class="technology-date-editor"><input ${common} type="date" value="${escapeHtml(value || '')}" aria-label="Плановая дата проведения" /><button type="button" class="technology-date-picker" data-technology-date-picker="1" aria-label="Открыть календарь" tabindex="-1">${icon('calendar', 14)}</button></div>`;
  if (key === 'hours') return `<input ${common} type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(value || 1)}" aria-label="Тайминг в часах" />`;
  return `<input ${common} type="text" value="${escapeHtml(value || '')}" aria-label="Тема мероприятия" placeholder="Без темы" />`;
}

function technologyRowHtml(item) {
  const editable = Auth.canEditItem('labs', item);
  return `<div class="checkins-table-row technology-table-row ${item.completed ? 'is-completed' : ''}" role="row" data-technology-row="${escapeHtml(item.id)}">
    <div class="checkins-cell checkins-cell-text checkins-cell-editable technology-table-cell technology-date" role="cell">${technologyInlineInputHtml(item, 'plannedDate', item.plannedDate, editable)}</div>
    <div class="checkins-cell checkins-cell-text checkins-cell-editable technology-table-cell technology-topic" role="cell">${technologyInlineInputHtml(item, 'topic', item.topic, editable)}</div>
    <div class="checkins-cell checkins-cell-text checkins-cell-editable technology-table-cell technology-timing" role="cell">${technologyInlineInputHtml(item, 'hours', item.hours, editable)}</div>
    <div class="checkins-cell checkins-cell-text ${editable ? 'checkins-cell-editable ' : ''}technology-table-cell technology-people-cell" role="cell">
      ${editable ? `<div class="technology-people-read" data-technology-people-read="${escapeHtml(item.id)}">${(item.personIds || []).length ? technologyPeopleHtml(item.personIds) : '<span class="technology-people-placeholder">Добавить…</span>'}</div><div class="technology-inline-people" data-technology-people="${escapeHtml(item.id)}">${peoplePickerHtml('Добавить…')}</div>` : technologyPeopleHtml(item.personIds)}
    </div>
    <div class="checkins-cell technology-table-cell technology-done" role="cell" data-action-stop="1">
      <label class="technology-done-control" title="${item.completed ? 'Проведено' : 'Отметить проведённым'}">
        <input type="checkbox" ${item.completed ? 'checked' : ''} ${editable ? `data-command="toggleTechnologyEvent" data-command-arg="${escapeHtml(item.id)}" data-command-checked="1" data-command-stop="1"` : 'disabled'} aria-label="Мероприятие проведено" />
      </label>
    </div>
    ${(Auth.canCreate('meetings') || Auth.canDeleteItem('labs', item)) ? (() => {
      const scheduled = Boolean(technologyMeetingForEvent(item));
      const tooltip = scheduled ? 'Встреча уже запланирована' : 'Запланировать встречу в Garden';
      const meetingAction = Auth.canCreate('meetings')
        ? `<span class="technology-row-action-wrap${scheduled ? ' is-disabled' : ''}" title="${tooltip}"><button type="button" class="technology-row-action technology-meeting-action" ${scheduled ? 'disabled' : `data-command-stop="1" data-command="scheduleTechnologyMeeting" data-command-arg="${escapeHtml(item.id)}"`} aria-label="${tooltip}">${icon('scheduleMeeting', 15)}</button></span>`
        : '';
      const deleteAction = Auth.canDeleteItem('labs', item)
        ? `<span class="technology-row-action-wrap technology-delete-action-wrap" title="Удалить мероприятие"><button type="button" class="technology-row-action technology-delete-action" data-command-stop="1" data-command="deleteTechnologyEvent" data-command-arg="${escapeHtml(item.id)}" aria-label="Удалить мероприятие">${icon('trash', 15)}</button></span>`
        : '';
      return `<span class="technology-row-actions">${meetingAction}${deleteAction}</span>`;
    })() : ''}
  </div>`;
}

function technologyYearNavHtml() {
  const year = technologyYearValue();
  return `<div class="checkins-week-nav technology-year-nav">
    <button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost" data-view-state="_technologyYear" data-view-value="${year - 1}" data-view-render="technology" aria-label="Предыдущий год">${icon('chevronLeft', 14)}</button>
    <span class="checkins-week-label technology-year-label">${year}</span>
    <button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost" data-view-state="_technologyYear" data-view-value="${year + 1}" data-view-render="technology" aria-label="Следующий год">${icon('chevronRight', 14)}</button>
  </div>`;
}

function technologyCurrentYearButtonHtml() {
  const current = technologyCurrentYear();
  if (technologyYearValue() === current) return '';
  return `<button type="button" class="ui-button ui-button--sm btn btn-sm checkins-today-btn" data-view-state="_technologyYear" data-view-value="${current}" data-view-render="technology">Текущий год</button>`;
}

function technologyQuarterFilterHtml() {
  const selected = String(Views._technologyQuarter || 'all');
  const year = technologyYearValue();
  return `<label class="technology-quarter-filter"><select id="technology-quarter-filter" aria-label="Период">
    <option value="1" ${selected === '1' ? 'selected' : ''}>Q1 ${year}</option>
    <option value="2" ${selected === '2' ? 'selected' : ''}>Q2 ${year}</option>
    <option value="3" ${selected === '3' ? 'selected' : ''}>Q3 ${year}</option>
    <option value="4" ${selected === '4' ? 'selected' : ''}>Q4 ${year}</option>
    <option value="all" ${selected === 'all' ? 'selected' : ''}>Весь год</option>
  </select></label>`;
}

function technologyFilteredItems(items, year = technologyYearValue(), quarter = Views._technologyQuarter) {
  return (items || []).filter((item) => {
    if (!item?.plannedDate || Number(String(item.plannedDate).slice(0, 4)) !== Number(year)) return false;
    if (String(quarter || 'all') === 'all') return true;
    return technologyQuarterOf(item.plannedDate) === Number(quarter);
  }).sort((a, b) => String(a.plannedDate || '').localeCompare(String(b.plannedDate || '')) || String(a.topic || '').localeCompare(String(b.topic || ''), 'ru'));
}

Views.technology = async function () {
  setTopbar(`<h1>План мероприятий</h1>${Auth.canCreate('labs') ? '<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openTechnologyEventModal">+ Добавить мероприятие</button></div>' : ''}`);
  const view = document.getElementById('view');
  view.classList.remove('checkins-wide');
  view.classList.remove('task-page');
  view.innerHTML = '<div class="tiny">Загрузка…</div>';

  if (!Views._technologyYear) Views._technologyYear = String(technologyCurrentYear());
  const [items, meetings] = await Promise.all([Resources.technologyEvents.list(), Resources.meetings.list()]);
  _lastTechnologyEvents = items;
  _lastTechnologyMeetings = meetings;
  const filtered = technologyFilteredItems(items);

  view.innerHTML = `<div class="checkins-view gcal-layout technology-view">
    <div class="gcal-toolbar checkins-toolbar technology-toolbar">
      <div class="checkins-toolbar-left">${technologyQuarterFilterHtml()}</div>
      <div class="checkins-toolbar-center">${technologyYearNavHtml()}</div>
      <div class="checkins-toolbar-right"><div class="checkins-toolbar-actions">${technologyCurrentYearButtonHtml()}<button type="button" class="ui-button ui-button--sm btn btn-sm checkins-export-btn" data-command="openTechnologyExportModal">Экспорт</button></div></div>
    </div>
    <div class="checkins-table technology-table" role="table" aria-label="План мероприятий">
      <div class="checkins-table-row checkins-table-head technology-table-row technology-table-head" role="row">
        <div class="checkins-cell technology-table-cell" role="columnheader">Плановая дата</div>
        <div class="checkins-cell technology-table-cell" role="columnheader">Тема</div>
        <div class="checkins-cell technology-table-cell" role="columnheader">Тайминг, ч</div>
        <div class="checkins-cell technology-table-cell" role="columnheader">Драйвер / гость</div>
        <div class="checkins-cell technology-table-cell technology-done" role="columnheader">Проведено</div>
      </div>
      ${filtered.length ? filtered.map(technologyRowHtml).join('') : `<div class="technology-empty"><div class="zen-empty">На этот период мероприятий нет</div></div>`}
    </div>
  </div>`;

  const quarter = document.getElementById('technology-quarter-filter');
  if (quarter) quarter.onchange = () => { Views._technologyQuarter = quarter.value || 'all'; Views.technology(); };
  wireTechnologyInlineEditors();
};

function technologyExportRows(items, year, quarter) {
  return technologyFilteredItems(items, year, quarter).map((item) => [
    item.plannedDate || '',
    item.topic || '',
    Number(item.hours || 0),
    technologyPeopleNames(item.personIds).join(', '),
    item.completed ? 'Да' : 'Нет',
  ]);
}

function openTechnologyExportModal() {
  const selectedYear = technologyYearValue();
  const selectedQuarter = String(Views._technologyQuarter || 'all');
  Modal.open(`
    <h2>Экспорт плана мероприятий</h2>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="technology-export-year">Год</label>
      <input id="technology-export-year" type="number" min="2000" max="2100" step="1" value="${selectedYear}" />
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="technology-export-quarter">Квартал</label>
      <select id="technology-export-quarter">
        <option value="1" ${selectedQuarter === '1' ? 'selected' : ''}>Q1 ${selectedYear}</option>
        <option value="2" ${selectedQuarter === '2' ? 'selected' : ''}>Q2 ${selectedYear}</option>
        <option value="3" ${selectedQuarter === '3' ? 'selected' : ''}>Q3 ${selectedYear}</option>
        <option value="4" ${selectedQuarter === '4' ? 'selected' : ''}>Q4 ${selectedYear}</option>
        <option value="all" ${selectedQuarter === 'all' ? 'selected' : ''}>Весь год</option>
      </select>
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="technology-export-format">Формат</label>
      <select id="technology-export-format"><option value="xlsx">XLSX</option><option value="csv">CSV</option><option value="md">MD</option></select>
    </div>
    <div class="ui-modal-actions modal-actions">
      <button type="button" class="ui-button btn" data-modal-close>Отмена</button>
      <button type="button" class="ui-button ui-button--primary btn btn-primary" id="technology-export-submit">Выгрузить</button>
    </div>
  `);
  const submit = document.getElementById('technology-export-submit');
  if (!submit) return;
  submit.onclick = () => {
    const year = Number(document.getElementById('technology-export-year')?.value || 0);
    const quarter = document.getElementById('technology-export-quarter')?.value || 'all';
    const format = document.getElementById('technology-export-format')?.value || 'xlsx';
    if (!Number.isInteger(year) || year < 2000 || year > 2100) { toast('Укажите корректный год'); return; }
    const rows = technologyExportRows(_lastTechnologyEvents, year, quarter);
    if (!rows.length) { toast('За выбранный период нет мероприятий'); return; }
    const headers = ['Плановая дата проведения', 'Тема', 'Тайминг, часов', 'Драйвер / гость', 'Проведено'];
    const suffix = quarter === 'all' ? `${year}` : `${year}_q${quarter}`;
    TabularExport.download({ headers, rows, format, filename: `technology_${suffix}` });
    Modal.close();
    toast('Экспорт готов');
  };
}

async function saveTechnologyInlineField(field) {
  const id = field?.dataset?.technologyId;
  const key = field?.dataset?.technologyKey;
  if (!id || !key) return;
  const item = _lastTechnologyEvents.find((entry) => entry.id === id);
  if (!item || !Auth.canEditItem('labs', item)) return;
  let value = field.value;
  if (key === 'topic') value = String(value || '').trim();
  if (key === 'hours') value = Number(value || 0);
  if (key === 'plannedDate' && !value) { field.classList.add('is-error'); toast('Укажите плановую дату'); return; }
  if (key === 'topic' && !value) { field.classList.add('is-error'); toast('Укажите тему мероприятия'); return; }
  if (key === 'hours' && (!Number.isInteger(value) || value <= 0)) { field.classList.add('is-error'); toast('Тайминг должен быть целым числом часов больше нуля'); return; }
  if (String(item[key] ?? '') === String(value)) return;
  try {
    const updated = await Resources.technologyEvents.update(id, { [key]: value });
    Object.assign(item, updated || { [key]: value });
    field.classList.remove('is-error');
    field.classList.add('is-saved');
    setTimeout(() => field.classList.remove('is-saved'), 500);
  } catch (_) {
    field.classList.add('is-error');
  }
}

function wireTechnologyInlineEditors() {
  document.querySelectorAll('[data-technology-date-picker]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const input = button.closest('.technology-date-editor')?.querySelector('input[type="date"]');
      if (!input || input.disabled) return;
      input.focus();
      if (typeof input.showPicker === 'function') input.showPicker();
    });
  });

  document.querySelectorAll('.technology-inline-input').forEach((field) => {
    if (field.disabled) return;
    let timer = null;
    const cell = field.closest('.checkins-cell-editable');
    if (cell) cell.addEventListener('click', (event) => {
      if (document.activeElement !== field) field.focus();
    });
    const save = () => { clearTimeout(timer); saveTechnologyInlineField(field); };
    if (field.tagName === 'TEXTAREA') {
      field.addEventListener('input', () => { field.classList.remove('is-error'); clearTimeout(timer); timer = setTimeout(save, 650); });
      field.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); field.blur(); } });
    } else {
      field.addEventListener('input', () => field.classList.remove('is-error'));
      field.addEventListener('change', save);
    }
    field.addEventListener('blur', save);
  });

  document.querySelectorAll('[data-technology-people]').forEach((root) => {
    const id = root.dataset.technologyPeople;
    const item = _lastTechnologyEvents.find((entry) => entry.id === id);
    if (!item) return;
    if (!Auth.canEditItem('labs', item)) return;
    const read = document.querySelector(`[data-technology-people-read="${CSS.escape(id)}"]`);
    const picker = initPeoplePicker(root, store.people, item.personIds || [], {
      multi: true,
      placeholder: 'Добавить…',
      menuMinWidth: 440,
      menuClass: 'technology-people-menu',
      onChange: async (selected) => {
        try {
          const updated = await Resources.technologyEvents.update(id, { personIds: selected });
          Object.assign(item, updated || { personIds: selected });
          if (read) read.innerHTML = selected.length ? technologyPeopleHtml(selected) : '<span class="technology-people-placeholder">Добавить…</span>';
          root.classList.add('is-saved');
          setTimeout(() => root.classList.remove('is-saved'), 500);
        } catch (_) { root.classList.add('is-error'); }
      },
    });
    const input = root.querySelector('.pp-input');
    const activate = () => {
      root.classList.add('is-editing');
      read?.classList.add('is-hidden');
      requestAnimationFrame(() => input?.focus());
    };
    read?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); activate(); });
    root.closest('.technology-people-cell')?.addEventListener('click', (event) => {
      if (root.classList.contains('is-editing') || event.target.closest('.pp-chip-x')) return;
      activate();
    });
    input?.addEventListener('blur', () => setTimeout(() => {
      if (root.contains(document.activeElement)) return;
      root.classList.remove('is-editing');
      read?.classList.remove('is-hidden');
    }, 220));
  });
}



async function deleteTechnologyEvent(id) {
  const item = await Resources.technologyEvents.get(id);
  if (!item || !Auth.canDeleteItem('labs', item)) return;
  if (!(await confirmAction('Удалить это мероприятие?'))) return;
  await Resources.technologyEvents.remove(id);
  toast('Мероприятие удалено');
  Views.technology();
}

async function scheduleTechnologyMeeting(id) {
  if (!Auth.canCreate('meetings')) return;
  const [item, meetings] = await Promise.all([Resources.technologyEvents.get(id), Resources.meetings.list()]);
  if (!item) return;
  if (technologyMeetingForEvent(item, meetings)) {
    toast('Встреча уже запланирована');
    return;
  }
  return FeatureLoader.run('openMeetingModal', {
    type: 'club',
    date: item.plannedDate || todayStr(),
    title: item.topic || 'Технологизация',
    participantIds: Array.isArray(item.personIds) ? item.personIds.slice() : [],
    sourceTechnologyEventId: item.id,
  });
}

async function toggleTechnologyEvent(id, checked) {
  const item = await Resources.technologyEvents.get(id);
  if (!Auth.canEditItem('labs', item)) return;
  await Resources.technologyEvents.update(id, { completed: Boolean(checked) });
  Views.technology();
}

async function openTechnologyEventModal(id) {
  const isEdit = Boolean(id);
  const item = isEdit ? await Resources.technologyEvents.get(id) : {};
  const editable = !isEdit || Auth.canEditItem('labs', item);
  const schema = [
    { key: 'plannedDate', label: 'Плановая дата проведения', type: 'date' },
    { key: 'topic', label: 'Тема', type: 'text', trim: true, placeholder: 'Тема мероприятия' },
    {
      key: 'hours', label: 'Тайминг, часов',
      render: ({ id: fieldId, value, disabled }) => `<input id="${fieldId}" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(value || 1)}" ${disabled} />`,
      read: () => Number(document.getElementById('ef-hours')?.value || 0),
    },
    { key: 'personIds', label: 'Драйвер / гость', type: 'people', people: () => store.people, placeholder: 'Добавить сотрудника или стейкхолдера…' },
  ];

  return EntityForm.open({
    title: isEdit ? 'Редактировать мероприятие' : 'Новое мероприятие',
    value: { plannedDate: todayStr(), hours: 1, personIds: [], completed: false, ...item },
    mode: isEdit ? 'edit' : 'create',
    editable,
    schema,
    validate: (payload) => {
      if (!payload.plannedDate) return 'Укажите плановую дату';
      if (!payload.topic) return 'Укажите тему мероприятия';
      if (!Number.isFinite(payload.hours) || payload.hours <= 0 || !Number.isInteger(payload.hours)) return 'Укажите тайминг целым числом часов больше нуля';
      return null;
    },
    onSave: async (payload) => {
      if (!isEdit) payload.completed = false;
      if (isEdit) payload.completed = Boolean(item.completed);
      if (isEdit) await Resources.technologyEvents.update(item.id, payload);
      else await Resources.technologyEvents.create(payload);
      Modal.close();
      toast('Сохранено');
      Views.technology();
    },
    onDelete: isEdit && Auth.canDeleteItem('labs', item) ? async () => {
      if (!(await confirmAction('Удалить это мероприятие?'))) return;
      await Resources.technologyEvents.remove(item.id);
      Modal.close();
      toast('Мероприятие удалено');
      Views.technology();
    } : null,
  });
}

FeatureLoader.register({ openTechnologyEventModal, toggleTechnologyEvent, openTechnologyExportModal, scheduleTechnologyMeeting, deleteTechnologyEvent });
