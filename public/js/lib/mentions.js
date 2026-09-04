// Рендер текста с упоминаниями (Имя / Проект) в кликабельные ссылки
// + автокомплит при наборе "@" в текстовых полях (Журнал, Договорённости).

const MENTION_DISPLAY_RE = /@\[([^\]]+)\]\((person|project|stakeholder|team):([a-zA-Z0-9_]+)\)/g;

function renderMentionText(text) {
  if (!text) return '';
  let out = '';
  let last = 0;
  let m;
  MENTION_DISPLAY_RE.lastIndex = 0;
  while ((m = MENTION_DISPLAY_RE.exec(text)) !== null) {
    out += renderLinkedText(text.slice(last, m.index));
    const [, label, type, id] = m;
    const target = type === 'project' ? projectPath(id) : type === 'team' ? '/people' : personPath(id);
    out += `<a class="mention" href="${target}" data-route="${target}" data-route-stop="1">${escapeHtml(label)}</a>`;
    last = m.index + m[0].length;
  }
  out += renderLinkedText(text.slice(last));
  return out;
}

function mentionCandidates(query) {
  const q = query.toLowerCase();
  const teamMention = 'команда'.includes(q) || q === 'все' ? [{ id: 'all', label: 'команда', type: 'team', sub: 'Вся команда' }] : [];
  const people = store.people
    .filter((p) => p.name.toLowerCase().includes(q))
    .map((p) => ({ id: p.id, label: p.name, type: p.type === 'stakeholder' ? 'stakeholder' : 'person', sub: p.role }));
  const projects = store.projects
    .filter((p) => p.name.toLowerCase().includes(q))
    .map((p) => ({ id: p.id, label: p.name, type: 'project', sub: 'Проект' }));
  return [...teamMention, ...people, ...projects].slice(0, 8);
}

// ---------------- Редактор упоминаний на contenteditable ----------------
// Показывает "Имя" сразу как оно будет выглядеть в тексте, а не markdown-разметкой @[Имя](type:id).
// Внутри контейнера могут быть только текстовые ноды, <br> и <span class="mention-chip"> — это
// нужно, чтобы сериализация обратно в markdown была простой и предсказуемой.

// markdown-текст -> HTML для contenteditable (упоминания превращаются в нередактируемые чипы).
function mentionsToEditableHtml(text) {
  if (!text) return '';
  let out = '';
  let last = 0;
  let m;
  MENTION_DISPLAY_RE.lastIndex = 0;
  while ((m = MENTION_DISPLAY_RE.exec(text)) !== null) {
    out += renderLinkedText(text.slice(last, m.index));
    const [, label, type, id] = m;
    out += `<span class="mention-chip" contenteditable="false" data-type="${type}" data-id="${id}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    last = m.index + m[0].length;
  }
  out += renderLinkedText(text.slice(last));
  return out;
}

// Содержимое contenteditable -> markdown-текст для сохранения на сервер.
function serializeEditableToText(rootEl) {
  let out = '';
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList && node.classList.contains('mention-chip')) {
      out += `@[${node.dataset.label}](${node.dataset.type}:${node.dataset.id})`;
      return;
    }
    if (node.tagName === 'BR') { out += '\n'; return; }
    Array.from(node.childNodes).forEach(walk);
    if (node.tagName === 'DIV') out += '\n';
  }
  Array.from(rootEl.childNodes).forEach(walk);
  return out;
}

// Вставляет <br> на месте курсора (используем вместо Enter, чтобы DOM оставался плоским).
function insertBrAtCaret() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  range.setStartAfter(br);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Автокомплит "@" для contenteditable-редактора (composer журнала, форма редактирования записи).
function attachMentionAutocompleteCE(editableEl, anchorContainer) {
  let menuEl = null;
  let activeIndex = 0;
  let candidates = [];
  let matchNode = null;
  let matchStart = -1;
  let matchCaret = -1;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    candidates = [];
    matchNode = null;
  }

  function renderMenu() {
    if (menuEl) menuEl.remove();
    menuEl = el(`<div class="mention-menu"></div>`);
    candidates.forEach((c, i) => {
      const item = el(`<div class="mm-item ${i === activeIndex ? 'active' : ''}">
        ${c.type === 'team' ? `<span class="mm-team-icon">${icon('team', 14)}</span>` : avatarHtml(c.type === 'project' ? null : store.person(c.id))}
        <span>${escapeHtml(c.label)}</span>
        <span class="mm-type">${c.type === 'team' ? 'вся команда' : c.type === 'project' ? 'проект' : c.type === 'stakeholder' ? 'стейкхолдер' : 'команда'}</span>
      </div>`);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        chooseCandidate(c);
      });
      menuEl.appendChild(item);
    });
    // Для contenteditable используем viewport-координаты и body, чтобы autocomplete
    // одинаково работал и на странице, и внутри любого модального окна.
    document.body.appendChild(menuEl);
    const rect = editableEl.getBoundingClientRect();
    menuEl.style.position = 'fixed';
    menuEl.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 236))}px`;
    menuEl.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 228)}px`;
  }

  function chooseCandidate(c) {
    if (!matchNode || !matchNode.parentNode) { closeMenu(); return; }
    const fullText = matchNode.textContent;
    const before = fullText.slice(0, matchStart);
    const after = fullText.slice(matchCaret);
    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.contentEditable = 'false';
    chip.dataset.type = c.type;
    chip.dataset.id = c.id;
    chip.dataset.label = c.label;
    chip.textContent = c.label;
    const beforeNode = document.createTextNode(before);
    const spaceNode = document.createTextNode(' ');
    const afterNode = document.createTextNode(after);
    const parent = matchNode.parentNode;
    parent.insertBefore(beforeNode, matchNode);
    parent.insertBefore(chip, matchNode);
    parent.insertBefore(spaceNode, matchNode);
    parent.insertBefore(afterNode, matchNode);
    parent.removeChild(matchNode);
    const range = document.createRange();
    range.setStart(afterNode, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editableEl.focus();
    closeMenu();
    editableEl.dispatchEvent(new Event('mention-inserted'));
  }

  editableEl.addEventListener('input', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) { closeMenu(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closeMenu(); return; }
    const upToCaret = node.textContent.slice(0, range.startOffset);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(upToCaret);
    if (!m) { closeMenu(); return; }
    const query = m[2];
    matchNode = node;
    matchCaret = range.startOffset;
    matchStart = range.startOffset - query.length - 1;
    candidates = mentionCandidates(query);
    activeIndex = 0;
    if (!candidates.length) { closeMenu(); return; }
    renderMenu();
  });

  editableEl.addEventListener('keydown', (e) => {
    if (menuEl && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % candidates.length; renderMenu(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + candidates.length) % candidates.length; renderMenu(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseCandidate(candidates[activeIndex]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Некоторые редакторы (например, быстрый композер Журнала) используют
      // обычный Enter как действие отправки. В них перенос строки остаётся на Shift+Enter.
      if (editableEl.dataset.submitOnEnter === 'true') return;
      e.preventDefault();
      if (!e.ctrlKey && !e.metaKey) insertBrAtCaret();
    }
  });

  editableEl.addEventListener('blur', () => setTimeout(closeMenu, 150));
}
