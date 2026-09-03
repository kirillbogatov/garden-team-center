// Календарь — строгая месячная сетка в духе Google Calendar.

const now0 = new Date();
Views._calMode = 'month';
Views._calYear = now0.getFullYear();
Views._calMonth = now0.getMonth() + 1;
// Как и в «Задачах» — панель фильтров сворачиваема, но здесь по умолчанию свёрнута.
try { Views._calFiltersCollapsed = localStorage.getItem('garden:calFiltersCollapsed') !== '0'; } catch (_) { Views._calFiltersCollapsed = true; }

const CAL_EMOJI = { meeting: '📅', birthday: '🎂', vacation: '🌴', sick: '🤒', dayoff: '☕' };
const CAL_TYPES = [
  { key: 'meeting', label: 'Встречи', cls: 'ev-meeting' },
  { key: 'birthday', label: 'Дни рождения', cls: 'ev-birthday' },
  { key: 'vacation', label: 'Отпуска', cls: 'ev-absence' },
  { key: 'sick', label: 'Больничные', cls: 'ev-absence' },
  { key: 'dayoff', label: 'Отгулы', cls: 'ev-absence' },
];

function loadCalFilters() {
  const all = { meeting: true, birthday: true, vacation: true, sick: true, dayoff: true };
  try {
    const raw = localStorage.getItem('garden:calFilters');
    if (raw) return { ...all, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return all;
}
function saveCalFilters() {
  try { localStorage.setItem('garden:calFilters', JSON.stringify(Views._calFilters)); } catch (_) { /* ignore */ }
}
function toggleCalFilter(key) {
  Views._calFilters[key] = !Views._calFilters[key];
  saveCalFilters();
  Views.calendar();
}

Views._calFilters = loadCalFilters();

Views.calendar = async function () {
  // Референс (/dashboard/calendar) держит переключатель фильтров прямо в
  // тулбаре календаря, рядом с «Today», а не в шапке страницы — там из общих
  // действий страницы остаётся только основное «+ Добавить отсутствие»,
  // фильтр переехал в calToolbarHtml().
  setTopbar(`<h1>Календарь</h1>
    <div class="actions">
      <button type="button" class="ui-button ui-button--primary btn btn-primary calendar-add-absence" data-command="openCalendarAbsenceModal">+ Добавить отсутствие</button>
    </div>`);
  document.getElementById('view').classList.add('gcal-wide', 'gcal-fit-height');
  if (Views._calMode === 'year') await renderYearCalendar();
  else await renderMonthCalendar();
  const filterToggle = document.getElementById('cal-filter-toggle');
  if (filterToggle) filterToggle.onclick = () => {
    const closing = !Views._calFiltersCollapsed;
    const apply = () => {
      Views._calFiltersCollapsed = !Views._calFiltersCollapsed;
      try { localStorage.setItem('garden:calFiltersCollapsed', Views._calFiltersCollapsed ? '1' : '0'); } catch (_) { /* ignore */ }
      Views.calendar();
    };
    if (closing) collapseThen(document.querySelector('.gcal-filter-panel'), apply); else apply();
  };
};


function openCalendarAbsenceModal() {
  const canChoosePerson = Auth.canManage('vacations');
  const ownPerson = store.person(Auth.user?.personId);
  const people = store.team();
  const today = todayStr();
  Modal.open(`<h2>Добавить отсутствие</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cal-absence-person">Сотрудник</label>
      ${canChoosePerson ? `<select id="cal-absence-person"><option value="">—</option>${people.map((person) => `<option value="${person.id}" ${person.id === Auth.user?.personId ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join('')}</select>` : `<input id="cal-absence-person-label" value="${escapeHtml(ownPerson?.name || Auth.user?.displayName || '')}" disabled /><input id="cal-absence-person" type="hidden" value="${escapeHtml(Auth.user?.personId || '')}" />`}
    </div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="cal-absence-type">Тип</label><select id="cal-absence-type">
      <option value="vacation">Отпуск</option><option value="sick">Больничный</option><option value="dayoff">Отгул</option>
    </select></div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="cal-absence-start">Начало</label><input id="cal-absence-start" type="date" value="${today}" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="cal-absence-end">Окончание</label><input id="cal-absence-end" type="date" value="${today}" /></div>
    </div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button btn" id="cal-absence-cancel">Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="cal-absence-save">Добавить</button></div>`);
  document.getElementById('cal-absence-cancel').onclick = () => Modal.close();
  document.getElementById('cal-absence-save').onclick = async () => {
    const personId = document.getElementById('cal-absence-person').value || null;
    const type = document.getElementById('cal-absence-type').value;
    const startDate = document.getElementById('cal-absence-start').value;
    const endDate = document.getElementById('cal-absence-end').value;
    if (!personId) { toast('Укажите сотрудника'); return; }
    if (!startDate || !endDate) { toast('Укажите даты отсутствия'); return; }
    if (endDate < startDate) { toast('Дата окончания не может быть раньше начала'); return; }
    try {
      await Resources.vacations.create({ personId, type, startDate, endDate });
      Modal.close();
      Views._calYear = Number(startDate.slice(0,4));
      Views._calMonth = Number(startDate.slice(5,7));
      Views._calMode = 'month';
      toast('Отсутствие добавлено');
      Views.calendar();
    } catch (err) {
      console.error(err);
      toast('Не удалось добавить отсутствие');
    }
  };
}

function calDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Тип встречи (1:1 / PR / другое) важен в календаре не меньше темы — показываем его явно,
// в общем для всех событий формате «Имя/Тема — тип события».
function meetingLabelWithType(mt) {
  const typeLabel = MEETING_TYPE_LABEL[mt.type];
  const title = meetingDisplayTitle(mt);
  return typeLabel ? `${title} — ${typeLabel}` : title;
}

function calToolbarHtml() {
  const mode = Views._calMode;
  const title = mode === 'year'
    ? `${Views._calYear}`
    : `${MONTHS_RU_NOM[Views._calMonth - 1]} <span>${Views._calYear}</span>`;
  const filtersCollapsed = !!Views._calFiltersCollapsed;
  // Как в «Задачах»: когда фильтры свёрнуты, панель вообще не рендерится (а не просто прячется),
  // чтобы над календарём не оставалось пустого места.
  const filtersHtml = filtersCollapsed ? '' : `<div class="gcal-filter-panel"><div class="gcal-filters">
      ${CAL_TYPES.map((t) => `<button class="gcal-filter-chip ${t.cls} ${Views._calFilters[t.key] ? 'active' : ''}" data-command="toggleCalFilter" data-command-arg="${t.key}">${CAL_EMOJI[t.key]} ${escapeHtml(t.label)}</button>`).join('')}
    </div></div>`;
  // Порядок — как в референсе (/dashboard/calendar): переключатель вида слева,
  // навигация по датам в центре, «Today»+фильтр справа. У Garden только два
  // реальных режима (Месяц/Год, не 4 как в демо), поэтому переключатель — те
  // же текстовые вкладки, что были, просто на новом месте.
  return `
    <div class="gcal-toolbar">
      <div class="gcal-view-switch">
        <button class="${mode === 'month' ? 'active' : ''}" data-view-state="_calMode" data-view-value="month" data-view-render="calendar">Месяц</button>
        <button class="${mode === 'year' ? 'active' : ''}" data-view-state="_calMode" data-view-value="year" data-view-render="calendar">Год</button>
      </div>
      <div class="gcal-nav">
        <button class="ui-button btn btn-icon" title="${mode === 'year' ? 'Предыдущий год' : 'Предыдущий месяц'}" data-command="changeCalendarPeriod" data-command-arg="-1">${icon('chevronLeft')}</button>
        <div class="gcal-title">${title}</div>
        <button class="ui-button btn btn-icon" title="${mode === 'year' ? 'Следующий год' : 'Следующий месяц'}" data-command="changeCalendarPeriod" data-command-arg="1">${icon('chevronRight')}</button>
      </div>
      <div class="gcal-toolbar-right">
        <button type="button" class="ui-icon-button gcal-filter-toggle ${filtersCollapsed ? '' : 'is-active'}" id="cal-filter-toggle" aria-expanded="${filtersCollapsed ? 'false' : 'true'}" title="${filtersCollapsed ? 'Показать фильтры' : 'Скрыть фильтры'}">${icon('filter', 15)}</button>
        <button class="ui-button ui-button--primary btn btn-primary gcal-today" data-command="goToday">Сегодня</button>
      </div>
    </div>
    ${filtersHtml}`;
}

async function renderMonthCalendar() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const data = await api.get(`/api/calendar/month?year=${Views._calYear}&month=${Views._calMonth}`);
  const y = Views._calYear;
  const m = Views._calMonth;
  const filters = Views._calFilters;
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // ПН = 0
  const gridStart = new Date(y, m - 1, 1 - startOffset);
  const todayKey = todayStr();

  // Всегда 6 недель: календарь не меняет число строк при переключении месяцев
  // (высота отдельной строки может вырасти, если в неё попадает много многодневных событий).
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return { date, key: calDateKey(date), outside: date.getMonth() !== m - 1 };
  });

  function dayEvents(cell) {
    const key = cell.key;
    const evs = [];

    if (filters.meeting) {
      (data.meetings || [])
        .filter((mt) => (mt.date || '').slice(0, 10) === key)
        .sort((a, b) => meetingLabelWithType(a).localeCompare(meetingLabelWithType(b), 'ru'))
        .forEach((mt) => evs.push({
          cls: 'ev-meeting',
          label: meetingLabelWithType(mt),
          go: () => FeatureLoader.run('openMeetingModal', mt),
        }));
    }

    if (filters.birthday) {
      (data.birthdays || [])
        .filter((person) => person.birthday && person.birthday.slice(5) === key.slice(5))
        .forEach((person) => evs.push({
          cls: 'ev-birthday',
          label: `${person.name} — день рождения`,
          go: () => Router.go(personPath(person)),
        }));
    }

    // Дедлайны задач в календаре не показываем — у задач есть свой раздел.

    return evs;
  }

  function eventHtml(e) {
    const idx = registerAction(e.go);
    const title = e.title || e.label;
    return `<div class="gcal-event ${e.cls}" data-action-id="${idx}" data-action-stop="1" title="${escapeHtml(title)}">
      <span class="gcal-event-icon">${CAL_EMOJI[e.cls === 'ev-meeting' ? 'meeting' : 'birthday']}</span>
      <span class="gcal-event-title">${escapeHtml(e.label)}</span>
    </div>`;
  }

  function weekSpanData(weekCells) {
    const firstKey = weekCells[0].key;
    const lastKey = weekCells[6].key;
    const candidates = (data.vacations || [])
      .filter((v) => filters[v.type] && v.startDate <= lastKey && v.endDate >= firstKey)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));

    const lanes = [];
    const spans = candidates.map((v) => {
      const start = v.startDate < firstKey ? firstKey : v.startDate;
      const end = v.endDate > lastKey ? lastKey : v.endDate;
      const startCol = weekCells.findIndex((c) => c.key === start) + 1;
      const endCol = weekCells.findIndex((c) => c.key === end) + 1;

      let lane = 0;
      while (lanes[lane] && lanes[lane].some(([a, b]) => !(endCol < a || startCol > b))) lane++;
      if (!lanes[lane]) lanes[lane] = [];
      lanes[lane].push([startCol, endCol]);

      const person = store.person(v.personId);
      const type = v.type === 'vacation' ? 'отпуск' : v.type === 'sick' ? 'больничный' : 'отгул';
      const label = `${person ? person.name : 'Сотрудник'} — ${type}`;
      const go = person ? () => Router.go(personPath(person)) : () => Router.go('/calendar');
      const idx = registerAction(go);
      const startsBefore = v.startDate < firstKey;
      const endsAfter = v.endDate > lastKey;

      return {
        lane,
        html: `<div class="gcal-span-event ev-${escapeHtml(v.type || 'vacation')} ${startsBefore ? 'continues-left' : ''} ${endsAfter ? 'continues-right' : ''}"
          style="grid-column:${startCol} / ${endCol + 1};--lane:${lane}"
          data-action-id="${idx}" data-action-stop="1"
          title="${escapeHtml(label)}">
          <span class="gcal-span-icon">${CAL_EMOJI[v.type] || CAL_EMOJI.vacation}</span><span class="gcal-event-title">${escapeHtml(label)}</span>
        </div>`,
      };
    });

    return { html: spans.map((s) => s.html).join(''), laneCount: lanes.length };
  }

  const weeks = Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  view.innerHTML = `
    <div class="gcal-shell">
      ${calToolbarHtml()}

      <div class="gcal-calendar">
        <div class="gcal-month-weeks">
          <div class="gcal-dow-row">${DOW_RU.map((d) => `<div class="gcal-dow">${escapeHtml(d)}</div>`).join('')}</div>
          ${weeks.map((week) => {
            const spanData = weekSpanData(week);
            return `<div class="gcal-week" style="--span-lanes:${spanData.laneCount}">
              ${week.map((cell, i) => {
                const isToday = cell.key === todayKey;
                const evs = dayEvents(cell);
                const createDate = cell.key;
                return `<div class="gcal-cell ${cell.outside ? 'outside' : ''} ${isToday ? 'today-cell' : ''}" style="grid-column:${i + 1}" ${cell.outside ? '' : `data-command="openMeetingOnDate" data-command-arg="${createDate}"`}>
                  <div class="gcal-dayline"><span class="gcal-day ${isToday ? 'today' : ''}">${cell.date.getDate()}</span>${isToday ? '<span class="gcal-today-label">сегодня</span>' : ''}</div>
                  <div class="gcal-events">${evs.map(eventHtml).join('')}</div>
                </div>`;
              }).join('')}
              ${spanData.html}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  scheduleCalendarFit();
}

// Ячейки подстраиваются под высоту экрана. Сетка всегда влезает целиком (ряды делят
// доступную высоту в CSS), а здесь решается, сколько содержимого в эту высоту влезло:
// лишние события и многодневные полосы прячутся и превращаются в «ещё N».
// Геометрию не хардкодим, а измеряем — она зависит от темы, масштаба интерфейса и шрифта.
function fitMonthCalendar() {
  const root = document.querySelector('.gcal-fit-height');
  if (!root) return;
  const weeks = Array.from(root.querySelectorAll('.gcal-week'));
  if (!weeks.length) return;

  // Сброс прошлой подгонки: иначе измерения пойдут по уже спрятанным элементам.
  root.querySelectorAll('.gcal-event, .gcal-span-event').forEach((el) => { el.style.display = ''; });
  root.querySelectorAll('.gcal-more').forEach((el) => el.remove());

  const sample = root.querySelector('.gcal-event');
  const eventHeight = (sample && sample.offsetHeight) || 19;
  const anyBox = root.querySelector('.gcal-events');
  const gap = anyBox ? (parseFloat(getComputedStyle(anyBox).rowGap) || 0) : 2;
  let moreHeight = 14;
  if (anyBox) {
    const probe = document.createElement('div');
    probe.className = 'gcal-more';
    probe.textContent = 'ещё 9';
    anyBox.appendChild(probe);
    moreHeight = probe.offsetHeight || moreHeight;
    probe.remove();
  }
  // Минимум, который стоит оставить дню: одна строка события либо счётчик «ещё N».
  const minLine = Math.max(eventHeight, moreHeight);
  const laneOf = (bar) => Number(bar.style.getPropertyValue('--lane')) || 0;

  weeks.forEach((week) => {
    const rowHeight = week.clientHeight;
    if (!rowHeight) return;
    const cells = Array.from(week.querySelectorAll('.gcal-cell'));
    const probeCell = cells[0];
    const probeBox = probeCell && probeCell.querySelector('.gcal-events');
    const padBottom = probeCell ? (parseFloat(getComputedStyle(probeCell).paddingBottom) || 0) : 0;
    const weekHasEvents = !!week.querySelector('.gcal-event');
    const bars = Array.from(week.querySelectorAll('.gcal-span-event'));

    // 1. Сколько дорожек многодневных событий показать. Важно не только чтобы сама
    //    полоса влезла в ряд, но и чтобы под события дня осталась хотя бы одна строка —
    //    иначе полосы съедают ячейку целиком и «ещё N» уже некуда поставить.
    let lanes = bars.reduce((max, bar) => Math.max(max, laneOf(bar) + 1), 0);
    while (lanes > 0) {
      week.style.setProperty('--span-lanes', String(lanes));
      const barsFit = bars.every((bar) => laneOf(bar) >= lanes ||
        bar.offsetTop + bar.offsetHeight <= rowHeight);
      const roomLeft = probeBox ? probeCell.clientHeight - probeBox.offsetTop - padBottom : rowHeight;
      if (barsFit && (!weekHasEvents || roomLeft >= minLine)) break;
      lanes--;
    }
    week.style.setProperty('--span-lanes', String(lanes));

    const hiddenBarsByColumn = new Map();
    bars.forEach((bar) => {
      if (laneOf(bar) < lanes) return;
      bar.style.display = 'none';
      const span = String(bar.style.gridColumn || '').split('/');
      const from = parseInt(span[0], 10) || 1;
      const to = (parseInt(span[1], 10) || from + 1) - 1;
      for (let column = from; column <= to; column++) {
        hiddenBarsByColumn.set(column, (hiddenBarsByColumn.get(column) || 0) + 1);
      }
    });

    // 2. События внутри ячеек — когда верхний отступ уже окончательный.
    cells.forEach((cell, index) => {
      const box = cell.querySelector('.gcal-events');
      if (!box) return;
      const events = Array.from(box.querySelectorAll('.gcal-event'));
      const hiddenBars = hiddenBarsByColumn.get(index + 1) || 0;
      if (!events.length && !hiddenBars) return;

      const available = cell.clientHeight - box.offsetTop - padBottom;
      // Все события одной высоты, поэтому вместимость считается, а не накапливается.
      const capacity = (reserve) => {
        const space = available - (reserve > 0 ? reserve + gap : 0);
        if (space < eventHeight) return 0;
        return Math.min(events.length, Math.floor((space + gap) / (eventHeight + gap)));
      };

      let visible = capacity(0);
      let rest = (events.length - visible) + hiddenBars;
      if (rest > 0) {
        visible = capacity(moreHeight);
        rest = (events.length - visible) + hiddenBars;
      }
      for (let i = visible; i < events.length; i++) events[i].style.display = 'none';

      if (rest > 0 && available >= moreHeight) {
        const more = document.createElement('div');
        more.className = 'gcal-more';
        more.textContent = `ещё ${rest}`;
        box.appendChild(more);
      }
    });
  });
}

// Пересчитываем после отрисовки и при изменении размера окна.
function scheduleCalendarFit() {
  requestAnimationFrame(() => requestAnimationFrame(fitMonthCalendar));
  if (Views._calFitBound) return;
  Views._calFitBound = true;
  let timer = null;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(fitMonthCalendar, 90);
  });
}

function changeCalendarPeriod(delta) {
  const step = Number(delta) || 0;
  if (Views._calMode === 'year') { Views._calYear += step; Views.calendar(); }
  else shiftMonth(step);
}

function openMeetingOnDate(date) { return FeatureLoader.run('openMeetingModal', { date }); }

function openCalendarMonth(month) {
  Views._calMonth = Number(month) || 1;
  Views._calMode = 'month';
  Views.calendar();
}

function shiftMonth(delta) {
  let m = Views._calMonth + delta;
  let y = Views._calYear;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  Views._calMonth = m;
  Views._calYear = y;
  Views.calendar();
}

function goToday() {
  const n = new Date();
  Views._calYear = n.getFullYear();
  Views._calMonth = n.getMonth() + 1;
  Views._calMode = 'month';
  Views.calendar();
}

function calYearDate(value) {
  const raw = String(value || '').slice(0, 10);
  return raw.length >= 10 ? `${raw.slice(5, 7)}.${raw.slice(8, 10)}` : '';
}

async function renderYearCalendar() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const year = Views._calYear;
  const filters = Views._calFilters;
  // Год собираем из тех же месячных данных, что и режим «Месяц».
  // Так представления не расходятся: любое событие, видимое в месяце,
  // гарантированно попадает и в годовой обзор.
  const monthlyData = await Promise.all(
    Array.from({ length: 12 }, (_, i) => api.get(`/api/calendar/month?year=${year}&month=${i + 1}`))
  );
  const uniqBy = (items, keyFn) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const data = {
    meetings: uniqBy(monthlyData.flatMap((m) => m.meetings || []), (x) => x.id || `${x.date}|${x.title}|${x.type}`),
    birthdays: uniqBy(monthlyData.flatMap((m) => m.birthdays || []), (x) => x.id || `${x.name}|${x.birthday}`),
    vacations: uniqBy(monthlyData.flatMap((m) => m.vacations || []).filter((x) => String(x.startDate || '').startsWith(String(year))), (x) => x.id || `${x.personId}|${x.type}|${x.startDate}|${x.endDate}`),
  };
  const monthItems = Array.from({ length: 12 }, () => []);

  function pushItem(monthIndex, item) {
    if (monthIndex < 0 || monthIndex > 11) return;
    monthItems[monthIndex].push(item);
  }

  if (filters.meeting) {
    (data.meetings || []).forEach((mt) => {
      const mi = parseInt(String(mt.date || '').slice(5, 7), 10) - 1;
      pushItem(mi, {
        sort: String(mt.date),
        cls: 'ev-meeting',
        emoji: CAL_EMOJI.meeting,
        dateLabel: calYearDate(mt.date),
        text: meetingLabelWithType(mt),
        go: () => FeatureLoader.run('openMeetingModal', mt),
      });
    });
  }

  if (filters.birthday) {
    (data.birthdays || []).forEach((p) => {
      if (!p.birthday) return;
      const mi = parseInt(p.birthday.slice(5, 7), 10) - 1;
      pushItem(mi, {
        sort: `${year}-${p.birthday.slice(5)}`,
        cls: 'ev-birthday',
        emoji: CAL_EMOJI.birthday,
        dateLabel: calYearDate(`${year}-${p.birthday.slice(5)}`),
        text: `${p.name} — день рождения`,
        go: () => Router.go(personPath(p)),
      });
    });
  }

  (data.vacations || []).forEach((v) => {
    if (!filters[v.type]) return;
    const mi = parseInt((v.startDate || '').slice(5, 7), 10) - 1;
    const person = store.person(v.personId);
    const typeLabel = v.type === 'vacation' ? 'отпуск' : v.type === 'sick' ? 'больничный' : 'отгул';
    pushItem(mi, {
      sort: v.startDate,
      cls: 'ev-absence',
      emoji: CAL_EMOJI[v.type] || CAL_EMOJI.vacation,
      dateLabel: calYearDate(v.startDate),
      text: `${person ? person.name : 'Сотрудник'} — ${typeLabel} (${calYearDate(v.startDate)} – ${calYearDate(v.endDate)})`,
      go: person ? () => Router.go(personPath(person)) : () => Router.go('/calendar'),
    });
  });

  monthItems.forEach((items) => items.sort((a, b) => a.sort.localeCompare(b.sort)));

  function itemHtml(item) {
    const idx = registerAction(item.go);
    return `<div class="ymc-item ${item.cls}" data-action-id="${idx}" data-action-stop="1" title="${escapeHtml(item.text)}">
      <span class="ymc-date">${escapeHtml(item.dateLabel)}</span>
      <span class="ymc-icon">${item.emoji}</span>
      <span class="ymc-text">${escapeHtml(item.text)}</span>
    </div>`;
  }

  const MAX_ITEMS = 6;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  view.innerHTML = `
    <div class="gcal-shell">
      ${calToolbarHtml()}
      <div class="year-grid">
        ${MONTHS_RU_NOM.map((name, i) => {
          const items = monthItems[i];
          const shown = items.slice(0, MAX_ITEMS);
          const restCount = items.length - shown.length;
          const isCurrentMonth = year === currentYear && i === currentMonthIndex;
          return `<div class="year-month-card ${isCurrentMonth ? 'current-month' : ''}">
            <div class="ymc-title-row" data-command="openCalendarMonth" data-command-arg="${i + 1}">
              <span class="ymc-title">${name}</span>
            </div>
            <div class="ymc-list">
              ${shown.length ? shown.map(itemHtml).join('') : `<div class="ymc-empty">Нет событий</div>`}
              ${restCount > 0 ? `<div class="ymc-more-link" data-command="openCalendarMonth" data-command-arg="${i + 1}">ещё ${restCount}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ changeCalendarPeriod, openMeetingOnDate, openCalendarMonth, toggleCalFilter, openCalendarAbsenceModal, goToday });
