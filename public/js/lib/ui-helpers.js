// Toast, animation, common form and people-picker helpers.
// ---------------- Micro animations ----------------

function collapseThen(element, done) {
  if (!element || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    done?.();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    element.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    done?.();
  };
  const onEnd = (event) => {
    if (event.target === element && (event.propertyName === 'height' || event.propertyName === 'opacity')) finish();
  };

  element.addEventListener('transitionend', onEnd);

  // Современный Chromium умеет плавно интерполировать auto → 0 через
  // interpolate-size. В fallback фиксируем текущую высоту перед переходом,
  // поэтому страница не делает предварительный скачок.
  if (!CSS.supports?.('interpolate-size: allow-keywords')) {
    const height = element.getBoundingClientRect().height;
    element.style.height = `${height}px`;
    element.getBoundingClientRect();
  }

  requestAnimationFrame(() => element.classList.add('is-collapsing'));
  const timer = setTimeout(finish, 300);
}

// ---------------- Toast ----------------

function toast(message) {
  const wrap = document.getElementById('toast-wrap');
  const t = el(`<div class="toast">${escapeHtml(message)}</div>`);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------------- Select options ----------------

function optionsHtml(list, valueKey, labelFn, selected) {
  return list
    .map((item) => {
      const v = item[valueKey];
      const label = labelFn(item);
      return `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function multiCheckList(list, name, labelFn, selectedIds) {
  selectedIds = selectedIds || [];
  return list
    .map(
      (item) => `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:12.5px;cursor:pointer;">
        <input type="checkbox" name="${name}" value="${item.id}" ${selectedIds.includes(item.id) ? 'checked' : ''}/> ${escapeHtml(labelFn(item))}
      </label>`
    )
    .join('');
}

function getCheckedValues(container, name) {
  return Array.from(container.querySelectorAll(`input[name="${name}"]:checked`)).map((i) => i.value);
}

// ---------------- Часовой пояс / график работы ----------------

// Компактная строка для карточки/списка: "Новосибирск · +5 ч · 04:00–13:00 у вас"
function timezoneLineHtml(person) {
  if (!person || !person.timezone) return '';
  const diff = tzDiffMinutes(person.timezone);
  const bits = [];
  if (person.city) bits.push(escapeHtml(person.city));
  else bits.push(escapeHtml(timezoneNameRu(person.timezone)));
  bits.push(escapeHtml(timezoneMoscowDiffLabel(person.timezone)));
  if (person.workStart && person.workEnd) {
    bits.push(`${shiftHHMMByDiff(person.workStart, diff)}–${shiftHHMMByDiff(person.workEnd, diff)}`);
  }
  if (!bits.length) return '';
  return `<div class="tz-line">${bits.map((b) => `<span>${b}</span>`).join('<span>·</span>')}</div>`;
}

// Панель на странице профиля: разница во времени и график работы, пересчитанный на Калининград.
// Строка с текущим статусом человека: работает / рабочий день закончен / начнёт через Х ч / в отпуске до дд.мм.
function personStatusHtml(person, vacations, opts) {
  opts = opts || {};
  const s = personWorkStatus(person, vacations);
  if (!s) return '';
  const dot = opts.noDot ? '' : `<span class="dot" style="background:${s.color}"></span>`;
  return `<div class="person-status" style="color:${s.color}">${dot}${escapeHtml(s.text)}</div>`;
}

// ---------------- Поле выбора людей с автоподстановкой ----------------
// Заменяет <select> и чекбоксы там, где нужно выбрать одного или нескольких людей.
// Использование: peoplePickerHtml('...') в разметке формы, initPeoplePicker(container, list, selectedIds, opts) после монтирования.

function peoplePickerHtml(placeholder) {
  const name = escapeHtml(placeholder || 'Введите имя…');
  return `<div class="people-picker"><div class="pp-chips"></div><input class="pp-input" type="text" autocomplete="off" aria-label="${name}" placeholder="${name}" /></div>`;
}

function normalizePersonQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function personMatchScore(person, query) {
  if (!query) return 10;
  const name = normalizePersonQuery(person.name);
  const role = normalizePersonQuery(person.role);
  const words = name.split(' ');
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (words.some((w) => w.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  if (role && role.includes(query)) return 4;
  return 99;
}

function highlightPersonMatch(name, query) {
  const safeName = escapeHtml(name || '');
  const q = String(query || '').trim();
  if (!q) return safeName;
  const normalizedName = normalizePersonQuery(name);
  const normalizedQ = normalizePersonQuery(q);
  const idx = normalizedName.indexOf(normalizedQ);
  if (idx < 0) return safeName;
  // Names are plain text in our data; slice original string by the normalized match length.
  return `${escapeHtml(name.slice(0, idx))}<mark class="pp-match">${escapeHtml(name.slice(idx, idx + q.length))}</mark>${escapeHtml(name.slice(idx + q.length))}`;
}

function initPeoplePicker(container, list, selectedIds, opts) {
  opts = opts || {};
  const multi = opts.multi !== false;
  let selected = (selectedIds || []).filter((id) => list.some((p) => p.id === id));
  let selectedAllShortcut = false;
  const allowSelectAll = Boolean(opts.allowSelectAll && multi);
  const chipsEl = container.querySelector('.pp-chips');
  const inputEl = container.querySelector('.pp-input');
  let menuEl = null;
  let activeIndex = 0;
  let candidates = [];

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    window.removeEventListener('resize', positionMenu);
    document.removeEventListener('scroll', positionMenu, true);
  }

  function positionMenu() {
    if (!menuEl || !document.body.contains(inputEl)) return;
    const rect = container.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const estimatedHeight = Math.min(260, 34 + candidates.length * 42);
    const openAbove = availableBelow < Math.min(180, estimatedHeight) && rect.top > availableBelow;
    menuEl.style.left = `${Math.round(rect.left)}px`;
    menuEl.style.width = `${Math.round(rect.width)}px`;
    menuEl.style.top = openAbove
      ? `${Math.max(8, Math.round(rect.top - estimatedHeight - 5))}px`
      : `${Math.round(rect.bottom + 5)}px`;
  }

  function renderChips() {
    chipsEl.innerHTML = '';
    selected.forEach((id) => {
      const p = list.find((x) => x.id === id);
      if (!p) return;
      const chip = el(`<span class="pp-chip">${avatarHtml(p)}<span>${escapeHtml(p.name)}</span><span class="pp-chip-x">${icon('close', 11)}</span></span>`);
      chip.querySelector('.pp-chip-x').addEventListener('mousedown', (e) => {
        e.preventDefault();
        selected = selected.filter((x) => x !== id);
        selectedAllShortcut = false;
        renderChips();
        inputEl.focus();
        updateCandidates();
        if (opts.onChange) opts.onChange(selected.slice());
      });
      chipsEl.appendChild(chip);
    });
    inputEl.placeholder = selected.length ? '' : (opts.placeholder || 'Введите имя…');
    if (!multi) inputEl.style.display = selected.length ? 'none' : '';
  }

  function renderMenu() {
    closeMenu();
    if (!candidates.length || document.activeElement !== inputEl) return;
    const query = inputEl.value.trim();
    menuEl = el(`<div class="pp-menu pp-menu-portal"><div class="pp-menu-label">Подсказки</div></div>`);
    candidates.forEach((p, i) => {
      const nameHtml = highlightPersonMatch(p.name, query);
      const leading = p._selectAll ? `<span class="pp-all-mark">${icon('people', 14)}</span>` : avatarHtml(p);
      const role = p._selectAll ? 'Добавить всех сотрудников' : (p.role || '');
      const item = el(`<div class="pp-item ${i === activeIndex ? 'active' : ''}">${leading}<span class="pp-item-name">${nameHtml}</span><span class="tiny pp-item-role">${escapeHtml(role)}</span></div>`);
      item.addEventListener('mousedown', (e) => { e.preventDefault(); choose(p); });
      menuEl.appendChild(item);
    });
    document.body.appendChild(menuEl);
    positionMenu();
    window.addEventListener('resize', positionMenu);
    document.addEventListener('scroll', positionMenu, true);
  }

  function choose(p) {
    if (p._selectAll && allowSelectAll) {
      selected = list.filter((person) => person.type !== 'team' || isActiveTeamPerson(person)).map((person) => person.id);
      selectedAllShortcut = false;
    } else {
      if (!multi) selected = [];
      if (!selected.includes(p.id)) selected.push(p.id);
      selectedAllShortcut = false;
    }
    inputEl.value = '';
    renderChips();
    closeMenu();
    if (multi) inputEl.focus(); else inputEl.blur();
    if (opts.onChange) opts.onChange(selected.slice());
  }

  function updateCandidates() {
    const q = normalizePersonQuery(inputEl.value);
    const peopleCandidates = list
      .filter((p) => !selected.includes(p.id))
      .map((p) => ({ p, score: personMatchScore(p, q) }))
      .filter((x) => !q || x.score < 99)
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'ru'))
      .map((x) => x.p);
    const selectableTeam = list.filter((person) => person.type !== 'team' || isActiveTeamPerson(person));
    const allSelected = selectableTeam.length > 0 && selectableTeam.every((person) => selected.includes(person.id));
    const allMatches = allowSelectAll && !allSelected && (!q || 'вся команда'.includes(q) || 'команда'.startsWith(q) || 'все'.startsWith(q));
    candidates = allMatches ? [{ id: '__all__', name: 'Вся команда', role: 'Добавить всех активных сотрудников', _selectAll: true }, ...peopleCandidates].slice(0, 9) : peopleCandidates.slice(0, 8);
    activeIndex = 0;
    renderMenu();
  }

  inputEl.addEventListener('input', updateCandidates);
  inputEl.addEventListener('focus', updateCandidates);
  // Если поле уже находится в фокусе (например, сразу после выбора первого
  // исполнителя), повторный клик не вызывает событие focus. Обновляем меню
  // явно, чтобы можно было сразу выбрать следующего человека.
  inputEl.addEventListener('click', updateCandidates);
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pp-chip-x')) return;
    if (e.target !== inputEl && !e.target.closest('.pp-chip')) {
      e.preventDefault();
      inputEl.focus();
      updateCandidates();
    }
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { if (candidates.length) { e.preventDefault(); activeIndex = (activeIndex + 1) % candidates.length; renderMenu(); } }
    else if (e.key === 'ArrowUp') { if (candidates.length) { e.preventDefault(); activeIndex = (activeIndex - 1 + candidates.length) % candidates.length; renderMenu(); } }
    else if (e.key === 'Enter') { if (candidates.length) { e.preventDefault(); choose(candidates[activeIndex]); } }
    else if (e.key === 'Backspace' && !inputEl.value && selected.length) { if (selectedAllShortcut) { selected = []; selectedAllShortcut = false; } else selected.pop(); renderChips(); updateCandidates(); if (opts.onChange) opts.onChange(selected.slice()); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); }
  });
  inputEl.addEventListener('blur', () => setTimeout(closeMenu, 180));

  renderChips();

  return {
    getSelected: () => selected.slice(),
    getSingle: () => selected[0] || null,
  };
}

