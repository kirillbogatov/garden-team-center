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
        <div class="checkins-toolbar-right">${checkinsCurrentWeekButtonHtml()}</div>
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
  return `<button type="button" class="ui-button ui-button--sm btn btn-sm btn-ghost checkins-today-btn" data-view-state="_checkinsWeek" data-view-value="${current}" data-view-render="checkins">Текущая неделя</button>`;
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

function checkinCellHtml(checkin, person, kind, weekStart = Views._checkinsWeek) {
  const text = checkin ? (checkin[kind] || '') : '';
  const spinOff = kind === 'willDo'
    ? { label: 'Создать задачу из этой записи', icon: 'tasks', command: 'spinOffTaskFromCheckin' }
    : kind === 'blockers'
      ? { label: 'Создать проблему из этой записи', icon: 'issues', command: 'spinOffIssueFromCheckin' }
      : null;
  return `<div class="checkins-cell checkins-cell-text checkins-cell-editable" role="cell">
    <textarea class="checkins-inline-editor" rows="1" data-checkin-inline="1" data-checkin-id="${checkin?.id || ''}" data-person-id="${person.id}" data-week-start="${weekStart}" data-kind="${kind}" aria-label="${kind === 'did' ? 'Что делал' : kind === 'willDo' ? 'Что буду делать' : 'Что мешает'}" placeholder="—">${escapeHtml(text)}</textarea>
    ${spinOff && checkin?.id && text.trim() ? `<button type="button" class="checkins-spinoff-btn" data-command-stop="1" data-command="${spinOff.command}" data-command-arg="${checkin.id}" title="${escapeHtml(spinOff.label)}" aria-label="${escapeHtml(spinOff.label)}">${icon(spinOff.icon, 13)}</button>` : ''}
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

function checkinsPersonHtml(checkins, team) {
  const personId = Views._checkinsPerson;
  const person = store.person(personId);
  const selectHtml = `<div class="checkins-person-select"><select id="checkins-person-select" aria-label="Сотрудник">${optionsHtml(team, 'id', (p) => p.name, personId)}</select></div>`;
  const mine = checkins.filter((c) => c.personId === personId).sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  const currentWeek = Views._checkinsWeek || localDateKey(mondayOf(new Date()));
  if (person && !mine.some((c) => c.weekStart === currentWeek)) mine.unshift({ id: '', personId, weekStart: currentWeek, did: '', willDo: '', blockers: '' });
  const rowsHtml = mine.length ? mine.map((c) => `<div class="checkins-history-table-row" role="row">
      <div class="checkins-history-table-cell checkins-history-period" role="cell"><span>${fmtDate(c.weekStart)}</span><span>${fmtDate(checkinWeekEnd(c.weekStart), { withYear: true })}</span></div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(c.id ? c : null, person, 'did', c.weekStart)}</div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(c.id ? c : null, person, 'willDo', c.weekStart)}</div>
      <div class="checkins-history-table-cell" role="cell">${checkinCellHtml(c.id ? c : null, person, 'blockers', c.weekStart)}</div>
    </div>`).join('') : '';
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

// «Что буду делать» → Задача, «Что мешает» → Проблема. Однонаправленная
// обратная ссылка sourceCheckinId — та же схема, что sourceJournalId в journal.js.
async function spinOffTaskFromCheckin(checkinId) {
  const c = _lastCheckins.find((x) => x.id === checkinId);
  if (!c || !c.willDo) return;
  const firstLine = c.willDo.split(/\r?\n/)[0].trim();
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : (firstLine || 'Задача из Check-in');
  await FeatureLoader.run('openTaskModal', null, {
    prefill: { title, description: c.willDo, assigneeIds: c.personId ? [c.personId] : [], sourceCheckinId: c.id },
  });
}

async function spinOffIssueFromCheckin(checkinId) {
  const c = _lastCheckins.find((x) => x.id === checkinId);
  if (!c || !c.blockers) return;
  const firstLine = c.blockers.split(/\r?\n/)[0].trim();
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : (firstLine || 'Проблема из Check-in');
  await FeatureLoader.run('openIssueModal', null, {
    prefill: { title, description: c.blockers, relatedPersonIds: c.personId ? [c.personId] : [], sourceCheckinId: c.id },
  });
}

FeatureLoader.register({ openCheckinModal, deleteCheckin, spinOffTaskFromCheckin, spinOffIssueFromCheckin });
