// Встречи — 1:1, PR и другие, с результатами и action items.

Views._meetingFilter = 'all';
Views._meetingPeriod = 'upcoming';
Views._meetingMonthState = {};

Views.meetings = async function () {
  setTopbar(`<h1>Встречи</h1>${Auth.canCreate('meetings') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openMeetingModal">+ Добавить встречу</button></div>` : ''}`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const meetings = await Resources.meetings.list();
  const filters = ['all', '1:1', 'pr', 'other'];
  const filterLabel = { all: 'Все', '1:1': '1:1', pr: 'PR', other: 'Другое' };
  const filtered = Views._meetingFilter === 'all' ? meetings : meetings.filter((m) => m.type === Views._meetingFilter);

  // Главный фильтр — тип встречи — тот же приём вкладок со счётчиками, что и в
  // «Задачах»/«Проблемах»/«Договорённостях» (референс: /dashboard/user/list);
  // период (предстоящие/завершённые) — второй, менее приоритетный переключатель
  // строкой ниже, а не рядом вперемешку с вкладками.
  const filterBar = `<div class="list-tabs meeting-filterbar" role="tablist" aria-label="Тип встречи">
    ${filters.map((f) => `<button type="button" class="list-tab ${Views._meetingFilter === f ? 'active' : ''}" role="tab" aria-selected="${Views._meetingFilter === f}" data-view-state="_meetingFilter" data-view-value="${f}" data-view-render="meetings">${filterLabel[f]}</button>`).join('')}
  </div>`;

  const today = todayStr();
  const upcoming = filtered.filter((m) => (m.date || '').slice(0, 10) >= today).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const past = filtered.filter((m) => (m.date || '').slice(0, 10) < today).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const activeMeetings = Views._meetingPeriod === 'past' ? past : upcoming;
  const emptyText = Views._meetingPeriod === 'past' ? 'Завершенных встреч нет' : 'Предстоящих встреч нет';

  const periodTabs = `<div class="meeting-period-tabs meeting-period-tabs-secondary" role="tablist" aria-label="Период встреч">
    <button type="button" class="meeting-period ${Views._meetingPeriod === 'upcoming' ? 'active' : ''}" role="tab" aria-selected="${Views._meetingPeriod === 'upcoming'}" data-command="setMeetingPeriod" data-command-arg="upcoming">Предстоящие</button>
    <button type="button" class="meeting-period ${Views._meetingPeriod === 'past' ? 'active' : ''}" role="tab" aria-selected="${Views._meetingPeriod === 'past'}" data-command="setMeetingPeriod" data-command-arg="past">Завершённые</button>
  </div>`;

  const monthGroups = groupMeetingsByMonth(activeMeetings);

  view.innerHTML = `<div class="view-narrow work-list-page meetings-view">
    <div class="work-list-toolbar meeting-toolbar">${filterBar}${periodTabs}</div>
    ${activeMeetings.length ? `<div class="meeting-month-groups task-groups-separated">${monthGroups.map((group, index) => meetingMonthGroupHtml(group, index)).join('')}</div>` : `<div class="zen-empty">${emptyText}</div>`}
  </div>`;
};

function meetingMonthKey(date) {
  return String(date || '').slice(0, 7);
}

function meetingMonthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return 'Без даты';
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupMeetingsByMonth(meetings) {
  const groups = [];
  const byKey = new Map();
  meetings.forEach((meeting) => {
    const key = meetingMonthKey(meeting.date) || 'no-date';
    if (!byKey.has(key)) {
      const group = { key, label: meetingMonthLabel(key), meetings: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).meetings.push(meeting);
  });
  return groups;
}

function meetingMonthGroupHtml(group, index) {
  const stateKey = `${Views._meetingPeriod}:${Views._meetingFilter}:${group.key}`;
  const expanded = Object.prototype.hasOwnProperty.call(Views._meetingMonthState, stateKey)
    ? Views._meetingMonthState[stateKey]
    : index === 0;
  return `<section class="meeting-month-group task-group-section separated ${expanded ? 'is-expanded' : 'is-collapsed'}" data-meeting-month="${escapeHtml(group.key)}">
    <button type="button" class="ui-disclosure group-header meeting-month-header" data-command="toggleMeetingMonth" data-command-arg="${escapeHtml(stateKey)}" data-command-self="1" aria-expanded="${expanded}">
      <span class="meeting-month-chevron" style="${expanded ? 'transform:rotate(90deg)' : ''}">${icon('chevronRight', 10)}</span>
      <span class="meeting-month-title task-group-title">${escapeHtml(group.label)}</span>
    </button>
    <div class="meeting-month-body">
      <div class="meeting-list">${group.meetings.map(meetingRowHtml).join('')}</div>
    </div>
  </section>`;
}

function setMeetingPeriod(period) {
  Views._meetingPeriod = period === 'past' ? 'past' : 'upcoming';
  Views.meetings();
}

function toggleMeetingMonth(stateKey, button) {
  const group = button?.closest('.meeting-month-group');
  if (!group) return;
  const expanded = group.classList.contains('is-expanded');
  group.classList.toggle('is-expanded', !expanded);
  group.classList.toggle('is-collapsed', expanded);
  Views._meetingMonthState[stateKey] = !expanded;
  button.setAttribute('aria-expanded', String(!expanded));
  const chevron = button.querySelector('.meeting-month-chevron');
  if (chevron) chevron.style.transform = expanded ? '' : 'rotate(90deg)';
}


function meetingRowHtml(m) {
  const participants = (m.participantIds || []).map((id) => store.person(id)).filter(Boolean);
  const project = store.project(m.projectId);
  const employee = participants[0] || null;
  const openIdx = registerAction(() => Router.go(meetingPath(m)));
  return `<div class="ui-row ui-row--meeting meeting-row clickable" data-action-id="${openIdx}">
      <span class="meeting-type badge meeting-type-${String(m.type || 'other').replace(/[^a-z0-9]+/gi, '-')}">${MEETING_TYPE_LABEL[m.type] || 'Другое'}</span>
      <span class="meeting-title">${escapeHtml(meetingDisplayTitle(m))}</span>
      <span class="meeting-row-meta meeting-row-project">${project ? projectChip(project) : ''}</span>
      <span class="meeting-date">${fmtDate(m.date)}</span>
      <span class="meeting-employee-avatar">${employee ? personAvatarLinkHtml(employee) : avatarHtml(null)}</span>
      <span class="meeting-chevron">${icon('chevronRight', 14)}</span>
  </div>`;
}

async function deleteMeeting(id) {
  const ok = await confirmAction('Удалить эту встречу?');
  if (!ok) return;
  await Resources.meetings.remove(id);
  Modal.close();
  toast('Встреча удалена');
  if (Router.current().startsWith('/meetings/')) Router.go('/meetings');
  else Router.render();
}

// Existing meetings open as a dedicated routed page (an "instance", by analogy
// with task instances) — the modal below is reserved for creating a new one.
function openMeetingModal(existing) {
  if (existing && existing.id) { Router.go(meetingPath(existing)); return; }
  openMeetingCreateModal(existing);
}

function openMeetingCreateModal(prefill) {
  const m = prefill || {};
  const dt = m.date ? m.date.slice(0, 10) : todayStr();
  Modal.open(`
    <h2>Новая встреча</h2>
    <div class="meeting-create-simple">
      <div class="ui-field-row field-row">
        <div class="ui-field field"><label class="ui-field-label field-label" for="mf-type">Тип</label>
          <select id="mf-type">
            <option value="1:1" ${m.type === '1:1' ? 'selected' : ''}>1:1</option>
            <option value="pr" ${m.type === 'pr' ? 'selected' : ''}>PR</option>
            <option value="other" ${m.type === 'other' ? 'selected' : ''}>Другое</option>
          </select>
        </div>
        <div class="ui-field field"><label class="ui-field-label field-label" for="mf-date">Дата</label><input id="mf-date" type="date" value="${dt}" /></div>
      </div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="mf-title">Название</label><input id="mf-title" value="${escapeHtml(m.title || '')}" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="mf-project">Проект (необязательно)</label>
        <select id="mf-project"><option value="">—</option>${optionsHtml(store.projects, 'id', (p) => p.name, m.projectId)}</select>
      </div>
      <div class="ui-field field"><span class="ui-field-label field-label">Участники</span>
        <div id="mf-participants-wrap">${peoplePickerHtml('Добавить участника…')}</div>
      </div>
    </div>
    <div class="ui-modal-actions modal-actions">
      <button type="button" class="ui-button btn" data-modal-close>Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="mf-save">Создать</button>
    </div>
  `);

  const participantsPicker = initPeoplePicker(document.getElementById('mf-participants-wrap'), store.people, m.participantIds || [], {
    multi: true,
    placeholder: 'Добавить участника…',
  });

  document.getElementById('mf-save').onclick = async () => {
    const payload = {
      type: document.getElementById('mf-type').value,
      date: document.getElementById('mf-date').value,
      title: document.getElementById('mf-title').value.trim() || 'Встреча',
      projectId: document.getElementById('mf-project').value || null,
      participantIds: participantsPicker.getSelected(),
      notes: '',
      actionItems: [],
      prepNotes: '',
      documentLinks: [],
    };
    const saved = await Resources.meetings.create(payload);
    Modal.close();
    toast('Встреча создана');
    Router.go(meetingPath(saved));
  };
}

function meetingDetailGoBack() {
  // Route through the guarded back action so unsaved meeting edits can be
  // handled before the browser history entry changes.
  Router.back();
}

Views.meetingDetailPage = async function (ref) {
  const meeting = await Resources.meetings.get(ref);
  if (String(ref || '').toUpperCase() !== String(meeting.meetingKey || '').toUpperCase()) Router.replace(meetingPath(meeting));
  return renderMeetingDetailPage(meeting);
};

async function renderMeetingDetailPage(m) {
  const canEdit = Auth.canEditItem('meetings', m, ['participantIds']);
  const canDelete = Auth.canDeleteItem('meetings', m);
  let meetingComments = await Comments.list('meeting', m.id);
  if (String(m.prepNotes || '').trim()) {
    const prepText = String(m.prepNotes).trim();
    if (!meetingComments.some((note) => String(note.text || '').trim() === prepText)) {
      try { meetingComments.push(await Comments.create('meeting', m.id, { text: prepText, color: 'yellow' })); } catch (_) {}
    }
  }
  const dt = m.date ? m.date.slice(0, 10) : todayStr();
  const participants = (m.participantIds || []).map((id) => store.person(id)).filter(Boolean);
  setTopbar(`
    <h1 class="topbar-h1-key">${escapeHtml(m.meetingKey || '')}</h1>
    <div class="actions task-detail-topbar-actions">
      <button type="button" class="sidebar-collapse-btn task-notes-sidebar-toggle" id="meeting-context-toggle" aria-label="Скрыть стикеры" title="Скрыть стикеры" aria-expanded="true">${icon('sidebar', 16)}</button>
      <div class="task-actions-menu-wrap">
        <button type="button" class="ui-button btn task-detail-topbar-btn" id="meeting-actions-toggle" aria-haspopup="menu" aria-expanded="false">Действия</button>
        <div class="task-actions-menu" id="meeting-actions-menu" role="menu" hidden>
          <button type="button" class="task-actions-menu-item" id="meeting-version-history" role="menuitem">${icon('clock',14)} История версий</button>
          ${canDelete ? `<button type="button" class="task-actions-menu-item task-actions-menu-item-danger" id="meeting-delete" role="menuitem">${icon('trash',14)} Удалить</button>` : ''}
        </div>
      </div>
      <button type="button" class="ui-button btn task-detail-topbar-btn" data-command="meetingDetailGoBack">Назад</button>
    </div>
  `);

  const meetingDetailMarkup = `
    <div class="task-detail-shell">
${detailPageHeaderHtml({ title: meetingDisplayTitle(m), eyebrow: m.meetingKey, inputId: 'mf-title', displayId: 'mf-title-display', shellId: 'mf-title-shell', editable: canEdit, ariaLabel: 'Название встречи' })}

      <div class="task-detail-layout">
        <main class="task-detail-main">
          <section class="task-detail-section task-detail-details-section">
            <div class="task-detail-details-grid">
              <div class="task-detail-details-column">
                <label class="task-detail-property"><span>Тип</span><span class="task-inline-edit is-editable"><select id="mf-type">
                  <option value="1:1" ${m.type === '1:1' ? 'selected' : ''}>1:1</option>
                  <option value="pr" ${m.type === 'pr' ? 'selected' : ''}>PR</option>
                  <option value="other" ${!m.type || m.type === 'other' ? 'selected' : ''}>Другое</option>
                </select><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span></span></label>
                <label class="task-detail-property"><span>Дата</span><span class="task-inline-edit is-editable"><input id="mf-date" type="date" value="${dt}" /><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span></span></label>
              </div>
              <div class="task-detail-details-column">
                <label class="task-detail-property"><span>Проект</span><span class="task-inline-edit is-editable"><select id="mf-project"><option value="">—</option>${optionsHtml(store.projects, 'id', (p) => p.name, m.projectId)}</select><span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span></span></label>
                <div class="task-detail-property task-detail-assignee-property"><span>Участники</span>
                  <div class="task-inline-edit task-inline-edit-assignees is-editable" id="mf-participants-shell">
                    <div id="mf-participants-display" class="task-detail-assignee-read task-detail-assignee-display" role="button" tabindex="0">${participants.length ? participants.map((p) => `<span>${avatarHtml(p)}${escapeHtml(p.name)}</span>`).join('') : '<span class="muted">Нет участников</span>'}</div>
                    <div id="mf-participants-edit" class="task-detail-assignee-edit" hidden><div id="mf-participants-wrap" class="task-detail-assignees">${peoplePickerHtml('Добавить участника…')}</div></div>
                    <span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="task-detail-section task-detail-description-section">
            <div class="task-detail-section-label task-detail-section-title">Итоги встречи</div>
            <div class="task-inline-edit task-inline-edit-description is-editable">
              <textarea id="mf-notes" class="task-detail-description" rows="4" placeholder="Что обсудили, договорились, решили">${escapeHtml(m.notes || '')}</textarea>
              <span class="task-inline-edit-icon" aria-hidden="true">${icon('edit', 11)}</span>
            </div>
          </section>

          ${(m.actionItems || []).length ? `<section class="task-detail-section">
            <div class="task-detail-section-label task-detail-section-title">Action items</div>
            <div class="meeting-action-items" id="mf-action-items">${m.actionItems.map((ai, idx) => `
              <label class="meeting-action-item">
                <input type="checkbox" ${ai.done ? 'checked' : ''} data-action-item-index="${idx}" />
                <span data-action-item-text="${idx}" style="${ai.done ? 'text-decoration:line-through;color:var(--text-disabled)' : ''}">${escapeHtml(ai.text)}</span>
                ${ai.assigneeId ? personChip(store.person(ai.assigneeId)) : ''}
              </label>`).join('')}</div>
          </section>` : ''}

          <section class="task-detail-section meeting-outcomes-box">
            <div class="task-detail-section-label task-detail-section-title">Создать по итогам</div>
            <div class="meeting-outcome-drafts" id="mf-outcome-drafts"></div>
            <div class="meeting-outcome-compose">
              <select id="mf-outcome-kind" aria-label="Тип записи по итогам">
                <option value="note">Заметка</option>
                <option value="issue">Проблема</option>
                <option value="agreement">Договорённость</option>
                <option value="task">Задача</option>
              </select>
              <input id="mf-outcome-text" placeholder="Что зафиксировать?" />
              <button type="button" class="ui-button ui-button--sm btn btn-sm" id="mf-outcome-add">Добавить</button>
            </div>
          </section>

          <section class="task-detail-section meeting-documents-field">
            <div class="task-detail-section-label task-detail-section-title">Документы</div>
            <div class="meeting-document-head" aria-hidden="true"><span>Название</span><span>Ссылка</span><span></span></div>
            <div id="mf-documents" class="meeting-document-list"></div>
          </section>
        </main>
      </div>
    </div>

    <aside class="task-detail-side" id="meeting-context-drawer" aria-hidden="true">
      <div class="task-detail-note-head"><div><strong>Стикеры</strong></div><div class="task-detail-note-actions"><button type="button" class="task-detail-icon-btn task-note-add" id="meeting-note-add" title="Добавить стикер" aria-label="Добавить стикер">+</button></div></div>
      <div class="task-comments-list detail-sticky-comments-list unified-notes-list" id="meeting-comments-list">${commentThreadHtml(meetingComments, { variant: 'notes' })}</div>
      <div id="mf-related" class="meeting-related-panel"><div class="tiny">Загрузка…</div></div>
    </aside>
  `;

  const view = document.getElementById('view');
  view.classList.add('task-detail-page-view');
  view.innerHTML = `<section class="modal-panel modal-task-detail task-detail-page">${meetingDetailMarkup}</section>`;
  if (!canEdit) {
    view.querySelectorAll('#mf-type, #mf-date, #mf-project, #mf-notes').forEach((el) => { el.disabled = true; });
    view.querySelectorAll('.task-inline-edit-icon').forEach((el) => { el.hidden = true; });
    const participantShell = document.getElementById('mf-participants-shell');
    participantShell?.classList.remove('is-editable');
    const participantEdit = document.getElementById('mf-participants-edit');
    if (participantEdit) participantEdit.hidden = true;
  }

  const detailPage = view.querySelector('.task-detail-page');
  const contextDrawer = document.getElementById('meeting-context-drawer');
  const contextToggle = document.getElementById('meeting-context-toggle');
  const mainShell = document.querySelector('.main');
  const setContextDrawerOpen = (open) => {
    const isOpen = Boolean(open);
    detailPage?.classList.toggle('notes-open', isOpen);
    mainShell?.classList.toggle('task-notes-open', isOpen);
    contextDrawer?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (contextToggle) {
      const label = isOpen ? 'Скрыть стикеры' : 'Показать стикеры';
      contextToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      contextToggle.setAttribute('aria-label', label);
      contextToggle.setAttribute('title', label);
      contextToggle.classList.toggle('is-active', isOpen);
      contextToggle.innerHTML = icon('sidebar', 16);
    }
  };
  // Open by default, but not below the 940px breakpoint where detail-page.css
  // turns this drawer into a full-screen overlay (same rule as the task notes
  // drawer in tasks.js — defaulting to open there would hide the meeting the
  // moment the page loads on a phone).
  setContextDrawerOpen(window.innerWidth > 940);
  if (contextToggle) contextToggle.onclick = () => setContextDrawerOpen(!detailPage?.classList.contains('notes-open'));

  createCommentController({
    entityType: 'meeting', entityId: m.id, comments: meetingComments,
    listId: 'meeting-comments-list', countId: null,
    addId: 'meeting-note-add', variant: 'notes',
  }).bind();

  const actionsToggle = document.getElementById('meeting-actions-toggle');
  const actionsMenu = document.getElementById('meeting-actions-menu');
  if (actionsToggle && actionsMenu) {
    const setActionsOpen = (open) => { actionsMenu.hidden = !open; actionsToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    const wrap = actionsToggle.closest('.task-actions-menu-wrap');
    actionsToggle.onclick = (event) => { event.stopPropagation(); setActionsOpen(actionsMenu.hidden); };
    actionsMenu.onclick = (event) => event.stopPropagation();
    document.addEventListener('click', (event) => { if (!wrap?.contains(event.target)) setActionsOpen(false); });
  }
  const versionHistoryButton = document.getElementById('meeting-version-history');
  if (versionHistoryButton) versionHistoryButton.onclick = async () => {
    actionsMenu && (actionsMenu.hidden = true);
    if (typeof DetailAutosave !== 'undefined') await DetailAutosave.flush();
    openVersionHistory('meetings', m, { canRestore: canEdit });
  };

  let queueMeetingAutosave = null;
  const participantsPicker = initPeoplePicker(document.getElementById('mf-participants-wrap'), store.people, m.participantIds, {
    multi: true,
    placeholder: 'Добавить участника…',
    onChange: (ids) => { renderMeetingRelatedPanel(ids); queueMeetingAutosave?.(true); },
  });
  renderMeetingRelatedPanel(m.participantIds || []);

  const titleShell = document.getElementById('mf-title-shell');
  const titleDisplay = document.getElementById('mf-title-display');
  const titleInput = document.getElementById('mf-title');
  const beginTitleEdit = () => {
    if (!canEdit || !titleInput.hidden) return;
    titleDisplay.hidden = true;
    titleInput.hidden = false;
    titleShell.classList.add('is-editing');
    titleInput.focus();
    const end = titleInput.value.length;
    try { titleInput.setSelectionRange(end, end); } catch (_) {}
  };
  titleDisplay.onclick = beginTitleEdit;
  titleDisplay.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginTitleEdit(); } };
  const closeTitleEdit = () => {
    if (titleInput.hidden) return;
    titleDisplay.textContent = titleInput.value.trim() || meetingDisplayTitle(m);
    titleInput.hidden = true;
    titleDisplay.hidden = false;
    titleShell.classList.remove('is-editing');
  };
  titleInput.onblur = closeTitleEdit;
  titleInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    closeTitleEdit();
  });

  const participantsShell = document.getElementById('mf-participants-shell');
  const participantsDisplay = document.getElementById('mf-participants-display');
  const participantsEdit = document.getElementById('mf-participants-edit');
  let participantsOutsideHandler = null;
  const refreshParticipantsDisplay = () => {
    const selected = [...(participantsPicker?.getSelected?.() || [])].map((id) => store.person(id)).filter(Boolean);
    participantsDisplay.innerHTML = selected.length
      ? selected.map((p) => `<span>${avatarHtml(p)}${escapeHtml(p.name)}</span>`).join('')
      : '<span class="muted">Нет участников</span>';
  };
  const closeParticipantsEdit = () => {
    if (participantsEdit.hidden) return;
    refreshParticipantsDisplay();
    participantsEdit.hidden = true;
    participantsDisplay.hidden = false;
    participantsShell.classList.remove('is-editing');
    if (participantsOutsideHandler) {
      document.removeEventListener('pointerdown', participantsOutsideHandler, true);
      participantsOutsideHandler = null;
    }
  };
  const beginParticipantsEdit = () => {
    if (!participantsEdit.hidden) return;
    participantsDisplay.hidden = true;
    participantsEdit.hidden = false;
    participantsShell.classList.add('is-editing');
    participantsEdit.querySelector('button, input, [tabindex]')?.focus();
    participantsOutsideHandler = (event) => {
      if (!participantsShell.contains(event.target)) closeParticipantsEdit();
    };
    requestAnimationFrame(() => document.addEventListener('pointerdown', participantsOutsideHandler, true));
  };
  participantsDisplay.onclick = beginParticipantsEdit;
  participantsDisplay.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginParticipantsEdit(); } };

  // The disclosure chevron sits outside native selects. Clicking that small
  // affordance should open the same picker as clicking the value itself.
  document.querySelectorAll('.task-detail-property .task-inline-edit select').forEach((select) => {
    const shell = select.closest('.task-inline-edit');
    if (!shell) return;
    shell.addEventListener('click', (event) => {
      if (event.target === select || select.disabled) return;
      event.preventDefault();
      select.focus();
      try { select.showPicker?.(); } catch (_) { select.click(); }
    });
  });

  document.querySelectorAll('#mf-action-items input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const idx = Number(checkbox.dataset.actionItemIndex);
      const item = (m.actionItems || [])[idx];
      if (!item) return;
      item.done = checkbox.checked;
      const label = document.querySelector(`[data-action-item-text="${idx}"]`);
      if (label) label.style.textDecoration = checkbox.checked ? 'line-through' : '';
      if (label) label.style.color = checkbox.checked ? 'var(--text-disabled)' : '';
      queueMeetingAutosave?.(true);
    });
  });

  const outcomeLabels = { note: 'Заметка', issue: 'Проблема', agreement: 'Договорённость', task: 'Задача' };
  const outcomePlaceholders = { note:'Что важно зафиксировать?', issue:'В чём проблема?', agreement:'О чём договорились?', task:'Что нужно сделать?' };
  const outcomeKind = document.getElementById('mf-outcome-kind');
  const outcomeText = document.getElementById('mf-outcome-text');
  let meetingOutcomes = [];
  const documentDrafts = (m.documentLinks || []).map((d) => ({ title: d.title || '', url: d.url || '' }));
  let documentComposer = { title: '', url: '' };

  function renderDocumentDrafts() {
    const list = document.getElementById('mf-documents');
    if (!list) return;
    const savedRows = documentDrafts.map((doc, index) => `
      <div class="meeting-document-row meeting-document-row--saved" data-document-row="${index}">
        <div class="meeting-document-saved-title">${escapeHtml(doc.title)}</div>
        <a class="meeting-document-saved-url" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.url)}</a>
        <button type="button" class="ui-icon-button meeting-document-remove" data-document-remove="${index}" title="Удалить документ" aria-label="Удалить документ">${icon('close', 13)}</button>
      </div>`).join('');
    list.innerHTML = `${savedRows}
      <div class="meeting-document-row meeting-document-row--composer">
        <div class="ui-field meeting-document-title-field"><input id="mf-document-new-title" aria-label="Название документа" value="${escapeHtml(documentComposer.title)}" placeholder="Название" /></div>
        <div class="ui-field meeting-document-url-field"><input id="mf-document-new-url" type="url" aria-label="Ссылка на документ" value="${escapeHtml(documentComposer.url)}" placeholder="Ссылка" /></div>
        <button type="button" class="ui-button ui-button--sm btn btn-sm meeting-document-inline-add" id="mf-document-add">Добавить</button>
      </div>`;
    const titleInput = document.getElementById('mf-document-new-title');
    const urlInput = document.getElementById('mf-document-new-url');
    titleInput.oninput = () => { documentComposer.title = titleInput.value; };
    urlInput.oninput = () => { documentComposer.url = urlInput.value; };
    document.getElementById('mf-document-add').onclick = addDocumentDraft;
    list.querySelectorAll('[data-document-remove]').forEach((btn) => {
      btn.onclick = () => {
        documentDrafts.splice(Number(btn.dataset.documentRemove), 1);
        renderDocumentDrafts();
        queueMeetingAutosave?.(true);
      };
    });
  }

  function addDocumentDraft() {
    const title = String(documentComposer.title || '').trim();
    const url = String(documentComposer.url || '').trim();
    if (!title || !url) { toast('Укажите название и ссылку документа'); document.getElementById(!title ? 'mf-document-new-title' : 'mf-document-new-url')?.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { toast('Ссылка на документ должна начинаться с http:// или https://'); document.getElementById('mf-document-new-url')?.focus(); return; }
    documentDrafts.push({ title, url });
    documentComposer = { title: '', url: '' };
    renderDocumentDrafts();
    queueMeetingAutosave?.(true);
    requestAnimationFrame(() => document.getElementById('mf-document-new-title')?.focus());
  }

  function renderMeetingOutcomes() {
    const list = document.getElementById('mf-outcome-drafts');
    if (!list) return;
    list.innerHTML = meetingOutcomes.map((item) => `
      <div class="meeting-outcome-draft">
        <span class="meeting-outcome-kind">${outcomeLabels[item.kind]}</span>
        <span class="meeting-outcome-draft-text">${escapeHtml(item.text)}</span>
        <button type="button" class="meeting-outcome-remove" data-outcome-kind="${item.kind}" data-outcome-id="${escapeHtml(String(item.id))}" title="Удалить" aria-label="Удалить">×</button>
      </div>`).join('');
    list.querySelectorAll('[data-outcome-id]').forEach((btn) => {
      btn.onclick = async () => {
        const kind = btn.dataset.outcomeKind;
        const id = btn.dataset.outcomeId;
        const resource = kind === 'task' ? Resources.tasks : kind === 'issue' ? Resources.issues : kind === 'agreement' ? Resources.agreements : Resources.journal;
        try {
          await resource.remove(id);
          meetingOutcomes = meetingOutcomes.filter((item) => !(String(item.id) === String(id) && item.kind === kind));
          renderMeetingOutcomes();
          toast('Удалено');
        } catch (error) {
          console.error(error);
          toast('Не удалось удалить');
        }
      };
    });
  }

  async function loadMeetingOutcomes() {
    try {
      const [tasks, issues, agreements, journal] = await Promise.all([
        Resources.tasks.list(), Resources.issues.list(), Resources.agreements.list(), Resources.journal.list()
      ]);
      meetingOutcomes = [
        ...tasks.filter((x) => String(x.sourceMeetingId || '') === String(m.id)).map((x) => ({ id:x.id, kind:'task', text:x.title || 'Задача' })),
        ...issues.filter((x) => String(x.sourceMeetingId || '') === String(m.id)).map((x) => ({ id:x.id, kind:'issue', text:x.title || 'Проблема' })),
        ...agreements.filter((x) => String(x.sourceMeetingId || '') === String(m.id)).map((x) => ({ id:x.id, kind:'agreement', text:previewText(x.text || '', 140) })),
        ...journal.filter((x) => String(x.sourceMeetingId || '') === String(m.id)).map((x) => ({ id:x.id, kind:'note', text:previewText(x.text || '', 140) })),
      ];
      renderMeetingOutcomes();
    } catch (error) { console.error(error); }
  }

  async function addMeetingOutcome() {
    const text = outcomeText.value.trim();
    if (!text) { toast('Введите текст'); outcomeText.focus(); return; }
    const kind = outcomeKind.value;
    const participantIds = [...participantsPicker.getSelected()];
    const projectId = document.getElementById('mf-project').value || null;
    try {
      let created;
      if (kind === 'task') {
        created = await Resources.tasks.create({ title:text, description:`Из встречи: ${meetingDisplayTitle(m)}`, taskType:'standard', projectId, assigneeIds:participantIds.filter((id) => store.person(id)?.type === 'team'), status:'todo', priority:'normal', dueDate:null, sourceMeetingId:m.id });
      } else if (kind === 'issue') {
        created = await Resources.issues.create({ title:text, description:'', projectId, severity:'normal', status:'open', relatedPersonIds:participantIds, solutionOptions:[], sourceMeetingId:m.id });
      } else if (kind === 'agreement') {
        const mentions = participantIds.map((id) => store.person(id)).filter(Boolean).map((person) => `@[${person.name}](${person.type === 'stakeholder' ? 'stakeholder' : 'person'}:${person.id})`).join(' ');
        created = await Resources.agreements.create({ text:mentions ? `${text} — ${mentions}` : text, date:(document.getElementById('mf-date').value || todayStr()).slice(0,10), dueDate:null, projectId, status:'open', withPersonIds:participantIds, sourceMeetingId:m.id });
      } else {
        const mentions = participantIds.map((id) => store.person(id)).filter(Boolean).map((person) => `@[${person.name}](${person.type === 'stakeholder' ? 'stakeholder' : 'person'}:${person.id})`).join(' ');
        created = await Resources.journal.create({ text:mentions ? `${text} — ${mentions}` : text, kind:'note', sourceMeetingId:m.id });
      }
      meetingOutcomes.push({ id: created.id, kind, text });
      outcomeText.value = '';
      renderMeetingOutcomes();
      outcomeText.focus();
      toast('Добавлено');
    } catch (error) {
      console.error(error);
      toast('Не удалось добавить');
    }
  }

  outcomeKind.onchange = () => { outcomeText.placeholder = outcomePlaceholders[outcomeKind.value]; };
  outcomeText.placeholder = outcomePlaceholders[outcomeKind.value];
  document.getElementById('mf-outcome-add').onclick = addMeetingOutcome;
  outcomeText.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); addMeetingOutcome(); }
  };
  renderDocumentDrafts();
  loadMeetingOutcomes();

  const currentMeetingPayload = () => ({
    type: document.getElementById('mf-type').value,
    date: document.getElementById('mf-date').value,
    title: document.getElementById('mf-title').value.trim() || 'Встреча',
    projectId: document.getElementById('mf-project').value || null,
    participantIds: [...participantsPicker.getSelected()].sort(),
    notes: document.getElementById('mf-notes').value.trim(),
    prepNotes: String(m.prepNotes || '').trim(),
    documentLinks: documentDrafts.map((d) => ({ title: (d.title || '').trim(), url: (d.url || '').trim() })).filter((d) => d.title && d.url),
  });
  let lastSavedMeetingPayload = JSON.stringify({ ...currentMeetingPayload(), actionItems: m.actionItems || [] });

  const saveMeetingChanges = async () => {
    const documentLinks = [];
    for (let i = 0; i < documentDrafts.length; i += 1) {
      const title = String(documentDrafts[i].title || '').trim();
      const url = String(documentDrafts[i].url || '').trim();
      if (!title && !url) continue;
      if (!title || !url) {
        toast('Укажите название и ссылку документа');
        document.querySelector(!title ? `[data-document-title="${i}"]` : `[data-document-url="${i}"]`)?.focus();
        throw new Error('invalid_document_link');
      }
      if (!/^https?:\/\//i.test(url)) {
        toast('Ссылка на документ должна начинаться с http:// или https://');
        document.querySelector(`[data-document-url="${i}"]`)?.focus();
        throw new Error('invalid_document_url');
      }
      documentLinks.push({ title, url });
    }
    const payload = currentMeetingPayload();
    payload.documentLinks = documentLinks;
    payload.actionItems = m.actionItems || [];
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedMeetingPayload) return true;
    let saved;
    try {
      saved = await Resources.meetings.update(m.id, payload);
    } catch (error) {
      console.error(error);
      toast('Не удалось сохранить изменения');
      throw error;
    }
    Object.assign(m, saved || payload);

    lastSavedMeetingPayload = JSON.stringify({ ...currentMeetingPayload(), actionItems: m.actionItems || [] });
    return true;
  };

  const autosave = DetailAutosave.set(createAutosave(saveMeetingChanges, { delay: 550 }));
  queueMeetingAutosave = (immediate = false) => autosave.schedule(immediate);
  Router.setLeaveGuard(async () => { await autosave.flush(); return true; }, () => autosave.pending);

  if (canEdit) {
    ['mf-title','mf-notes'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => queueMeetingAutosave(false));
    });
    ['mf-type','mf-date','mf-project'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => queueMeetingAutosave(true));
    });
    titleInput.addEventListener('blur', () => queueMeetingAutosave(true));
    document.getElementById('mf-notes')?.addEventListener('blur', () => queueMeetingAutosave(true));
    bindDetailCommitOnEnter(document.getElementById('mf-notes'), () => queueMeetingAutosave(true));
  }

  const deleteButton = document.getElementById('meeting-delete');
  if (deleteButton) deleteButton.onclick = async () => {
    actionsMenu && (actionsMenu.hidden = true);
    await autosave.flush();
    await deleteMeeting(m.id);
  };
}

// Панель "Связанное с участниками" в форме встречи — активные задачи, проблемы, договорённости
// и свежие заметки о выбранных людях.
function renderMeetingRelatedPanel(personIds) {
  const container = document.getElementById('mf-related');
  if (!container) return;
  if (!personIds || !personIds.length) { container.innerHTML = `<div class="tiny">Выберите участников</div>`; return; }
  container.innerHTML = `<div class="tiny">Загрузка…</div>`;
  Promise.all([Resources.tasks.list(), Resources.issues.list(), Resources.agreements.list(), Resources.journal.list()]).then(([allTasks, allIssues, allAgreements, allJournal]) => {
    if (!document.getElementById('mf-related')) return;
    const relTasks = allTasks.filter((t) =>
      !t.archivedAt && t.status === 'in_progress' && (t.assigneeIds || []).some((id) => personIds.includes(id))
    );
    const relIssues = allIssues.filter((i) => (i.relatedPersonIds || []).some((id) => personIds.includes(id)) && i.status !== 'resolved');
    const relAgreements = allAgreements.filter((a) => (a.withPersonIds || []).some((id) => personIds.includes(id)) && a.status !== 'done');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const relNotes = allJournal
      .filter((entry) => {
        if (entry.kind !== 'note') return false;
        const createdAt = new Date(entry.createdAt || 0);
        if (Number.isNaN(createdAt.getTime()) || createdAt < threeMonthsAgo) return false;
        return (entry.mentions || []).some((mention) =>
          (mention.type === 'person' || mention.type === 'stakeholder') && personIds.includes(mention.id)
        );
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const nothing = !relTasks.length && !relIssues.length && !relAgreements.length && !relNotes.length;
    const group = (key, title, items, render) => items.length ? `
      <section class="meeting-related-group meeting-related-group--${key}">
        <div class="meeting-related-title">${title}</div>
        <div class="meeting-related-list">${items.map(render).join('')}</div>
      </section>` : '';
    container.innerHTML = `
      ${group('tasks', 'Задачи в работе', relTasks, (t) => `<div class="ui-row ui-row--compact mini-row clickable meeting-related-marked" data-command="openTaskModal" data-command-arg="${t.id}">${escapeHtml(t.title)}</div>`)}
      ${group('issues', 'Открытые проблемы', relIssues, (i) => `<div class="ui-row ui-row--compact mini-row clickable meeting-related-marked" data-command="openIssueModal" data-command-arg="${i.id}">${escapeHtml(i.title)}</div>`)}
      ${group('agreements', 'Открытые договорённости', relAgreements, (a) => `<div class="ui-row ui-row--compact mini-row clickable" data-command="openAgreementModal" data-command-arg="${a.id}">${previewText(a.text, 60)}</div>`)}
      ${group('notes', 'Заметки из журнала', relNotes, (entry) => `<a class="ui-row ui-row--compact mini-row clickable meeting-related-note" href="/journal?entry=${encodeURIComponent(entry.id)}"><span class="meeting-related-note-text">${previewText(entry.text, 86)}</span></a>`)}
      ${nothing ? `<div class="tiny meeting-related-empty">Нет активных связей и свежих заметок</div>` : ''}
    `;
  });
}


// Закрываем управленческий цикл после встречи: из результатов сразу создаются follow-up сущности.
function openMeetingFollowup(meeting) {
  const openActions = (meeting.actionItems || []).filter((x) => !x.done && x.text);
  const participants = (meeting.participantIds || []).map((id) => store.person(id)).filter(Boolean);
  const primaryPerson = participants.find((p) => p.type === 'team') || participants[0] || null;
  const sourceLabel = `${MEETING_TYPE_LABEL[meeting.type] || 'Встреча'} · ${fmtDate(meeting.date)}`;

  Modal.open(`
    <h2>Что не забыть после встречи?</h2>
    <p class="muted" style="margin:-4px 0 18px">${escapeHtml(meetingDisplayTitle(meeting))} · ${escapeHtml(fmtDate(meeting.date))}</p>
    ${openActions.length ? `<div class="followup-group"><div class="ui-field-label field-label">ACTION ITEMS → ЗАДАЧИ</div>${openActions.map((ai, i) => `<label class="followup-option"><input type="checkbox" data-follow-task="${i}" checked><span>${escapeHtml(ai.text)}</span></label>`).join('')}</div>` : ''}
    <div class="ui-modal-actions modal-actions">
      <button class="ui-button btn" id="follow-skip">Не создавать</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="follow-save">Создать follow-up</button>
    </div>
  `);

  document.getElementById('follow-skip').onclick = () => { Modal.close(); Router.render(); };
  document.getElementById('follow-save').onclick = async () => {
    const selected = Array.from(document.querySelectorAll('[data-follow-task]:checked')).map((el) => openActions[Number(el.dataset.followTask)]).filter(Boolean);
    for (const ai of selected) {
      await Resources.tasks.create({
        title: ai.text,
        description: `Из встречи: ${sourceLabel}`,
        projectId: meeting.projectId || null,
        assigneeIds: ai.assigneeId ? [ai.assigneeId] : (primaryPerson ? [primaryPerson.id] : []),
        status: 'todo', priority: 'normal', dueDate: null,
        sourceMeetingId: meeting.id,
      });
    }
    Modal.close();
    toast('Follow-up создан');
    Router.render();
  };
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ setMeetingPeriod, toggleMeetingMonth, deleteMeeting, openMeetingModal, meetingDetailGoBack });
