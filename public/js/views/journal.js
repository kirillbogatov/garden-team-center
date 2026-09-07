// Журнал — только личные заметки с упоминаниями через @.

Views._journalQuery = Views._journalQuery || '';
Views._journalSearchOpen = Views._journalSearchOpen || false;

Views.journal = async function () {
  const requestedEntry = Router.queryParam('entry');
  const composerPrefill = Views._journalComposerPrefill || null;
  Views._journalComposerPrefill = null;

  setTopbar(`<h1>Журнал</h1>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;

  // Старые установки могли содержать в журнале зеркала идей, проблем и договорённостей.
  // В новом Журнале показываем только заметки; остальные сущности живут в своих разделах.
  const entries = (await Resources.journal.list())
    .filter((entry) => !entry.kind || entry.kind === 'note')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const journalQuery = (Views._journalQuery || '').trim().toLocaleLowerCase('ru');
  const filtered = journalQuery ? entries.filter((e) => (e.text || '').toLocaleLowerCase('ru').includes(journalQuery)) : entries;

  view.innerHTML = `
    <div class="view-narrow">
      <div class="journal-composer" id="composer">
        <div id="journal-text" class="je-editable" contenteditable="true" data-placeholder="Запишите заметку. Упомяните @человека или @проект."></div>
        <div class="composer-footer journal-composer-footer">
          <div class="journal-composer-actions">
            <button class="ui-button ui-button--primary btn btn-primary" id="journal-submit">Записать заметку</button>
          </div>
        </div>
      </div>

      <div class="journal-history">
        <div class="journal-history-tools">
          <div class="journal-history-title">Заметки</div>
          <button type="button" class="journal-search-toggle ${Views._journalSearchOpen ? 'active' : ''}" id="journal-search-toggle" title="Поиск по заметкам" aria-label="Поиск по заметкам">${icon('search',14)}</button>
        </div>
        ${Views._journalSearchOpen ? `<div class="journal-inline-search"><input id="journal-search-input" type="search" placeholder="Поиск по заметкам" value="${escapeHtml(Views._journalQuery || '')}" /><button type="button" class="ui-button ui-button--sm btn btn-sm" id="journal-search-close">Закрыть</button></div>` : ''}
        <div id="journal-feed">
          ${filtered.length ? filtered.map(journalEntryHtml).join('') : emptyState('Заметок пока нет', 'Добавьте первую заметку выше', 'journal')}
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
  if (journalSearchToggle) journalSearchToggle.onclick = () => {
    Views._journalSearchOpen = !Views._journalSearchOpen;
    if (!Views._journalSearchOpen) Views._journalQuery = '';
    Views.journal();
  };
  const journalSearchInput = document.getElementById('journal-search-input');
  if (journalSearchInput) {
    journalSearchInput.focus();
    journalSearchInput.oninput = () => {
      Views._journalQuery = journalSearchInput.value;
      const feed = document.getElementById('journal-feed');
      const q = Views._journalQuery.trim().toLocaleLowerCase('ru');
      const shown = entries.filter((e) => !q || (e.text || '').toLocaleLowerCase('ru').includes(q));
      feed.innerHTML = shown.length ? shown.map(journalEntryHtml).join('') : emptyState('Ничего не найдено', 'Попробуйте другой запрос', 'search');
    };
  }
  const journalSearchClose = document.getElementById('journal-search-close');
  if (journalSearchClose) journalSearchClose.onclick = () => { Views._journalSearchOpen = false; Views._journalQuery = ''; Views.journal(); };

  const editable = document.getElementById('journal-text');
  editable.dataset.submitOnEnter = 'true';
  attachMentionAutocompleteCE(editable, document.getElementById('composer'));
  if (composerPrefill?.text) {
    editable.innerHTML = mentionsToEditableHtml(composerPrefill.text);
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  document.getElementById('journal-submit').addEventListener('click', async () => {
    const text = serializeEditableToText(editable).trim();
    if (!text) return;
    await Resources.journal.create({ text, kind: 'note', createdAt: new Date().toISOString() });
    toast('Заметка добавлена в журнал');
    Views.journal();
  });

  editable.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
    e.preventDefault();
    document.getElementById('journal-submit').click();
  });
};



function openJournalEditModal(j) {
  // Журнал редактирует только заметки. Старые связанные записи больше не являются
  // частью журнала и открываться отсюда не должны.
  if (j?.kind && j.kind !== 'note') {
    if (j.kind === 'problem' && j.issueId) { FeatureLoader.run('openIssueModal', j.issueId); return; }
    if (j.kind === 'agreement' && j.agreementId) { FeatureLoader.run('openAgreementModal', j.agreementId); return; }
    if (j.kind === 'idea' && j.labId) { FeatureLoader.run('openLabIdeaModal', j); return; }
    toast('Эта запись теперь находится в соответствующем разделе');
    return;
  }

  Modal.open(
    `<h2>Редактировать заметку</h2>
    <div class="ui-field field">
      <span class="ui-field-label field-label">Текст</span>
      <div id="jef-text" class="je-editable" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Текст заметки" tabindex="0">${mentionsToEditableHtml(j.text)}</div>
    </div>
    <div class="ui-field field">
      <label class="ui-field-label field-label" for="jef-date">Дата</label>
      <input id="jef-date" type="datetime-local" value="${toDatetimeLocalValue(j.createdAt)}" />
    </div>
    <div class="ui-modal-actions modal-actions">
      <button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="jef-delete">${icon('trash', 14)} Удалить</button>
      <button class="ui-button btn" id="jef-cancel">Отмена</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="jef-save">Сохранить</button>
    </div>`,
    { onMount: (panel) => attachMentionAutocompleteCE(document.getElementById('jef-text'), panel) }
  );

  document.getElementById('jef-cancel').onclick = () => Modal.close();
  document.getElementById('jef-delete').onclick = async () => { Modal.close(); await deleteJournalEntry(j); };
  document.getElementById('jef-save').onclick = async () => {
    const text = serializeEditableToText(document.getElementById('jef-text')).trim();
    if (!text) { toast('Текст не может быть пустым'); return; }
    const payload = { text, kind: 'note' };
    const dateVal = document.getElementById('jef-date').value;
    if (dateVal) payload.createdAt = new Date(dateVal).toISOString();
    await Resources.journal.update(j.id, payload);
    Modal.close();
    toast('Сохранено');
    Router.render();
  };
}

async function deleteJournalEntry(j) {
  const ok = await confirmAction('Удалить эту заметку из журнала?');
  if (!ok) return;
  await Resources.journal.remove(j.id);
  toast('Заметка удалена');
  Router.render();
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openJournalEditModal, deleteJournalEntry });
