// База знаний — Paper-подобные документы с деревом папок, визуальным редактором и Markdown.

Views._kbFolder = 'all';
let kbFolderNameMap = {};

Views.knowledgeBase = async function () {
  setTopbar(`<h1>База знаний</h1><div class="actions"><button class="ui-button btn" data-command="openKbFolderModal">+ Создать папку</button><button class="ui-button ui-button--primary btn btn-primary" data-command="openKbNewDocumentModal">+ Добавить документ</button></div>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const [folders, docs] = await Promise.all([Resources.kbFolders.list(), Resources.kbDocs.list()]);
  kbFolderNameMap = Object.fromEntries(folders.map((f) => [f.id, f.title]));
  const selected = Views._kbFolder;
  const filtered = selected === 'all' ? docs : docs.filter((d) => d.folderId === selected);
  const selectedFolder = folders.find((f) => f.id === selected);

  const docRowsHtml = filtered.length
    ? filtered.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(kbDocRowHtml).join('')
    : `<div class="zen-empty">В этой папке пока нет документов</div>`;
  const folderEditButton = selectedFolder
    ? `<button class="ui-button ui-button--sm btn btn-sm" data-command="openKbFolderModal" data-command-arg="${selectedFolder.id}">${icon('edit', 13)} Редактировать папку</button>`
    : '';

  view.innerHTML = `<div class="kb-layout">
    <aside class="kb-tree-panel">
      <button class="ui-row ui-row--tree kb-tree-row kb-tree-all ${selected === 'all' ? 'active' : ''}" data-view-state="_kbFolder" data-view-value="all" data-view-render="knowledgeBase">Все документы <span>${docs.length}</span></button>
      <div class="kb-tree">${kbFolderTreeHtml(folders, docs, null, 0)}</div>
    </aside>
    <section class="kb-main">
      <div class="kb-section-head">
        <div><h2>${escapeHtml(selectedFolder?.title || 'Все документы')}</h2><div class="tiny">${filtered.length} ${pluralRu(filtered.length, 'документ', 'документа', 'документов')}</div></div>
        ${folderEditButton}
      </div>
      <div class="kb-doc-list">
        ${docRowsHtml}
      </div>
    </section>
  </div>`;
};

function kbFolderTreeHtml(folders, docs, parentId, depth) {
  const children = folders
    .filter((f) => (f.parentId || null) === (parentId || null))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return children.map((f) => {
    const childrenHtml = kbFolderTreeHtml(folders, docs, f.id, depth + 1);
    const count = docs.filter((d) => d.folderId === f.id).length;
    return `<div class="kb-tree-node">
      <button class="ui-row ui-row--tree kb-tree-row ${Views._kbFolder === f.id ? 'active' : ''}" style="--kb-depth:${depth}" data-view-state="_kbFolder" data-view-value="${f.id}" data-view-render="knowledgeBase">
        <span class="kb-folder-mark">${icon('projects', 13)}</span><span class="kb-tree-title">${escapeHtml(f.title)}</span><span>${count || ''}</span>
      </button>${childrenHtml}
    </div>`;
  }).join('');
}

function kbDocRowHtml(d) {
  const folder = d.folderId;
  const isLink = d.docType === 'link';
  const meta = isLink ? 'Ссылка' : `Изменён ${fmtRelative(d.updatedAt)}`;
  const copy = `<div class="kb-doc-copy"><div class="kb-doc-title">${escapeHtml(d.title)}</div><div class="tiny">${meta}</div></div>`;
  const folderHtml = folder ? `<span class="tiny">${escapeHtml(kbFolderNameMap[folder] || '')}</span>` : '';
  if (isLink) {
    const url = String(d.url || '').trim();
    return `<div class="kb-doc-row clickable" data-command="openKnowledgeLink" data-command-arg="${escapeHtml(encodeURIComponent(url))}">
      ${copy}${folderHtml}
      <span class="kb-doc-row-actions">
        <button type="button" class="kb-doc-action" title="Редактировать ссылку" aria-label="Редактировать ссылку" data-command="openKbLinkEditModal" data-command-arg="${escapeHtml(d.id)}" data-command-stop="1">${icon('edit',13)}</button>
        <span class="kb-doc-external" aria-hidden="true">${icon('external',13)}</span>
      </span>
    </div>`;
  }
  const path = `/knowledge-base/${encodeURIComponent(d.slug || d.id)}`;
  return `<div class="kb-doc-row clickable" data-route="${path}">
    ${copy}${folderHtml}${icon('chevronRight',13)}
  </div>`;
}

function kbDescendantIds(folders, parentId, out = new Set()) {
  for (const folder of folders.filter((f) => f.parentId === parentId)) {
    if (out.has(folder.id)) continue;
    out.add(folder.id);
    kbDescendantIds(folders, folder.id, out);
  }
  return out;
}

async function openKbFolderModal(id) {
  const folders = await Resources.kbFolders.list();
  const current = id ? folders.find((f) => f.id === id) : null;
  const blockedParents = current ? kbDescendantIds(folders, current.id) : new Set();
  if (current) blockedParents.add(current.id);
  Modal.open(`<h2>${current ? 'Редактировать папку' : 'Новая папка'}</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbf-title">Название</label><input id="kbf-title" value="${escapeHtml(current?.title || '')}" autofocus /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbf-parent">Родительская папка</label><select id="kbf-parent"><option value="">Корень</option>${folders.filter((f)=>!blockedParents.has(f.id)).map((f)=>`<option value="${f.id}" ${current?.parentId===f.id?'selected':''}>${escapeHtml(f.title)}</option>`).join('')}</select></div>
    <div class="ui-modal-actions modal-actions">${current ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="kbf-delete">${icon('trash',13)} Удалить</button>` : ''}<button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="kbf-save">Сохранить</button></div>`);
  if (current) document.getElementById('kbf-delete').onclick = async () => {
    const docs = await Resources.kbDocs.list();
    const hasChildren = folders.some((f) => f.parentId === current.id);
    const hasDocs = docs.some((d) => d.folderId === current.id);
    if (hasChildren || hasDocs) { toast('Сначала перенесите документы и вложенные папки'); return; }
    if (!(await confirmAction('Удалить пустую папку?'))) return;
    await Resources.kbFolders.remove(current.id);
    Modal.close();
    Views._kbFolder = 'all';
    Views.knowledgeBase();
  };
  document.getElementById('kbf-save').onclick = async () => {
    const payload = {
      title: document.getElementById('kbf-title').value.trim(),
      parentId: document.getElementById('kbf-parent').value || null,
    };
    if (!payload.title) { toast('Укажите название папки'); return; }
    if (current) await Resources.kbFolders.update(current.id, payload);
    else await Resources.kbFolders.create(payload);
    Modal.close();
    Views.knowledgeBase();
  };
}

function openKnowledgeLink(encodedUrl) {
  const url = decodeURIComponent(String(encodedUrl || ''));
  if (!/^https?:\/\//i.test(url)) { toast('Некорректная ссылка'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function openKbLinkEditModal(id) {
  const [item, folders] = await Promise.all([Resources.kbDocs.get(id), Resources.kbFolders.list()]);
  Modal.open(`<h2>Редактировать ссылку</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbe-title">Название</label><input id="kbe-title" value="${escapeHtml(item.title || '')}" autofocus /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbe-url">Ссылка</label><input id="kbe-url" type="url" inputmode="url" value="${escapeHtml(item.url || '')}" placeholder="https://…" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbe-folder">Папка</label><select id="kbe-folder"><option value="">Без папки</option>${folders.map((f)=>`<option value="${f.id}" ${item.folderId===f.id?'selected':''}>${escapeHtml(f.title)}</option>`).join('')}</select></div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="kbe-delete">${icon('trash',13)} Удалить</button><button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="kbe-save">Сохранить</button></div>`);
  document.getElementById('kbe-delete').onclick = async () => {
    if (!(await confirmAction('Удалить ссылку из базы знаний?'))) return;
    await Resources.kbDocs.remove(item.id);
    Modal.close(); toast('Ссылка удалена'); Views.knowledgeBase();
  };
  document.getElementById('kbe-save').onclick = async () => {
    const title = document.getElementById('kbe-title').value.trim();
    const url = document.getElementById('kbe-url').value.trim();
    const folderId = document.getElementById('kbe-folder').value || null;
    if (!title) { toast('Укажите название'); return; }
    if (!/^https?:\/\//i.test(url)) { toast('Укажите корректную ссылку'); return; }
    await Resources.kbDocs.update(item.id, { ...item, title, url, folderId, docType: 'link' });
    Modal.close(); toast('Сохранено'); Views.knowledgeBase();
  };
}

async function openKbNewDocumentModal() {
  const folders = await Resources.kbFolders.list();
  Modal.open(`<h2>Новый документ</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbd-title">Название</label><input id="kbd-title" autofocus /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbd-type">Тип</label><select id="kbd-type"><option value="article" selected>Статья</option><option value="link">Ссылка</option></select></div>
    <div class="ui-field field" id="kbd-url-field" hidden><label class="ui-field-label field-label" for="kbd-url">Ссылка</label><input id="kbd-url" type="url" inputmode="url" placeholder="https://…" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="kbd-folder">Папка</label><select id="kbd-folder"><option value="">Без папки</option>${folders.map((f)=>`<option value="${f.id}" ${Views._kbFolder===f.id?'selected':''}>${escapeHtml(f.title)}</option>`).join('')}</select></div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="kbd-create">Создать</button></div>`);
  const typeSelect = document.getElementById('kbd-type');
  const urlField = document.getElementById('kbd-url-field');
  const urlInput = document.getElementById('kbd-url');
  const primaryButton = document.getElementById('kbd-create');
  const syncType = () => {
    const isLink = typeSelect.value === 'link';
    urlField.hidden = !isLink;
    primaryButton.textContent = isLink ? 'Сохранить' : 'Создать';
    if (isLink) requestAnimationFrame(() => urlInput.focus());
  };
  typeSelect.onchange = syncType;
  primaryButton.onclick = async () => {
    const title = document.getElementById('kbd-title').value.trim();
    if (!title) { toast('Укажите название'); return; }
    const folderId = document.getElementById('kbd-folder').value || null;
    if (typeSelect.value === 'link') {
      const url = urlInput.value.trim();
      if (!/^https?:\/\//i.test(url)) { toast('Укажите корректную ссылку'); return; }
      await Resources.kbDocs.create({ title, folderId, docType: 'link', url, contentHtml: '', markdown: '' });
      Modal.close();
      Views.knowledgeBase();
      return;
    }
    const doc = await Resources.kbDocs.create({ title, folderId, docType: 'article', contentHtml: '<p><br></p>', markdown: '' });
    Modal.close();
    Router.go(`/knowledge-base/${encodeURIComponent(doc.slug || doc.id)}`);
  };
}

function kbFolderBreadcrumbs(folders, folderId) {
  const map = new Map(folders.map((f) => [f.id, f]));
  const chain = [];
  let cur = folderId ? map.get(folderId) : null;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? map.get(cur.parentId) : null;
  }
  return chain;
}

function kbDocumentBreadcrumbsHtml(d, folders) {
  const folderChain = kbFolderBreadcrumbs(folders, d.folderId);
  const parts = [
    `<button class="kb-crumb" type="button" data-view-state="_kbFolder" data-view-value="all" data-view-render="knowledgeBase">База знаний</button>`,
    ...folderChain.map((f) => `<button class="kb-crumb" type="button" data-view-state="_kbFolder" data-view-value="${f.id}" data-view-render="knowledgeBase">${escapeHtml(f.title)}</button>`),
    `<span class="kb-crumb-current">${escapeHtml(d.title)}</span>`
  ];
  return `<div class="kb-breadcrumbs">${parts.map((part, i) => `${i ? '<span class="kb-crumb-sep">/</span>' : ''}${part}`).join('')}</div>`;
}

Views.knowledgeDocument = async function (ref) {
  const d = await Resources.kbDocs.get(ref);
  const folders = await Resources.kbFolders.list();
  setTopbar(`${kbDocumentBreadcrumbsHtml(d, folders)}<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" id="kb-save">Сохранить</button></div>`);
  const view=document.getElementById('view');
  const initialHtml = d.contentHtml || markdownToKnowledgeHtml(d.markdown || '') || '<p><br></p>';
  view.innerHTML=`<div class="kb-paper-page">
    <div class="kb-paper-meta">
      <input id="kb-title" class="kb-title-input" value="${escapeHtml(d.title)}" aria-label="Название документа" />
      <select id="kb-folder" class="kb-folder-select"><option value="">Без папки</option>${folders.map((f)=>`<option value="${f.id}" ${d.folderId===f.id?'selected':''}>${escapeHtml(f.title)}</option>`).join('')}</select>
    </div>
    <div class="kb-editor-toolbar" id="kb-toolbar">
      <select id="kb-block-style" title="Стиль блока"><option value="p">Текст</option><option value="h1">Заголовок 1</option><option value="h2">Заголовок 2</option><option value="h3">Заголовок 3</option></select>
      <button class="kb-tool" data-cmd="bold" title="Жирный"><b>B</b></button>
      <button class="kb-tool" data-cmd="italic" title="Курсив"><i>I</i></button>
      <button class="kb-tool" id="kb-link" title="Ссылка">${icon('external',13)}</button>
      <button class="kb-tool" id="kb-code" title="Блок кода">&lt;/&gt;</button>
      <button class="kb-tool" id="kb-image" title="Вставить изображение">Изображение</button>
      <button class="kb-tool" id="kb-table" title="Таблица">Таблица</button>
      <span class="kb-toolbar-spacer"></span>
      <button class="kb-tool" id="kb-import">Импорт .md</button>
      <button class="kb-tool" id="kb-export">Экспорт .md</button>
      <button class="kb-tool kb-danger" id="kb-delete" title="Удалить">${icon('trash',13)}</button>
      <input type="file" id="kb-import-file" accept=".md,text/markdown,text/plain" hidden />
      <input type="file" id="kb-image-file" accept="image/*" hidden />
    </div>
    <article id="kb-editor" class="kb-editor" contenteditable="true" data-placeholder="Начните писать…">${initialHtml}</article>
  </div>`;

  const editor = document.getElementById('kb-editor');
  const titleInput = document.getElementById('kb-title');
  const folderSelect = document.getElementById('kb-folder');
  const draftKey = knowledgeDraftKey(d.id);
  const publishedState = {
    title: (d.title || '').trim(),
    folderId: d.folderId || '',
    contentHtml: sanitizeKnowledgeHtml(initialHtml),
  };
  const snapshot = () => ({
    title: titleInput.value.trim(),
    folderId: folderSelect.value || '',
    contentHtml: sanitizeKnowledgeHtml(editor.innerHTML),
  });
  const persistDraft = () => {
    const state = snapshot();
    if (knowledgeDraftStatesEqual(state, publishedState)) { knowledgeClearDraft(draftKey); return; }
    knowledgeWriteDraft(draftKey, { ...state, updatedAt: Date.now() });
  };
  const scheduleDraftSave = knowledgeDebounce(persistDraft, 700);

  initKnowledgeImageResizing(editor);
  restoreKnowledgeDraftIfNeeded({ draftKey, publishedState, titleInput, folderSelect, editor });
  wireKnowledgeEditorToolbar({ editor, titleInput, folderSelect, d, draftKey, publishedState, scheduleDraftSave });

  titleInput.addEventListener('input', scheduleDraftSave);
  titleInput.addEventListener('blur', persistDraft);
  folderSelect.addEventListener('change', scheduleDraftSave);
  folderSelect.addEventListener('blur', persistDraft);
  editor.addEventListener('input', scheduleDraftSave);
  editor.addEventListener('blur', persistDraft);
  const observer = new MutationObserver(() => scheduleDraftSave());
  observer.observe(editor, { subtree: true, childList: true, characterData: true });
};

// Черновик документа хранится локально (localStorage) и предлагается к
// восстановлению, только если он реально отличается от опубликованной версии —
// иначе при каждом открытии документа всплывал бы бесполезный тост.
function restoreKnowledgeDraftIfNeeded({ draftKey, publishedState, titleInput, folderSelect, editor }) {
  const storedDraft = knowledgeReadDraft(draftKey);
  if (!storedDraft) return;
  if (knowledgeDraftStatesEqual(storedDraft, publishedState)) { knowledgeClearDraft(draftKey); return; }
  requestAnimationFrame(() => {
    promptKnowledgeDraftRestore(storedDraft, () => {
      titleInput.value = storedDraft.title || titleInput.value;
      folderSelect.value = storedDraft.folderId || '';
      editor.innerHTML = storedDraft.contentHtml || editor.innerHTML;
      initKnowledgeImageResizing(editor);
      toast('Неопубликованный черновик восстановлен');
    }, () => knowledgeClearDraft(draftKey));
  });
}

// Кнопки панели инструментов редактора: форматирование через execCommand,
// вставка изображений/таблиц/кода и импорт/экспорт/удаление документа.
function wireKnowledgeEditorToolbar({ editor, titleInput, folderSelect, d, draftKey, publishedState, scheduleDraftSave }) {
  document.querySelectorAll('[data-cmd]').forEach((b) => {
    b.onmousedown = (e) => {
      e.preventDefault();
      document.execCommand(b.dataset.cmd, false, null);
      editor.focus();
      scheduleDraftSave();
    };
  });
  document.getElementById('kb-block-style').onchange = (e) => {
    document.execCommand('formatBlock', false, e.target.value);
    editor.focus();
    scheduleDraftSave();
  };
  document.getElementById('kb-link').onmousedown = (e) => {
    e.preventDefault();
    const url = prompt('Ссылка');
    if (url) { document.execCommand('createLink', false, url); scheduleDraftSave(); }
    editor.focus();
  };
  document.getElementById('kb-code').onmousedown = (e) => {
    e.preventDefault();
    insertKnowledgeCodeBlock(editor);
    scheduleDraftSave();
  };
  document.getElementById('kb-image').onclick = () => document.getElementById('kb-image-file').click();
  document.getElementById('kb-image-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await insertKnowledgeImage(editor, file);
    e.target.value = '';
    scheduleDraftSave();
  };
  document.getElementById('kb-table').onmousedown = (e) => {
    e.preventDefault();
    openKnowledgeTableActions(editor);
    scheduleDraftSave();
  };
  document.getElementById('kb-import').onclick = () => document.getElementById('kb-import-file').click();
  document.getElementById('kb-import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    editor.innerHTML = markdownToKnowledgeHtml(await file.text());
    initKnowledgeImageResizing(editor);
    scheduleDraftSave();
    toast('Markdown импортирован. Черновик сохранится автоматически.');
  };
  document.getElementById('kb-export').onclick = () => exportKnowledgeMarkdown(titleInput.value.trim() || d.title, knowledgeHtmlToMarkdown(editor.innerHTML));
  document.getElementById('kb-delete').onclick = async () => {
    if (!(await confirmAction('Удалить документ из базы знаний?'))) return;
    knowledgeClearDraft(draftKey);
    await Resources.kbDocs.remove(d.id);
    Router.go('/knowledge-base');
  };
  document.getElementById('kb-save').onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) { toast('Укажите название'); return; }
    const contentHtml = sanitizeKnowledgeHtml(editor.innerHTML);
    const folderId = folderSelect.value || null;
    await Resources.kbDocs.update(d.id, { title, folderId, contentHtml, markdown: knowledgeHtmlToMarkdown(contentHtml) });
    knowledgeClearDraft(draftKey);
    publishedState.title = title;
    publishedState.folderId = folderId || '';
    publishedState.contentHtml = contentHtml;
    toast('Документ сохранён');
    Views._kbFolder = folderId || 'all';
  };
}

function knowledgeDraftKey(id){
  return `garden:kb-draft:${id}`;
}

function knowledgeReadDraft(key){
  try {
    const raw=localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function knowledgeWriteDraft(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function knowledgeClearDraft(key){
  try { localStorage.removeItem(key); } catch (_) {}
}

function knowledgeDraftStatesEqual(a, b){
  return String(a?.title||'').trim()===String(b?.title||'').trim()
    && String(a?.folderId||'')===String(b?.folderId||'')
    && sanitizeKnowledgeHtml(String(a?.contentHtml||''))===sanitizeKnowledgeHtml(String(b?.contentHtml||''));
}

function knowledgeDebounce(fn, wait){
  let timer=null;
  return (...args)=>{
    clearTimeout(timer);
    timer=setTimeout(()=>fn(...args), wait || 0);
  };
}

function knowledgeDraftUpdatedLabel(updatedAt){
  if(!updatedAt) return 'недавно';
  try {
    return new Date(updatedAt).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
  } catch (_) {
    return 'недавно';
  }
}

function promptKnowledgeDraftRestore(draft, onRestore, onDiscard){
  Modal.open(`<h2>Восстановить черновик?</h2>
    <p class="muted" style="margin:0 0 8px">Для этого документа найдена неопубликованная версия от ${escapeHtml(knowledgeDraftUpdatedLabel(draft.updatedAt))}.</p>
    <p class="muted" style="margin:0 0 4px">Её изменения были сохранены автоматически, но не опубликованы кнопкой «Сохранить».</p>
    <div class="ui-modal-actions modal-actions">
      <button class="ui-button btn btn-danger btn-push-left" id="kb-draft-discard">Сбросить</button>
      <button class="ui-button btn" id="kb-draft-cancel">Позже</button>
      <button class="ui-button ui-button--primary btn btn-primary" id="kb-draft-restore">Восстановить</button>
    </div>`);
  document.getElementById('kb-draft-discard').onclick=()=>{ Modal.close(); onDiscard?.(); toast('Черновик удалён'); };
  document.getElementById('kb-draft-cancel').onclick=()=>{ Modal.close(); };
  document.getElementById('kb-draft-restore').onclick=()=>{ Modal.close(); onRestore?.(); };
}

function insertKnowledgeTable(editor) {
  const rows = Math.min(12, Math.max(1, Number(prompt('Строк (включая заголовок)', '3')) || 3));
  const cols = Math.min(8, Math.max(1, Number(prompt('Столбцов', '3')) || 3));
  const headCells = Array.from({ length: cols }, (_, i) => `<th>Столбец ${i + 1}</th>`).join('');
  const bodyRow = '<tr>' + Array.from({ length: cols }, () => '<td><br></td>').join('') + '</tr>';
  const bodyRows = Array.from({ length: rows - 1 }, () => bodyRow).join('');
  const html = `<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`;
  editor.focus();
  document.execCommand('insertHTML', false, html);
}

function knowledgeCurrentCell(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (node?.nodeType === 3) node = node.parentElement;
  const cell = node?.closest?.('td,th');
  return cell && editor.contains(cell) ? cell : null;
}

// Добавление строки поддерживает вставку и в <thead>, и в <tbody> — новая
// строка заголовка становится первой строкой тела, а не остаётся в шапке.
function knowledgeAddTableRow(table, sourceRow) {
  const newRow = document.createElement('tr');
  const isHeadRow = sourceRow.parentElement.tagName === 'THEAD';
  [...sourceRow.children].forEach(() => {
    const cell = document.createElement(isHeadRow ? 'th' : 'td');
    cell.innerHTML = '<br>';
    newRow.appendChild(cell);
  });
  if (isHeadRow) (table.tBodies[0] || table.appendChild(document.createElement('tbody'))).prepend(newRow);
  else sourceRow.after(newRow);
}

function knowledgeAddTableColumn(table, col) {
  [...table.rows].forEach((r) => {
    const cells = [...r.cells];
    const ref = cells[Math.min(col, cells.length - 1)];
    const cell = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td');
    cell.innerHTML = '<br>';
    if (ref) ref.after(cell); else r.appendChild(cell);
  });
}

function openKnowledgeTableActions(editor) {
  const cell = knowledgeCurrentCell(editor);
  if (!cell) { insertKnowledgeTable(editor); return; }
  const table = cell.closest('table');
  const row = cell.parentElement;
  const col = [...row.children].indexOf(cell);
  Modal.open(`<h2>Таблица</h2>
    <div class="kb-table-actions">
      <button class="ui-button btn" id="kbt-add-row">Добавить строку</button>
      <button class="ui-button btn" id="kbt-del-row">Удалить строку</button>
      <button class="ui-button btn" id="kbt-add-col">Добавить столбец</button>
      <button class="ui-button btn" id="kbt-del-col">Удалить столбец</button>
      <button class="ui-button btn" id="kbt-merge-right">Объединить справа</button>
      <button class="ui-button btn" id="kbt-merge-down">Объединить снизу</button>
    </div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="kbt-delete">Удалить таблицу</button><button class="ui-button btn" data-modal-close>Готово</button></div>`);
  document.getElementById('kbt-add-row').onclick = () => {
    knowledgeAddTableRow(table, row);
    Modal.close();
    editor.focus();
  };
  document.getElementById('kbt-del-row').onclick = () => {
    const total = [...table.querySelectorAll('tr')].length;
    if (total <= 1) table.remove(); else row.remove();
    Modal.close();
    editor.focus();
  };
  document.getElementById('kbt-add-col').onclick = () => {
    knowledgeAddTableColumn(table, col);
    Modal.close();
    editor.focus();
  };
  document.getElementById('kbt-del-col').onclick = () => {
    const max = Math.max(0, ...[...table.rows].map((r) => r.cells.length));
    if (max <= 1) table.remove();
    else [...table.rows].forEach((r) => { if (r.cells[col]) r.deleteCell(col); });
    Modal.close();
    editor.focus();
  };
  document.getElementById('kbt-merge-right').onclick = () => {
    if (knowledgeMergeCellRight(cell)) { Modal.close(); editor.focus(); }
  };
  document.getElementById('kbt-merge-down').onclick = () => {
    if (knowledgeMergeCellDown(cell)) { Modal.close(); editor.focus(); }
  };
  document.getElementById('kbt-delete').onclick = () => { table.remove(); Modal.close(); editor.focus(); };
}

function knowledgeMergeCellContent(target, source) {
  const left = String(target.innerHTML || '').trim();
  const right = String(source.innerHTML || '').trim();
  const leftEmpty = !left || left === '<br>';
  const rightEmpty = !right || right === '<br>';
  if (leftEmpty && !rightEmpty) target.innerHTML = source.innerHTML;
  else if (!leftEmpty && !rightEmpty) target.innerHTML = `${target.innerHTML}<br>${source.innerHTML}`;
}

function knowledgeTableMatrix(table) {
  const matrix = [];
  [...table.rows].forEach((row, rowIndex) => {
    matrix[rowIndex] ||= [];
    let colIndex = 0;
    while (matrix[rowIndex][colIndex]) colIndex += 1;
    [...row.cells].forEach((cell) => {
      while (matrix[rowIndex][colIndex]) colIndex += 1;
      const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
      const colSpan = Math.max(1, Number(cell.colSpan) || 1);
      for (let r = 0; r < rowSpan; r += 1) {
        matrix[rowIndex + r] ||= [];
        for (let c = 0; c < colSpan; c += 1) {
          matrix[rowIndex + r][colIndex + c] = cell;
        }
      }
      colIndex += colSpan;
    });
  });
  return matrix;
}

function knowledgeCellPosition(cell) {
  const table = cell?.closest?.('table');
  if (!table) return null;
  const matrix = knowledgeTableMatrix(table);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const colIndex = row.indexOf(cell);
    if (colIndex !== -1) return { table, matrix, rowIndex, colIndex };
  }
  return null;
}

function knowledgeMergeCellRight(cell) {
  const pos = knowledgeCellPosition(cell);
  if (!pos) return false;
  const { matrix, rowIndex, colIndex } = pos;
  const targetCol = colIndex + Math.max(1, Number(cell.colSpan) || 1);
  const neighbor = matrix[rowIndex]?.[targetCol];
  if (!neighbor || neighbor === cell) { toast('Справа нет соседней ячейки'); return false; }
  if (neighbor.parentElement !== cell.parentElement) { toast('Можно объединять только ячейки в одной строке'); return false; }
  const cellRowSpan = Math.max(1, Number(cell.rowSpan) || 1);
  const neighborRowSpan = Math.max(1, Number(neighbor.rowSpan) || 1);
  if (cellRowSpan !== neighborRowSpan) { toast('Для объединения справа высота ячеек должна совпадать'); return false; }
  knowledgeMergeCellContent(cell, neighbor);
  cell.colSpan = Math.max(1, Number(cell.colSpan) || 1) + Math.max(1, Number(neighbor.colSpan) || 1);
  neighbor.remove();
  return true;
}

function knowledgeMergeCellDown(cell) {
  const pos = knowledgeCellPosition(cell);
  if (!pos) return false;
  const { matrix, rowIndex, colIndex } = pos;
  const targetRow = rowIndex + Math.max(1, Number(cell.rowSpan) || 1);
  const neighbor = matrix[targetRow]?.[colIndex];
  if (!neighbor || neighbor === cell) { toast('Снизу нет соседней ячейки'); return false; }
  const cellColSpan = Math.max(1, Number(cell.colSpan) || 1);
  const neighborColSpan = Math.max(1, Number(neighbor.colSpan) || 1);
  if (cellColSpan !== neighborColSpan) { toast('Для объединения снизу ширина ячеек должна совпадать'); return false; }
  knowledgeMergeCellContent(cell, neighbor);
  cell.rowSpan = Math.max(1, Number(cell.rowSpan) || 1) + Math.max(1, Number(neighbor.rowSpan) || 1);
  neighbor.remove();
  return true;
}

function insertKnowledgeCodeBlock(editor) {
  editor.focus();
  const sel = window.getSelection();
  const selected = sel && sel.rangeCount ? sel.toString() : '';
  const code = escapeHtml(selected || 'код');
  document.execCommand('insertHTML', false, `<pre><code>${code}</code></pre><p><br></p>`);
}

function insertKnowledgeImage(editor, file) {
  if (!file.type.startsWith('image/')) { toast('Выберите изображение'); return Promise.resolve(); }
  if (file.size > 8 * 1024 * 1024) { toast('Изображение должно быть меньше 8 МБ'); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      editor.focus();
      const alt = escapeHtml(file.name.replace(/\.[^.]+$/, ''));
      const html = `<figure class="kb-image-figure" data-kb-width="100"><img src="${escapeHtml(reader.result)}" alt="${alt}"><figcaption><br></figcaption></figure><p><br></p>`;
      document.execCommand('insertHTML', false, html);
      initKnowledgeImageResizing(editor);
      resolve();
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Каждая вставленная картинка становится ресайзящейся: клик выделяет фигуру,
// а ResizeObserver отслеживает перетаскивание рамки браузером (resize: both в
// CSS) и записывает итоговую ширину в data-kb-width, которая переживает
// сохранение/сериализацию в Markdown и обратно.
function initKnowledgeImageResizing(editor) {
  if (!editor) return;
  editor.querySelectorAll('figure').forEach((figure) => {
    const img = figure.querySelector(':scope > img');
    if (!img) return;
    figure.classList.add('kb-image-figure');
    const stored = Math.max(20, Math.min(100, Number(figure.dataset.kbWidth) || 100));
    figure.dataset.kbWidth = String(Math.round(stored));
    figure.style.width = `${stored}%`;
    if (figure.dataset.kbResizeBound === '1') return;
    figure.dataset.kbResizeBound = '1';
    figure.addEventListener('click', (e) => {
      e.stopPropagation();
      editor.querySelectorAll('.kb-image-figure.is-selected').forEach((el) => { if (el !== figure) el.classList.remove('is-selected'); });
      figure.classList.add('is-selected');
    });
    const observer = new ResizeObserver(() => {
      if (!figure.isConnected || !figure.classList.contains('is-selected')) return;
      const max = editor.clientWidth || 1;
      const pct = Math.max(20, Math.min(100, (figure.getBoundingClientRect().width / max) * 100));
      figure.dataset.kbWidth = String(Math.round(pct));
    });
    observer.observe(figure);
  });
  if (editor.dataset.kbImageDismissBound !== '1') {
    editor.dataset.kbImageDismissBound = '1';
    editor.addEventListener('click', (e) => {
      if (!e.target.closest('.kb-image-figure')) editor.querySelectorAll('.kb-image-figure.is-selected').forEach((el) => el.classList.remove('is-selected'));
    });
  }
}

// Санитизация перед сохранением/показом: убираем исполняемые/встраиваемые
// теги целиком, снимаем UI-состояние ресайза картинок и вырезаем опасные
// атрибуты (on*, style, а также href/src с недоверенной схемой).
function sanitizeKnowledgeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  root.querySelectorAll('script,style,iframe,object,embed,form,input,button').forEach((el) => el.remove());
  root.querySelectorAll('.kb-image-figure').forEach((el) => {
    el.classList.remove('is-selected');
    el.removeAttribute('data-kb-resize-bound');
    el.style.removeProperty('width');
  });
  root.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || a.name === 'style') el.removeAttribute(a.name);
      if (a.name === 'href' && !/^https?:|^mailto:|^#/i.test(a.value)) el.removeAttribute(a.name);
      if (a.name === 'src' && !/^https?:|^data:image\//i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  return root.innerHTML;
}

// Инлайн-разметка внутри строки: картинки/ссылки/код/жирный/курсив.
// Порядок замен важен — картинка `![]()` должна обработаться раньше
// обычной ссылки `[]()`, иначе `!` перед ней сломает совпадение.
function knowledgeInlineMarkdown(v) {
  return escapeHtml(v)
    .replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// Построчный разбор блоков Markdown: тройные кавычки — код, `|...|` со
// строкой-разделителем следом — таблица, `![]()`/`#`/пустая строка — картинка,
// заголовок, пустой абзац; всё остальное — обычный абзац с инлайн-разметкой.
function markdownToKnowledgeHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      const langAttr = lang ? ` data-language="${escapeHtml(lang)}"` : '';
      out += `<pre><code${langAttr}>${escapeHtml(code.join('\n'))}</code></pre>`;
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map((x) => x.trim()));
        i++;
        // Строка-разделитель (`|---|---|`) сразу после заголовка — это
        // разметка таблицы, а не строка данных, пропускаем её.
        if (rows.length === 1 && i < lines.length && /^\|?[\s:|-]+\|/.test(lines[i])) i++;
      }
      const head = rows.shift() || [];
      const headHtml = head.map((x) => `<th>${knowledgeInlineMarkdown(x)}</th>`).join('');
      const bodyHtml = rows.map((r) => '<tr>' + r.map((x) => `<td>${knowledgeInlineMarkdown(x)}</td>`).join('') + '</tr>').join('');
      out += `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)\s*$/);
    if (image) {
      out += `<figure><img src="${image[2]}" alt="${escapeHtml(image[1])}"></figure>`;
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      out += `<h${h[1].length}>${knowledgeInlineMarkdown(h[2])}</h${h[1].length}>`;
      i++;
      continue;
    }

    if (!line.trim()) { out += '<p><br></p>'; i++; continue; }
    out += `<p>${knowledgeInlineMarkdown(line)}</p>`;
    i++;
  }
  return out;
}

// Обратное преобразование: DOM-узел в инлайн-Markdown. Рекурсивно обходит
// дочерние узлы, оборачивая распознанные теги в соответствующий синтаксис;
// незнакомые теги просто отдают текст своих детей без потери содержимого.
function knowledgeInlineToMarkdown(node) {
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  const text = [...node.childNodes].map(knowledgeInlineToMarkdown).join('');
  if (tag === 'a') return `[${text}](${node.getAttribute('href') || ''})`;
  if (tag === 'img') return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
  if (tag === 'strong' || tag === 'b') return `**${text}**`;
  if (tag === 'em' || tag === 'i') return `*${text}*`;
  if (tag === 'code' && node.parentElement?.tagName !== 'PRE') return '`' + text + '`';
  if (tag === 'br') return '\n';
  return text;
}

// Таблица сериализуется в GFM-Markdown: строка заголовка, строка-разделитель
// из дефисов, затем строки данных — символ `|` внутри ячеек экранируется.
function knowledgeTableToMarkdownBlock(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')].map((tr) =>
    [...tr.children].map((c) => knowledgeInlineToMarkdown(c).replace(/\|/g, '\\|').trim())
  );
  if (!rows.length) return null;
  const lines = [`| ${rows[0].join(' | ')} |`, `| ${rows[0].map(() => '---').join(' | ')} |`];
  rows.slice(1).forEach((r) => lines.push(`| ${r.join(' | ')} |`));
  return lines.join('\n');
}

function knowledgeBlockToMarkdown(el) {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-3]$/.test(tag)) return '#'.repeat(Number(tag[1])) + ' ' + knowledgeInlineToMarkdown(el);
  if (tag === 'pre') {
    const code = el.querySelector('code');
    const lang = code?.dataset?.language || '';
    return '```' + lang + '\n' + (code?.textContent || el.textContent || '') + '\n```';
  }
  if (tag === 'figure') {
    const img = el.querySelector('img');
    return img ? `![${img.getAttribute('alt') || ''}](${img.getAttribute('src') || ''})` : null;
  }
  if (tag === 'table') return knowledgeTableToMarkdownBlock(el);
  return knowledgeInlineToMarkdown(el);
}

function knowledgeHtmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(`<div>${sanitizeKnowledgeHtml(html)}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const blocks = [...root.children]
    .map(knowledgeBlockToMarkdown)
    .filter((block) => block !== null);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function exportKnowledgeMarkdown(title, markdown) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (title || 'document').replace(/[\\/:*?"<>|]+/g, '-') + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openKbFolderModal, openKbNewDocumentModal, openKbLinkEditModal, openKnowledgeLink });
