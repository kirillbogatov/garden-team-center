// Check-in — еженедельный статус команды: «Что делал», «Что буду делать», «Что мешает».
// Таблица показывает одну календарную неделю (понедельник — воскресенье) с
// переключением между неделями, либо историю конкретного сотрудника по всем неделям.

Views._checkinsMode = Views._checkinsMode || 'week';
Views._checkinsWeek = Views._checkinsWeek || null;
Views._checkinsPerson = Views._checkinsPerson || null;

// Кэш последнего списка записей — нужен, чтобы «+ Задача»/«+ Проблема» на ячейке
// могли достать текст записи по id без лишнего запроса к серверу.
let _lastCheckins = [];

function checkinWeekEnd(weekStartKey) {
  const d = new Date(`${weekStartKey}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return localDateKey(d);
}
function checkinShiftWeek(weekStartKey, deltaWeeks) {
  const d = new Date(`${weekStartKey}T00:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return localDateKey(d);
}

Views.checkins = async function () {
  const requestedPerson = Router.queryParam('person');
  if (requestedPerson) { Views._checkinsMode = 'person'; Views._checkinsPerson = requestedPerson; }
  setTopbar(`<h1>Check-in</h1>`);
  const view = document.getElementById('view');
  view.classList.add('checkins-wide');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const checkins = await Resources.checkins.list();
  _lastCheckins = checkins;
  // На дозвол не смотрим: в таблице показываем всю активную команду, кроме тех,
  // кто сейчас в отпуске/на больничном — как и в остальных сводках Garden.
  const team = store.activeTeam().filter((p) => p.status !== 'on_leave');
  if (!Views._checkinsWeek) Views._checkinsWeek = localDateKey(mondayOf(new Date()));
  if (!Views._checkinsPerson || !team.some((p) => p.id === Views._checkinsPerson)) Views._checkinsPerson = team[0]?.id || null;

  const modeTabsHtml = `<div class="list-tabs" role="tablist" aria-label="Режим отображения Check-in">
    <button type="button" class="list-tab ${Views._checkinsMode === 'week' ? 'active' : ''}" role="tab" aria-selected="${Views._checkinsMode === 'week'}" data-view-state="_checkinsMode" data-view-value="week" data-view-render="checkins">По неделям</button>
    <button type="button" class="list-tab ${Views._checkinsMode === 'person' ? 'active' : ''}" role="tab" aria-selected="${Views._checkinsMode === 'person'}" data-view-state="_checkinsMode" data-view-value="person" data-view-render="checkins">По сотрудникам</button>
  </div>`;

  const bodyHtml = Views._checkinsMode === 'person' ? checkinsPersonHtml(checkins, team) : checkinsWeekHtml(checkins, team);

  view.innerHTML = `
    <div class="checkins-view gcal-layout">
      <div class="gcal-toolbar checkins-toolbar">
        <div class="checkins-toolbar-left">${modeTabsHtml}</div>
        <div class="checkins-toolbar-center">${checkinsWeekNavHtml()}</div>
        <div class="checkins-toolbar-right"><div class="checkins-toolbar-actions">${checkinsCurrentWeekButtonHtml()}<button type="button" class="ui-button ui-button--sm btn btn-sm checkins-export-btn" data-command="openCheckinsExportModal">Экспорт</button></div></div>
      </div>
      ${bodyHtml}
    </div>
  `;

  if (Views._checkinsMode === 'person') wireCheckinsPersonSelect();
  wireCheckinInlineEditors();
};

function checkinsWeekNavHtml() {
  const weekStart = Views._checkinsWeek;
  const weekEnd = checkinWeekEnd(weekStart);
  const isCurrent = weekStart === localDateKey(mondayOf(new Date()));
  return `<div class="checkins-week-nav">
    <button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost" data-view-state="_checkinsWeek" data-view-value="${checkinShiftWeek(weekStart, -1)}" data-view-render="checkins" aria-label="Предыдущая неделя">${icon('chevronLeft', 14)}</button>
    <button type="button" class="checkins-week-label checkins-week-picker-btn" data-command="openCheckinsWeekPicker" title="Выбрать неделю">${fmtDate(weekStart)} – ${fmtDate(weekEnd, { withYear: true })}${isCurrent ? ' (текущая)' : ''}</button>
    <button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost" data-view-state="_checkinsWeek" data-view-value="${checkinShiftWeek(weekStart, 1)}" data-view-render="checkins" aria-label="Следующая неделя">${icon('chevronRight', 14)}</button>
  </div>`;
}

function checkinsCurrentWeekButtonHtml() {
  const current = localDateKey(mondayOf(new Date()));
  if (Views._checkinsWeek === current) return '';
  return `<button type="button" class="ui-button ui-button--sm btn btn-sm checkins-today-btn" data-view-state="_checkinsWeek" data-view-value="${current}" data-view-render="checkins">Текущая неделя</button>`;
}


function checkinsExportRows(checkins, personId, fromDate, toDate) {
  const rows = (checkins || []).filter((checkin) => {
    if (!checkin?.weekStart) return false;
    if (personId && personId !== 'all' && checkin.personId !== personId) return false;
    const weekEnd = checkinWeekEnd(checkin.weekStart);
    return checkin.weekStart <= toDate && weekEnd >= fromDate;
  });
  rows.sort((a, b) => {
    const aName = store.person(a.personId)?.name || '';
    const bName = store.person(b.personId)?.name || '';
    return aName.localeCompare(bName, 'ru') || String(a.weekStart).localeCompare(String(b.weekStart));
  });
  return rows.map((checkin) => [
    store.person(checkin.personId)?.name || 'Неизвестный сотрудник',
    checkin.weekStart,
    checkinWeekEnd(checkin.weekStart),
    checkin.did || '',
    checkin.willDo || '',
    checkin.blockers || '',
  ]);
}

function openCheckinsExportModal() {
  const selectedWeek = Views._checkinsWeek || localDateKey(mondayOf(new Date()));
  const defaultFrom = selectedWeek;
  const defaultTo = checkinWeekEnd(selectedWeek);
  const people = store.team().slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  const personOptions = [`<option value="all">Все сотрудники</option>`, ...people.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`)].join('');

  Modal.open(`
    <h2>Экспорт Check-in</h2>
    <div class="checkins-export-period">
      <div class="ui-field field">
        <label class="ui-field-label field-label" for="checkins-export-from">Период с</label>
        <input id="checkins-export-from" type="date" value="${defaultFrom}" />
      </div>
      <div class="ui-field field">
        <label class="ui-field-label field-label" for="checkins-export-to">По</label>
        <input id="checkins-export-to" type="date" value="${defaultTo}" />
      </div>
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="checkins-export-person">Сотрудники</label>
      <select id="checkins-export-person">${personOptions}</select>
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="checkins-export-format">Формат</label>
      <select id="checkins-export-format">
        <option value="xlsx">XLSX</option>
        <option value="csv">CSV</option>
        <option value="md">MD</option>
      </select>
    </div>
    <div class="ui-modal-actions modal-actions">
      <button type="button" class="ui-button btn" data-modal-close>Отмена</button>
      <button type="button" class="ui-button ui-button--primary btn btn-primary" id="checkins-export-submit">Выгрузить</button>
    </div>
  `);

  const submit = document.getElementById('checkins-export-submit');
  if (!submit) return;
  submit.onclick = () => {
    const from = document.getElementById('checkins-export-from')?.value || '';
    const to = document.getElementById('checkins-export-to')?.value || '';
    const personId = document.getElementById('checkins-export-person')?.value || 'all';
    const format = document.getElementById('checkins-export-format')?.value || 'xlsx';
    if (!from || !to) { toast('Укажите период выгрузки'); return; }
    if (from > to) { toast('Начало периода должно быть раньше конца'); return; }
    const rows = checkinsExportRows(_lastCheckins, personId, from, to);
    if (!rows.length) { toast('За выбранный период нет данных Check-in'); return; }
    const headers = ['Сотрудник', 'Неделя с', 'Неделя по', 'Что делал', 'Что буду делать', 'Что мешает'];
    const personSuffix = personId === 'all' ? 'all' : (store.person(personId)?.name || personId).replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, '-');
    TabularExport.download({ headers, rows, format, filename: `checkins_${from}_${to}_${personSuffix}` });
    Modal.close();
    toast('Экспорт готов');
  };
}

function openCheckinsWeekPicker() {
  const selectedWeek = Views._checkinsWeek || localDateKey(mondayOf(new Date()));
  Modal.open(`
    <h2>Выбрать неделю</h2>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="checkins-week-picker">Дата внутри нужной недели</label>
      <input id="checkins-week-picker" type="date" value="${selectedWeek}" autofocus />
    </div>
    <div class="ui-modal-actions modal-actions">
      <button type="button" class="ui-button btn" data-modal-close>Отмена</button>
      <button type="button" class="ui-button ui-button--primary btn btn-primary" id="checkins-week-picker-apply">Перейти</button>
    </div>
  `);
  const input = document.getElementById('checkins-week-picker');
  const apply = document.getElementById('checkins-week-picker-apply');
  if (!input || !apply) return;
  const go = () => {
    if (!input.value) return;
    Views._checkinsWeek = localDateKey(mondayOf(new Date(`${input.value}T00:00:00`)));
    Modal.close();
    Views.checkins();
  };
  apply.onclick = go;
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
}

// Подписи трёх колонок Check-in переиспользуются и в таблице по неделям,
// и в истории по сотруднику, и в aria-label каждого поля.
const CHECKIN_FIELD_LABEL = { did: 'Что делал', willDo: 'Что буду делать', blockers: 'Что мешает' };

function checkinCellHtml(checkin, person, kind, weekStart = Views._checkinsWeek) {
  const text = checkin ? (checkin[kind] || '') : '';
  const spinOff = kind === 'willDo'
    ? { label: 'Создать задачу из этой записи', icon: 'tasks', command: 'spinOffTaskFromCheckin' }
    : kind === 'blockers'
      ? { label: 'Создать проблему из этой записи', icon: 'issues', command: 'spinOffIssueFromCheckin' }
      : null;
  const spinOffHtml = spinOff && checkin?.id && text.trim()
    ? `<button type="button" class="checkins-spinoff-btn" data-command-stop="1" data-command="${spinOff.command}" data-command-arg="${checkin.id}" title="${escapeHtml(spinOff.label)}" aria-label="${escapeHtml(spinOff.label)}">${icon(spinOff.icon, 13)}</button>`
    : '';
  return `<div class="checkins-cell checkins-cell-text checkins-cell-editable" role="cell">
    <textarea class="checkins-inline-editor" rows="1" data-checkin-inline="1" data-checkin-id="${checkin?.id || ''}" data-person-id="${person.id}" data-week-start="${weekStart}" data-kind="${kind}" aria-label="${CHECKIN_FIELD_LABEL[kind]}" placeholder="—">${escapeHtml(text)}</textarea>
    ${spinOffHtml}
  </div>`;
}

function checkinsWeekHtml(checkins, team) {
  const weekStart = Views._checkinsWeek;
  const rows = team.map((p) => {
    const c = checkins.find((x) => x.personId === p.id && x.weekStart === weekStart) || null;
    return `<div class="checkins-table-row" role="row">
      <div class="checkins-cell checkins-cell-person" role="cell">${avatarHtml(p)}<span class="checkins-person-name">${escapeHtml(p.name)}</span></div>
      ${checkinCellHtml(c, p, 'did')}
      ${checkinCellHtml(c, p, 'willDo')}
      ${checkinCellHtml(c, p, 'blockers')}
    </div>`;
  }).join('');
  return `<div class="checkins-table" role="table" aria-label="Check-in за неделю">
    <div class="checkins-table-row checkins-table-head" role="row">
      <div class="checkins-cell checkins-cell-person" role="columnheader">Сотрудник</div>
      <div class="checkins-cell" role="columnheader">Что делал</div>
      <div class="checkins-cell" role="columnheader">Что буду делать</div>
      <div class="checkins-cell" role="columnheader">Что мешает</div>
    </div>
    ${rows || emptyState('В команде пока нет сотрудников', '', 'team')}
  </div>`;
}

function checkinsHistoryRowHtml(c, person) {
  const checkin = c.id ? c : null;
  return `<div class="checkins-history-table-row" role="row">
      <div class="checkins-history-table-cell checkins-history-period" role="cell"><span>${fmtDate(c.weekStart)}</span><span>${fmtDate(checkinWeekEnd(c.weekStart), { withYear: true })}</span></div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(checkin, person, 'did', c.weekStart)}</div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(checkin, person, 'willDo', c.weekStart)}</div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(checkin, person, 'blockers', c.weekStart)}</div>
    </div>`;
}

function checkinsPersonHtml(checkins, team) {
  const personId = Views._checkinsPerson;
  const person = store.person(personId);
  const selectHtml = `<div class="checkins-person-select"><select id="checkins-person-select" aria-label="Сотрудник">${optionsHtml(team, 'id', (p) => p.name, personId)}</select></div>`;
  const mine = checkins.filter((c) => c.personId === personId).sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  const currentWeek = Views._checkinsWeek || localDateKey(mondayOf(new Date()));
  if (person && !mine.some((c) => c.weekStart === currentWeek)) mine.unshift({ id: '', personId, weekStart: currentWeek, did: '', willDo: '', blockers: '' });
  const rowsHtml = mine.length ? mine.map((c) => checkinsHistoryRowHtml(c, person)).join('') : '';
  return `<div class="checkins-person-panel">${selectHtml}<div class="checkins-history-table" role="table" aria-label="История Check-in по сотруднику">
    <div class="checkins-history-table-row checkins-history-table-head" role="row">
      <div class="checkins-history-table-cell" role="columnheader">Период</div>
      <div class="checkins-history-table-cell" role="columnheader">Что делал</div>
      <div class="checkins-history-table-cell" role="columnheader">Что буду делать</div>
      <div class="checkins-history-table-cell" role="columnheader">Что мешает</div>
    </div>${rowsHtml}</div></div>`;
}

function wireCheckinsPersonSelect() {
  const select = document.getElementById('checkins-person-select');
  if (!select) return;
  select.onchange = () => { Views._checkinsPerson = select.value; Views.checkins(); };
}

function wireCheckinInlineEditors() {
  document.querySelectorAll('.checkins-inline-editor').forEach((field) => {
    let timer = null;
    const resize = () => { field.style.height = '0px'; field.style.height = `${Math.max(20, field.scrollHeight)}px`; };
    const save = async () => {
      clearTimeout(timer);
      const personId = field.dataset.personId;
      const weekStart = field.dataset.weekStart;
      const kind = field.dataset.kind;
      if (!personId || !weekStart || !kind) return;
      let checkin = field.dataset.checkinId ? _lastCheckins.find((x) => x.id === field.dataset.checkinId) : _lastCheckins.find((x) => x.personId === personId && x.weekStart === weekStart);
      const value = field.value.trim();
      if (!checkin && !value) return;
      const payload = checkin ? {
        personId: checkin.personId, weekStart: checkin.weekStart,
        did: checkin.did || '', willDo: checkin.willDo || '', blockers: checkin.blockers || '',
      } : { personId, weekStart, did: '', willDo: '', blockers: '' };
      payload[kind] = value;
      try {
        if (checkin) {
          const updated = await Resources.checkins.update(checkin.id, payload);
          Object.assign(checkin, updated || payload);
        } else {
          checkin = await Resources.checkins.create(payload);
          _lastCheckins.push(checkin);
          document.querySelectorAll(`.checkins-inline-editor[data-person-id="${CSS.escape(personId)}"][data-week-start="${CSS.escape(weekStart)}"]`).forEach((el) => { el.dataset.checkinId = checkin.id; });
        }
        field.classList.add('is-saved');
        setTimeout(() => field.classList.remove('is-saved'), 500);
      } catch (_) { field.classList.add('is-error'); }
    };
    resize();
    const cell = field.closest('.checkins-cell-editable');
    if (cell) cell.addEventListener('click', (event) => {
      if (event.target.closest('.checkins-spinoff-btn')) return;
      if (document.activeElement !== field) field.focus();
    });
    field.addEventListener('input', () => { resize(); field.classList.remove('is-error'); clearTimeout(timer); timer = setTimeout(save, 650); });
    field.addEventListener('blur', save);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); field.blur(); }
    });
  });
}

async function openCheckinModal(personId, checkinId) {
  const isEdit = Boolean(checkinId);
  const person = store.person(personId);
  const c = isEdit ? (_lastCheckins.find((x) => x.id === checkinId) || await Resources.checkins.get(checkinId)) : {};
  const weekStart = c.weekStart || Views._checkinsWeek || localDateKey(mondayOf(new Date()));
  Modal.open(`
    <h2>${isEdit ? 'Редактировать Check-in' : 'Новый Check-in'}</h2>
    <div class="ui-field field"><span class="ui-field-label field-label">Сотрудник</span><div class="checkins-modal-person">${person ? `${avatarHtml(person)}<span>${escapeHtml(person.name)}</span>` : '—'}</div></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cf-week">Неделя (понедельник)</label><input id="cf-week" type="date" value="${weekStart}" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cf-did">Что делал</label><textarea id="cf-did" rows="3">${escapeHtml(c.did || '')}</textarea></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cf-willdo">Что буду делать</label><textarea id="cf-willdo" rows="3">${escapeHtml(c.willDo || '')}</textarea></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cf-blockers">Что мешает</label><textarea id="cf-blockers" rows="2">${escapeHtml(c.blockers || '')}</textarea></div>
    <div class="ui-modal-actions modal-actions">
      ${isEdit ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" data-command="deleteCheckin" data-command-arg="${c.id}">${icon('trash', 14)} Удалить</button>` : ''}
      <button class="ui-button btn" id="cf-cancel">Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="cf-save">Сохранить</button>
    </div>
  `);
  document.getElementById('cf-cancel').onclick = () => Modal.close();
  document.getElementById('cf-save').onclick = async () => {
    const rawWeek = document.getElementById('cf-week').value;
    // Что бы ни выбрали в календаре — приводим к понедельнику этой недели,
    // чтобы запись всегда попадала в правильный столбец таблицы.
    const normalizedWeek = rawWeek ? localDateKey(mondayOf(new Date(`${rawWeek}T00:00:00`))) : weekStart;
    const payload = {
      personId,
      weekStart: normalizedWeek,
      did: document.getElementById('cf-did').value.trim(),
      willDo: document.getElementById('cf-willdo').value.trim(),
      blockers: document.getElementById('cf-blockers').value.trim(),
    };
    if (isEdit) await Resources.checkins.update(c.id, payload); else await Resources.checkins.create(payload);
    Modal.close();
    toast('Сохранено');
    Views.checkins();
  };
}

async function deleteCheckin(id) {
  const ok = await confirmAction('Удалить эту запись Check-in?');
  if (!ok) return;
  await Resources.checkins.remove(id);
  Modal.close();
  toast('Удалено');
  Views.checkins();
}

// Заголовок новой сущности — первая строка исходного текста, обрезанная до
// разумной длины заголовка; если запись пуста, подставляем нейтральное имя.
function checkinSpinOffTitle(text, fallback) {
  const firstLine = text.split(/\r?\n/)[0].trim();
  if (firstLine.length > 120) return `${firstLine.slice(0, 117)}…`;
  return firstLine || fallback;
}

// «Что буду делать» → Задача, «Что мешает» → Проблема. Однонаправленная
// обратная ссылка sourceCheckinId связывает созданную сущность с исходным Check-in.
async function spinOffTaskFromCheckin(checkinId) {
  const c = _lastCheckins.find((x) => x.id === checkinId);
  if (!c || !c.willDo) return;
  const title = checkinSpinOffTitle(c.willDo, 'Задача из Check-in');
  await FeatureLoader.run('openTaskModal', null, {
    prefill: { title, description: c.willDo, assigneeIds: c.personId ? [c.personId] : [], sourceCheckinId: c.id },
  });
}

async function spinOffIssueFromCheckin(checkinId) {
  const c = _lastCheckins.find((x) => x.id === checkinId);
  if (!c || !c.blockers) return;
  const title = checkinSpinOffTitle(c.blockers, 'Проблема из Check-in');
  await FeatureLoader.run('openIssueModal', null, {
    prefill: { title, description: c.blockers, relatedPersonIds: c.personId ? [c.personId] : [], sourceCheckinId: c.id },
  });
}

FeatureLoader.register({ openCheckinsWeekPicker, openCheckinsExportModal, openCheckinModal, deleteCheckin, spinOffTaskFromCheckin, spinOffIssueFromCheckin });
