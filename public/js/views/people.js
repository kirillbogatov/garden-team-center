// Команда, Стейкхолдеры и карточка человека.

Views.team = async function () {
  await store.loadAll();
  renderPeopleList('team', 'Команда', 'Пока никого нет в команде');
};

Views.stakeholders = async function () {
  await store.loadAll();
  renderPeopleList('stakeholder', 'Стейкхолдеры', 'Пока никого нет в списке');
};

function renderPeopleList(type, title, emptyHint) {
  if (type === 'team' && Views._teamOnlyActive === undefined) Views._teamOnlyActive = true;
  const allPeople = (store.people || []).filter((p) => p.type === type);
  const people = type === 'team' && Views._teamOnlyActive ? allPeople.filter(isActiveTeamPerson) : allPeople;
  setTopbar(`<h1>${title}</h1>${(Auth.canManage('people') || (Auth.isTeamlead() && type === 'team')) ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openPersonModal" data-command-arg="${type}">${type === 'team' ? '+ Добавить сотрудника' : '+ Добавить стейкхолдера'}</button></div>` : ''}`);
  const view = document.getElementById('view');

  const teamFilter = type === 'team' ? `<div class="team-list-toolbar"><label class="team-active-toggle"><input type="checkbox" ${Views._teamOnlyActive ? 'checked' : ''} onchange="toggleTeamOnlyActive(this.checked)" /><span>Только активные</span></label></div>` : '';

  if (!people.length) {
    view.innerHTML = `${teamFilter}${emptyState(type === 'team' && Views._teamOnlyActive ? 'Нет активных сотрудников' : emptyHint, '', type === 'team' ? 'team' : 'stakeholders')}`;
    return;
  }

  if (type === 'stakeholder') {
    view.innerHTML = `<div class="stakeholder-list view-narrow">
      ${people.map((p) => {
        const projects = (store.projects || []).filter((pr) => (pr.memberIds || []).includes(p.id));
        const tags = nonGradeTags(p);
        return `<div class="ui-row list-row stakeholder-row" data-route="${personPath(p)}">
          ${avatarHtml(p, 'sm')}
          <div class="stakeholder-main">
            <span class="title">${escapeHtml(p.name)}</span>
            ${p.role ? `<span class="meta stakeholder-role">${escapeHtml(p.role)}</span>` : ''}
          </div>
          <div class="stakeholder-tags">${projects.slice(0, 2).map((pr) => projectChip(pr)).join('')}${tags.slice(0, 2).map((t) => `<span class="ui-tag chip">${escapeHtml(t)}</span>`).join('')}</div>
          ${p.email ? `<span class="meta stakeholder-contact">${escapeHtml(p.email)}</span>` : ''}
          <span class="row-chevron">${icon('chevronRight', 13)}</span>
        </div>`;
      }).join('')}
    </div>`;
    return;
  }

  view.innerHTML = `${teamFilter}
    <div class="people-grid people-grid--team">
      ${people
        .map((p) => {
          const localTime = localTimeLabel(p);
          const activeProjects = (store.projects || []).filter((pr) => pr.status === 'active' && (pr.memberIds || []).includes(p.id));
          const projectTags = activeProjects.slice(0, 2).map((pr) => projectChip(pr));
          const extraProjects = activeProjects.length > 2 ? `<span class="ui-tag chip project-chip project-chip--more">+${activeProjects.length - 2}</span>` : '';
          const auxTags = nonGradeTags(p).slice(0, 1).map((t) => `<span class="ui-tag chip">${escapeHtml(t)}</span>`);
          const tagsHtml = [...projectTags, extraProjects, ...auxTags].join('');
          return `<div class="ui-surface ui-surface--person person-card person-card--team" data-route="${personPath(p)}">
            ${avatarWithStatusHtml(p, store.vacations, 'lg')}
            <div class="pc-body">
              <div class="pc-primary">
                <div class="pc-name">${escapeHtml(p.name)}</div>
                <div class="pc-role">${roleWithGrade(p)}</div>
                ${personStatusHtml(p, store.vacations, { noDot: true })}
                ${tagsHtml ? `<div class="pc-tags">${tagsHtml}</div>` : ''}
              </div>
              <div class="pc-local-time" title="${escapeHtml(timezoneOptionLabel(p.timezone || 'Europe/Moscow'))}">
                <span class="pc-local-time-value">${escapeHtml(localTime || '—')}</span>
              </div>
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;
}

function toggleTeamOnlyActive(checked) {
  Views._teamOnlyActive = !!checked;
  renderPeopleList('team', 'Команда', 'Пока никого нет в команде');
}

function openPersonModal(type, existing) {
  const isEdit = !!existing;
  const p = existing || { type };
  const limitedSelf = isEdit && !Auth.canManage('people') && !Auth.isTeamlead() && Auth.isOwnPerson(p.id);
  const teamleadManaging = Auth.isTeamlead() && type === 'team' && (!isEdit || p.teamLeadId === Auth.user?.personId || p.id === Auth.user?.personId);
  const skillsetUrl = p.skillsetUrl || '';
  const cleanNotes = p.notes || '';
  Modal.open(`
    <h2>${isEdit ? 'Редактировать' : type === 'team' ? 'Новый член команды' : 'Новый стейкхолдер'}</h2>
    ${isEdit ? `<div class="photo-field">
      <span id="pf-avatar-preview">${avatarHtml(p, 'xl')}</span>
      <div class="photo-field-actions">
        <button type="button" class="ui-button ui-button--sm btn btn-sm" id="pf-photo-btn">${icon('camera', 14)} ${p.photoUrl ? 'Заменить фото' : 'Загрузить фото'}</button>
        ${p.photoUrl ? `<button type="button" class="ui-button ui-button--sm btn btn-sm btn-danger" id="pf-photo-remove">${icon('trash', 13)} Удалить</button>` : ''}
        <input type="file" id="pf-photo-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" />
      </div>
    </div>` : ''}
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-name">Имя</label><input id="pf-name" value="${escapeHtml(p.name || '')}" ${limitedSelf ? 'disabled' : ''} /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="pf-role">Роль</label><input id="pf-role" value="${escapeHtml(p.role || '')}" placeholder="${type === 'team' ? 'Например, Backend-разработчик' : 'Например, Продакт-менеджер клиента'}" ${limitedSelf ? 'disabled' : ''} /></div>
    ${type === 'team' ? `<div class="ui-field field"><label class="ui-field-label field-label" for="pf-grade">Грейд</label><select id="pf-grade" ${limitedSelf ? 'disabled' : ''}>
      <option value="">Не указан</option>
      ${GRADE_TAGS.map((grade) => `<option value="${grade}" ${personGrade(p) === grade ? 'selected' : ''}>${GRADE_LABEL[grade]}</option>`).join('')}
    </select></div>` : ''}
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-email">Email</label><input id="pf-email" value="${escapeHtml(p.email || '')}" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-telegram">Telegram</label><input id="pf-telegram" value="${escapeHtml(p.telegram || '')}" /></div>
    </div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-birthday">День рождения</label><input id="pf-birthday" type="date" value="${p.birthday || ''}" /></div>
      ${type === 'team' ? `<div class="ui-field field"><label class="ui-field-label field-label" for="pf-hire">Дата найма</label><input id="pf-hire" type="date" value="${p.hireDate || ''}" ${limitedSelf ? 'disabled' : ''} /></div>` : ''}
    </div>
    ${type === 'team' ? `<div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-status">Статус</label>
        <select id="pf-status" ${limitedSelf ? 'disabled' : ''}>
          <option value="active" ${!p.status || p.status === 'active' ? 'selected' : ''}>Активен</option>
          <option value="on_leave" ${p.status === 'on_leave' ? 'selected' : ''}>В отпуске</option>
          <option value="dismissed" ${p.status === 'dismissed' ? 'selected' : ''}>Уволен</option>
          <option value="transferred" ${p.status === 'transferred' ? 'selected' : ''}>Переведен</option>
        </select>
      </div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-city">Город</label><input id="pf-city" value="${escapeHtml(p.city || '')}" placeholder="Например, Калининград" /></div>
    </div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-timezone">Часовой пояс</label>
        <select id="pf-timezone">${availableTimezones(p.timezone || 'Europe/Kaliningrad').map((tz) => `<option value="${escapeHtml(tz)}" ${(p.timezone || 'Europe/Kaliningrad') === tz ? 'selected' : ''}>${escapeHtml(timezoneOptionLabel(tz))}</option>`).join('')}</select>
      </div>
      <div class="ui-field field"><span class="ui-field-label field-label">Начало / конец рабочего дня (по их времени)</span>
        <div class="flex gap-8">
          <input id="pf-work-start" type="time" aria-label="Начало рабочего дня" value="${p.workStart || '09:00'}" />
          <input id="pf-work-end" type="time" aria-label="Конец рабочего дня" value="${p.workEnd || '18:00'}" />
        </div>
      </div>
    </div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-1on1-frequency">1 on 1 — каждые</label><select id="pf-1on1-frequency">${[0,1,2,3,4,6,12].map((n) => `<option value="${n}" ${Number(p.oneOnOneEveryMonths ?? 1) === n ? 'selected' : ''}>${n === 0 ? 'Не планировать' : `${n} ${pluralRu(n, 'месяц', 'месяца', 'месяцев')}`}</option>`).join('')}</select></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-pr-frequency">PR — каждые</label><select id="pf-pr-frequency">${[0,1,2,3,4,6,12].map((n) => `<option value="${n}" ${Number(p.prEveryMonths ?? 3) === n ? 'selected' : ''}>${n === 0 ? 'Не планировать' : `${n} ${pluralRu(n, 'месяц', 'месяца', 'месяцев')}`}</option>`).join('')}</select></div>
    </div>` : ''}
    ${type === 'team' ? `<div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-strengths-likes">Сильные стороны / что нравится</label><textarea id="pf-strengths-likes" rows="3" placeholder="Сильные стороны, интересы, тип задач, который нравится">${escapeHtml(p.strengthsLikes || p.developmentFocus || '')}</textarea></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-weaknesses-dislikes">Слабые стороны / что не нравится</label><textarea id="pf-weaknesses-dislikes" rows="3" placeholder="Зоны роста, ограничения, задачи, которые не нравятся">${escapeHtml(p.weaknessesDislikes || '')}</textarea></div>
    </div>
    <div class="ui-field-row field-row">
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-skillset-url">Скиллсет</label><input id="pf-skillset-url" type="url" value="${escapeHtml(skillsetUrl)}" placeholder="https://…" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="pf-ipr-url">ИПР</label><input id="pf-ipr-url" type="url" value="${escapeHtml(p.iprUrl || '')}" placeholder="https://…" /></div>
    </div>` : ''}
    ${(Auth.canManage('people') || teamleadManaging) ? `<div class="ui-field field"><label class="ui-field-label field-label" for="pf-notes">Заметки</label><textarea id="pf-notes" rows="3">${escapeHtml(cleanNotes)}</textarea></div>` : ''}
    <div class="ui-modal-actions modal-actions">
      ${isEdit && Auth.isAdmin() ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="pf-delete">${icon('trash', 14)} Удалить</button>` : ''}
      <button class="ui-button btn" id="pf-cancel">Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="pf-save">Сохранить</button>
    </div>
  `);

  document.getElementById('pf-cancel').onclick = () => Modal.close();
  if (isEdit) {
    const photoInput = document.getElementById('pf-photo-input');
    document.getElementById('pf-photo-btn').onclick = () => photoInput.click();
    photoInput.onchange = async () => {
      const file = photoInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast('Файл слишком большой (макс. 8 МБ)'); return; }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      try {
        const updated = await api.post(`/api/people/${p.id}/photo`, { photo: dataUrl });
        p.photoUrl = updated.photoUrl;
        await store.loadAll();
        document.getElementById('pf-avatar-preview').innerHTML = avatarHtml(p, 'xl');
        toast('Фото обновлено');
        openPersonModal(type, p);
      } catch (e) {
        toast('Не удалось загрузить фото');
      }
    };
    const removeBtn = document.getElementById('pf-photo-remove');
    if (removeBtn) {
      removeBtn.onclick = async () => {
        await api.del(`/api/people/${p.id}/photo`);
        p.photoUrl = null;
        await store.loadAll();
        toast('Фото удалено');
        openPersonModal(type, p);
      };
    }
  }
  if (isEdit && Auth.isAdmin()) {
    document.getElementById('pf-delete').onclick = async () => {
      const ok = await confirmAction(`Удалить ${p.name} из списка? Задачи и записи журнала останутся, но без карточки.`);
      if (!ok) return;
      await Resources.people.remove(p.id);
      Modal.close();
      toast('Удалено');
      Router.go(type === 'team' ? '/team' : '/stakeholders');
      store.loadAll();
    };
  }
  document.getElementById('pf-save').onclick = async () => {
    const payload = {
      name: document.getElementById('pf-name').value.trim(),
      role: document.getElementById('pf-role').value.trim(),
      type,
      email: document.getElementById('pf-email').value.trim(),
      telegram: document.getElementById('pf-telegram').value.trim(),
      birthday: document.getElementById('pf-birthday').value || null,
      notes: document.getElementById('pf-notes')?.value.trim() || '',
    };
    if (type === 'team') {
      payload.hireDate = document.getElementById('pf-hire').value || null;
      payload.grade = document.getElementById('pf-grade').value || null;
      payload.status = document.getElementById('pf-status').value;
      payload.city = document.getElementById('pf-city').value.trim();
      payload.timezone = document.getElementById('pf-timezone').value.trim() || 'Europe/Kaliningrad';
      payload.workStart = document.getElementById('pf-work-start').value || '09:00';
      payload.workEnd = document.getElementById('pf-work-end').value || '18:00';
      payload.strengthsLikes = document.getElementById('pf-strengths-likes').value.trim();
      payload.weaknessesDislikes = document.getElementById('pf-weaknesses-dislikes').value.trim();
      payload.skillsetUrl = document.getElementById('pf-skillset-url').value.trim();
      payload.iprUrl = document.getElementById('pf-ipr-url').value.trim();
      payload.oneOnOneEveryMonths = Number(document.getElementById('pf-1on1-frequency')?.value ?? 1);
      payload.prEveryMonths = Number(document.getElementById('pf-pr-frequency')?.value ?? 3);
      if (payload.skillsetUrl && !/^https?:\/\//i.test(payload.skillsetUrl)) { toast('Ссылка на скиллсет должна начинаться с http:// или https://'); return; }
      if (payload.iprUrl && !/^https?:\/\//i.test(payload.iprUrl)) { toast('Ссылка на ИПР должна начинаться с http:// или https://'); return; }
    }
    if (!payload.name) { toast('Укажите имя'); return; }
    if (isEdit) await Resources.people.update(p.id, payload);
    else await Resources.people.create(payload);
    await store.loadAll();
    Modal.close();
    toast('Сохранено');
    if (isEdit) Views.personDetail(p.id);
    else Router.go(type === 'team' ? '/team' : '/stakeholders');
  };
}

Views._personTab = 'tasks';
Views._personJournalFilter = Views._personJournalFilter || 'all';

// Состояние сотрудника рассчитывается из рабочего контекста, а не хранится вручную.
function personDevelopmentHtml(p, data) {
  if (p.type !== 'team') return '';
  const developmentTasks = data.tasks
    .filter((t) => t.taskType === 'development')
    .sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0;
      const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0;
      return bTime - aTime;
    });

  function developmentTaskRow(task) {
    const idx = registerAction(() => FeatureLoader.run('openTaskModal', task.id));
    const project = store.project(task.projectId);
    const overdue = task.dueDate && task.status !== 'done' && task.dueDate.slice(0, 10) < todayStr();
    return `<div class="ui-row ui-row--task list-row task-list-row development-task" data-action-id="${idx}">
      ${taskStatusBadge(task.status, task.id)}
      <span class="tl-title">${escapeHtml(task.title)}</span>
      <div class="tl-right">
        <div class="task-tags-cell">
          <span class="task-labels-group">
            <span class="ui-tag ui-tag--task-type badge task-kind ${task.taskType}">${escapeHtml(TASK_TYPE_LABEL[task.taskType] || task.taskType)}</span>
            ${priorityBadge(task.priority)}
          </span>
        </div>
        <span class="task-due-cell tiny" style="${overdue ? 'color:var(--red)' : ''}">${task.dueDate ? (task.status === 'done' ? deadlineDateLabel(task.dueDate) : dueLabel(task.dueDate)) : ''}</span>
        <span class="task-assignee-cell" aria-hidden="true"></span>
      </div>
    </div>`;
  }

  function taskGroup(label, items, emptyText) {
    return `<div class="development-task-group">
      <div class="development-subhead"><span>${label}</span><span>${items.length}</span></div>
      <div class="development-task-surface">${items.length ? items.map(developmentTaskRow).join('') : `<div class="development-group-empty">${emptyText}</div>`}</div>
    </div>`;
  }

  const developmentItems = [...developmentTasks]
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0;
      const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0;
      return bTime - aTime;
    });

  const labProjects = (data.labs || []).filter((lab) => lab.entityType !== 'idea');
  const labRows = labProjects.map((lab) => {
    const idx = registerAction(() => Router.go(`/labs/${encodeURIComponent(lab.labKey || lab.id)}`));
    return `<div class="ui-row ui-row--task list-row task-list-row development-task" data-action-id="${idx}">
      ${labStatusReadonlyIconHtml(lab.status || 'idea')}
      <span class="tl-title">${escapeHtml(lab.title || lab.description || 'Без названия')}</span>
      <div class="tl-right">
        <div class="task-tags-cell"><span class="task-labels-group"><span class="ui-tag ui-tag--task-type badge task-kind labs">The Labs</span></span></div>
        <span class="task-due-cell tiny"></span>
        <span class="task-assignee-cell" aria-hidden="true"></span>
      </div>
    </div>`;
  });
  const developmentList = (developmentItems.length || labRows.length)
    ? developmentItems.map(developmentTaskRow).join('') + labRows.join('')
    : `<div class="development-group-empty">Нет задач на развитие и проектов The Labs</div>`;

  return `<div class="development-panel person-development-tab">
    <div class="development-task-surface">${developmentList}</div>
  </div>`;
}

function personContextHtml(p, data) {
  const rows = [];
  const schedule = workScheduleBlockHtml(p);
  if (schedule) rows.push({ label: 'Работает', value: schedule });
  if (p.birthday) rows.push({ label: 'День рождения', value: escapeHtml(fmtDate(p.birthday, { withYear: false })) });
  if (p.type === 'team' && p.hireDate) {
    const tenure = formatTenure(p.hireDate);
    if (tenure) rows.push({ label: 'Стаж', value: escapeHtml(tenure) });
  }
  const rest = p.notes || '';
  const skillsetUrl = p.skillsetUrl || '';
  if (p.type === 'team') {
    const ipr = p.iprUrl || '';
    rows.push({
      label: 'ИПР',
      value: ipr
        ? `<a class="context-resource-link" href="${escapeHtml(ipr)}" target="_blank" rel="noopener">Открыть план развития</a>`
        : '<span class="context-resource-empty">Не указан</span>'
    });
    rows.push({
      label: 'Скиллсет',
      value: skillsetUrl
        ? `<a class="context-resource-link" href="${escapeHtml(skillsetUrl)}" target="_blank" rel="noopener">Открыть карту навыков</a>`
        : '<span class="context-resource-empty">Не указан</span>'
    });
  }
  const strengthsLikes = p.strengthsLikes || p.developmentFocus || '';
  const weaknessesDislikes = p.weaknessesDislikes || '';
  const preferencesHtml = p.type === 'team' ? `<div class="person-context-preferences-row">
    <div class="person-context-preference"><span>Сильные стороны / что нравится</span><div>${strengthsLikes ? escapeHtml(strengthsLikes).replace(/\n/g, '<br>') : '<span class="context-resource-empty">Не указано</span>'}</div></div>
    <div class="person-context-preference"><span>Слабые стороны / что не нравится</span><div>${weaknessesDislikes ? escapeHtml(weaknessesDislikes).replace(/\n/g, '<br>') : '<span class="context-resource-empty">Не указано</span>'}</div></div>
    <div class="person-context-preference"><span>Комментарий</span><div>${rest ? escapeHtml(rest).replace(/\n/g, '<br>') : '<span class="context-resource-empty">Не указано</span>'}</div></div>
  </div>` : (rest ? `<div><span>Комментарий</span><div>${escapeHtml(rest).replace(/\n/g, '<br>')}</div></div>` : '');
  if (!rows.length && !preferencesHtml) return '';
  return `<section class="person-focus-section person-context"><div class="person-context-grid">${rows.map((r) => `<div><span>${r.label}</span><div>${r.value}</div></div>`).join('')}${preferencesHtml}</div></section>`;
}

Views.personDetail = async function (id) {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const data = await api.get(`/api/people/${id}/profile`);
  data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  // В карточке сотрудника новые задачи всегда выше старых.
  data.tasks.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0;
    const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0;
    return bTime - aTime;
  });
  data.projects = Array.isArray(data.projects) ? data.projects : [];
  data.meetings = Array.isArray(data.meetings) ? data.meetings : [];
  data.journal = Array.isArray(data.journal) ? data.journal : [];
  data.agreements = Array.isArray(data.agreements) ? data.agreements : [];
  data.issues = Array.isArray(data.issues) ? data.issues : [];
  data.vacations = Array.isArray(data.vacations) ? data.vacations : [];
  data.labs = Array.isArray(data.labs) ? data.labs : [];
  const p = data.person;
  if (id !== (data.person.slug || data.person.id)) Router.replace(personPath(p));

  const addTaskIdx = registerAction(() => FeatureLoader.run('openTaskModal', null, { prefill: { assigneeIds: [p.id] } }));
  const addMeetingIdx = registerAction(() => FeatureLoader.run('openMeetingModal', { participantIds: [p.id] }));
  const editPersonIdx = registerAction(() => openPersonModal(p.type, p));
  // Маршрут карточки человека живёт под /people/:ref, а не под /team или
  // /stakeholders (куда на него ссылается меню) — pageBreadcrumbParts не может
  // резолвить его автоматически по пути. Передаём крошки явно вторым
  // параметром setTopbar, тем же способом, что и The Labs ниже.
  setTopbar(`<h1 class="person-topbar-title-placeholder" aria-hidden="true">&nbsp;</h1>
    <div class="actions">
      ${p.type === 'team' ? `<button class="ui-button ui-button--sm btn btn-sm" data-action-id="${addTaskIdx}">+ Добавить задачу</button>
      <button class="ui-button ui-button--sm btn btn-sm" data-action-id="${addMeetingIdx}">+ Добавить встречу</button>` : ''}
      ${(Auth.canManage('people') || Auth.isOwnPerson(p.id) || Auth.canManagePerson(p)) ? `<button class="ui-button btn" data-action-id="${editPersonIdx}">${icon('edit', 14)} Редактировать</button>` : ''}
    </div>`, { crumbs: [
      { label: 'Garden', path: '/overview' },
      { label: p.type === 'team' ? 'Команда' : 'Стейкхолдеры', path: p.type === 'team' ? '/team' : '/stakeholders' },
    ] });
  Views._lastPerson = p;

  // Тот же порядок статусов, что и группировка на странице «Задачи» (К выполнению →
  // В работе → На ревью → Приостановлено → Заблокировано → Готово), а не порядок
  // создания записей — иначе список выглядит вперемешку.
  const historyTasks = data.tasks.filter((t) => !t.archivedAt && t.taskType !== 'development')
    .slice()
    .sort((a, b) => TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status));

  const journalRegular = data.journal.filter((entry) => entry.kind !== 'problem' && entry.kind !== 'agreement');
  const journalTotal = journalRegular.length + data.issues.length + data.agreements.length;
  const developmentCount = data.tasks.filter((t) => t.taskType === 'development').length + data.labs.filter((lab) => lab.entityType !== 'idea').length;
  const tabs = [
    { key: 'tasks', label: 'Задачи' },
    ...(p.type === 'team' ? [{ key: 'development', label: 'Развитие' }] : []),
    { key: 'meetings', label: 'Встречи' },
    { key: 'journal', label: 'Журнал' },
    ...(p.type === 'team' ? [{ key: 'load', label: 'Загрузка' }] : []),
  ];
  if (!tabs.some((t) => t.key === Views._personTab)) Views._personTab = 'tasks';

  function tabBody(key) {
    if (key === 'tasks') {
      // Та же сетка колонок (tl-title / task-tags-cell / task-due-cell /
      // task-assignee-cell), что и в taskListRowHtml на странице «Задачи» —
      // раньше здесь были те же самые данные, но одной строкой без колонок,
      // из-за чего теги не выравнивались, а срок не был прибит к правому
      // краю. Колонка исполнителя оставлена пустой (как и в соседней вкладке
      // «Развитие», see developmentTaskRow ниже) — на странице самого
      // сотрудника его же аватар в каждой строке был бы лишним, но пустая
      // ячейка сохраняет ту же сетку и то же положение срока, что и везде.
      return historyTasks.length
        ? historyTasks.map((t) => {
            const idx = registerAction(() => FeatureLoader.run('openTaskModal', t.id));
            const overdue = t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < todayStr();
            return `<div class="ui-row ui-row--task list-row task-list-row" data-action-id="${idx}">
              ${taskStatusBadge(t.status, t.id)}
              <span class="tl-title">${escapeHtml(t.title)}</span>
              <div class="tl-right">
                <div class="task-tags-cell">${taskLabelsHtml(t)}</div>
                <div class="task-due-cell">${t.dueDate ? `<span class="tiny" style="${overdue ? 'color:var(--red)' : ''}">${t.status === 'done' ? deadlineDateLabel(t.dueDate) : dueLabel(t.dueDate)}</span>` : ''}</div>
                <span class="task-assignee-cell" aria-hidden="true"></span>
              </div>
            </div>`;
          }).join('')
        : emptyState('Задач нет', '', 'tasks');
    }
    if (key === 'development' && p.type === 'team') {
      return personDevelopmentHtml(p, data);
    }
    if (key === 'meetings') {
      return data.meetings.length
        ? data.meetings.map((m) => {
            const idx = registerAction(() => FeatureLoader.run('openMeetingModal', m));
            return `<div class="ui-row list-row" data-action-id="${idx}">
              <span class="ui-tag badge">${MEETING_TYPE_LABEL[m.type]}</span><span class="title">${escapeHtml(meetingDisplayTitle(m))}</span>
              <span class="meta">${fmtDate(m.date)}</span>
            </div>`;
          }).join('')
        : emptyState('Встреч ещё не было', '', 'meetings');
    }
    if (key === 'journal') {
      const filterDefs = [
        { key: 'all', label: 'Все', count: journalTotal },
        { key: 'entries', label: 'Записи', count: journalRegular.length },
        { key: 'issues', label: 'Проблемы', count: data.issues.length },
        { key: 'agreements', label: 'Договорённости', count: data.agreements.length },
      ];
      if (!filterDefs.some((filter) => filter.key === Views._personJournalFilter)) Views._personJournalFilter = 'all';
      const rows = [];
      if (Views._personJournalFilter === 'all' || Views._personJournalFilter === 'entries') {
        journalRegular.forEach((entry) => rows.push({
          date: entry.createdAt || '',
          html: journalEntryHtml(entry),
        }));
      }
      if (Views._personJournalFilter === 'all' || Views._personJournalFilter === 'issues') {
        data.issues.forEach((issue) => {
          const idx = registerAction(() => FeatureLoader.run('openIssueModal', issue.id));
          rows.push({
            date: issue.createdAt || issue.updatedAt || '',
            html: `<div class="ui-row list-row" data-action-id="${idx}">
              ${issueStatusBadge(issue.status, issue.id)}<span class="title">${escapeHtml(issue.title)}</span>${severityBadge(issue.severity)}
            </div>`,
          });
        });
      }
      if (Views._personJournalFilter === 'all' || Views._personJournalFilter === 'agreements') {
        data.agreements.forEach((agreement) => {
          const idx = registerAction(() => FeatureLoader.run('openAgreementModal', agreement.id));
          rows.push({
            date: agreement.createdAt || agreement.date || '',
            html: `<div class="journal-entry clickable" data-action-id="${idx}">
              <div class="je-head"><span class="ui-tag badge" style="--ui-tag-dot:${agreement.status === 'done' ? 'var(--green)' : 'var(--text-tertiary)'}">${agreement.status === 'done' ? 'Выполнено' : 'В работе'}</span>
              <span class="tiny">${fmtDate(agreement.date)}</span></div>
              <div class="je-text">${renderMentionText(agreement.text)}</div>
            </div>`,
          });
        });
      }
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return `<div class="ui-segmented person-journal-filters person-journal-switch" role="tablist" aria-label="Тип записей журнала">
        ${filterDefs.map((filter) => `<button type="button" class="ui-segmented-item ${Views._personJournalFilter === filter.key ? 'active' : ''}" role="tab" aria-selected="${Views._personJournalFilter === filter.key}" data-view-state="_personJournalFilter" data-view-value="${filter.key}" data-view-render="personDetail" data-view-render-arg="${id}">${filter.label}</button>`).join('')}
      </div>
      <div class="person-journal-feed">${rows.length ? rows.map((row) => row.html).join('') : emptyState('Записей нет', '', 'journal')}</div>`;
    }
    if (key === 'load' && p.type === 'team') {
      const summary = personProjectLoadSummary(p.id, store.projects);
      const rows = summary.projects.map((pr) => {
        const load = normalizeProjectMemberLoad((pr.memberLoads || {})[p.id]);
        const cfg = PROJECT_LOAD_OPTIONS[load.mode];
        return `<div class="ui-row list-row person-load-summary-row" data-route="${projectPath(pr)}">
          <span class="dot" style="background:${pr.color || 'var(--accent)'}"></span>
          <span class="title">${escapeHtml(pr.name)}</span>
          <span class="meta">${cfg.label}</span>
        </div>`;
      }).join('');
      return `<div class="person-load-summary">
        <div class="person-load-summary-head">
          <div><span class="team-load-level ${summary.level.tone}">${summary.level.label}</span></div>
          ${Auth.canManage('projects') ? `<button class="ui-button ui-button--sm btn btn-sm" data-command="openPersonLoadModal" data-command-arg="${p.id}">${icon('edit', 13)} Редактировать</button>` : ''}
        </div>
        ${rows || emptyState('Нет активных проектов', '', 'projects')}
      </div>`;
    }
    return '';
  }

  view.innerHTML = `
    <div class="person-detail person-detail-${p.type}">
    <div class="person-profile-head">
      ${avatarWithStatusHtml(p, store.vacations, 'xl')}
      <div class="person-profile-identity">
        <div class="dh-name">${escapeHtml(p.name)}</div>
        <div class="dh-role">${roleWithGrade(p)}</div>
        <div class="person-profile-inline-status">${personStatusHtml(p, store.vacations, { noDot: true })}</div>
        ${data.projects.length ? `<div class="person-profile-projects" aria-label="Проекты">${data.projects.map(projectChip).join('')}</div>` : ''}
      </div>
    </div>
    ${personContextHtml(p, data)}
    <div class="person-history-label">История и работа</div>
    <div class="ui-tab tabs person-tabs">${tabs.map((t) => `<div class="ui-tab tab ${Views._personTab === t.key ? 'active' : ''}" data-view-state="_personTab" data-view-value="${t.key}" data-view-render="personDetail" data-view-render-arg="${id}">${t.label}</div>`).join('')}</div>
    <div class="person-tab-body">${tabBody(Views._personTab)}</div>
    </div>
  `;
};

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openPersonModal });
