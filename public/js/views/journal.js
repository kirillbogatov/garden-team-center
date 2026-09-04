// Журнал — быстрые заметки, идеи, проблемы и договоренности с упоминаниями через @.

Views._journalFilter = Views._journalFilter || 'all';
Views._journalComposerKind = Views._journalComposerKind || 'note';
Views._journalQuery = Views._journalQuery || '';
Views._journalSearchOpen = Views._journalSearchOpen || false;

Views.journal = async function () {
  const requestedKind = Router.queryParam('kind');
  const requestedEntry = Router.queryParam('entry');
  const allowedKinds = ['note', 'idea', 'problem', 'agreement'];
  if (requestedEntry) {
    Views._journalFilter = 'all';
    Views._journalQuery = '';
    Views._journalSearchOpen = false;
  } else if (allowedKinds.includes(requestedKind)) {
    Views._journalFilter = requestedKind;
    Views._journalComposerKind = requestedKind;
    // Параметр нужен только для входа в преднастроенный журнал. После применения
    // убираем его из URL, чтобы пользователь мог свободно менять фильтр вручную.
    Router.replace('/journal');
  }

  setTopbar(`<h1>Журнал</h1>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  const entries = (await Resources.journal.list()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const kinds = ['all', 'note', 'idea', 'problem', 'agreement'];
  const kindLabels = { all: 'Все', note: 'Заметки', idea: 'Идеи', problem: 'Проблемы', agreement: 'Договоренности' };

  const byKind = Views._journalFilter === 'all' ? entries : entries.filter((e) => e.kind === Views._journalFilter);
  const journalQuery = (Views._journalQuery || '').trim().toLocaleLowerCase('ru');
  const filtered = journalQuery ? byKind.filter((e) => (e.text || '').toLocaleLowerCase('ru').includes(journalQuery)) : byKind;

  view.innerHTML = `
    <div class="view-narrow">
      <div class="journal-composer" id="composer">
        <div id="journal-text" class="je-editable" contenteditable="true" data-placeholder="Что произошло? Упомяните @человека или @проект."></div>
        <div class="composer-footer journal-composer-footer">
          <div class="journal-kind-switch meeting-filterbar journal-composer-type-selector" id="journal-kind-switch" aria-label="Тип записи">
            ${['note', 'idea', 'problem', 'agreement']
              .map((k) => `<button type="button" class="ui-segmented-item meeting-filter kind-btn ${k === Views._journalComposerKind ? 'active' : ''}" data-kind="${k}"><span>${JOURNAL_KIND_LABEL[k]}</span></button>`)
              .join('')}
          </div>
          <div class="journal-composer-actions">
            ${Auth.canCreate('tasks') ? `<button type="button" class="ui-button btn journal-create-task" id="journal-create-task">Сделать задачей</button>` : ''}
            <button class="ui-button ui-button--primary btn btn-primary" id="journal-submit">Записать</button>
          </div>
        </div>
      </div>

      <div class="journal-history">
        <div class="journal-history-tools">
          <div class="ui-tab tabs journal-tabs">
            ${kinds.map((k) => `<div class="ui-tab tab ${Views._journalFilter === k ? 'active' : ''}" data-view-state="_journalFilter" data-view-value="${k}" data-view-render="journal">${kindLabels[k]}</div>`).join('')}
          </div>
          <button type="button" class="journal-search-toggle ${Views._journalSearchOpen ? 'active' : ''}" id="journal-search-toggle" title="Поиск по журналу" aria-label="Поиск по журналу">${icon('search',14)}</button>
        </div>
        ${Views._journalSearchOpen ? `<div class="journal-inline-search"><input id="journal-search-input" type="search" placeholder="Поиск по записям" value="${escapeHtml(Views._journalQuery || '')}" /><button type="button" class="ui-button ui-button--sm btn btn-sm" id="journal-search-close">Закрыть</button></div>` : ''}

        <div id="journal-feed">
          ${filtered.length ? filtered.map(journalEntryHtml).join('') : emptyState('Записей пока нет', 'Добавьте первую запись выше', 'journal')}
        </div>
      </div>
    </div>
  `;

  if (requestedEntry) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(`journal-entry-${requestedEntry}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('journal-entry-target');
        setTimeout(() => target.classList.remove('journal-entry-target'), 1800);
      }
      Router.replace('/journal');
    }));
  }

  const journalSearchToggle = document.getElementById('journal-search-toggle');
  if (journalSearchToggle) journalSearchToggle.onclick = () => { Views._journalSearchOpen = !Views._journalSearchOpen; if (!Views._journalSearchOpen) Views._journalQuery = ''; Views.journal(); };
  const journalSearchInput = document.getElementById('journal-search-input');
  if (journalSearchInput) {
    journalSearchInput.focus();
    journalSearchInput.oninput = () => { Views._journalQuery = journalSearchInput.value; const feed = document.getElementById('journal-feed'); const q = Views._journalQuery.trim().toLocaleLowerCase('ru'); const shown = (Views._journalFilter === 'all' ? entries : entries.filter((e) => e.kind === Views._journalFilter)).filter((e) => !q || (e.text || '').toLocaleLowerCase('ru').includes(q)); feed.innerHTML = shown.length ? shown.map(journalEntryHtml).join('') : emptyState('Ничего не найдено', 'Попробуйте другой запрос', 'search'); };
  }
  const journalSearchClose = document.getElementById('journal-search-close');
  if (journalSearchClose) journalSearchClose.onclick = () => { Views._journalSearchOpen = false; Views._journalQuery = ''; Views.journal(); };

  const editable = document.getElementById('journal-text');
  editable.dataset.submitOnEnter = 'true';
  attachMentionAutocompleteCE(editable, document.getElementById('composer'));

  let selectedKind = Views._journalComposerKind;
  let kindManuallySelected = false;
  document.querySelectorAll('#journal-kind-switch .kind-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedKind = btn.dataset.kind;
      kindManuallySelected = true;
      Views._journalComposerKind = selectedKind;
      document.querySelectorAll('#journal-kind-switch .kind-btn').forEach((b) => b.classList.toggle('active', b.dataset.kind === selectedKind));
    });
  });

  const applyDetectedKind = () => {
    const currentText = serializeEditableToText(editable);
    if (!currentText.trim()) kindManuallySelected = false;
    if (kindManuallySelected) return;
    const detected = detectJournalKindFromText(currentText);
    if (!detected || detected === selectedKind) return;
    selectedKind = detected;
    Views._journalComposerKind = detected;
    document.querySelectorAll('#journal-kind-switch .kind-btn').forEach((b) => b.classList.toggle('active', b.dataset.kind === detected));
  };
  editable.addEventListener('input', applyDetectedKind);

  const createTaskButton = document.getElementById('journal-create-task');
  if (createTaskButton) createTaskButton.addEventListener('click', async () => {
    const sourceText = serializeEditableToText(editable).trim();
    const prefill = journalTaskPrefill(sourceText);
    editable.innerHTML = '';
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    await FeatureLoader.run('openTaskModal', null, { prefill });
  });

  document.getElementById('journal-submit').addEventListener('click', async () => {
    const text = serializeEditableToText(editable).trim();
    if (!text) return;
    const payload = { text, kind: selectedKind, createdAt: new Date().toISOString() };
    // Проблема/идея/договорённость сразу же появляется и в своём разделе (Проблемы/
    // The Labs/Договорённости) — сервер синхронизирует их автоматически, см.
    // syncJournalDerivedEntity в server/domain/journal-sync.js. Для идеи видимость
    // спрашиваем напрямую диалогом (см. askIdeaVisibility в entity-ui.js) — вместо
    // чекбокса, который легко проглядеть; если пользователь ранее попросил не
    // спрашивать больше, диалог не покажется вовсе.
    if (selectedKind === 'idea') payload.private = await askIdeaVisibility();
    await Resources.journal.create(payload);

    toast(selectedKind === 'idea'
      ? (payload.private ? 'Идея сохранена (видна только вам)' : 'Идея сохранена и опубликована в The Labs')
      : selectedKind === 'problem' ? 'Запись добавлена в журнал и в «Проблемы»'
      : selectedKind === 'agreement' ? 'Запись добавлена в журнал и в «Договорённости»'
      : 'Запись добавлена в журнал');
    Views.journal();
  });

  editable.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
    e.preventDefault();
    document.getElementById('journal-submit').click();
  });
};




function journalTaskPrefill(text) {
  const source = String(text || '');
  const assigneeIds = [];
  let projectId = null;
  let match;
  MENTION_DISPLAY_RE.lastIndex = 0;
  while ((match = MENTION_DISPLAY_RE.exec(source)) !== null) {
    const [, , type, id] = match;
    if (type === 'person' && !assigneeIds.includes(id) && store.person(id)) assigneeIds.push(id);
    if (type === 'project' && !projectId && store.project(id)) projectId = id;
  }
  MENTION_DISPLAY_RE.lastIndex = 0;
  const title = source
    .replace(MENTION_DISPLAY_RE, (_, label) => label)
    .trim()
    .replace(/\s+/g, ' ');
  return { title, assigneeIds, projectId };
}

function detectJournalKindFromText(text) {
  const normalized = String(text || '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/^[\s\-–—:;,.!?]+/, '')
    .trim();
  if (!normalized) return null;

  const rules = [
    ['problem', /^(?:проблем(?:а|ы|е|у|ой|ою))\b/],
    ['agreement', /^(?:договоренн(?:ость|ости|остью|остям|остями)|договорились|договорился|договорилась)\b/],
    ['idea', /^(?:иде(?:я|и|ю|ей|е))\b/],
    ['note', /^(?:заметк(?:а|и|у|ой|е))\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] || null;
}


function openJournalEditModal(j) {
  Modal.open(
    `<h2>Редактировать запись</h2>
    <div class="ui-field field">
      <span class="ui-field-label field-label">Текст</span>
      <div id="jef-text" class="je-editable" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Текст записи" tabindex="0">${mentionsToEditableHtml(j.text)}</div>
    </div>
    <div class="ui-field field">
      <span class="ui-field-label field-label">Тип</span>
      <div class="kind-select" id="jef-kind-select" role="radiogroup" aria-label="Тип записи">
        ${['note', 'idea', 'problem', 'agreement']
          .map((k) => `<button type="button" class="ui-segmented-item kind-btn ${k === j.kind ? 'active' : ''}" role="radio" aria-checked="${k === j.kind}" data-kind="${k}">${JOURNAL_KIND_LABEL[k]}</button>`)
          .join('')}
      </div>
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="jef-date">Дата</label>
      <input id="jef-date" type="datetime-local" value="${toDatetimeLocalValue(j.createdAt)}" />
    </div>
    <label class="lab-private-checkbox journal-idea-visibility" id="jef-idea-visibility" style="${j.kind === 'idea' ? '' : 'display:none'}">
      <input type="checkbox" id="jef-idea-private" ${j.private ? 'checked' : ''}/>
      <span>Приватная идея (видна только вам)</span>
    </label>
    <div class="ui-modal-actions modal-actions">
      <button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="jef-delete">${icon('trash', 14)} Удалить</button>
      <button class="ui-button btn" id="jef-cancel">Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="jef-save">Сохранить</button>
    </div>`,
    { onMount: (panel) => attachMentionAutocompleteCE(document.getElementById('jef-text'), panel) }
  );

  let selectedKind = ['note', 'idea', 'problem', 'agreement'].includes(j.kind) ? j.kind : 'note';
  const ideaVisibilityRow = document.getElementById('jef-idea-visibility');
  document.querySelectorAll('#jef-kind-select .kind-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedKind = btn.dataset.kind;
      document.querySelectorAll('#jef-kind-select .kind-btn').forEach((b) => {
        const k = b.dataset.kind;
        b.classList.toggle('active', k === selectedKind);
        b.setAttribute('aria-checked', String(k === selectedKind));
      });
      if (ideaVisibilityRow) ideaVisibilityRow.style.display = selectedKind === 'idea' ? '' : 'none';
    });
  });

  document.getElementById('jef-cancel').onclick = () => Modal.close();
  document.getElementById('jef-delete').onclick = async () => {
    Modal.close();
    await deleteJournalEntry(j);
  };
  document.getElementById('jef-save').onclick = async () => {
    const text = serializeEditableToText(document.getElementById('jef-text')).trim();
    if (!text) { toast('Текст не может быть пустым'); return; }
    const payload = { text, kind: selectedKind };
    const dateVal = document.getElementById('jef-date').value;
    if (dateVal) payload.createdAt = new Date(dateVal).toISOString();
    if (selectedKind === 'idea') payload.private = Boolean(document.getElementById('jef-idea-private')?.checked);
    await Resources.journal.update(j.id, payload);
    Modal.close();
    toast('Сохранено');
    Router.render();
  };
}

const LINKED_ENTITY_LABEL = { problem: { noun: 'проблему', section: 'Проблемы', title: 'проблема' }, agreement: { noun: 'договорённость', section: 'Договорённости', title: 'договорённость' }, idea: { noun: 'идею', section: 'The Labs', title: 'идея' } };

function askDeleteLinkedJournalEntity(kind) {
  const { noun, section, title } = LINKED_ENTITY_LABEL[kind];
  return new Promise((resolve) => {
    Modal.open(
      `<h2>Связанная ${title}</h2>
       <p class="muted" style="margin:0 0 4px">Удалить также ${noun} из раздела «${section}»?</p>
       <div class="ui-modal-actions modal-actions">
         <button class="ui-button btn" id="jdel-keep">Оставить</button>
         <button class="ui-button ui-button--danger btn btn-danger-primary" id="jdel-linked">Удалить вместе</button>
       </div>`
    );
    document.getElementById('jdel-keep').onclick = () => { Modal.close(); resolve(false); };
    document.getElementById('jdel-linked').onclick = () => { Modal.close(); resolve(true); };
  });
}

async function deleteJournalEntry(j) {
  const ok = await confirmAction('Удалить эту запись из журнала?');
  if (!ok) return;

  const linkedType = j.kind === 'problem' && j.issueId ? 'problem'
    : j.kind === 'agreement' && j.agreementId ? 'agreement'
    : j.kind === 'idea' && j.labId ? 'idea'
    : null;
  const linkedId = linkedType === 'problem' ? j.issueId : linkedType === 'agreement' ? j.agreementId : linkedType === 'idea' ? j.labId : null;
  const deleteLinked = linkedType ? await askDeleteLinkedJournalEntity(linkedType) : false;

  await Resources.journal.remove(j.id);

  if (linkedType && linkedId) {
    const linkedResource = linkedType === 'problem' ? Resources.issues : linkedType === 'agreement' ? Resources.agreements : Resources.labs;
    try {
      if (deleteLinked) {
        await linkedResource.remove(linkedId);
      } else {
        await linkedResource.update(linkedId, { sourceJournalId: null });
      }
    } catch (err) {
      console.warn('Не удалось обновить связанную сущность после удаления записи журнала', err);
      toast(deleteLinked ? 'Запись удалена, связанную сущность удалить не удалось' : 'Запись удалена');
      Router.render();
      return;
    }
  }

  toast(deleteLinked ? 'Запись и связанная сущность удалены' : 'Запись удалена');
  Router.render();
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openJournalEditModal, deleteJournalEntry });
